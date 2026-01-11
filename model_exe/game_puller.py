#!/usr/bin/env python
# coding: utf-8
import signal
from initial import engine, as_future, best_league, int_jump, limit,football_games_link,firefox_on
import re
from selenium import webdriver # pyright: ignore[reportMissingImports]
from selenium.webdriver.common.by import By # type: ignore
from selenium.common.exceptions import TimeoutException # type: ignore
import time
from selenium.webdriver.support.ui import WebDriverWait # type: ignore
from selenium.webdriver.support import expected_conditions as EC # type: ignore
import pandas as pd, numpy as np
import os,sys
from sqlalchemy import text
from selenium.webdriver.firefox.options import Options # type: ignore
from colorama import Fore, Style, Back # type: ignore
from datetime import datetime, timedelta
import warnings
from datetime import datetime

warnings.filterwarnings('ignore')
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



def fn_SelectStartDate_set(db_lastStartdate, db_repeat):
    # identify how many time will be clicked to calendar as day,month, year
    dd,mm,yyyy = datetime.now().strftime("%d/%m/%Y").split("/")

    # adjustement of run time to select start date
    if db_repeat == 0:
        start_date = db_lastStartdate
        db_repeat += 1
        dic = {'given_date':start_date, 'repeat':db_repeat}
        df = pd.DataFrame([dic])
        # DataFrame'i yeni bir tablo olarak veritabanına yaz

        df.to_sql(name='log_time_jump', con=engine, if_exists='replace', index=False)
    else:
        start_date = db_lastStartdate
        print(Back.RED + f'!!! Driver stopt and reloaded with date: {start_date} !!!'+ Style.RESET_ALL, flush=True)
    
    # Kullanıcıdan başlangıç tarihini iste
    start_year = int(start_date.split('-')[2])
    start_month = int(start_date.split('-')[1])
    start_day = int(start_date.split('-')[0])
    
    diff_year = int(yyyy) - int(start_year)
    diff_month = int(start_month) - int(mm)
    return diff_year,12-diff_month,start_day


# In[7]:


def clickStartDate(driver,diff_year,diff_month,selectedDay,db_lastStartdate):
    # based on fn_SelectStartDate_set output, this func will click and select start date    
    # open calendar
    driver.find_element(By.CSS_SELECTOR, ".widget-dateslider__datepicker-toggle").click()
    time.sleep(1)
    xpth = "/html/body/div[5]/div/main/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div/div[1]/div[2]/div[3]"
    driver.find_element(By.XPATH, xpth).click()
    
    yy_count = 0
    while yy_count!=diff_year:
        driver.find_element(By.CSS_SELECTOR, "div.widget-datepicker__selector:nth-child(2) > div:nth-child(1)").click()
        yy_count+=1

    while diff_month>0:
        driver.find_element(By.CSS_SELECTOR, "div.widget-datepicker__selector:nth-child(1) > div:nth-child(1)").click()
        diff_month-=1

    calendar_body = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, '[class="widget-datepicker__calendar-body"]'))
        )

    
    calendar_body_xpath = "/html/body/div[5]/div/main/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div/div[2]/table/tbody"
    container_calendar_body = driver.find_element(By.XPATH, calendar_body_xpath)
    day_rows = container_calendar_body.find_elements(By.CLASS_NAME, 'widget-datepicker__calendar-body-cell')
    
    
    # update and align selected days and pulled website day
    upd_selectedDay = datetime.strptime(db_lastStartdate, "%d-%m-%Y")
    updated_selected_day = upd_selectedDay.strftime("%Y-%m-%d")
    
    for day in day_rows:
        if day.get_attribute('data-date') == updated_selected_day:
            day.click()


# In[8]:


def accept_cookies(driver):
    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    cookies = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button#didomi-notice-agree-button')))
    cookies.click()


# In[9]:


def date_handle(date):
    # change pulled year as 2024. it was pulled as 24
    updatedDate = datetime.strptime(date, "%d-%m-%y")
    date = updatedDate.strftime("%d-%m-%Y")
    return date


# In[10]:


def idx_find(L, text,jump):
    # searching regarding column name and selection odds correctly. return -1 : np.nan
    for idx, value in enumerate(L):
        if text in str(value):
            get_idx = L.index(value)
            return get_idx + jump
    return -1


# In[11]:


def find_IYScore(L):
    #find IY Score
    for data in L:
        if isinstance(data, str):
            match = re.search(r'\(İY (\d+) - (\d+)\)', data)
            if match:
                return match.group(1) + '-' + match.group(2)
    return '-'


# In[12]:


def find_lig(L, patern):
    #find lig
    for data in L:
        lig = re.search(patern, data)
        if lig:
            return lig.group(1).strip()
    return None


# In[13]:


