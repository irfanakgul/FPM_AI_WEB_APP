#!/usr/bin/env python
# coding: utf-8

# In[2]:
print("▶︎ ▶︎ ▶︎ PREDICTOR started ◀︎ ◀︎ ◀︎")


from initial import engine,selected_odds_list,target_cols,rond_threshold,model_size
from models_nb import model_names
import pandas as pd, numpy as np
from joblib import load as mdl_load # type: ignore
import math,sys
import re
from sqlalchemy import text
from datetime import datetime
import warnings
from pathlib import Path

warnings.filterwarnings('ignore')


# 🔹 BASE PATH (PredictionEngine.py'nin olduğu klasör)
BASE_DIR = Path(__file__).resolve().parent

# 🔹 MODELS PATH
MODELS_DIR = BASE_DIR / "outputs" / "models"

# In[2]:


# needs to read correct column names from cloud db
def read_sql_case_safe(engine, query: str):
    """
    Çok temel SELECT sorgularında tablo/kolonları DB şemasından okuyup doğru şekilde quote eder.
    Şu formu hedefler:
      SELECT col1, col2 FROM table ...
      SELECT * FROM table ...
    Daha karmaşık JOIN/alias sorgularda sınırlı kalabilir.
    """
    q = query.strip().rstrip(";")

    m = re.match(r'(?is)^\s*select\s+(?P<select>.+?)\s+from\s+(?P<table>[A-Za-z0-9_]+)\s*(?P<rest>.*)$', q)
    if not m:
        # tanıyamazsa aynen çalıştır
        return pd.read_sql_query(query, engine)

    select_part = m.group("select").strip()
    table = m.group("table").strip()
    rest = m.group("rest") or ""

    # tablonun gerçek kolon adlarını çek
    cols = pd.read_sql_query(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=:t
        ORDER BY ordinal_position
    """), engine, params={"t": table})["column_name"].tolist()

    # kolonu case-insensitive eşle
    col_map = {c.lower(): c for c in cols}

    if select_part == "*":
        fixed_select = "*"
    else:
        raw_cols = [c.strip() for c in select_part.split(",")]
        fixed_cols = []
        for rc in raw_cols:
            # fonksiyon/alias gibi şeyler varsa dokunmayalım
            if re.search(r'\(|\)|\s+as\s+|\s', rc, flags=re.I):
                fixed_cols.append(rc)
                continue

            real = col_map.get(rc.lower())
            if real:
                fixed_cols.append(f'"{real}"')
            else:
                fixed_cols.append(rc)
        fixed_select = ", ".join(fixed_cols)

    fixed_query = f'SELECT {fixed_select} FROM "{table}" {rest}'.strip()
    return pd.read_sql_query(fixed_query, engine)

#read data with column name correction  
def fn_read_data_db(tableName):
    # basit güvenlik: sadece harf/rakam/_ izin ver
    if not re.fullmatch(r"[A-Za-z0-9_]+", tableName):
        raise ValueError("Invalid table name")

    query = f'SELECT * FROM "{tableName}"'
    
    return read_sql_case_safe(engine, query)


# In[5]:


# current/next games for prediction
print('---->> CLEAN UP of DATASET <-----',flush=True)
df_unpred_cleaned_games = fn_read_data_db('tbl_futureGames')
df_unpred_cleaned_games = df_unpred_cleaned_games.drop_duplicates(subset=['GameLink'], keep='last')

print(f'^^ pred data size before drop: {len(df_unpred_cleaned_games)}',flush=True)
df_unpred_cleaned_games = df_unpred_cleaned_games.drop_duplicates(subset=['GameLink'],keep='last')
print(f'^^ pred data size after drop: {len(df_unpred_cleaned_games)}',flush=True)

# replace by '__' if team name contains '-'
df_unpred_cleaned_games['EvSahibi'] = df_unpred_cleaned_games['EvSahibi'].str.replace('-', '__', regex=False)
df_unpred_cleaned_games['KonukEkip'] = df_unpred_cleaned_games['KonukEkip'].str.replace('-', '__', regex=False)


# In[ ]:


if len(sys.argv) < 2:
    print("[ERROR] Missing response argument (yes/no)")
    sys.exit(1)

response = sys.argv[1].lower()
print(f"[RESPONSE RECEIVED]-----------------> {response.upper()}")

if response not in ("yes", "no"):
    print("[ERROR] response must be yes or no")
    sys.exit(1)


lst_gamelink = list(fn_read_data_db('Predicted_games_AVG_sec')['GameLink'])
# response = input('? Do you want to calculate only new games ? ')
if response == 'yes' or response == 'Yes' or response == 'y' or response == 'YES' or response == 'Y':
    df_unpred_cleaned_games = df_unpred_cleaned_games[~df_unpred_cleaned_games['GameLink'].isin(lst_gamelink)]
    print(f'^^ Only new game size to calculate > {len(df_unpred_cleaned_games)} ^^')
else:
    print(f'^^ Total game size to calculate > {len(df_unpred_cleaned_games)} ^^')


# In[6]:


# focus odds cols
df_driver = fn_read_data_db('selection_Driver_List')
selected_odds = df_driver[df_driver[selected_odds_list]==1]['FeatureName'].tolist()

# focus required cols
selected_cols = df_driver[df_driver['mainSelect']==1]['FeatureName'].tolist()
selected_cols.remove('IlkYariSonucu')
selected_cols.remove('MacSonucu')


# In[7]:

# 🔴 güvenlik: klasör var mı?
if not MODELS_DIR.exists():
    raise FileNotFoundError(f"Models directory not found: {MODELS_DIR}")

# 🔹 MODEL CONTAINER
models = {}

# 🔹 loop for each model
for str_mdl in model_names:
    for str_target in target_cols:
        file_name = MODELS_DIR / f"mdl_{str_mdl}_{str_target}.joblib"

        if not file_name.exists():
            print(f"[WARN] Model not found → {file_name}")
            continue

        models[f"mdl_{str_mdl}_{str_target}"] = mdl_load(file_name)
print(f"[OK] Models loaded...")



# In[8]:


# new games cleaning
def game_cleaner(df):
    print('>> Games are being cleaned... << ',flush=True)

    # Silinecek sütunların listesi
    columns_to_drop = ['IlkYariSonucu', 'MacSonucu']

    # Eğer DataFrame'de bu sütunlar varsa, sil
    for column in columns_to_drop:
        if column in df.columns:
            df.drop(column, axis=1, inplace=True)
    
    # # replace nan/-/None/ odds into 1.0
    df_driver = fn_read_data_db('selection_Driver_List')
    selected_odds = df_driver[df_driver[selected_odds_list]==1]['FeatureName'].tolist()
    df[selected_odds] = df[selected_odds].replace(np.nan, 1.0).replace('-', 1.0)
    df = df[~df.apply(lambda x: x == '').any(axis=1)]
    
    print(f'** Games are ready for prediction. Game Size: {len(df)} **\n ',flush=True)
    return df


# In[9]:


def custom_round(n):
    if n - math.floor(n) >= rond_threshold:
        return math.ceil(n)
    else:
        return math.floor(n)


# In[10]:


def fn_prediction(df,response):
    print('$$ Model started to predict of games $$ \n',flush=True)
    df_acc = fn_read_data_db('log_mdl_accuracy_scores').loc[:,'Model_Type':]
    df_pred_res = pd.DataFrame(columns=['MacTarihi','HomeTeam', 'AwayTeam', 'REGTYPE','Accuracy_%','Home_HT', 
                                       'Away_HT','Home_FT', 'Away_FT'])
    
    list_df = [] 
    for idx, game_row in df.iterrows():
        df_selectedTeam = pd.DataFrame(game_row).transpose()
        # keep names
        str_home = df_selectedTeam['EvSahibi'].iloc[0]
        str_away = df_selectedTeam['KonukEkip'].iloc[0]
        str_date = df_selectedTeam['MacTarihi'].iloc[0]
        
        # select odds and make float
        df_select_odds = df_selectedTeam[selected_odds].astype('float')
        
        for str_mdl in model_names:
            # Yukarıdaki kodun yerine kullanılacak DataFrame
            new_data = {
                'MacTarihi': [str_date],
                'HomeTeam': [str_home],
                'AwayTeam': [str_away],
                'REGTYPE': [str_mdl],
                'Accuracy_%': [df_acc[df_acc['Model_Type'] == str_mdl]['Model_AVG'].iloc[0]],
                'Home_HT': [custom_round(round(models[f'mdl_{str_mdl}_home_HT'].predict(df_select_odds)[0], 2))],
                'Away_HT': [custom_round(round(models[f'mdl_{str_mdl}_away_HT'].predict(df_select_odds)[0], 2))],
                'Home_FT': [custom_round(round(models[f'mdl_{str_mdl}_home_FT'].predict(df_select_odds)[0], 2))],
                'Away_FT': [custom_round(round(models[f'mdl_{str_mdl}_Away_FT'].predict(df_select_odds)[0], 2))]
            }
            # Yeni DataFrame oluştur
            new_df = pd.DataFrame(new_data)

            # df_pred_res DataFrame'ine concat kullanarak ekle
            df_pred_res = pd.concat([df_pred_res, new_df], ignore_index=True)
            
    df_pred_res[['Home_HT','Away_HT','Home_FT','Away_FT']] = df_pred_res[['Home_HT','Away_HT','Home_FT','Away_FT']].applymap(lambda x: 0 if x < 0 else x)
        
    df_pred_res['Total_Score'] = df_pred_res['Home_FT'] + df_pred_res['Away_FT']

    if response == 'yes' or response == 'Yes' or response == 'y' or response == 'YES' or response == 'Y':
        df_pred_res.to_sql(name='Predicted_games_allModels_sec', con=engine, if_exists='append', index=False)
    else:
        df_pred_res.to_sql(name='Predicted_games_allModels_sec', con=engine, if_exists='replace', index=False)
 
    print(f'\n** All selected games have been predicted with {len(model_names)} models and written into DB**')    
    return df_pred_res


# In[11]:


def avg_calc(df,df_unpred_cleaned_games,response):
    
    # temp cols comb 
    combined_column = df['HomeTeam'].astype(str) + '-' + df['AwayTeam'].astype(str)
    df['Home-Away'] = combined_column
    
    # order cols
    columns = list(df.columns)
    new_column_order = [columns[0]] + [columns[-1]] + columns[1:-1]

    # Sütunları yeni sıraya göre düzenleyip DataFrame'i güncelliyoruz
    df_pred = df[new_column_order]
    df_pred = df.drop(['HomeTeam','AwayTeam'],axis=1)
    
    # group by
    grouped_averages = df_pred.groupby('Home-Away')['Home_FT'].mean()
    
    df_avg = df_pred.groupby('Home-Away').agg(
    MacTarihi=('MacTarihi', 'first'),
    REGTYPE=('REGTYPE', lambda x: 'AVG_AllModels'),
    Accuracy_Mean=('Accuracy_%', 'mean'),
    Home_HT_Mean=('Home_HT', 'mean'),
    Away_HT_Mean=('Away_HT', 'mean'),
    Home_FT_Mean=('Home_FT', 'mean'),
    Away_FT_Mean=('Away_FT', 'mean')).reset_index()
    
    df_avg[['HomeTeam', 'AwayTeam']] = df_avg['Home-Away'].str.split('-', n=1, expand=True)
    
    df_avg = df_avg[['MacTarihi', 'HomeTeam','AwayTeam','REGTYPE','Accuracy_Mean',\
                     'Home_HT_Mean','Away_HT_Mean','Home_FT_Mean','Away_FT_Mean']] #
    
    # cols to int from float by our threshold
    columns_to_update = ['Home_HT_Mean','Away_HT_Mean','Home_FT_Mean','Away_FT_Mean']
    # apply on identified cols
    df_avg[columns_to_update] = df_avg[columns_to_update].applymap(custom_round)
    df_avg['Total_Score_Mean'] = df_avg['Home_FT_Mean'] + df_avg['Away_FT_Mean']
    
    print(f'** --> AVG SEC SIZE= {len(df_avg)} <-- **',flush=True)
    #take Gamelink and merged to AVG 
    df_future_link = df_unpred_cleaned_games[['MacTarihi','EvSahibi', 'KonukEkip','GameLink']]

    df_avg = pd.merge(
    df_avg,
    df_future_link,
    how='left',
    left_on=['MacTarihi', 'HomeTeam', 'AwayTeam'],
    right_on=['MacTarihi', 'EvSahibi', 'KonukEkip']
)

    if response == 'yes' or response == 'Yes' or response == 'y' or response == 'YES' or response == 'Y':
        df_avg.to_sql(name='Predicted_games_AVG_sec', con=engine, if_exists='append', index=False)
    else:
        df_avg.to_sql(name='Predicted_games_AVG_sec', con=engine, if_exists='replace', index=False)
    
    print('Has been predicted FOR LEAGUES',flush=True)
    print(f"\n!!! All Model Accuracy Score= {round(np.mean(df_avg['Accuracy_Mean']),2)} #Selected ODDS LIST : - {selected_odds_list[-1]} - !!! \n",flush=True)
    
    # mdl_total_note = round(np.mean(df_avg['Accuracy_Mean']),2)
    # keep logs for each run
    log_dic = {'accuracy_mean':round(np.mean(df_avg['Accuracy_Mean']),2),
               'data_size': len(df)/model_size, #13 for 13 model- can be changed later
               'Odds_List': selected_odds_list[-1],
               'RunTime': f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'}

    df_log_acc = pd.DataFrame([log_dic])
    
    df_log_acc.to_sql(name='log_accuracy_onScore', con=engine, if_exists='append', index=False)
    
    return df_avg



# In[40]:

if len(df_unpred_cleaned_games) > 0:
    df_cleaned_unpred = game_cleaner(df_unpred_cleaned_games)
    df_prediction = fn_prediction(df_cleaned_unpred,response)
    df_score_avg = avg_calc(df_prediction,df_cleaned_unpred,response)
else:
    print('There is no new game to be predicted !', flush=True)

print('--- END OF PREDICTION ---',flush=True)
