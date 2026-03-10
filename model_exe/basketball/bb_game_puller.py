print('➡️➡️➡️➡️➡️ BB GAME-PULL started ⬅️⬅️⬅️⬅️⬅️')

import os
import sys
import re
import json
import time
import signal
import warnings
from datetime import datetime, timedelta

import pandas as pd
import numpy as np

from sqlalchemy import text

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException
)


from colorama import Fore, Style, Back

from bb_initial import (
    engine,
    bb_as_future,
    bb_best_league,
    bb_int_jump,
    bb_limit,
    bb_firefox_on,
    basket_games_link
)

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

        df.to_sql(name='BB_log_TimeJump', con=engine, if_exists='replace', index=False)
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


def accept_cookies(driver):
    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    cookies = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button#didomi-notice-agree-button')))
    cookies.click()


def date_handle(date):
    # change pulled year as 2024. it was pulled as 24
    updatedDate = datetime.strptime(date, "%d-%m-%y")
    date = updatedDate.strftime("%d-%m-%Y")
    return date



def idx_find(L, text,jump):
    # searching regarding column name and selection odds correctly. return -1 : np.nan
    for idx, value in enumerate(L):
        if text in str(value):
            get_idx = L.index(value)
            return get_idx + jump
    return -1

def find_lig_new(L):
    idx = [i for i, item in enumerate(L) if " | " in item]
    if len(idx) !=0:
        date, lig= L[idx[0]].split('|')
    else:
        date,lig = None
    return lig

def find_period_score(L, cursor):
    try:
        if cursor == 'past':
            home_p1 = L[8].split(' ')[1]
            home_p2 = L[8].split(' ')[3]
            home_p3 = L[8].split(' ')[5]
            home_p4 = L[8].split(' ')[7]
            
    
            away_p1 = L[9].split(' ')[1]
            away_p2 = L[9].split(' ')[3]        
            away_p3 = L[9].split(' ')[5]
            away_p4 = L[9].split(' ')[7]
            
    
            p1 = f'{home_p1}-{away_p1}'
            p2 = f'{home_p2}-{away_p2}'
            p3 = f'{home_p3}-{away_p3}'
            p4 = f'{home_p4}-{away_p4}'
            
            return p1,p2,p3,p4
        else:
            return '-','-','-','-'
        # if error raised, then set '-' for period. sometimes period scorer are not coming
    except:
        return '-','-','-','-'
    

def find_IYScore(L, cursor):
    if cursor == 'past':
        
        match = re.search(r'\(İY\s*(\d+)\s*-\s*(\d+)\)', L)
        if match:
            return f"{match.group(1)}-{match.group(2)}"
        return None
    else:
        return '-'
    
def find_teams(L,cursor):
    if cursor == 'past':
        home = L[0]
        away = L[5]
    elif cursor == 'future':
        home = L[0]
        away = L[2]

    return home, away


def filter_dataframe(df, column1, column2, keywords,game_link,count,db_lastStartdate):
    new_df = df.copy()
    for index, row in new_df.iterrows():
        if any(keyword in row[column1] or keyword in row[column2] for keyword in keywords):
            df.to_sql(name='BB_issue_char', con=engine, if_exists='append', index=False)
            df_disabledlink = pd.DataFrame([game_link], columns=['gameLink'])
            df_disabledlink['gameDate'] = db_lastStartdate
            df_disabledlink['runTime'] = f"{datetime.now().strftime('%d-%m-%Y, %H:%M')} - X -"
            df_disabledlink.to_sql(name='BB_disabledGameLinks', con=engine, if_exists='append', index=False)
            
            new_df = new_df.drop(index)
            # print(f"!!!# {count}: UNCLEAR CHAR GAME #!!!")
    return new_df


def fn_RepeatLastGivenDate():
    # adjust start date for first run
    query = "SELECT given_date,repeat FROM BB_log_TimeJump"
    df_logTime = read_sql_case_safe(engine, query)
    db_lastStartdate = df_logTime.loc[0,'given_date']
    repeat_count = df_logTime.loc[0,'repeat']

    return db_lastStartdate,repeat_count