def filter_dataframe(df, column1, column2, keywords,game_link,count,db_lastStartdate):
    new_df = df.copy()
    for index, row in new_df.iterrows():
        if any(keyword in row[column1] or keyword in row[column2] for keyword in keywords):
            df.to_sql(name='issue_char', con=engine, if_exists='append', index=False)
            df_disabledlink = pd.DataFrame([game_link], columns=['gameLink'])
            df_disabledlink['gameDate'] = db_lastStartdate
            df_disabledlink['runTime'] = f"{datetime.now().strftime('%d-%m-%Y, %H:%M')} - X -"
            df_disabledlink.to_sql(name='disabled_game_links', con=engine, if_exists='append', index=False)
            
            new_df = new_df.drop(index)
    return new_df


# In[14]:


def fn_RepeatLastGivenDate():
    # adjust start date for first run
    query = "SELECT given_date,repeat FROM log_time_jump"
    df_logTime = pd.read_sql(query,engine)
    db_lastStartdate = df_logTime.loc[0,'given_date']
    repeat_count = df_logTime.loc[0,'repeat']
    return db_lastStartdate,repeat_count


# In[15]:


def fn_get_currentDate(driver):
    # get current page date to check if it is same with given date
    elements = driver.find_element(By.CSS_SELECTOR, "[id^='widget-livescore-match-row-']")
    first_element = f"#{elements.get_attribute('id')}"
    new_element = driver.find_element(By.CSS_SELECTOR, first_element)
    curent_date = new_element.get_attribute("data-match-date")
    str_current_date = f"{curent_date.split('-')[2].split(' ')[0]}-{curent_date.split('-')[1]}-{curent_date.split('-')[0]}"
    return str_current_date


# In[16]:


def fn_extract_teamsFromLink(gameLink):
    pre_home, pre_away = gameLink.split('-vs-')
    str_home = pre_home.split('/')[-1]
    str_away = pre_away.split('/')[0]
    return str_home,str_away


# In[17]:


def fn_driverStart(firefox_on):

    global GLOBAL_DRIVER   # 🔑

    if firefox_on == True:
        driver = webdriver.Firefox()

    else:

        # # Firefox için headless seçeneği oluşturun
        firefox_options = Options()
        firefox_options.add_argument('--headless')
        
        #start driver
        driver = webdriver.Firefox(options=firefox_options)

    
    # Hedef web sitesine gidin
    macKolikUrl = football_games_link #"https://www.mackolik.com/futbol/canli-sonuclar"
    driver.get(macKolikUrl)
    time.sleep(4)
    accept_cookies(driver)
    time.sleep(4)

    return driver


# In[18]:


def date_period_check(date, as_future):
    # check given date is it past or future date. 
    date_type= "%d-%m-%Y"
    given_date = datetime.strptime(date, date_type)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    if as_future == False:
        if (given_date > today) or (given_date == today):
            return "future"
        else:
            return "past"
    else:
        return "as_future"


# In[19]:


