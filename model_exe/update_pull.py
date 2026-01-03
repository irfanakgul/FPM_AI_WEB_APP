#!/usr/bin/env python
# coding: utf-8
print("▶︎ ▶︎ ▶︎ UPDATE ? GAMES started ◀︎ ◀︎ ◀︎")

# In[1]:
import sys
import re
from initial import engine,spreadsheet_id
from func_write_read_to_google import *
from selenium import webdriver # type: ignore
from selenium.webdriver.common.by import By # type: ignore
from selenium.webdriver.support.ui import WebDriverWait # type: ignore
from selenium.webdriver.support import expected_conditions as EC # type: ignore
from selenium.webdriver.firefox.options import Options # type: ignore
from sqlalchemy import text
import time
from pathlib import Path


# 🔹 BASE PATH (PredictionEngine.py'nin olduğu klasör)
BASE_DIR = Path(__file__).resolve().parent
GOOGLE_API_PATH = str(BASE_DIR / "google_api" / "google_api.json")

def log(msg):
    print(msg)
    sys.stdout.flush()


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


# In[4]:

def accept_cookies(driver):
    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    cookies = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button#didomi-notice-agree-button')))
    cookies.click()

# In[6]:


df_log = fn_read_from_google(spreadsheet_id, sheet_name='LOG_FOCUS_MODEL_A',path=GOOGLE_API_PATH)


# In[7]:


lst_only_link = list(df_log[~df_log['STATUS'].isin(['W', 'L', 'D', 'PASS'])]
['GameLink'])


# In[8]:


def fn_start_driver(link, firefox_on=False):
    if firefox_on==False:
        
        firefox_options = Options()
        firefox_options.add_argument('--headless')
    
        # start driver
        driver = webdriver.Firefox(options=firefox_options)
    else:
        
        # open driver
        driver = webdriver.Firefox()
    
    driver.get(link)

    # click/accept cookies
    wait = WebDriverWait(driver, 20)
    time.sleep(3)

    accept_cookies(driver)
    
    return driver,wait


# In[9]:


def fn_collect_results(driver,wait):
    home = away = "?"

    status = driver.find_elements(
        By.CSS_SELECTOR,
        ".p0c-soccer-match-details-header__match-status"
    )
    stage = status[0].text if status else "?"

    if not driver.find_elements(
        By.CSS_SELECTOR,
        ".p0c-soccer-match-details-header__score-time"
    ):
        home = driver.find_element(
            By.CSS_SELECTOR,
            ".p0c-soccer-match-details-header__score-home"
        ).text
        away = driver.find_element(
            By.CSS_SELECTOR,
            ".p0c-soccer-match-details-header__score-away"
        ).text
    driver.quit()
    
    if stage.upper() == 'MS':
        stage = 'MS'
        
    elif ':' in stage:
        stage = 'FUTURE'

    else:
        stage = 'LIVE'

    
    # print(home, away, stage)
    return home, away, stage
    


# In[10]:


def fn_status_calc(home, away, stage):
    score = f'{home}-{away}'

    if stage.upper()=='MS':
        if int(home) > int(away):
            STATUS = 'W'
        elif int(home) < int(away):
            STATUS = 'L'
        else:
            STATUS = 'D'
    elif stage.upper()=='LIVE':
        STATUS = f'LIVE | {home}-{away}'
    elif stage.upper()=='FUTURE':
        STATUS = '?'
    else:
        STATUS = 'ERROR'
    # print(STATUS)
    
    return STATUS


# In[ ]:

#check if the link is exist or not
query = "Select GameLink from _ONLY_SCORES"
lst_exist_links = read_sql_case_safe(engine,query)['GameLink'].tolist()

for link in lst_only_link:
    # print(link)
    try:
        driver,wait = fn_start_driver(link)
        home, away, stage = fn_collect_results(driver,wait)
        NEW_STATUS = fn_status_calc(home, away, stage)

        # add to db for logging
        if stage.upper() == 'MS':
            
            if link not in lst_exist_links:
                dic_output = {
                    'GameLink': link,
                    'HomeScore': home,
                    'AwayScore': away,
                    'Stage': stage,
                    'STATUS': NEW_STATUS
                }

                df_output = pd.DataFrame([dic_output])
                df_output.to_sql(
                    name='_ONLY_SCORES',
                    con=engine,
                    if_exists='append',
                    index=False
                )
                print("Inserted into database.")

            # 3️⃣ Varsa mesaj bas
            else:
                print("Already exists.")

        for sheetName in ['LOG_FOCUS_MODEL_A','FINAL_FOCUS_SELECTION']:
            print(f'inProgress SHEETNAME:{sheetName}')
    
            #update cell on google 
            fn_update_cell_googlesheet(
                spreadsheet_id=spreadsheet_id,
                sheet_name=sheetName,
                filter_col="GameLink",
                filter_value=link,
                target_col="STATUS",
                new_value=NEW_STATUS,
                path=GOOGLE_API_PATH
            )

    except Exception as e:
        NEW_STATUS = 'ERROR-Link'
        
        #update cell on google 
        fn_update_cell_googlesheet(
            spreadsheet_id=spreadsheet_id,
            sheet_name="LOG_FOCUS_MODEL_A",
            filter_col="GameLink",
            filter_value=link,
            target_col="STATUS",
            new_value=NEW_STATUS,
            path=GOOGLE_API_PATH
        )
        print(e,flush=True)
        continue


# In[ ]:

print('<-------- END OF UPDATE ? GAMES -------->')