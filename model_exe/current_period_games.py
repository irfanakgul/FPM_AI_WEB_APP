import sys
from initial import init_version,spreadsheet_id
from func_write_read_to_google import *
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

# 🔹 BASE PATH (PredictionEngine.py'nin olduğu klasör)
BASE_DIR = Path(__file__).resolve().parent
GOOGLE_API_PATH = str(BASE_DIR / "google_api" / "google_api.json")

def log(msg):
    print(msg, flush=True)
    sys.stdout.flush()

def print_table(df):
    print("__TABLE__" + df.to_json(orient="records"), flush=True)

# selection version
version = init_version

########################################## 1- Curren Period Games ########################################
print('-----> Current Period.py started', flush=True)

# %%
def calc_period(tarih_str):
        tarih = datetime.strptime(tarih_str, '%d-%m-%Y')

        # Bir önceki Salı (weekday 1)
        onceki_sali = tarih - timedelta(days=(tarih.weekday() - 1) % 7)

        # Sonraki ilk Pazartesi (weekday 0)
        sonraki_pazartesi = tarih + timedelta(days=(7 - tarih.weekday()) % 7)

        sali_str = onceki_sali.strftime('%d-%m-%Y')
        pazartesi_str = sonraki_pazartesi.strftime('%d-%m-%Y')
        return f"{sali_str}<>{pazartesi_str}"
# %%
df_google = fn_read_from_google(spreadsheet_id, sheet_name='LOG_FOCUS_MODEL_A',path=GOOGLE_API_PATH)
# %%
today_str = datetime.today().strftime("%d-%m-%Y")
curr_period = calc_period(today_str)
print(f"*** CURRENT PERRIOD CODE= {curr_period} ***", flush=True)
# %%
df_google = df_google[['MacTarihi', 'Time', 'STATUS', 'Lig_CODE', 'Lig', 'EvSahibi',
       'KonukEkip','Standing','Prio_Rate', 'CI_Score','Period','RunTime', 'GameLink']]
# %%
df = df_google[df_google['Period']==curr_period]
print(f'---> Current Period size={len(df)} <----', flush=True)

# Pandas kırpmalarını kapat
pd.set_option("display.max_columns", None)
pd.set_option("display.width", None)
pd.set_option("display.max_colwidth", None)
pd.set_option("display.expand_frame_repr", False)

for i in range(len(df)):
    print("-" * 120, flush=True)
    print(" | ".join(map(str, df.iloc[i].values)), flush=True)
    print('\n', flush=True)
    print("-" * 120, flush=True)


# %%
print('========= End of Current Period.py =======', flush=True)