#renewed
def raw_cleaner(L, game_date,as_future,cursor):
    # make a df on collected data
    
    
    # if not any data, assign nan value
    L.append(np.nan) 
    IlkYariSonucu=''
    MacSonucu=''
    
    
    if any("ERT" in str(item) for item in L):
        MacSonucu = "ERT"
        IlkYariSonucu = '-'
    elif any("components" in str(item) for item in L):
        IlkYariSonucu = '-'
        MacSonucu = '-'
    else:
        IlkYariSonucu = find_IYScore(L)
        MacSonucu = f"{L[2]}-{L[4]}"

    # add game time as hour for future. 
    if cursor == 'future':
        try:
            time = L[3]
        except:
            time = 'time_error'
    else:
        time = '-'

            
    cleaned = {
  
        # 'MacTarihi':date_handle(find_date_format(L)),
        # 'MacTarihi':find_date_format(L),
        'MacTarihi':game_date,
        'Time': time,
        'EvSahibi':L[0],
        'KonukEkip':L[1],
        'Lig':find_lig(L, r'\|\s*(.*?)\s*\|'),
        'IlkYariSonucu': IlkYariSonucu,
        'MacSonucu': MacSonucu,
        
        'Ms1': L[idx_find(L, 'MAÇ SONUCU',2)],
        'Ms0':L[idx_find(L, 'MAÇ SONUCU',4)],
        'Ms2':L[idx_find(L, 'MAÇ SONUCU',6)],
        
        'CS10':L[idx_find(L, 'ÇIFTE ŞANS',2)],
        'CS12':L[idx_find(L, 'ÇIFTE ŞANS',4)],
        'CS02':L[idx_find(L, 'ÇIFTE ŞANS',6)],
        
        'H10Ms1':L[idx_find(L, 'HND. MS (1:0)',2)],
        'H10Ms0':L[idx_find(L, 'HND. MS (1:0)',4)],
        'H10Ms2':L[idx_find(L, 'HND. MS (1:0)',6)],
        'H20Ms1':L[idx_find(L, 'HND. MS (2:0)',2)],
        'H20Ms0':L[idx_find(L, 'HND. MS (2:0)',4)],
        'H20Ms2':L[idx_find(L, 'HND. MS (2:0)',6)],
        'H30Ms1':L[idx_find(L, 'HND. MS (3:0)',2)],
        'H30Ms0':L[idx_find(L, 'HND. MS (3:0)',4)],
        'H30Ms2':L[idx_find(L, 'HND. MS (3:0)',6)],
        'H01Ms1':L[idx_find(L, 'HND. MS (0:1)',2)],
        'H01Ms0':L[idx_find(L, 'HND. MS (0:1)',4)],
        'H01Ms2':L[idx_find(L, 'HND. MS (0:1)',6)],
        'H02Ms1':L[idx_find(L, 'HND. MS (0:2)',2)],
        'H02Ms0':L[idx_find(L, 'HND. MS (0:2)',4)],
        'H02Ms2':L[idx_find(L, 'HND. MS (0:2)',6)],
        'H03Ms1':L[idx_find(L, 'HND. MS (0:3)',2)],
        'H03Ms0':L[idx_find(L, 'HND. MS (0:3)',4)],
        'H03Ms2':L[idx_find(L, 'HND. MS (0:3)',6)],
        
        'Ms1den1':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',2)],
        'Ms0dan1':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',4)],
        'Ms2den1':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',6)],       
        'Ms1den0':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',8)],
        'Ms0dan0':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',10)],
        'Ms2den0':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',12)],
        'Ms1den2':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',14)],
        'Ms0dan2':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',16)],
        'Ms2den2':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',18)],
        
        'Alt15':L[idx_find(L, '1,5 ALT/ÜST',2)],
        'Ust15':L[idx_find(L, '1,5 ALT/ÜST',4)],
        'Alt25':L[idx_find(L, '2,5 ALT/ÜST',2)],
        'Ust25':L[idx_find(L, '2,5 ALT/ÜST',4)],
        'Alt35':L[idx_find(L, '3,5 ALT/ÜST',2)],
        'Ust35':L[idx_find(L, '3,5 ALT/ÜST',4)],
        'Alt45':L[idx_find(L, '4,5 ALT/ÜST',2)],
        'Ust45':L[idx_find(L, '4,5 ALT/ÜST',4)],
        'Alt55':L[idx_find(L, '5,5 ALT/ÜST',2)],
        'Ust55':L[idx_find(L, '5,5 ALT/ÜST',4)],
        
        'MS1VE15A':L[idx_find(L, 'MS VE 1,5 ALT/ÜST',2)],
        'MS0VE15A':L[idx_find(L, 'MS VE 1,5 ALT/ÜST',4)],
        'MS2VE15A':L[idx_find(L, 'MS VE 1,5 ALT/ÜST',6)],
        'MS1VE15U':L[idx_find(L, 'MS VE 1,5 ALT/ÜST',8)],
        'MS0VE15U':L[idx_find(L, 'MS VE 1,5 ALT/ÜST',10)],
        'MS2VE15U':L[idx_find(L, 'MS VE 1,5 ALT/ÜST',12)],
        'MS1VE25A':L[idx_find(L, 'MS VE 2,5 ALT/ÜST',2)],
        'MS0VE25A':L[idx_find(L, 'MS VE 2,5 ALT/ÜST',4)],
        'MS2VE25A':L[idx_find(L, 'MS VE 2,5 ALT/ÜST',6)],
        'MS1VE25U':L[idx_find(L, 'MS VE 2,5 ALT/ÜST',8)],
        'MS0VE25U':L[idx_find(L, 'MS VE 2,5 ALT/ÜST',10)],
        'MS2VE25U':L[idx_find(L, 'MS VE 2,5 ALT/ÜST',12)],
        'MS1VE35A':L[idx_find(L, 'MS VE 3,5 ALT/ÜST',2)],
        'MS0VE35A':L[idx_find(L, 'MS VE 3,5 ALT/ÜST',4)],
        'MS2VE35A':L[idx_find(L, 'MS VE 3,5 ALT/ÜST',6)],
        'MS1VE35U':L[idx_find(L, 'MS VE 3,5 ALT/ÜST',8)],
        'MS0VE35U':L[idx_find(L, 'MS VE 3,5 ALT/ÜST',10)],
        'MS2VE35U':L[idx_find(L, 'MS VE 3,5 ALT/ÜST',12)],
        ### kalan satirlari sor ve ona gore yap
        'IYAlt05':L[idx_find(L, '1. YARI DEPLASMAN 0,5 ALT/ÜST',2)],
        'IYUst05':L[idx_find(L, '1. YARI DEPLASMAN 0,5 ALT/ÜST',4)],
        #####
        'IYAlt25':L[idx_find(L, 'EV SAHIBI 2,5 A/Ü',2)],
        'IYUst25':L[idx_find(L, 'EV SAHIBI 2,5 A/Ü',4)],
        #####
        'IYAlt15':L[idx_find(L, 'EV SAHIBI 1,5 A/Ü',2)],
        'IYUst15':L[idx_find(L, 'EV SAHIBI 1,5 A/Ü',4)],
        
        ####EV SAHIBI 0,5 A/Ü
        'Ev05Alt':L[idx_find(L, 'EV SAHIBI 0,5 A/Ü',2)],
        'Ev05Ust':L[idx_find(L, 'EV SAHIBI 0,5 A/Ü',4)],
        ####EN ÇOK GOL OLACAK YARI
        'EnCokGol1Yari':L[idx_find(L, 'EN ÇOK GOL OLACAK YARI',2)],
        'EnCokGolEsit':L[idx_find(L, 'EN ÇOK GOL OLACAK YARI',4)],
        'EnCokGol2Yari':L[idx_find(L, 'EN ÇOK GOL OLACAK YARI',6)],
        ###DEPLASMAN 2,5 A/Ü
        'Dep25Alt':L[idx_find(L, 'DEPLASMAN 2,5 A/Ü',2)],
        'Dep25Ust':L[idx_find(L, 'DEPLASMAN 2,5 A/Ü',4)],
        #####
        'Dep05Alt':L[idx_find(L, 'DEPLASMAN 0,5 A/Ü',2)],
        'Dep05Ust':L[idx_find(L, 'DEPLASMAN 0,5 A/Ü',4)],
        ###DEPLASMAN 1,5 A/Ü
        'Dep15Alt':L[idx_find(L, 'DEPLASMAN 1,5 A/Ü',2)],
        'Dep15Ust':L[idx_find(L, 'DEPLASMAN 1,5 A/Ü',4)],
        ####EV SAHIBI İKI YARIYI DA KAZANIR
        'Ms1den1':L[idx_find(L, 'EV SAHIBI İKI YARIYI DA KAZANIR',2)],
        'Ms2den2':L[idx_find(L, 'EV SAHIBI İKI YARIYI DA KAZANIR',4)],
        ####1. YARI EV SAHIBI 0,5 ALT/ÜST
        'IYEv05Alt':L[idx_find(L, '1. YARI EV SAHIBI 0,5 ALT/ÜST',2)],
        'IYEv05Ust':L[idx_find(L, '1. YARI EV SAHIBI 0,5 ALT/ÜST',4)],
        ####DEPLASMAN İKI YARIYI DA KAZANIR
        'Ms2den2':L[idx_find(L, 'DEPLASMAN İKI YARIYI DA KAZANIR',2)],
        'Ms1den1':L[idx_find(L, 'DEPLASMAN İKI YARIYI DA KAZANIR',4)],
        
        ##bazi maclarin idaa oranlarinda kisaltma kodlari yok!!!!
        'Iy1':L[idx_find(L, '1. YARI SONUCU',2)],
        'Iy0':L[idx_find(L, '1. YARI SONUCU',4)],
        'Iy2':L[idx_find(L, '1. YARI SONUCU',6)],
        #TEK/ÇIFT
        'TEK':L[idx_find(L, 'TEK/ÇIFT',2)],
        'CIFT':L[idx_find(L, 'TEK/ÇIFT',4)],
        #KARŞILIKLI GOL
        'KgVar':L[idx_find(L, 'KARŞILIKLI GOL',2)],
        'KgYok':L[idx_find(L, 'KARŞILIKLI GOL',4)],
        
        'Iy1':L[idx_find(L, '1. YARI SONUCU 17298 MBS 1',2)],
        'Iy0':L[idx_find(L, '1. YARI SONUCU 17298 MBS 1',4)],
        'Iy2':L[idx_find(L, '1. YARI SONUCU 17298 MBS 1',6)],

        'Ev15Alt': L[idx_find(L, 'EV SAHIBI 1,5 A/Ü 17322 MBS 1',2)],
        'Ev15Ust': L[idx_find(L, 'EV SAHIBI 1,5 A/Ü 17322 MBS 1',4)],

        'Ev25Alt': L[idx_find(L, 'EV SAHIBI 2,5 A/Ü 17323 MBS 1',2)],
        'Ev25Ust' : L[idx_find(L, 'EV SAHIBI 2,5 A/Ü 17323 MBS 1',4)],

        'IYDep05Alt':L[idx_find(L, '1. YARI DEPLASMAN 0,5 ALT/ÜST',2)],
        'IYDep05Ust':L[idx_find(L, '1. YARI DEPLASMAN 0,5 ALT/ÜST',4)],

        'IYKgVar': L[idx_find(L, '1. YARI KARŞILIKLI GOL',2)],
        'IYKgYok': L[idx_find(L, '1. YARI KARŞILIKLI GOL',4)],

        'IYEnCokKorner1': L[idx_find(L, '1. YARI EN ÇOK KORNER',2)],
        'IYEnCokKorner0': L[idx_find(L, '1. YARI EN ÇOK KORNER',4)],
        'IYEnCokKorner2': L[idx_find(L, '1. YARI EN ÇOK KORNER',6)],

        'Skor00': L[idx_find(L, 'MAÇ SKORU',2)],
        'Skor10': L[idx_find(L, 'MAÇ SKORU',14)],
        'Skor20': L[idx_find(L, 'MAÇ SKORU',26)],
        'Skor30': L[idx_find(L, 'MAÇ SKORU',38)],
        'Skor40': L[idx_find(L, 'MAÇ SKORU',46)],
        'Skor50': L[idx_find(L, 'MAÇ SKORU',52)],

        'Skor01': L[idx_find(L, 'MAÇ SKORU',4)],
        'Skor02': L[idx_find(L, 'MAÇ SKORU',6)],
        'Skor03': L[idx_find(L, 'MAÇ SKORU',8)],
        'Skor04': L[idx_find(L, 'MAÇ SKORU',10)],
        'Skor05': L[idx_find(L, 'MAÇ SKORU',12)],

        'Skor11': L[idx_find(L, 'MAÇ SKORU',16)],
        'Skor22': L[idx_find(L, 'MAÇ SKORU',30)],
        'Skor33': L[idx_find(L, 'MAÇ SKORU',44)],

        'Skor21': L[idx_find(L, 'MAÇ SKORU',28)],
        'Skor31': L[idx_find(L, 'MAÇ SKORU',40)],
        'Skor41': L[idx_find(L, 'MAÇ SKORU',48)],
        'Skor51': L[idx_find(L, 'MAÇ SKORU',54)],

        'Skor12': L[idx_find(L, 'MAÇ SKORU',18)],
        'Skor32': L[idx_find(L, 'MAÇ SKORU',42)],
        'Skor42': L[idx_find(L, 'MAÇ SKORU',50)],

        'Skor13': L[idx_find(L, 'MAÇ SKORU',20)],
        'Skor14': L[idx_find(L, 'MAÇ SKORU',22)],
        'Skor15': L[idx_find(L, 'MAÇ SKORU',24)],
        'Skor23': L[idx_find(L, 'MAÇ SKORU',32)],
        'Skor24': L[idx_find(L, 'MAÇ SKORU',34)],
        
        'runTime':datetime.now().strftime('%d-%m-%Y, %H:%M')
 
    }
    # delete of fake last Nan value (-1)
    L.pop()
    
    df = pd.DataFrame([cleaned])
        
    return df


