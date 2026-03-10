print('➡️➡️➡️➡️➡️ BB UPDATE-PULL started ⬅️⬅️⬅️⬅️⬅️')

import sys
import re
import time
import signal
import warnings
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
from datetime import datetime, date

from sqlalchemy import text

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException
)


from bb_initial import (
    engine,
    bb_firefox_on,
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

def accept_cookies(driver):
    # click/accept cookies
    wait = WebDriverWait(driver, 30)
    cookies = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'button#didomi-notice-agree-button')))
    cookies.click()



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
            df_disabledlink = pd.DataFrame([game_link], columns=['gameLink'])
            df_disabledlink['gameDate'] = db_lastStartdate
            df_disabledlink['runTime'] = f"{datetime.now().strftime('%d-%m-%Y, %H:%M')} - X -"
            
            new_df = new_df.drop(index)
            # print(f"!!!# {count}: UNCLEAR CHAR GAME #!!!")
    return new_df

def fn_extract_teamsFromLink(gameLink):
    pre_home, pre_away = gameLink.split('-vs-')
    str_home = pre_home.split('/')[-1]
    str_away = pre_away.split('/')[0]
    return str_home,str_away


def fn_driverStart(init_bb_firefox_on,link):
       
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
    driver.get(link)
    time.sleep(4)
    accept_cookies(driver)
    time.sleep(4)
    return driver



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
def raw_cleaner(L,game_date,cursor):
    # make a df on collected data
    
    # if not any data, assign nan value
    L.append(np.nan) 
    
    if cursor  == 'past':
        MacSonucu = f'{L[1]}-{L[3]}'
    elif cursor == 'future':
        MacSonucu = '-'
    
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

def is_past(date_str,time_str):
    """
    date_str: 'DD-MM-YYYY'
    time_str: 'HH:MM'

    - Şu andan 3 saat veya daha eskiyse True
    - Son 3 saat içindeyse veya gelecekteyse False
    - Format hatalıysa False
    """
    try:
        # tarih + saat birleştir
        dt = datetime.strptime(
            f"{date_str} {time_str}",
            "%d-%m-%Y %H:%M"
        )
    except (ValueError, TypeError):
        return False  # format hatası

    now = datetime.now()
    three_hours_ago = now - timedelta(hours=3)

    return dt <= three_hours_ago


def fn_driverRun():
    # main run func
    cursor = 'past'

    df_future = fn_read_data_db('BB_futureGames')
    ftr_links = list(df_future['GameLink'])

    lst_pulled_gameLinks = list(fn_read_data_db('BB_results')['GameLink'])
    count = 1

    # main for loop
    total_ftr_len = len(ftr_links)
    for game_link in ftr_links:
    
        str_date = df_future.loc[df_future['GameLink'] == game_link, 'MacTarihi'].iloc[0]
        str_time = df_future.loc[df_future['GameLink'] == game_link, 'Time'].iloc[0]
        date_cursor = is_past(str_date,str_time)

        # check date is really past or not. !Today is not past. 
        if date_cursor == True:
            try:
                if (game_link not in lst_pulled_gameLinks):

                    driver = fn_driverStart(init_bb_firefox_on,game_link)

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

                            # ara fonksiyon bugunu cekerken, oynanmis maclarda takilmasin diye yapildi. 
                            def fn_check_run():
                                
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

                                # print(result)
                                cleaned_df = raw_cleaner(list(pd.DataFrame(result, columns=[0])[0]), str_date,cursor)
                                cleaned_df['GameLink'] = game_link

                                return cleaned_df
                            
                            cleaned_df = fn_check_run()
                            # print(cleaned_df.columns)
                            cleaned_df.to_sql(name='BB_results', con=engine, if_exists='append', index=False)
                            print(f'✅ IDX: {count}/{total_ftr_len}: saved into bb_result')
                            count += 1
                            driver.quit()
                else:
                    print(f'☑️ IDX: {count}/{total_ftr_len}> Game was already pulled before ##')
                    count += 1

            except TimeoutException:
                count +=1
                # print(f'error {game_link}')
                print(f"🚫 TimeoutException Error, Skipping: {count}: {game_link}")
                continue  # Bir sonrakine geç
            
        else:
            print(f'⚠️ IDX: {count}/{total_ftr_len}> Link is not past: {str_date}-{str_time} ')
            count += 1

    return df_future


def master_collection():

    df_future = fn_driverRun()
    return df_future


#final run
df_future = master_collection()

df_results = fn_read_data_db('BB_results')[['MacTarihi','EvSahibi','KonukEkip','P1','P2','P3','P4','IlkYariSonucu','MacSonucu','GameLink']]

# 1) Left join (df_future solda)
df_merged = df_future.merge(
    df_results,
    on="GameLink",
    how="left",
    suffixes=("_future", "_results")
)
# 2) İstediğin kolonları tek df'de birleştir
df_comb = pd.DataFrame({
    # df_future'dan
    "MacTarihi": df_merged["MacTarihi_future"],
    "EvSahibi": df_merged["EvSahibi_future"],
    "KonukEkip": df_merged["KonukEkip_future"],
    "Ms1": df_merged["Ms1"],
    "Ms2": df_merged["Ms2"],


    # df_results'dan
    "P1": df_merged["P1_results"],
    "P2": df_merged["P2_results"],
    "P3": df_merged["P3_results"],
    "P4": df_merged["P4_results"],
    "IlkYariSonucu": df_merged["IlkYariSonucu_results"],
    "MacSonucu": df_merged["MacSonucu_results"],
    "GameLink": df_merged["GameLink"]

})
df_comb[['Ms1','Ms2']] = df_comb[['Ms1','Ms2']].replace('-',1.0)

df_comb.to_sql(name='BB_future_result_analysis', con=engine, if_exists='replace', index=False)
print('✅✅✅ FUTURE GAMES HAS BEEN UPDATED WITH RESULTS AFTER GAMES ARE REALISED.✅✅✅ ')
print('✅✅✅ CHECK TABLE: BB_future_result_analysis ✅✅✅')


print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")
