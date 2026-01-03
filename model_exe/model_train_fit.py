from pathlib import Path
import pandas as pd, numpy as np
from sqlalchemy import text
from initial import engine,train_table_name,selected_odds_list,exclude_terms,model_first_cleaned_data,target_cols
import sys,time,re
from datetime import datetime
from models_nb import *
from sklearn.metrics import r2_score # type: ignore
from sklearn.model_selection import train_test_split # type: ignore
from joblib import dump # type: ignore
import warnings

warnings.filterwarnings('ignore')

def log(msg):
    print(msg)
    sys.stdout.flush()


# 🔹 BASE PATH (PredictionEngine.py'nin olduğu klasör)
BASE_DIR = Path(__file__).resolve().parent

# 🔹 MODELS PATH
MODELS_DIR = BASE_DIR / "outputs" / "models"
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

# %%
print('---->> STEP-1: MODEL FIT CLEANER <-----',flush=True)

# %%
df_raw_data = fn_read_data_db(train_table_name)
# df_raw_data = df_raw_data.head(1000)
# %%
def first_cleaner(df):
    
    print(f'>>First raw dataset size: {len(df)} - {len(df.columns)}<')
    target_cols = ['home_HT','away_HT','home_FT','Away_FT']
    
    # split scores > 
    df[['home_HT', 'away_HT']] = df['IlkYariSonucu'].str.split('-', expand=True)
    df[['home_FT', 'Away_FT']] = df['MacSonucu'].str.split('-', expand=True)
    
    # drop if no results
    df = df.dropna(subset=target_cols)
    
    # # replace nan/-/None/ odds into 1.0
    df_driver = fn_read_data_db('selection_Driver_List')
    selected_odds = df_driver[df_driver[selected_odds_list]==1]['FeatureName'].tolist()
    df[selected_odds] = df[selected_odds].replace(np.nan, 1.0).replace('-', 1.0)
    df = df[~df.apply(lambda x: x == '').any(axis=1)]
    
    # convert data types
    df[target_cols] = df[target_cols].astype('int32')
    df[selected_odds] = df[selected_odds].astype('float32')
    df = df.drop(['IlkYariSonucu','MacSonucu'], axis=1)
    
    print(f'^^^ Odds List Type: {selected_odds_list[-1]} ^^')
    print(f'size before exl. groups from leagues: {len(df)}')

    # # Belirli ifadeleri içeren terimler listesi     
    df = df[~df['Lig'].str.contains('|'.join(exclude_terms), case=False, na=False)]

    print(f'size after (input to model) exl. groups from leagues: {len(df)}',flush=True)

    df.to_sql(name='model_first_cleaned_TrainData', con=engine, if_exists='replace', index=False)
    print(f'** Success /FirstCleaner/: RAW data cleaned. Size: {len(df)} - {len(df.columns)} **',flush=True)
    return df
# %%
df = first_cleaner(df_raw_data)

# %%
####################### MODEL FIT - TRAINING #######################
print('---->> STEP-2: MODEL FIT STARTED <-----',flush=True)
# %%
start_time = time.time()
# %%
# %run ../inputs/model_notebook/models_nb.ipynb

# %%
data_cleaned = fn_read_data_db(model_first_cleaned_data)

# # replace nan/-/None/ odds into 1.0
df_driver = fn_read_data_db('selection_Driver_List')
selected_odds_col = df_driver[df_driver[selected_odds_list]==1]['FeatureName'].tolist()

# %%
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
# %%
def Model_Acc_Calc(df):
    print('--- > Models are being fitted... <---', flush=True)
    print(f'*** MODEL FIT DATASET SIZE = {len(df)} ***', flush=True)
    
    # dict for collecting of  results
    results = {col: {} for col in target_cols}
        
    # loop for model types
    for str_mdl, RegModel in lst_models:
        
        # loop for target accuracy
        for str_target in target_cols:
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
    df_accuracy['Model_AVG'] = df_accuracy[target_cols].mean(axis=1)
    df_accuracy['Odds_List'] = selected_odds_list[-1]
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
    df_accuracy.to_sql(name='log_mdl_accuracy_scores', con=engine, if_exists='replace', index=False)
    
    # df_accuracy.to_excel(f'../outputs/results/df_accuracy_traindata.xlsx')
    
    return df_accuracy
# %%
df_accuracy = Model_Acc_Calc(data_cleaned)

# %%
# Bitiş zamanını alın
end_time = time.time()

# Geçen süreyi hesaplayın
elapsed_time = end_time - start_time

# Geçen süreyi dakika ve saniye olarak ayırın
minutes = int(elapsed_time // 60)
seconds = elapsed_time % 60

# print('model_first_cleaned_TrainData is dropped for storage saving!')
# clear_table('model_first_cleaned_TrainData')

print('** Success /Model/ Models fitted and has been written into local **')
print(f"<<< Model has been fitted within {minutes} minute {seconds:.2f} second. >>>")
print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")