# In[20]:


def link_correction(link):
    """
    Mackolik maç linkini kontrol eder. Eğer içinde '/iddaa/' yoksa uygun yere ekler.
    """
    if "/karsilastirma/" in link:
        return link  # Zaten doğru formatta

    try:
        # "mac/" sonrası kısmı ayır
        parts = link.split("/mac/")
        if len(parts) != 2:
            return link  # Beklenmeyen format

        mac_kismi = parts[1]  # Örnek: "haiti-vs-curaçao/54mtgy40apxv65rbm8ggits7o"
        if mac_kismi.count("/") != 1:
            return link  # Beklenen format: "takim1-vs-takim2/id"

        mac_adi, mac_id = mac_kismi.split("/")
        yeni_link = f"{parts[0]}/mac/{mac_adi}/karsilastirma/{mac_id}"
        yeni_link = yeni_link.replace('iddaa/', '')
        print(f'<old link: {link}', flush=True)
        print(f'<GameLink corrected: {yeni_link}', flush=True)
        return yeni_link

    except Exception:
        return link  # Her ihtimale karşı hata durumunda orijinal linki döner


# In[21]:


def fn_driverRun(as_future,best_league,limit,int_jump):
    # main run func
    
    # go to website url
    macKolikUrl = "https://www.mackolik.com/futbol/canli-sonuclar"
    
    # fileName = input('Entry which date you will pull!')
    
    start_time = time.time()
    
