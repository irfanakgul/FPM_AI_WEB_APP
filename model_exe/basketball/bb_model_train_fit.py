print('➡️➡️➡️➡️➡️ BB MODEL-FIT started ⬅️⬅️⬅️⬅️⬅️')


from pathlib import Path
import pandas as pd, numpy as np
from sqlalchemy import text
from bb_initial import engine,bb_train_table_name,bb_selected_odds_list,bb_exclude_terms,bb_model_first_cleaned_data,bb_target_cols
import sys,time,re
from datetime import datetime
from bb_model_nb import *
from sklearn.metrics import r2_score # type: ignore
from sklearn.model_selection import train_test_split # type: ignore
from joblib import dump # type: ignore
import warnings

warnings.filterwarnings('ignore')

def log(msg):
    print(msg)
    sys.stdout.flush()

start_time = time.time()

# 🔹 BASE PATH (PredictionEngine.py'nin olduğu klasör)
BASE_DIR = Path(__file__).resolve().parent

# 🔹 MODELS PATH
MODELS_DIR = BASE_DIR / "bb_outputs" / "bb_models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


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

print('STEP-1: Clean Train Dataset')

df_raw_data = fn_read_data_db('BB_results')
df_raw_data = df_raw_data[~df_raw_data["MacSonucu"].astype(str).str.contains(":")]


def first_cleaner(df):

    # drop some exc items from df
    exc = ['İPT-Takım', 'IPT','ERT']  # Hariç tutulacak terimler
    exc = [term.lower() for term in exc]
    df['MacSonucu'] = df['MacSonucu'].str.lower()
    mask = ~df['MacSonucu'].str.contains('|'.join(exc), na=False)
    df = df[mask]

    
    print(f'>>First raw dataset size: {len(df)} - {len(df.columns)}<')
    target_cols = ['home_FT','Away_FT']
    
    # split scores > 
    df[['home_FT', 'Away_FT']] = df['MacSonucu'].str.split('-', expand=True)
    
    # drop if no results
    df = df.dropna(subset=target_cols)
    
    # # # replace nan/-/None/ odds into 1.0
  
    selected_odds = ['Ms1', 'Ms2',
       'IY_MS_1_1', 'IY_MS_0_1', 'IY_MS_2_1', 'IY_MS_1_0', 'IY_MS_0_0',
       'IY_MS_2_0', 'IY_MS_1_2', 'IY_MS_0_2', 'IY_MS_2_2', 'IY_HOME',
       'IY_DRAW', 'IY_AWAY']
    df[selected_odds] = df[selected_odds].replace(np.nan, 1.0).replace('-', 1.0)
    df = df[~df.apply(lambda x: x == '').any(axis=1)]
    
    # convert data types

    df.to_sql(name='test_check_df', con=engine, if_exists='replace', index=False)
    
    df[target_cols] = df[target_cols].astype('int32')
    df[selected_odds] = df[selected_odds].astype('float32').round(2)
    df = df.drop(['IlkYariSonucu','MacSonucu'], axis=1)
    
    print(f'^^^ Odds List Type: {bb_selected_odds_list[-1]} ^^')
    print(f'size before exl. groups from leagues: {len(df)}')

    # # Belirli ifadeleri içeren terimler listesi
    # exclude_terms = ['U20', 'Kadınlar', 'u20', 'U19', 'u19','u23', 'kadınlar', 'kadin', 'Kadinlar','Kupa','kupa','KUPA','CUP','Cup','cup','Kupası', 'Bölgesel','U21','Hazırlık','hazirlik'] # >>> from initial
     
    df = df[~df['Lig'].str.contains('|'.join(bb_exclude_terms), case=False, na=False)]

    print(f'size after (input to model) exl. groups from leagues: {len(df)}')

    print(f'** Success /FirstCleaner/: RAW data cleaned. Size: {len(df)} - {len(df.columns)} **')
    df = df[['MacTarihi', 'Time', 'EvSahibi', 'KonukEkip', 'Lig', 'LigCode','home_FT', 'Away_FT', 'P1',
       'P2', 'P3', 'P4', 'Ms1', 'Ms2', 'IY_MS_1_1', 'IY_MS_0_1', 'IY_MS_2_1',
       'IY_MS_1_0', 'IY_MS_0_0', 'IY_MS_2_0', 'IY_MS_1_2', 'IY_MS_0_2',
       'IY_MS_2_2', 'IY_HOME', 'IY_DRAW', 'IY_AWAY', 'GameLink', 'runTime'
       ]]
    # df.to_sql(name='test', con=engine, if_exists='replace', index=False)
    
    return df


