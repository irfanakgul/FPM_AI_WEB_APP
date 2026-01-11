print('➡️➡️➡️➡️➡️ BB FUTURE - LEAGUE-PULL started ⬅️⬅️⬅️⬅️⬅️')

import os
import sys
import re
import time
import signal
import warnings
import sqlite3
from datetime import datetime, timedelta
from urllib.parse import urlparse, unquote

import pandas as pd
import numpy as np

from sqlalchemy import create_engine, text

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    WebDriverException,
    TimeoutException,
    StaleElementReferenceException
)

from openpyxl import load_workbook
from pandas.io.formats.excel import ExcelFormatter

import nbimporter

from bb_initial import (
    engine,
    bb_firefox_on,
    bb_is_active,
    bb_lst_double_lg_list
)

warnings.filterwarnings("ignore")
class BadGatewayException(Exception):
    pass
start_time = time.time()

init_bb_firefox_on = bb_firefox_on


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



df_tbl_future = fn_read_data_db('BB_futureGames')

# list out leagues for keep short list 
# df_tbl_future = df_tbl_future[~df_tbl_future['Lig'].isin(out_leagues)]
lst_gamelink = list(df_tbl_future['GameLink'])
print(f'** Total future game size = {len(lst_gamelink)}')
lst_real_sec_standing = list(fn_read_data_db('BB_League_List')['Link'])

def accept_cookies(driver):
    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    cookies = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button#didomi-notice-agree-button')))
    cookies.click()


def extract_league_name(url):
    path = urlparse(url).path  # URL'nin yol kısmını al
    parts = path.split('/')  # Bölümlere ayır
    if len(parts) > 2:
        hash_code = link.split("/")[-1]

        return unquote(parts[2]),hash_code  # Lig ismini çözümleyerek döndür
    return '-', '-noHash-'  # Geçerli bir lig ismi bulunamazsa None döndür


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



def fn_collect_standing_from_future(link):

    driver = fn_driverStart(init_bb_firefox_on)

    # open driver
    # driver = webdriver.Firefox()
    driver.get(link)

    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    time.sleep(3)

    accept_cookies(driver)

    # Belirtilen XPath ile öğeyi bul
    element = driver.find_element(By.XPATH, '/html/body/div[5]/div[1]/div[1]/div/p')

    # Bu öğenin içindeki linki al
    link = element.find_element(By.TAG_NAME, 'a')

    # Linkin href özelliğini yazdır
    link = link.get_attribute('href')

    driver.quit()    

    return link


#updated with new. from tuesday to monday
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



def fn_link_clean(link):
    if '/fikstur' in link:
        return link.replace('/fikstur', '')
    return link


runtime = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
print(f'* New Standing is being found * Total list size: {len(lst_gamelink)} *')

for index, link in enumerate(lst_gamelink):
    # if (index == 20) or (index == 50) or index % 100 == 0:  # 100'ün katı mı kontrol et
    #     print(f"COUNT IDX: {index}  : {link}")
    try:
        print(f'inProgress {index} | {link}')
        link_raw= fn_collect_standing_from_future(link)
        std_link = fn_link_clean(link_raw) # drop fikstur link, to standing link
        ligName, hash_code = extract_league_name(std_link)
        
    except Exception as e:
        print(f"Error link: {index}-{link} ")
        
        dic = {'GameLink':link,
               'Period':set_week_period(),
               'RunTime':f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'}
        df = pd.DataFrame([dic])
        df.to_sql(name='BB_LG_FTR_SCANNER_errorList', con=engine, if_exists='append', index=False)
        
        continue  # Hata olduğunda döngünün bir sonraki iterasyona geçmesini sağlar

    lst_collect_sec_standing = list(fn_read_data_db('BB_LG_FTR_SCANNER')['Link'])
    
    if (std_link not in lst_real_sec_standing) and (std_link not in lst_collect_sec_standing):
    # if std_link not in lst_collect_sec_standing:
    
        df_res = pd.DataFrame([{'LeagueName':'-', 'FullName': ligName, 'Link': std_link, 'is_active': 'new'}])
        df_res['league_hashcode'] = df_res['Link'].str.split('/').str[-1]
        df_res['Category'] = 'new'
        df_res['PRIO'] = 'new'
        df_res['RunTime'] = runtime
        try:
            df_res.to_sql(name='BB_LG_FTR_SCANNER', con=engine, if_exists='append', index=False)
            print(f'-----------> {index} - {ligName} added to DB :MK_LG_FTR_SCANNER <-----------')
        except Exception as e:
            print(f'!! INFO Error> index: {index}    - URL:{std_link} error: {e}')
            continue

print(f"RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")
print('⏮️⏮️⏮️⏮️⏮️ BB FUTUR-LEAGUE-PULL ended ⏭️⏭️⏭️⏭️⏭️')