def fn_get_currentDate(driver):
    # get current page date to check if it is same with given date
    elements = driver.find_element(By.CSS_SELECTOR, "[id^='widget-livescore-match-row-']")
    first_element = f"#{elements.get_attribute('id')}"
    new_element = driver.find_element(By.CSS_SELECTOR, first_element)
    curent_date = new_element.get_attribute("data-match-date")
    str_current_date = f"{curent_date.split('-')[2].split(' ')[0]}-{curent_date.split('-')[1]}-{curent_date.split('-')[0]}"
    return str_current_date


def fn_extract_teamsFromLink(gameLink):
    pre_home, pre_away = gameLink.split('-vs-')
    str_home = pre_home.split('/')[-1]
    str_away = pre_away.split('/')[0]
    return str_home,str_away


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

    # Hedef web sitesine gidin
    macKolikUrl = basket_games_link #"https://www.mackolik.com/basketbol/canli-sonuclar"
    driver.get(macKolikUrl)
    time.sleep(4)
    accept_cookies(driver)
    time.sleep(4)

    return driver


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
        print(f'<old link: {link}')
        print(f'<GameLink corrected: {yeni_link}')
        return yeni_link

    except Exception:
        return link  # Her ihtimale karşı hata durumunda orijinal linki döner
    


#renewed
def raw_cleaner(L,game_date,as_future,cursor):
    # make a df on collected data
    
    # if not any data, assign nan value
    L.append(np.nan) 
    
    if cursor  == 'past':
        MacSonucu = f'{L[1]}-{L[3]}'
    elif cursor == 'future':
        MacSonucu = '-'
    
    
    # if any("ERT" in str(item) for item in L):
    #     MacSonucu = "ERT"
    #     IlkYariSonucu = '-'
    # elif any("components" in str(item) for item in L):
    #     IlkYariSonucu = '-'
    #     MacSonucu = '-'
    # else:
    #     IlkYariSonucu = find_IYScore(L)
    #     MacSonucu = f"{L[2]}-{L[4]}"

    # add game time as hour for future. 
    if cursor == 'future':
        try:
            time = L[1]
        except:
            time = 'time_error'
    else:
        time = 'MS'

    # find period scores
    p1,p2,p3,p4 = find_period_score(L, cursor)

    #find team name
    home, away = find_teams(L,cursor)

    cleaned = {
  
        # 'MacTarihi':date_handle(find_date_format(L)),
        # 'MacTarihi':find_date_format(L),
        'MacTarihi':game_date,
        'Time': time,
        'EvSahibi':home,
        'KonukEkip':away,
        # 'Lig':find_lig(L, r'\|\s*(.*?)\s*\|'),
        # 'Lig':find_lig_new(L),
        'Lig':'Later',
        
        'LigCode': 'Later',
        'P1': p1,
        'P2': p2,
        'P3': p3,
        'P4': p4,
        'IlkYariSonucu':find_IYScore(L[4],cursor),
        'MacSonucu':MacSonucu,
        'Ms1':L[idx_find(L, 'MAÇ SONUCU (UZT. DAHIL)',2)],
        'Ms2':L[idx_find(L, 'MAÇ SONUCU (UZT. DAHIL)',4)],

        # iY / MS
        'IY_MS_1_1':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',2)],
        'IY_MS_0_1':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',4)],
        'IY_MS_2_1':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',6)],
        'IY_MS_1_0':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',8)],
        'IY_MS_0_0':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',10)],
        'IY_MS_2_0':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',12)],
        'IY_MS_1_2':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',14)],
        'IY_MS_0_2':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',16)],
        'IY_MS_2_2':L[idx_find(L, 'İLK YARI/MAÇ SONUCU',18)],
        
        # iy/ms
        'IY_HOME':L[idx_find(L, '1. YARI SONUCU',2)],
        'IY_DRAW':L[idx_find(L, '1. YARI SONUCU',4)],
        'IY_AWAY':L[idx_find(L, '1. YARI SONUCU',6)],
        
        'GameLink':game_date,
        'runTime':datetime.now().strftime('%d-%m-%Y, %H:%M')
 
    }
    # delete of fake last Nan value (-1)
    L.pop()
    
    df = pd.DataFrame([cleaned])
    
    # # adjusment if want to check old data for prediction. accept it as future
    # if as_future == True:
    #     df['IlkYariSonucu'][0] = '-'
    #     df['MacSonucu'][0] = '-'
        
    return df


