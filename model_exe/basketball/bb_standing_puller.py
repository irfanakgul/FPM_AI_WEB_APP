print('➡️➡️➡️➡️➡️ BB STANDING-PULL started ⬅️⬅️⬅️⬅️⬅️')

import sys
import re
import time
import signal
import warnings
from datetime import datetime, timedelta

import pandas as pd

from sqlalchemy import  text

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC



from bb_initial import (
    engine,
    bb_firefox_on,
    bb_is_active,
    bb_lst_double_lg_list
)

start_time = time.time()

warnings.filterwarnings("ignore")


class BadGatewayException(Exception):
    pass


GLOBAL_DRIVER = None   # 🔑 driver referansı burada tutulacak

def graceful_shutdown(signum, frame):
    print("🛑 STOP SIGNAL RECEIVED — shutting down...", flush=True)

    global GLOBAL_DRIVER
    try:
        if GLOBAL_DRIVER is not None:
            print("🧹 Closing Selenium driver...", flush=True)
            GLOBAL_DRIVER.quit()
    except Exception as e:
        print(f"[WARN] Driver quit error: {e}", flush=True)

    print("✅ Clean shutdown complete", flush=True)
    sys.exit(0)

# 🔥 Sinyalleri dinle
signal.signal(signal.SIGTERM, graceful_shutdown)
signal.signal(signal.SIGINT, graceful_shutdown)


# In[1]:
# open firefox browser or not. True = open
init_bb_firefox_on = bb_firefox_on

#read data    
def fn_read_data_db(tableName):
    # basit güvenlik: sadece harf/rakam/_ izin ver
    if not re.fullmatch(r"[A-Za-z0-9_]+", tableName):
        raise ValueError("Invalid table name")

    query = f'SELECT * FROM "{tableName}"'
    
    return read_sql_case_safe(engine, query)



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


runTime = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'