df = first_cleaner(df_raw_data)

df.to_sql(name='BB_model_first_cleaned_TrainData', con=engine, if_exists='replace', index=False)

########################################### STEP-2 | MODEL FIT ########################################### 

print('STEP-2: Model FIT')

data_cleaned = df.copy()

# # replace nan/-/None/ odds into 1.0
# df_driver = fn_read_trainData_db('selection_Driver_List',manuelRun)
selected_odds_col = ['Ms1', 'Ms2',
       'IY_MS_1_1', 'IY_MS_0_1', 'IY_MS_2_1', 'IY_MS_1_0', 'IY_MS_0_0',
       'IY_MS_2_0', 'IY_MS_1_2', 'IY_MS_0_2', 'IY_MS_2_2', 'IY_HOME',
       'IY_DRAW', 'IY_AWAY']

def fn_modelFit(df,str_target,RegModel):
    
    # Model Fitting
    X = df[selected_odds_col]
    y = df[str_target]
    
    # Split train test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)
    
    model = RegModel  # loop for each model type
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    accuracy = round(r2_score(y_test, y_pred),2)
    return model,accuracy


def Model_Acc_Calc(df):
    print('$$$ Models are being fitted... $$$')
    
    # dict for collecting of  results
    results = {col: {} for col in bb_target_cols}
        
    # loop for model types
    for str_mdl, RegModel in lst_models:
        
        # loop for target accuracy
        for str_target in bb_target_cols:
            # calc of accuracy
            model, acc = fn_modelFit(df, str_target, RegModel)
            
            # add results into 
            results[str_target][str_mdl] = acc
                        
            # get output of models into local
            model_path = MODELS_DIR / f"mdl_{str_mdl}_{str_target}.joblib"
            dump(model, model_path)

        print(f'>> {str_mdl} have been fitted.')
    
    # get a df on results
    df_accuracy = pd.DataFrame(results)
    df_accuracy = df_accuracy.reset_index()

    df_accuracy = df_accuracy.rename({'index':'Model_Type'},axis=1)
    
    # get mean of each model base on model
    df_accuracy['Model_AVG'] = df_accuracy[bb_target_cols].mean(axis=1)
    df_accuracy['Odds_List'] = bb_selected_odds_list[-1]
    df_accuracy['RunTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
    
    # get mean of target ( mean of all model base on target)
    column_means = df_accuracy.select_dtypes(include=['number']).mean()
    # df_accuracy = df_accuracy.append(column_means, ignore_index=True)
    df_accuracy = pd.concat([df_accuracy, column_means.to_frame().T], ignore_index=True)
    df_accuracy.at[df_accuracy.index[len(model_names)], 'Model_Type'] = "AllModels_AVG"
    
    
    # model score calculation
    df_acc_log = pd.DataFrame(df_accuracy.iloc[-1,:]).T
    df_acc_log['Dataset size'] = f'R: {len(data_cleaned)} - C: {len(data_cleaned.columns)}'
    df_acc_log['Log Time'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
    
    # Bu DataFrame'i 'dfLog.xlsx' adlı bir Excel dosyasına ekle
    # fn_acc_record('../outputs/logs/df_logRecords.xlsx', df_acc_log, header=False, index=False)
    print('** Accuracy scores recorded into log DB. **')

    # write into excel
    df_accuracy.to_sql(name='BB_log_mdl_accuracy_scores', con=engine, if_exists='replace', index=False)
    
    return df_accuracy

df_accuracy = Model_Acc_Calc(data_cleaned)

# Bitiş zamanını alın
end_time = time.time()

# Geçen süreyi hesaplayın
elapsed_time = end_time - start_time

# Geçen süreyi dakika ve saniye olarak ayırın
minutes = int(elapsed_time // 60)
seconds = elapsed_time % 60

print('** Success /Model/ Models fitted and has been written into local **')
print(f"<<< Model has been fitted within {minutes} minute {seconds:.2f} second. >>>")
print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")