#     engine = create_engine(
#     f"sqlite:///{DB_PATH}",
#     connect_args={"check_same_thread": False},
#     poolclass=StaticPool,
# )
    
    db_lastStartdate, repeat_count = fn_RepeatLastGivenDate()
    
    #identfy future or past 
    cursor = date_period_check(db_lastStartdate,as_future)
    # cursor = 'future'
    
    # calc how many time will be clicked on day, month and year on calendar
    diff_year,diff_month,selected_day = fn_SelectStartDate_set(db_lastStartdate,repeat_count)
     
    driver = fn_driverStart(firefox_on)
    
    #select given date to start pulling
    clickStartDate(driver,diff_year,diff_month,selected_day,db_lastStartdate)

    time.sleep(15)
    
    # check if current page container is the same with given date
    str_pageCurrent_date = fn_get_currentDate(driver)
    
    # refresh driver 3 times. and try until when current page date and given date are the same
    driver_count = 0
    while db_lastStartdate != str_pageCurrent_date:
        print(Fore.RED +f"### Given Date: {db_lastStartdate}, Page Date: {str_pageCurrent_date} ###" + Style.RESET_ALL, flush=True)
        
        #reload website
        driver.get(macKolikUrl)
        time.sleep(5)
        #select given date to start pulling
        clickStartDate(driver,diff_year,diff_month,selected_day,db_lastStartdate)
        
        time.sleep(30)
        driver_count += 1
        str_pageCurrent_date = fn_get_currentDate(driver)
        print(Back.RED +f'??? Given date and page date is not matching!!! TRYING: {driver_count} ??? '+ Style.RESET_ALL, flush=True)
        if driver_count == 3:
            break
    
    # do when dates are matching.
    if db_lastStartdate == fn_get_currentDate(driver):
        print(f"** Given Date: {db_lastStartdate}, Page Date: {fn_get_currentDate(driver)} \u2705 **", flush=True)
        
        container = driver.find_element(By.XPATH, "/html/body/div[5]/div/main/div[1]/div[1]/div[2]")
    
        # 'match-row__score' class'ına sahip tüm satırları bul
        score_rows = container.find_elements(By.CLASS_NAME, 'match-row__score')

        # Href linklerini içerecek bir liste oluştur
        href_links = []

        # Her satır için href linkini listeye ekle
        for row in score_rows:
            href = row.get_attribute('href')
            if href:
                href_links.append(href)


        # add /iddaa/ to each game link
        new_links = []
        for link in href_links:
            # adjust link for future games
            if cursor == 'future':
                new_links.append(f"{link.rsplit('/', 2)[0]}/iddaa/{link.rsplit('/', 2)[2]}")

            # adjust link for past games
            elif (cursor == 'past') | (cursor == 'as_future'):
                new_links.append(f"{link.rsplit('/', 1)[0]}/iddaa/{link.rsplit('/', 1)[1]}")

        print(f"---Found {len(new_links)} games: ({cursor}) -------", flush=True)

        # Yeni bir sekme aç
        driver.execute_script("window.open('');")

        # Açılan son sekmenin handle'ını al
        new_tab_handle = driver.window_handles[-1]

        # Yeni sekme üzerinde işlem yapmak için ana pencereyi değiştir
        driver.switch_to.window(new_tab_handle)

        result_df_list = []
        # log pulled data
        pulled_count = 0



        #check disabled link for past and future
        query_disabledLinks = "SELECT gameLink FROM disabled_game_links"
        df_db_disabledTable = read_sql_case_safe(engine, query_disabledLinks)

        lst_disabled_links = df_db_disabledTable['gameLink'].to_list()
        # check list to write into db. If exist past, if not, write to db
        if cursor == 'past':
            query_results = "SELECT GameLink FROM results"
            df_db = read_sql_case_safe(engine, query_results)
            lst_pulled_gameLinks = df_db['GameLink'].to_list()
        elif cursor == 'future':
            query_future_results = "SELECT GameLink FROM tbl_futureGames"
            df_db = read_sql_case_safe(engine, query_future_results)
            lst_pulled_gameLinks = df_db['GameLink'].to_list()
            
        elif cursor == 'as_future':
            query_future_results = "SELECT GameLink FROM tbl_real_scores"
            df_db = read_sql_case_safe(engine, query_future_results)
            lst_pulled_gameLinks = df_db['GameLink'].to_list()


        query_allLinks_fromDB = "SELECT game_date FROM only_links_all"
        df_db_onlyLinks = read_sql_case_safe(engine, query_allLinks_fromDB)
        lst_only_links = df_db_onlyLinks['game_date'].to_list()
        
        if db_lastStartdate not in lst_only_links:
            # print(f'^^ All game links on {db_lastStartdate} appended into Database ^^')
            # take all links and sent to db
            df_allLinks_to_db = pd.DataFrame({
                'game_date': [db_lastStartdate],
                'day_links': [','.join(new_links)],  # day_links'i virgülle ayrılmış bir string'e çevirir
                'game_count':[int(len(new_links))],
                'RunTime': [datetime.now().strftime('%d-%m-%Y, %H:%M')]
            })

            if cursor != 'future':
                df_allLinks_to_db.to_sql(name='only_links_all', con=engine, if_exists='append', index=False)

        # count for game number    
        count = 0
        
        # limit pulled game 
        if len(new_links) > limit: 
            if best_league == True:
                if (cursor == 'as_future') or (cursor == 'future'):
                    limit = limit
                    print(f'!!! CAUTION > Limit is open ({limit}) for prediction. Flag: TRUE !!! ', flush=True)
                    new_links = new_links[:limit]
       
        # main for loop
        for game_link in new_links[int_jump:]:
            try:
                
                # if cursor == 'future':
                #     game_link = link_correction(game_link)
                
                # check game is already pulled or not. if not, do all progress below
                if (game_link not in lst_pulled_gameLinks) and (game_link not in lst_disabled_links):
                    # print(game_link)
                                    
                    driver.get(game_link)
                    
                    body_css = WebDriverWait(driver, 6).until(EC.element_to_be_clickable((By.CSS_SELECTOR, "body")))
           
                    body_className = body_css.get_attribute('class')
        
                    count_404 = 0
                    if 'pages-match-soccer' in str(body_className):
                        pass
                    else:
                        # print(f'{count}: {game_link}')
                        # print(f'!!{count}: GET AWAY 404 ERROR !!')
                        while 'pages-match-soccer' not in str(body_className):
                            # print(f'{count}: TRY: {count_404+1}')
                            driver.get(game_link)
                            time.sleep(10)
                            body_css_refreshed = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.CSS_SELECTOR, "body")))
                            body_className_ref = body_css_refreshed.get_attribute('class')
                            
                            if 'pages-match-soccer' in str(body_className_ref):
                                break
                    
                            count_404 += 1
                            if count_404 ==4:
                                break
                    
                    body_css_latest = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.CSS_SELECTOR, "body")))
                            
                    body_className_latest = body_css_latest.get_attribute('class')
                    
                    # check still get away 404 error is active or not. if not, then do follow: 
                    if 'pages-match-soccer' in str(body_className_latest):
    
                        time.sleep(5)
                        # check iddaa button if disabled or not
                        iddia_button = WebDriverWait(driver, 6).until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-item-id='iddaa']")))
                        # get class attribute values...
                        tx = iddia_button.get_attribute('class')
    
    
                        # Check if the iddia_button is disabled
                        if "disabled" not in tx:
                            
                            #--------------------------------------------
                            
                            if cursor == 'future':
                                
                                # Belirli bir öğenin 'data-match-status' değerini almak
                                element = driver.find_element(By.XPATH, '//*[@data-match-status]')  # İlk bulunan öğeyi seçer
                                match_status = element.get_attribute("data-match-status")
                                                        
                                #--------------------------------------------
                            # ara fonksiyon bugunu cekerken, oynanmis maclarda takilmasin diye yapildi. 
                            def fn_check_run(count, pulled_count):
                                
                                """
                                data-match-status="preGame"     > daha oynanmamis
                                data-match-status="liveGame"    > Suan oynaniyor - LIVE
                                data-match-status="postGame"    > oynanmis bitmis. 
                                """
    
                                result = []  # Her bir sayfa için result listesini temizle
    
                            
                                 # Top scoreboard table element
                                mac_scorboard = WebDriverWait(driver, 3).until(
                                    EC.element_to_be_clickable((By.CSS_SELECTOR, "div.p0c-soccer-match-details-header"))
                                )
    
                                    
                                mac_details_data = WebDriverWait(driver, 3).until(
                                    EC.element_to_be_clickable((By.CSS_SELECTOR, ".widget-iddaa-markets__markets-list"))
                                )
                        
                                # Scoreboard as a string
                                scoreboard_text = mac_scorboard.text
                                lines = scoreboard_text.strip().split('\n')
                                for line_sb in lines:
                                    result += [line_sb]
    
                                # Get match details as string text
                                mac_details_data_text = mac_details_data.text
                                detail_lines = mac_details_data_text.strip().split('\n')  # detail_lines is a list
                                for line_md in detail_lines:
                                    result += [line_md]
    
                                crude_df = pd.DataFrame(result, columns=[0])
                                # print(result)
                                cleaned_df = raw_cleaner(list(pd.DataFrame(result, columns=[0])[0]), db_lastStartdate,as_future,cursor)
                                cleaned_df['GameLink'] = game_link
                                # result_df_list.append(cleaned_df)
    
                                # cleaning of some unclear pulled data
                                # cleaned_df = fn_cleanTouch(cleaned_df)
    
                                keywords = ['DUR', 'IPT', 'ERT', '(']
                                cleaned_df = filter_dataframe(cleaned_df, 'IlkYariSonucu','MacSonucu', keywords,game_link,count,db_lastStartdate)
    
                                if cursor == 'past':
                                    # DataFrame'i veritabanındaki bir tabloya eklemek
                                    cleaned_df.to_sql(name='results', con=engine, if_exists='append', index=False)
    
                                elif cursor == 'future':
                                    cleaned_df.to_sql(name='tbl_futureGames', con=engine, if_exists='append', index=False)
                                    cleaned_df.to_sql(name='tbl_future_all_collect_RAW', con=engine, if_exists='append', index=False)
    
                                elif cursor == 'as_future':
                                    cleaned_df.to_sql(name='tbl_real_scores', con=engine, if_exists='append', index=False)
    
                                    cleaned_df['IlkYariSonucu'][0] = '-'
                                    cleaned_df['MacSonucu'][0] = '-'
                                    cleaned_df.to_sql(name='tbl_futureGames', con=engine, if_exists='append', index=False)
    
                                pulled_count +=1
                                # print(f"*** {count}: DONE! - {cleaned_df.loc[0,'EvSahibi']} & {cleaned_df.loc[0,'KonukEkip']}  ***")
                                if cursor != 'past':
                                    print(Fore.GREEN + f"*** {count+int_jump} / {len(new_links)}: OK ***" + Style.RESET_ALL, flush=True)
                                    count += 1
                                    return count,pulled_count
                                else:
                                    count += 1
                                    if count % 100 == 0:
                                        print(Fore.GREEN + f'** Game Number {count+int_jump} OK **' + Style.RESET_ALL, flush=True)
    
                                    return count,pulled_count
                                    
                                
                                # -- end func
                                
                            if cursor == 'past' or cursor == 'as_future':
                                count,pulled_count = fn_check_run(count,pulled_count)
                                
                            elif (cursor == 'future') and (match_status == 'preGame'):
                                count,pulled_count = fn_check_run(count,pulled_count)
                            else:
                                print(Fore.BLUE + f'{count+int_jump}: ! Today and Live game found and skipped! '  + Style.RESET_ALL, flush=True)
                                count +=1
                        
                        else:
                            if cursor != 'future':
                                # str_home, str_away = fn_extract_teamsFromLink(game_link)
                                df_disabledlink = pd.DataFrame([game_link], columns=['gameLink'])
                                df_disabledlink['gameDate'] = db_lastStartdate
                                df_disabledlink['runTime'] = datetime.now().strftime('%d-%m-%Y, %H:%M')
                                df_disabledlink.to_sql(name='disabled_game_links', con=engine, if_exists='append', index=False)
                                # print(f"** {count}: PASSED - Disabled link **")
                                count += 1
                            else:
                                # print(f'*** {count}: Game is not ready for future prediction.Skipped in term !')
                                count += 1
    
                    else:
                        print(Fore.RED + f'?? {count+int_jump}: 404! Get Away problem cannot be fixed. Skipped next game ?? ' + Style.RESET_ALL + game_link, flush=True)
                        # save to db games which skipped due to error!
                        df_error_skipped = pd.DataFrame([game_link], columns=['gameLink-404'])
                        df_error_skipped['gameDate'] = db_lastStartdate
                        df_error_skipped['runTime'] = f"{datetime.now().strftime('%d-%m-%Y, %H:%M')}-E404"
                        df_error_skipped.to_sql(name='issue_error_Links', con=engine, if_exists='append', index=False)
                        # new_links.append(game_link)
                        count += 1
                else:
                    if cursor != 'past':
                        print(Fore.YELLOW + f'^^^{count+int_jump}: Already was pulled before^^^' + Style.RESET_ALL, flush=True)
                        # print(game_link)
                        count += 1
                        
                    else:
                        count += 1
                        if count % 100 == 0:
                            print(Fore.YELLOW + f'*** Game Number {count+int_jump}. Pulled ***' + Style.RESET_ALL, flush=True)

            except TimeoutException:
                # print(f'error {game_link}')
                print(f"TimeoutException Error, Skipping: {game_link}", flush=True)
                continue  # Bir sonrakine geç

        # calc elapsed time
        end_time = time.time()
        minutes = int((end_time - start_time) // 60)
        seconds = (end_time - start_time) % 60

        driver.quit()
        print(Fore.CYAN + f"<<< {pulled_count}/{len(new_links)} games have pulled successfully. Duration: {minutes} min {seconds:.2f} sec. >>>" + Style.RESET_ALL, flush=True)
    else:
        print(Fore.RED +f"!!! GIVEN DATE:'{db_lastStartdate}' CANNOT BE UPLOADED and SKIPPED TO THE NEXT DATE.  !!!" + Style.RESET_ALL, flush=True)
        driver.quit()
    driver.quit()


# In[22]:


def master_collection(engine):
    df_GameDay_result = fn_driverRun(as_future = as_future, best_league=best_league,limit=limit, int_jump=int_jump)
    print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}", flush=True)