def time_calc(start_time):
    # Bitiş zamanını alın
    end_time = time.time()

    # Geçen süreyi hesaplayın
    elapsed_time = end_time - start_time

    # Geçen süreyi dakika ve saniye olarak ayırın
    minutes = int(elapsed_time // 60)
    seconds = elapsed_time % 60
    print(f"*** All MK Standings pulled successfully : {minutes} minute {seconds:.2f} second.***")

def set_week_period():
    today = datetime.today()
    weekday = today.weekday()  # 0: Pazartesi, 1: Salı, ..., 6: Pazar

    # Start day: en yakın geçmiş veya bugünkü Salı (ya da yarın eğer bugün Pazartesi)
    if weekday == 0:  # Pazartesi
        start_date = today + timedelta(days=1)  # Yarın (Salı)
    elif weekday == 1:  # Salı
        start_date = today
    elif weekday > 1:  # Çarşamba - Pazar
        days_since_tuesday = (weekday - 1)
        start_date = today - timedelta(days=days_since_tuesday)

    # End day: bir sonraki Pazartesi
    days_until_next_monday = (7 - weekday) % 7
    if days_until_next_monday == 0:
        days_until_next_monday = 7  # Eğer bugün Pazartesi ise, bir sonraki Pazartesi 7 gün sonra
    end_date = today + timedelta(days=days_until_next_monday)

    # Formatla
    start_date_str = start_date.strftime("%d-%m-%Y")
    end_date_str = end_date.strftime("%d-%m-%Y")
    period = f'{start_date_str}<>{end_date_str}'
    
    return period

def accept_cookies(driver):
    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    cookies = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button#didomi-notice-agree-button')))
    cookies.click()

def fn_driverStart(init_bb_firefox_on):
       
    if init_bb_firefox_on == True:
            
        #start driver with open browser
        driver = webdriver.Firefox()
           
    else:
           
        # # Firefox için headless seçeneği oluşturun
        firefox_options = Options()
        firefox_options.add_argument('--headless')

        #start driver without browse
        driver = webdriver.Firefox(options=firefox_options)

    return driver

def fn_scrap_secondary(link, league):

    driver = fn_driverStart(init_bb_firefox_on)
 
    driver.get(link)

    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    time.sleep(5)

    accept_cookies(driver)

    # XPath ile tabloyu bulma
    table = driver.find_element(By.XPATH, f'/html/body/div[5]/div[2]/main/div[1]/div[3]/div[2]/div')

    # Tablo satırlarını al
    rows = table.find_elements(By.TAG_NAME, "tr")

    # Verileri depolamak için bir liste
    data = []

    # Satırlardaki verileri dolaş
    for row in rows:
        # Her satırdaki hücreleri (td) al
        cols = row.find_elements(By.TAG_NAME, "td") 
        cols = [ele.text.strip() for ele in cols]
        data.append(cols)  # Veri listesine ekle
    df = pd.DataFrame(data)
    cols = {0:'Position', 1:'TeamName',2:'Week',3:'Win',4:'Loss',5:'basket_home',6:'basket_away',
    7:'AVG',8:'Point'}
    df.rename(columns=cols,inplace=True)
    # df.drop(1, axis=1,inplace=True)
    df = df.iloc[1:,:]
    df['League'] = league
    df = df[['League','Position','TeamName','Week','Win','Loss','basket_home',
    'basket_away','AVG','Point']]
    driver.quit()    
    return df


# main list
df_secLeagues_all = fn_read_data_db('BB_League_List')
df_secLeagues_all['is_active'] = df_secLeagues_all['is_active'].astype('int32')
df_secLeagues = df_secLeagues_all[df_secLeagues_all['is_active']==bb_is_active].sort_values(by='PRIO').reset_index(drop=True)

# # re-try from error list
# df_secLeagues = fn_read_Data_db('MK_WEEKLY_STANDINGS_ERROR_LIST',manuelRun) # from error list trying purpose
# # print('-------/ re-try /------')

# input from WEB APP (bb model panel)
if len(sys.argv) < 3:
    print("[ERROR] Missing arguments. Usage: standing_puller.py <is_append> <respond>")
    sys.exit(1)

# 🔑 SIRAYLA
is_append = sys.argv[1].strip().lower()
respond   = sys.argv[2].strip().lower()


# save current db and adding to standing raw container
curr_period = set_week_period()
df_curr = fn_read_data_db('BB_WEEKLY_STANDINGS')

lst_curr_leagueName = list(df_curr.League)
# df_curr['period'] = curr_period

df_curr['appendTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'


#asking 1) add to raw container? 
if is_append == 'yes' or is_append == 'Yes' or is_append == 'y' or is_append == 'YES' or is_append == 'Y':
    df_curr.to_sql(name='BB_WEEKLY_STANDINGS_rawContainer', con=engine, if_exists='append', index=False)
    print(f'>> Old standing table added to rawContainer | Period {set_week_period()} | Table: MK_WEEKLY_STANDINGS_rawContainer >> ')


if respond == 'yes' or respond == 'Yes' or respond == 'y' or respond == 'YES' or respond == 'Y':
    combined_df = pd.DataFrame(columns=['League','Position','TeamName','Week','Win','Loss','basket_home',
        'basket_away','AVG','Point','period','runTime','Link'])

    # to clear of table in db
    combined_df['runTime'] = ''
    combined_df.to_sql(name='BB_WEEKLY_STANDINGS', con=engine, if_exists='replace', index=False)
    print('!Target table removed!')




print(f'$$$ Period:{curr_period} %%% ')
def fn_scrap(df_secLeagues,lst_curr_leagueName,curr_period):
    size = len(df_secLeagues)
    print(size)
    for index, row in df_secLeagues.iterrows():
       
        # control to start mid index
        if index > -1:
            
            ligName = row['LeagueName']
            link = row['Link']
    
            if link not in lst_curr_leagueName:
                try:
                    print('Starting: ',ligName)
                    df = fn_scrap_secondary(link, ligName)
                    # combined_df = pd.concat([combined_df, df], ignore_index=True)
                    df['period'] = curr_period
                    df['runTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
                    df['Link'] = link
    
                    if ligName not in bb_lst_double_lg_list:
                        df.to_sql(name='BB_WEEKLY_STANDINGS', con=engine, if_exists='append', index=False)
                        # print(f'** DONE {index}/{size}: {ligName} - {link} ')
                        print(f'** DONE {index}/{size}: {ligName}')
                    
                    else:
                        print(f'*^*^* DOUBLE LG : {ligName} - {link}  *^*^*')
                        df.to_sql(name='BB_WEEKLY_STANDINGS_DOUBLES', con=engine, if_exists='append', index=False)
                            
                except Exception as e:
                    print(f'!!! ERROR [{type(e).__name__}] : {index}/{size}: {ligName} - {link} !!')
                    df_err = pd.DataFrame([{'LeagueName': ligName, 'Link': link, 'runTime': runTime}])
                    df_err.to_sql(name='BB_WEEKLY_STANDINGS_ERROR_LIST', con=engine, if_exists='append', index=False)
                    continue
            else:
                print(f'# Already pulled: {index}/{size}: {ligName} - {link}')


# run
fn_scrap(df_secLeagues,lst_curr_leagueName,curr_period)



time_calc(start_time)
print(f"RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")


print('⏮️⏮️⏮️⏮️⏮️ BB STANDING-PULL ended ⏭️⏭️⏭️⏭️⏭️')
