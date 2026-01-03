#!/usr/bin/env python
# coding: utf-8
print("▶︎ ▶︎ ▶︎ STANDING PULLER started ◀︎ ◀︎ ◀︎")

# In[1]:
from initial import engine
import re
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pandas as pd
import sys
from datetime import datetime, timedelta
from sqlalchemy import text

from selenium.webdriver.firefox.options import Options

import warnings
warnings.filterwarnings('ignore')

class BadGatewayException(Exception):
    pass


start_time = time.time()
# is_active=2
# In[4]:
def log(*args):
    print(*args)
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



is_active=1
runTime = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'


# In[6]:


def time_calc(start_time):
    # Bitiş zamanını alın
    end_time = time.time()

    # Geçen süreyi hesaplayın
    elapsed_time = end_time - start_time

    # Geçen süreyi dakika ve saniye olarak ayırın
    minutes = int(elapsed_time // 60)
    seconds = elapsed_time % 60
    print(f"*** All MK Standings pulled successfully : {minutes} minute {seconds:.2f} second.***")


# In[7]:


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


# In[8]:


def accept_cookies(driver):
    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    cookies = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button#didomi-notice-agree-button')))
    cookies.click()


# In[9]:


def fn_scrap_secondary(link, league):

    # Firefox için headless seçeneği oluşturun
    firefox_options = Options()
    firefox_options.add_argument('--headless')

    # start driver
    driver = webdriver.Firefox(options=firefox_options)
    
    # open driver
    # driver = webdriver.Firefox()

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
    cols = {0:'Position', 2:'TeamName',3:'Week',5:'Win',6:'Draw',7:'Loss',8:'Goal_home',
    9:'Goal_dep',10:'Avarage',11:'Point'}
    df.rename(columns=cols,inplace=True)
    df.drop(1, axis=1,inplace=True)
    df = df.iloc[1:,:]
    df['League'] = league
    df = df[['League','Position','TeamName','Week','Win','Draw','Loss','Goal_home',
    'Goal_dep','Avarage','Point']]
    driver.quit()    
    return df


# In[10]:


#test purpose
# link = 'https://www.mackolik.com/puan-durumu/t%C3%BCrkiye-trendyol-s%C3%BCper-lig/482ofyysbdbeoxauk19yg7tdt'
# league = 'TR_1'
# fn_scrap_secondary(link, league)


# In[ ]:





# In[11]:


# main list
df_secLeagues_all = fn_read_data_db('MK_League_List')
df_secLeagues_all['is_active'] = df_secLeagues_all['is_active'].astype('int32')
df_secLeagues = df_secLeagues_all[df_secLeagues_all['is_active']==is_active].sort_values(by='PRIO').reset_index(drop=True)

# # re-try from error list
# df_secLeagues = fn_read_data_db('MK_WEEKLY_STANDINGS_ERROR_LIST') # from error list trying purpose
# # print('-------/ re-try /------')

# In[12]:

if len(sys.argv) < 3:
    print("[ERROR] Missing arguments. Usage: standing_puller.py <is_append> <respond>")
    sys.exit(1)

# 🔑 SIRAYLA
is_append = sys.argv[1].strip().lower()
respond   = sys.argv[2].strip().lower()


# save current db and adding to standing raw container
curr_period = set_week_period()
df_curr = fn_read_data_db('MK_WEEKLY_STANDINGS')

lst_curr_leagueName = list(df_curr.League)
# df_curr['period'] = curr_period

df_curr['appendTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'

# is_append = input('Current standing will be added to RAW Container? Yes-No? :')

if is_append == 'yes' or is_append == 'Yes' or is_append == 'y' or is_append == 'YES' or is_append == 'Y':

    df_curr.to_sql(name='MK_WEEKLY_STANDINGS_rawContainer', con=engine, if_exists='append', index=False)
    print(f'>> Old standing table added to rawContainer | Period {set_week_period()} | Table: MK_WEEKLY_STANDINGS_rawContainer >> ')

# Clear All_LeaguesStanding table content
# respond = input('MK STANDING table will be cleared? Yes-No? :')

if respond == 'yes' or respond == 'Yes' or respond == 'y' or respond == 'YES' or respond == 'Y':

    combined_df = pd.DataFrame(columns=['League','Position','TeamName','Week','Win','Draw','Loss','Goal_home',
        'Goal_dep','Avarage','Point','period','runTime','Link'])

    # to clear of table in db
    combined_df['runTime'] = ''
    combined_df.to_sql(name='MK_WEEKLY_STANDINGS', con=engine, if_exists='replace', index=False)
    print('!Target table removed!')


# In[13]:

def read_data(tableName):
    query = f"SELECT * FROM {tableName}"
    df = read_sql_case_safe(engine,query)
    df = df[(df['is_active']=='1') & (df['Category']=='double')]
    return df

lst_double_lg_list = list(read_data('MK_League_List')['LeagueName'])

print(f'$$$ Period:{curr_period} %%% ')


def fn_scrap(df_secLeagues,lst_curr_leagueName,curr_period):
    size = len(df_secLeagues)
    print(size,flush=True)
    for index, row in df_secLeagues.iterrows():
       
        # control to start mid index
        if index > -1:
            
            ligName = row['LeagueName']
            link = row['Link']
    
            if link not in lst_curr_leagueName:
                try:
                    print('Starting: ',ligName,flush=True)
                    df = fn_scrap_secondary(link, ligName)
                    # combined_df = pd.concat([combined_df, df], ignore_index=True)
                    df['period'] = curr_period
                    df['runTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
                    df['Link'] = link
    
                    if ligName not in lst_double_lg_list:
                        df.to_sql(name='MK_WEEKLY_STANDINGS', con=engine, if_exists='append', index=False)
                        # print(f'** DONE {index}/{size}: {ligName} - {link} ')
                        print(f'** DONE {index}/{size}: {ligName}')
                    
                    else:
                        print(f'*^*^* DOUBLE LG : {ligName} - {link}  *^*^*')
                        df.to_sql(name='MK_WEEKLY_STANDINGS_DOUBLES', con=engine, if_exists='append', index=False)
                                
                except Exception as e:
                    print(f'!!! ERROR [{type(e).__name__}] : {index}/{size}: {ligName} - {link} !!')
                    df_err = pd.DataFrame([{'LeagueName': ligName, 'Link': link, 'runTime': runTime}])
                    df_err.to_sql(name='MK_WEEKLY_STANDINGS_ERROR_LIST', con=engine, if_exists='append', index=False)
                    continue
            else:
                print(f'# Already pulled: {index}/{size}: {ligName} - {link}')


# In[14]:


# run
fn_scrap(df_secLeagues,lst_curr_leagueName,curr_period)


# In[15]:


# handle double standings. manuel controled
df_doubles = fn_read_data_db('MK_WEEKLY_STANDINGS_DOUBLES')
df_doubles = df_doubles.dropna(subset=['Position', 'TeamName'], how='all')

# get_ipython().run_line_magic('load_ext', 'sql')
# get_ipython().run_line_magic('sql', 'sqlite:///../../database/results.db')

for lg in lst_double_lg_list:
    if lg in lst_double_lg_list:

        df = df_doubles[df_doubles['League']==lg]

        if len(df)>0:
            # DataFrame'in tam ortasını bulalım
            half = len(df) // 2
            
            # Üst kısmı ve alt kısmı ayıralım
            df_upper = df.iloc[:half].reset_index(drop=True)
            df_lower = df.iloc[half:].reset_index(drop=True)
    
            # League sütunundaki mevcut değeri alalım
            lg_upper = df_upper['League'].iloc[0]
            lg_lower = df_lower['League'].iloc[0]
            
            # League sütunundaki değerleri değiştiriyoruz
            df_upper['League'] = df_upper['League'].apply(lambda x: f'{lg_upper}_A')
            df_lower['League'] = df_lower['League'].apply(lambda x: f'{lg_lower}_B')
    
            
            df_upper.to_sql(name='MK_WEEKLY_STANDINGS', con=engine, if_exists='append', index=False)
            df_lower.to_sql(name='MK_WEEKLY_STANDINGS', con=engine, if_exists='append', index=False)
            query = f"DELETE FROM MK_WEEKLY_STANDINGS WHERE League = '{lg}'"
            get_ipython().run_line_magic('sql', '{query}')
        else:
            # query = f"DELETE FROM MK_WEEKLY_STANDINGS WHERE League = '{lg}'"
            get_ipython().run_line_magic('sql', '{query}')
            print(f'! Not found Double standing for: {lg}')
            
# Python ile SQL INSERT işlemi
print(f'** Double standings handled and appended to MK_WEEKLY_STANDINGS ** {lst_double_lg_list}')
time_calc(start_time)
print(f"RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")