def fn_driverRun(as_future,best_league,limit,int_jump):
    # main run func
    
    # go to website url
    macKolikUrl = "https://www.mackolik.com/basketbol/canli-sonuclar"
    
    # fileName = input('Entry which date you will pull!')
    
    start_time = time.time()
    
    
    db_lastStartdate, repeat_count = fn_RepeatLastGivenDate()
    
    #identfy future or past 
    cursor = date_period_check(db_lastStartdate,as_future)
    # cursor = 'future'
    
    # calc how many time will be clicked on day, month and year on calendar
    diff_year,diff_month,selected_day = fn_SelectStartDate_set(db_lastStartdate,repeat_count)
    driver = fn_driverStart(init_bb_firefox_on)
    
    #select given date to start pulling
    clickStartDate(driver,diff_year,diff_month,selected_day,db_lastStartdate)

    time.sleep(10)
    
    # check if current page container is the same with given date
    str_pageCurrent_date = fn_get_currentDate(driver)
    
    # refresh driver 3 times. and try until when current page date and given date are the same
    driver_count = 0
    while db_lastStartdate != str_pageCurrent_date:
        print(Fore.RED +f"### Given Date: {db_lastStartdate}, Page Date: {str_pageCurrent_date} ###" + Style.RESET_ALL)
        
        #reload website
        driver.get(macKolikUrl)
        time.sleep(5)
        #select given date to start pulling
        clickStartDate(driver,diff_year,diff_month,selected_day,db_lastStartdate)
        
        time.sleep(20)
        driver_count += 1
        str_pageCurrent_date = fn_get_currentDate(driver)
        print(Back.RED +f'??? Given date and page date is not matching!!! TRYING: {driver_count} ??? '+ Style.RESET_ALL)
        if driver_count == 3:
            break
    
    # do when dates are matching.
    if db_lastStartdate == fn_get_currentDate(driver):
        print(f"** Given Date: {db_lastStartdate}, Page Date: {fn_get_currentDate(driver)} \u2705 **")
        
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

        print(Fore.CYAN + f"------/ Found {len(new_links)} games: ({cursor}) \-------" + Style.RESET_ALL)

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
        query_disabledLinks = 'SELECT "gameLink" FROM "BB_disabledGameLinks"'
        df_db_disabledTable = read_sql_case_safe(engine, query_disabledLinks)
    
        lst_disabled_links = df_db_disabledTable.gameLink.to_list()
        
        # check list to write into db. If exist past, if not, write to db
        if cursor == 'past':
            query_results = "SELECT GameLink FROM BB_results"
            df_db = read_sql_case_safe(engine, query_results)
            lst_pulled_gameLinks = df_db.GameLink.to_list()
        elif cursor == 'future':
            query_future_results = "SELECT GameLink FROM BB_futureGames"
            df_db = read_sql_case_safe(engine, query_future_results)
            lst_pulled_gameLinks = df_db.GameLink.to_list()
            
        elif cursor == 'as_future':
            query_future_results = "SELECT GameLink FROM BB_real_scores"
            df_db = read_sql_case_safe(engine, query_future_results)
            lst_pulled_gameLinks = df_db.GameLink.to_list()

        query_allLinks_fromDB = "SELECT game_date FROM BB_only_links_all"
        df_db_onlyLinks = read_sql_case_safe(engine, query_allLinks_fromDB)
        lst_only_links = df_db_onlyLinks.game_date.to_list()

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
                df_allLinks_to_db.to_sql(name='BB_only_links_all', con=engine, if_exists='append', index=False)

        # count for game number    
        count = 0
        
        # limit pulled game 
        if len(new_links) > limit: 
            if best_league == True:
                if (cursor == 'as_future') or (cursor == 'future'):
                    limit = limit
                    print(f'!!! CAUTION > Limit is open ({limit}) for prediction. Flag: TRUE !!! ')
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
                    
                    if "pages-match-basketball" in str(body_className_latest):
    
                        time.sleep(5)
                        # check iddaa button if disabled or not
                        iddia_button = WebDriverWait(driver, 6).until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-item-id='iddaa']")))
                        # get class attribute values...
                        tx = iddia_button.get_attribute('class')
    
    
                        # Check if the iddia_button is disabled
                        if "disabled" not in tx:
                            
                            #--------------------------------------------
                            
                            if cursor == 'future':
                                
                                # 1. İlgili elementi bekle
                                element = WebDriverWait(driver, 3).until(
                                    EC.element_to_be_clickable((By.CSS_SELECTOR, "div.widget-basketball-match-details-header"))
                                )
                                
                                # 2. data-settings attribute'unu al
                                raw_data = element.get_attribute("data-settings")
                                
                                # 3. Dış tırnaklardan arındır (eğer string içinde JSON olarak geldiyse)
                                if raw_data.startswith('"') and raw_data.endswith('"'):
                                    raw_data = raw_data.strip('"')
                                
                                # 4. JSON string'i Python dict'e çevir
                                data_dict = json.loads(raw_data)
                                
                                # 5. 'state' değerini al
                                match_status = data_dict.get("state")
                                # print("State:", match_status)
                                                        
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
   EC.element_to_be_clickable((By.CSS_SELECTOR, "div.widget-basketball-match-details-header"))
)
    
                                    
                                mac_details_data = WebDriverWait(driver, 3).until(
    EC.element_to_be_clickable((By.CSS_SELECTOR, ".widget-iddaa-markets__markets-list")))
                        
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
    
                                # keywords = ['DUR', 'IPT', 'ERT', '(']
                                # cleaned_df = filter_dataframe(cleaned_df, 'IlkYariSonucu','MacSonucu', keywords,game_link,count,db_lastStartdate)
    
                                if cursor == 'past':
                                    # DataFrame'i veritabanındaki bir tabloya eklemek
                                    cleaned_df.to_sql(name='BB_results', con=engine, if_exists='append', index=False)
    
                                elif cursor == 'future':
                                    cleaned_df.to_sql(name='BB_futureGames', con=engine, if_exists='append', index=False)
                                    cleaned_df.to_sql(name='BB_futureGames_container', con=engine, if_exists='append', index=False)
    
                                elif cursor == 'as_future':
                                    cleaned_df.to_sql(name='BB_real_scores', con=engine, if_exists='append', index=False)
    
                                    cleaned_df['IlkYariSonucu'][0] = '-'
                                    cleaned_df['MacSonucu'][0] = '-'
                                    cleaned_df.to_sql(name='BB_futureGames', con=engine, if_exists='append', index=False)
    
                                pulled_count +=1
                                # print(f"*** {count}: DONE! - {cleaned_df.loc[0,'EvSahibi']} & {cleaned_df.loc[0,'KonukEkip']}  ***")
                                if cursor != 'pastt':
                                    print(Fore.GREEN + f"*** {count+int_jump} / {len(new_links)}: OK ***" + Style.RESET_ALL)
                                    count += 1
                                    return count,pulled_count
                                else:
                                    count += 1
                                    if count % 100 == 0:
                                        print(Fore.GREEN + f'** Game Number {count+int_jump} OK **' + Style.RESET_ALL)
    
                                    return count,pulled_count
                                    
                                
                                # -- end func
                                
                            if cursor == 'past' or cursor == 'as_future':
                                count,pulled_count = fn_check_run(count,pulled_count)
                                
                            elif (cursor == 'future') and (match_status == 'preGame'):
                                count,pulled_count = fn_check_run(count,pulled_count)
                            else:
                                print(Fore.BLUE + f'{count+int_jump}: ! Today and Live game found and skipped! '  + Style.RESET_ALL)
                                count +=1
                        
                        else:
                            if cursor != 'future':
                                # str_home, str_away = fn_extract_teamsFromLink(game_link)
                                df_disabledlink = pd.DataFrame([game_link], columns=['gameLink'])
                                df_disabledlink['gameDate'] = db_lastStartdate
                                df_disabledlink['runTime'] = datetime.now().strftime('%d-%m-%Y, %H:%M')
                                df_disabledlink.to_sql(name='BB_disabledGameLinks', con=engine, if_exists='append', index=False)
                                # print(f"** {count}: PASSED - Disabled link **")
                                count += 1
                            else:
                                # print(f'*** {count}: Game is not ready for future prediction.Skipped in term !')
                                count += 1
    
                    else:
                        print(Fore.RED + f'?? {count+int_jump}: 404! Get Away problem cannot be fixed. Skipped next game ?? ' + Style.RESET_ALL + game_link)
                        # save to db games which skipped due to error!
                        df_error_skipped = pd.DataFrame([game_link], columns=['gameLink-404'])
                        df_error_skipped['gameDate'] = db_lastStartdate
                        df_error_skipped['runTime'] = f"{datetime.now().strftime('%d-%m-%Y, %H:%M')}-E404"
                        df_error_skipped.to_sql(name='BB_issue_error_Links', con=engine, if_exists='append', index=False)
                        # new_links.append(game_link)
                        count += 1
                else:
                    if cursor != 'past':
                        print(Fore.YELLOW + f'^^^{count+int_jump}: Already was pulled before^^^' + Style.RESET_ALL)
                        # print(game_link)
                        count += 1
                        
                    else:
                        count += 1
                        if count % 100 == 0:
                            print(Fore.YELLOW + f'*** Game Number {count+int_jump}. Pulled ***' + Style.RESET_ALL)

            except TimeoutException:
                # print(f'error {game_link}')
                print(f"TimeoutException Error, Skipping: {game_link}")
                continue  # Bir sonrakine geç

        # calc elapsed time
        end_time = time.time()
        minutes = int((end_time - start_time) // 60)
        seconds = (end_time - start_time) % 60

        driver.quit()
        print(Fore.CYAN + f"<<< {pulled_count}/{len(new_links)} games have pulled successfully. Duration: {minutes} min {seconds:.2f} sec. >>>" + Style.RESET_ALL)
    else:
        print(Fore.RED +f"!!! GIVEN DATE:'{db_lastStartdate}' CANNOT BE UPLOADED and SKIPPED TO THE NEXT DATE.  !!!" + Style.RESET_ALL)
        driver.quit()
    driver.quit()


def master_collection(engine):

    df_GameDay_result = fn_driverRun(as_future = bb_as_future, best_league=bb_best_league,limit=bb_limit, int_jump=bb_int_jump)

    print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")


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


def master_trigger():
    
    if len(sys.argv) < 3:
        print("[ERROR] Missing args. Usage: python BB_game_puller.py <dd-mm-yyyy> <days>", flush=True)
        raise SystemExit(1)

    start_date = sys.argv[1]
    how_many_day = sys.argv[2]
    lst_dateRange = fn_dateRange(start_date, how_many_day)

    # print(Back.CYAN + f'||| PARAMETERS || AS_FUTURE: {BB_as_future} | BEST_LEAGUES: {BB_best_league} | START_JUMP: {BB_int_jump} | END LIMIT: {BB_limit} |||' + Style.RESET_ALL, flush=True)
    for date in lst_dateRange:
        tarih = datetime.strptime(date, '%d-%m-%Y')
    
        # Tarihin gününü bulalım (haftanın hangi günü olduğunu)
        day = tarih.strftime('%A')
        print(Fore.MAGENTA + f'\n------------> {date} ({day}) have been started to collect <-----------------' + Style.RESET_ALL, flush=True)
        df = pd.DataFrame({'given_date':date,'repeat':0,'date_range':lst_dateRange})

        df.to_sql(name='BB_log_TimeJump', con=engine, if_exists='replace', index=False)
        master_collection(engine)

        # count_run = 0
        # try:
        #     #first run
        #     master_collection(engine)
        # except:
        #     count_run +=1
        #     print(Back.RED + f'-------------> Forcing: {count_run} <----------------------'+ Style.RESET_ALL, flush=True)
        #     try :
        #         master_collection(engine)
                
        #     except:
        #         count_run +=1
        #         print(Back.RED + f'-------------> Forcing: {count_run} <----------------------'+ Style.RESET_ALL, flush=True)
    
        #         master_collection(engine)
                
        #         pass
                
                
    
    print(Back.GREEN + '********************** ENTIRELY SUCCESSFULLY ****************************'+ Style.RESET_ALL, flush=True)
    print(f'PULLED DATES: {lst_dateRange}', flush=True)
    print(f"RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')} |{os.path.basename(__file__)}", flush=True)


# In[ ]:


if __name__ == "__main__":
    master_trigger()


print('⏮️⏮️⏮️⏮️⏮️ BB GAME Pull ended ⏭️⏭️⏭️⏭️⏭️')