# ## TRIGGER CHAPTER

# In[24]:


def fn_dateRange(baslangic_tarihi_str, howMany_day):
    baslangic_tarihi = datetime.strptime(baslangic_tarihi_str, '%d-%m-%Y')

    tarih_listesi = [
        baslangic_tarihi + timedelta(days=gun)
        for gun in range(int(howMany_day))
    ]

    tarih_listesi_str = [
        tarih.strftime('%d-%m-%Y')
        for tarih in tarih_listesi
    ]

    return tarih_listesi_str


# In[25]:


def master_trigger():
    
    if len(sys.argv) < 3:
        print("[ERROR] Missing args. Usage: python game_puller.py <dd-mm-yyyy> <days>", flush=True)
        raise SystemExit(1)

    start_date = sys.argv[1]
    how_many_day = sys.argv[2]
    lst_dateRange = fn_dateRange(start_date, how_many_day)

    print(Back.CYAN + f'||| PARAMETERS || AS_FUTURE: {as_future} | BEST_LEAGUES: {best_league} | START_JUMP: {int_jump} | END LIMIT: {limit} |||' + Style.RESET_ALL, flush=True)
    for date in lst_dateRange:
        tarih = datetime.strptime(date, '%d-%m-%Y')
    
        # Tarihin gününü bulalım (haftanın hangi günü olduğunu)
        day = tarih.strftime('%A')
        print(Fore.MAGENTA + f'\n------------> {date} ({day}) have been started to collect <-----------------' + Style.RESET_ALL, flush=True)
        df = pd.DataFrame({'given_date':date,'repeat':0,'date_range':lst_dateRange})

        df.to_sql(name='log_time_jump', con=engine, if_exists='replace', index=False)
        # master_collection(engine)

        count_run = 0
        try:
            #first run
            master_collection(engine)
        except:
            count_run +=1
            print(Back.RED + f'-------------> Forcing: {count_run} <----------------------'+ Style.RESET_ALL, flush=True)
            try :
                master_collection(engine)
                
            except:
                count_run +=1
                print(Back.RED + f'-------------> Forcing: {count_run} <----------------------'+ Style.RESET_ALL, flush=True)
    
                master_collection(engine)
                
                pass
                
                
    
    print(Back.GREEN + '********************** ENTIRELY SUCCESSFULLY ****************************'+ Style.RESET_ALL, flush=True)
    print(f'PULLED DATES: {lst_dateRange}', flush=True)
    print(f"RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')} |{os.path.basename(__file__)}", flush=True)


# In[ ]:


if __name__ == "__main__":
    master_trigger()


# In[ ]:




