import sys

def log(msg):
    print(msg)
    sys.stdout.flush()

print('ALL ANALYSIS TRIGGERED by WEB APP')


from initial import *
from func_write_read_to_google import *

import pandas as pd
# import matplotlib.pyplot as plt
# import plotly.express as px
# import plotly.graph_objects as go
from sqlalchemy import create_engine,text
from datetime import datetime, timedelta
from sqlalchemy.pool import StaticPool


import warnings
warnings.filterwarnings('ignore')

# %run ../2_Predictor/func_write_read_to_google.ipynb
# path = './google_api/google_api.json'


from pathlib import Path

DB_PATH = Path("/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/database/results.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# 🔹 BASE PATH (PredictionEngine.py'nin olduğu klasör)
BASE_DIR = Path(__file__).resolve().parent
GOOGLE_API_PATH = str(BASE_DIR / "google_api" / "google_api.json")

# In[ ]:
def clear_table(tableName):
    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {tableName}"))

# In[4]:
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool)

# selection version
version = init_version


#read data    
def fn_read_data_db(tableName):
    
    query = f"SELECT * FROM {tableName}"
    df = pd.read_sql_query(query, engine)
    return df



########################################## 1- FIND LOESER LEAGUES ########################################
print('-----> STEP-1 | FIND_LOESER_LEAGUES.py started')

# %%
# show most successfull leagues
def calc_winner_loser_leagues(df):
    
    # '?' olanları çıkar
    df_clean = df[df['STATUS'] != '?']
    
    # Gruplandır ve özet istatistikleri hesapla
    df_perc = (
        df_clean.groupby('Lig_CODE')['STATUS']
        .agg(
            Toplam='count',
            W_sayisi=lambda x: (x == 'W').sum()
        )
        .assign(W_Yuzdesi=lambda df: (df['W_sayisi'] / df['Toplam']) * 100).round(0).astype(int)
        .reset_index()
        .sort_values(by='W_Yuzdesi', ascending=False))
    
    df_perc = df_perc.sort_values(['W_Yuzdesi','W_sayisi','Toplam'], ascending=False)

    clear_table('WINNER_LOSER_LEAGUES_SORTED')
    df_perc.to_sql(name='WINNER_LOSER_LEAGUES_SORTED', con=engine, if_exists='append', index=False)
    return df_perc
# %%
def fn_losers(df):
    runTime = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
    # Doğru şekilde DataFrame oluşturulmalı (column -> columns)
    df_losers = pd.DataFrame(columns=['LoserLeague','RunTime'])
    
    loser_list = []
    list_losers = df[(df['Toplam'] >= 4) & (df['W_Yuzdesi'] <= 40)]['Lig_CODE'].tolist()

    for lg in list_losers:
        loser_list.append({'LoserLeague': lg,'RunTime':runTime})
    
    df_losers = pd.DataFrame(loser_list)
    if len(df_losers)>0:
        clear_table('log_LOSER_LEAGUES')
        df_losers.to_sql(name='log_LOSER_LEAGUES', con=engine, if_exists='append', index=False)
    print(f'> !! LOSER LEAGUES: {list_losers} | Unique Size: {len(df)} | RUNTIME: {runTime}!! ')
# %%

def master_find_loser():
    # df_focus_legacy = fn_read_data_db(f'LEGACY_1_FOCUS_ALL_container',manuelRun)
    df_foc_google = fn_read_from_google(spreadsheet_id, sheet_name='LOG_FOCUS_MODEL_A',path=GOOGLE_API_PATH)

    # combine legacy focus and current focus
    # df_focus = pd.concat([df_focus_legacy, df_foc_google], ignore_index=True)
    df_focus = df_foc_google.copy()
    # %%
    df_perc = calc_winner_loser_leagues(df_focus)
    fn_losers(df_perc)
    # %%
    df_perc['RunTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
    fn_write_to_google(df_perc,spreadsheet_id,'Winner_Loser_Leagues',replace_or_append = 'replace',path=GOOGLE_API_PATH)
    # %%
    print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")
    print("-----------------------------/ end of LOSERS IDENTIFICATION  /-----------------------------")
# %%
#run master find loser leagues
master_find_loser()

# %%

########################################## 2- IM_CLEAN_SELECT ########################################

print('-----> STEP-2 | IM_CLEAN_SELECT.py started')
# %%
print(f'--> Model results in use:  {model_inUse}')
# %%
def check_weekday(date_str,usual_low,usual_high,week_low,week_high):
    """
    Tarih hafta içiyse bir işlem, değilse başka bir işlem yapılabilir.
    """

    Gameday = datetime.strptime(date_str, "%d-%m-%Y").strftime("%A")

    weekend_days = ['Saturday','Sunday']

    if Gameday in weekend_days:
        low = usual_low
        high = usual_high
    else:
        low = week_low
        high = week_high

    return low,high
# %%
df_sec_standing = fn_read_data_db('MK_WEEKLY_STANDINGS')

df_all_sec = fn_read_data_db('Predicted_games_allModels_sec')[['MacTarihi', 'HomeTeam', 'AwayTeam', 'REGTYPE', 'Home_FT', 'Away_FT']]

df_tbl_future_raw = fn_read_data_db('tbl_futureGames')[['MacTarihi', 'EvSahibi', 'KonukEkip', 'Lig','Ms1', 'Ms2','GameLink']]

df_tbl_future_raw.rename({'EvSahibi':'HomeTeam','KonukEkip':'AwayTeam'}, axis=1,inplace=True)
# %%
def fn_master(sec_model_type,df_sec_standing,df_all_sec,df_tbl_future_raw):
    
    df_lin_sec = df_all_sec[df_all_sec['REGTYPE']==sec_model_type]

    # filter out model draw result
    if model_inUse == True:
        df_lin_sec = df_lin_sec[df_lin_sec['Home_FT']!=df_lin_sec['Away_FT']]        
    
    df = pd.merge(df_lin_sec,df_tbl_future_raw, on=['MacTarihi', 'HomeTeam', 'AwayTeam'])

    df_final = pd.DataFrame()

    for index, row in df.iterrows():
        MacTarihi = row['MacTarihi']
        Lig = row['Lig']
        home_team = row['HomeTeam']
        away_team = row['AwayTeam']
        GameLink = row['GameLink']
        
        # print(MacTarihi,Lig,home_team,away_team)
        
        if Lig not in ['Şampiyonlar Ligi', 'Avrupa Ligi', 'Konferans Ligi']:
            # Lig bu listedekilerden biri değilse, bu listede olmayanları filtrele
            filtered_df = df_sec_standing[~df_sec_standing['League'].isin(['Şampiyonlar Ligi', 'Avrupa Ligi', 'Konferans Ligi'])]
            
            filter_home = filtered_df[filtered_df['TeamName'] == home_team]
            filter_away = df_sec_standing[df_sec_standing['TeamName']==away_team]
            
            if (len(filter_home) > 0) and (len(filter_away) > 0):
                
                if len(filter_home)>1:
                    nl_home = filter_home.League.unique()[0]
                    # nl_home = filter_home.League.unique()[1]
                    
                else:
                    nl_home = filter_home.League.unique()[0]
                
                if len(filter_away)>1:
                    # nl_away = filter_away.League.unique()[1]
                    nl_away = filter_away.League.unique()[0]
                    
                else:
                    nl_away = filter_away.League.unique()[0]
                    
                                
                if nl_home == nl_away:
                    ligname = nl_home
                else:
                    ligname = '-----'
            else:
                ligname = '-(NoStanding)'
    
        else:
            # Lig listedekilerden biriyse, sadece TeamName'e göre filtreleme yap
            filter_home = df_sec_standing[df_sec_standing['TeamName'] == home_team]
            filter_away = df_sec_standing[df_sec_standing['TeamName']==away_team]
            
            if (len(filter_home) > 0) and (len(filter_away) > 0):
                nl_home = filter_home.League.unique()[0]
                nl_away = filter_away.League.unique()[0]
                
                if nl_home == nl_away:
                    ligname = nl_home
                else:
                    ligname = '---'
            else:
                ligname = '-(NoStanding)'
    
        
        dic_ = {'MacTarihi':MacTarihi,
           'Lig':Lig,
           '_NL':ligname,
           'HomeTeam':home_team,
           'AwayTeam':away_team,
           'GameLink':GameLink}
        df_rem = pd.DataFrame([dic_])
        df_final = pd.concat([df_final, df_rem], ignore_index=True)  # Alt alta ekle
        
        df_master = pd.merge(df_final,df, on=['MacTarihi','HomeTeam','AwayTeam']).drop(['Lig_y','GameLink_x'],axis=1)
        df_master['Ms1'] = df_master['Ms1'].replace('-', 1.0)
        df_master['Ms2'] = df_master['Ms2'].replace('-', 1.0)
        
        df_master['Ms1'] = df_master['Ms1'].astype('float32')
        df_master['Ms2'] = df_master['Ms2'].astype('float32')
        
        
    return df_master        
        
# %%
df_collect = []
for sec_model_type in model_list:
    
    df_temp = fn_master(sec_model_type,df_sec_standing,df_all_sec,df_tbl_future_raw)
    df_collect.append(df_temp)

df_final = pd.concat(df_collect, ignore_index=True)
df_final[['Ms1','Ms2']] = df_final[['Ms1','Ms2']].round(2)

# keep all unfiltered games in db
clear_table('MK_UNFILTERED_GAMES')
df_final.to_sql(name='MK_UNFILTERED_GAMES', con=engine, if_exists='append', index=False)
df_final.to_sql(name='MK_UNFILTERED_GAMES_container', con=engine, if_exists='append', index=False)
# %%
# weekend_low,weekend_high,week_low,week_high,mon_fri_low = set_var_threshold()

# Tarihleri datetime formatına çevir
df_final['MacTarihi_dt'] = pd.to_datetime(df_final['MacTarihi'], format="%d-%m-%Y")

# Hafta içi/sonı kontrolü
df_final['is_weekday'] = df_final['MacTarihi_dt'].dt.weekday < 5  # True: hafta içi

# low/high değerlerini satıra özel ata
df_final['low'] = df_final['is_weekday'].apply(lambda x: week_low if x else weekend_low)
df_final['high'] = df_final['is_weekday'].apply(lambda x: week_high if x else weekend_high)

# Şimdi ms1 odds filtreleme işlemi high-low ms1
df_final = df_final[(df_final['Ms1'] > df_final['low']) & (df_final['Ms1'] < df_final['high'])].drop(['MacTarihi_dt'], axis=1)

df_final['Ms1'] = df_final['Ms1'].astype(float).round(2)
df_final['Ms2'] = df_final['Ms2'].astype(float).round(2)

clear_table('MK_REM_PRE_ELECTION_ALLMODEL')
df_final.to_sql(name='MK_REM_PRE_ELECTION_ALLMODEL', con=engine, if_exists='append', index=False)
# %%
print('** MK Cleaning and Pre Selection realised | Table: MK_REM_PRE_ELECTION_ALLMODEL ***')
print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")

print("-----------------------------/ end of IM_CLEAN_SELECT.py  /-----------------------------")

# %%
########################################## 3- IM_STAKERER ########################################

print('-----> STEP-3 | IM_STAKERER.py started')

# %%
df_future = fn_read_data_db('MK_REM_PRE_ELECTION_ALLMODEL')
df_standing = fn_read_data_db('MK_WEEKLY_STANDINGS')
df_standing['Position'] = pd.to_numeric(df_standing['Position'], errors='coerce')

# %%
def calculate_diff_pos(row, df_standing):
        try:
            df_selc_standing = df_standing[df_standing['League']==row['_NL']]
            int_lg_size = int(len(df_selc_standing))
            home_team_pos = df_selc_standing[df_selc_standing['TeamName'] == row['HomeTeam']]['Position'].values[0]
        except IndexError:
            home_team_pos = 0  # Handle case where HomeTeam position is not found

        try:
            df_selc_standing2 = df_standing[df_standing['League']==row['_NL']]
            away_team_pos = df_selc_standing2[df_selc_standing2['TeamName'] == row['AwayTeam']]['Position'].values[0]
        except IndexError:
            away_team_pos = 0  # Handle case where AwayTeam position is not found

        return abs(home_team_pos - away_team_pos), int_lg_size
# %%
df_future['Diff_position'] = None
df_future['LeagueSize'] = None

df_future[['Diff_position', 'LeagueSize']] = df_future.apply(
    lambda row: pd.Series(calculate_diff_pos(row, df_standing)), axis=1
).astype(int)

# %%
# Yeni fonksiyon: Pozisyonları birleştiren fonksiyon
def combine_positions(row, df_standing):
    try:
        df_selc_standing = df_standing[df_standing['League']==row['_NL']]
        home_pos = df_selc_standing[df_selc_standing['TeamName'] == row['HomeTeam']]['Position'].values[0]
        home_week = df_selc_standing[df_selc_standing['TeamName'] == row['HomeTeam']]['Week'].values[0]
    except IndexError:
        home_pos = 999
        home_week = 99999
    try:
        df_selc_standing2 = df_standing[df_standing['League']==row['_NL']]
        away_pos = df_selc_standing2[df_selc_standing2['TeamName'] == row['AwayTeam']]['Position'].values[0]
        away_week = df_selc_standing2[df_selc_standing2['TeamName'] == row['AwayTeam']]['Week'].values[0]
    except IndexError:
        away_pos = 999
        away_week = 9999
    return f'H={int(home_pos)},A={int(away_pos)},Week={home_week}-{away_week}'
# %%
df_future['Combined_Pos'] = df_future.apply(lambda row: combine_positions(row, df_standing), axis=1)
# %%
def determine_winner(row):
    if row['Home_FT'] > row['Away_FT']:
        return row['HomeTeam']
    elif row['Home_FT'] < row['Away_FT']:
        return row['AwayTeam']
    else:
        return 'Draw'

# Yeni sütun ekleme
df_future['Winner'] = df_future.apply(determine_winner, axis=1)
# %%
df_future_final = df_future[['MacTarihi', 'Lig_x', '_NL', 'HomeTeam', 'AwayTeam', 'REGTYPE',
                    'Winner','Ms1', 'Ms2','Diff_position', 'Combined_Pos', 'Home_FT', 'Away_FT','LeagueSize',
                     'GameLink_y']]

df_future_final = df_future_final[~df_future_final['Lig_x'].str.contains('|'.join(exclude_terms), case=False, na=False)]

# %%
def fn_selection_sec(df,version,week_threshold):
    dfs = []
    
    
    df = df[df['Diff_position']!='?']
    df['Diff_position'] = df['Diff_position'].astype('int32')
    df['Mdl_Socore'] = df['Home_FT'].astype(str) + '-' + df['Away_FT'].astype(str)
    for idx, game_row in df.iterrows():
    
        df_single = pd.DataFrame(game_row).transpose()
        df_single['StakeComment'] = '?'
        home_score = int(df_single['Home_FT'].iloc[0])
        away_score = int(df_single['Away_FT'].iloc[0])
        
        diff_pos = int(df_single['Diff_position'].iloc[0])
        lg_size = int(df_single['LeagueSize'].iloc[0])
        
        info_stand = df_single['Combined_Pos'].iloc[0]

        # Her bir öğeyi virgüle göre ayır
        ogeler = info_stand.split(',')

        # Her bir öğeyi eşitliğe göre ayırarak değişkenlere ata
        h_all_stand = int(ogeler[0].split('=')[1])
        a_all_stand = int(ogeler[1].split('=')[1])
        week = ogeler[2].split('=')[1].split('-')[0]
        
        # focus to HOME
        if int(week) > week_threshold and int(week)< 100:
            if lg_size >= 14:
                if (h_all_stand == 1) and (a_all_stand>=15):
                    df_single['StakeComment'] = 'A-1'
                elif (h_all_stand == 1) and ((a_all_stand==13) or (a_all_stand==14)):
                    df_single['StakeComment'] = 'A-2'
                elif (h_all_stand == 1) and ((a_all_stand==11) or (a_all_stand==12)):
                    df_single['StakeComment'] = 'A-3'
                elif (h_all_stand == 2) and (a_all_stand>=15):
                    df_single['StakeComment'] = 'A-4'
                elif (h_all_stand == 1) and (a_all_stand==10):
                    df_single['StakeComment'] = 'A-5'
                elif (h_all_stand == 2) and ((a_all_stand==13) or (a_all_stand==14)):
                    df_single['StakeComment'] = 'A-6'
                elif (h_all_stand == 3) and (a_all_stand>=16):
                    df_single['StakeComment'] = 'A-7'
                elif (h_all_stand == 2) and ((a_all_stand==11) or (a_all_stand==12)):
                    df_single['StakeComment'] = 'A-8'
                elif (h_all_stand == 1) and (a_all_stand==9):
                    df_single['StakeComment'] = 'A-9'
                elif (h_all_stand == 3) and ((a_all_stand==14) or (a_all_stand==15)):
                    df_single['StakeComment'] = 'A-10'
                elif (h_all_stand == 4) and (a_all_stand>=16):
                    df_single['StakeComment'] = 'A-11'
                elif (h_all_stand == 3) and (a_all_stand==13):
                    df_single['StakeComment'] = 'A-12'
                elif (h_all_stand == 4) and ((a_all_stand==14) or (a_all_stand==15)):
                    df_single['StakeComment'] = 'A-13'
                elif (h_all_stand == 4) and (a_all_stand==13):
                    df_single['StakeComment'] = 'A-14'
                elif (h_all_stand == 1) and (a_all_stand==8):
                    df_single['StakeComment'] = 'A-15'
                elif (h_all_stand == 2) and (a_all_stand==10):
                    df_single['StakeComment'] = 'A-16'
                elif (h_all_stand == 5) and (a_all_stand>=15):
                    df_single['StakeComment'] = 'A-17'
                else:
                    df_single['StakeComment'] = f'EE_{version}'

            elif (lg_size >= 12) and (lg_size < 14):
                if (h_all_stand == 1) and (a_all_stand>=13):
                    df_single['StakeComment'] = 'A-20'
                elif (h_all_stand == 1) and (a_all_stand==12):
                    df_single['StakeComment'] = 'A-21'
                elif (h_all_stand == 1) and (a_all_stand==11):
                    df_single['StakeComment'] = 'A-22'
                elif (h_all_stand == 2) and (a_all_stand>=13):
                    df_single['StakeComment'] = 'A-23'
                elif (h_all_stand == 2) and (a_all_stand==12):
                    df_single['StakeComment'] = 'A-24'
                elif (h_all_stand == 2) and (a_all_stand==11):
                    df_single['StakeComment'] = 'A-25'
                elif (h_all_stand == 3) and (a_all_stand>=13):
                    df_single['StakeComment'] = 'A-26'
                elif (h_all_stand == 3) and (a_all_stand==12):
                    df_single['StakeComment'] = 'A-27'
                else:
                    df_single['StakeComment'] = f'EEE_{version}'
            else:
                if (h_all_stand == 1) and (a_all_stand==11):
                    df_single['StakeComment'] = 'A-30'
                elif (h_all_stand == 1) and (a_all_stand==10):
                    df_single['StakeComment'] = 'A-31'
                elif (h_all_stand == 2) and (a_all_stand==11):
                    df_single['StakeComment'] = 'A-32'
                
            
        dfs.append(df_single)
    

    df_results = pd.concat(dfs, axis=0).reset_index(drop=True)
    df_results['RunTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'
    
    df_results['Version'] = f'_{version}'
    
    clear_table('MK_IM_STAKER_ALL_COMMENT_ALLMODEL')
    df_results.to_sql(name=f'MK_IM_STAKER_ALL_COMMENT_ALLMODEL', con=engine, if_exists='append', index=False)   

    size_A = len(df_results[df_results['StakeComment'].str.contains('A-', na=False)])
    print(f'** {version} MK_IM_STAKER_ALL_COMMENT_ALLMODEL | Size A Comments: {size_A}')    
    
    return df_results
# %%
df_im = fn_selection_sec(df_future_final,version,week_threshold)
# %%
def fn_selection_final(df):
    df_selected_all = []
    dates = df.MacTarihi.unique().tolist()
    
    for day in dates:
    
        df_day = df[df['MacTarihi']==day]
        
        lst_day_comments = df_day['StakeComment'].unique().tolist()
        
        selected_comments = [f'A-{i+1}' for i in range(100)] # list ['A-1',...'A-16']
        
        for comment in selected_comments:
            # if comment in lst_day_comments:
            df_sel = df_day[df_day['StakeComment']==comment]
            df_selected_all.append(df_sel)
            # if len(df_sel)>0:
            #     print(df_sel.AwayTeam.iloc[0])
    
    if len(df_selected_all)>0:
        df_results = pd.concat(df_selected_all, axis=0).reset_index(drop=True)

        # df_filtered = df_results.groupby('MacTarihi').head(3)
        df_filtered = df_results.groupby('MacTarihi').head(2000)
        
        
        df_filtered = df_filtered[['MacTarihi', 'Lig_x', '_NL', 'HomeTeam', 'AwayTeam', 'REGTYPE',
       'Winner', 'Ms1', 'Ms2', 'Diff_position', 'Combined_Pos', 'Home_FT',
       'Away_FT', 'Mdl_Socore', 'StakeComment', 'RunTime',
       'Version', 'LeagueSize','GameLink_y']] 
        
    else:
        print(f'!!! NOT FOUND - SEC STAKE SELECTION!!!')
        df_filtered = pd.DataFrame(columns=['MacTarihi', 'Lig_x', '_NL', 'HomeTeam', 'AwayTeam', 'REGTYPE',
       'Winner', 'Ms1', 'Ms2', 'Diff_position', 'Combined_Pos', 'Home_FT',
       'Away_FT', 'Mdl_Socore', 'StakeComment', 'RunTime',
       'Version', 'LeagueSize','GameLink_y'])
      
    return df_filtered

# %%
def master_im_staker():
    df_res_all = fn_selection_final(df_im)

    lst_allmodels_links = fn_read_data_db('MK_FINAL_STAKER_ALLMODELS')['GameLink_y']
    df_res_all_dist = df_res_all[~df_res_all['GameLink_y'].isin(lst_allmodels_links)]

    df_res_all_dist.to_sql(name=f'MK_FINAL_STAKER_ALLMODELS', con=engine, if_exists='append', index=False)

    print(f"** {version} FINAL STAKE SELECTION (ALLMODEL) DONE | Table:MK_FINAL_STAKER_ALLMODELS   SIZE: {len(df_res_all[df_res_all['REGTYPE']==focus_model_live])}")
    # %%
    print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")

# %%

#master im staker trigger
master_im_staker()

print('-------------------------------------- end of IM_STAKER.py -------------------------------------- ')

# %%
########################################## 4- FINAL_STAKE_MAKER ########################################

print('-----> STEP-4 | IM_STAKERER.py started')

# %%
def set_week_period(df):
    "Calc period based on MacTarihi"
    def calc_period(tarih_str):
        tarih = datetime.strptime(tarih_str, '%d-%m-%Y')

        # Bir önceki Salı (weekday 1)
        onceki_sali = tarih - timedelta(days=(tarih.weekday() - 1) % 7)

        # Sonraki ilk Pazartesi (weekday 0)
        sonraki_pazartesi = tarih + timedelta(days=(7 - tarih.weekday()) % 7)

        sali_str = onceki_sali.strftime('%d-%m-%Y')
        pazartesi_str = sonraki_pazartesi.strftime('%d-%m-%Y')
        return f"{sali_str}<>{pazartesi_str}"

    df['period'] = df['MacTarihi'].apply(calc_period)
    return df
# %%
def set_prio_rate(df):
    # Koşullar ve değerler
    conditions = []
    values = []
    
    for home in range(1, 6):  # Ev sahibi sırası (1-5)
        for diff in range(1, 24):  # Pozisyon farkı (1-23)
            conditions.append((df['HomeStand'] == home) & (df['Diff_position'] == diff))
            
            # Öncelik puanı hesaplama
            if home == 1:
                prio = max(1, 30 - diff)  # 1. sıradaysa, fark büyüdükçe Prio düşer (1 en iyi ihtimal)
            elif home == 2:
                prio = max(10, 40 - diff)
            elif home == 3:
                prio = max(25, 50 - diff)
            elif home == 4:
                prio = max(45, 70 - diff)
            elif home == 5:
                prio = max(70, 100 - diff)  # 5. sıradaysa, fark büyüse bile ihtimal daha düşük
            
            values.append(prio)
    
    # Prio sütununu oluştur
    df['Prio_Rate'] = np.select(conditions, values, default=100)
    return df
# %%
def set_prio_odds(df):
    # Ms1 sütununu float yap
    df['Ms1'] = df['Ms1'].astype(float)

    # Her MacTarihi için Ms1'e göre sırala ve yeni Prio sütununu oluştur
    df = df.sort_values(['MacTarihi', 'Ms1']).copy()
    df['Prio_Odds'] = df.groupby('MacTarihi').cumcount() + 1

    return df
# %%
def set_prio_confidence(df):
    df = df.copy()  # Orijinal df’ye zarar vermemek için bir kopyasını al
    # df['Ms1'] = df['Ms1'].copy().str.replace(',', '.').astype(float).round(2)
    df['LeagueSize'] = df['LeagueSize'].astype(int)
    df['Diff_position'] = df['Diff_position'].astype(int)

    df[['H', 'A']] = df['Standing'].str.extract(r'H=(\d+),A=(\d+)').astype(int)
    
    # 1. Ev sahibi takımın galibiyet oranı düşükse, favoridir → Bu nedenle oranın tersini alıyoruz
    df['MS1_Gucu'] = 1 / df['Ms1']
    
    # 2. Takım sıralarını normalize et (örneğin 3/20 = 0.15 → daha küçük daha iyi)
    df['Ev_Norm'] = df['H'] / df['LeagueSize']
    df['Dep_Norm'] = df['A'] / df['LeagueSize']
    
    # 3. Pozisyon farkını normalize et (farkı al, lig büyüklüğüne böl → 0 ile 1 arası değer)
    df['Diff_Norm'] = df['Diff_position'] / df['LeagueSize']
    
    # 4. Güven skoru hesapla (ağırlıklı ortalama gibi):
    #    - MS1_Gucu: Ev sahibinin oranına göre favorilik derecesi
    #    - Diff_Norm: Pozisyon farkı ne kadar büyükse o kadar iyi
    #    - Dep_Norm - Ev_Norm: Ev sahibi daha üst sıradaysa sonuç pozitif olur, bu da iyi
    df['CI_Score'] = (
        0.5 * df['MS1_Gucu'] +        # %50 oran etkisi
        0.3 * df['Diff_Norm'] +       # %30 pozisyon farkı etkisi
        0.2 * (df['Dep_Norm'] - df['Ev_Norm'])  # %20 ev-deplasman sıralama farkı
    ).round(2)
    
    # 5. Her maç günündeki maçları bu güven skoruna göre sırala
    df['Prio_CI_Rank'] = df.groupby('MacTarihi')['CI_Score'].rank(method='first', ascending=False).astype(int)


    df = df.drop(['H', 'A', 'MS1_Gucu', 'Ev_Norm', 'Dep_Norm', 'Diff_Norm'],axis=1)
    
    return df
# %%
def fn_set_risky_weeks(df):
    # Standing sütununu ayır: H, A, Week
    split_cols = df['Standing'].str.extract(r'H=(\d+),A=(\d+),Week=(\d+)-(\d+)')
    df['H'] = split_cols[0].astype(int)
    df['A'] = split_cols[1].astype(int)
    
    # Week ortalaması (integer)
    df['Week'] = ((split_cols[2].astype(int) + split_cols[3].astype(int)) // 2)
    
    # Total_Week = LeagueSize * 2
    df['Total_Week'] = (df['LeagueSize'] * 2)-2
    
    # RISK_Value hesaplama
    def calculate_risk(row):
        if row['LeagueSize'] - row['A'] < 7:
            diff = row['Total_Week'] - row['Week']
            if diff <= 3:
                return 3
            elif diff in [4, 5]:
                return 2
            elif diff == 6:
                return 1
            else:
                return 0
        else:
            return 0

    df['RISK_Value'] = df.apply(calculate_risk, axis=1)
    
    return df
# %%
df = fn_read_data_db(f'MK_FINAL_STAKER_ALLMODELS')
df['Mdl_Socore'] = df['Home_FT'].astype(str) + '-' + df['Away_FT'].astype(str)


recol = {'Lig_x':'Lig',
'_NL':'Lig_CODE',
 'HomeTeam':'EvSahibi',
 'AwayTeam':'KonukEkip',
 'REGTYPE':'ModelType',
 'Winner':'MS_SELECTION',
 'Combined_Pos':'Standing',
 'GameLink_y':'GameLink'}

df = df.rename(columns=recol)

df['RunTime'] = f'{datetime.now().strftime("%d.%m.%Y")} - {datetime.now().strftime("%H:%M")}'

df['Ms1'] = df['Ms1'].round(2)
df['Ms2'] = df['Ms2'].round(2)

# set period based on mactarihi
df=set_week_period(df)

# df['HomeStand'] = df['Standing'].str.extract(r'(?:H=|h_all=)(\d+)').astype(int)

df['STATUS'] = '?'

# add game time as hour
df_future_time = fn_read_data_db('tbl_futureGames')[['Time','GameLink']]
df = pd.merge(df,df_future_time, on='GameLink')
# %%
## All ML Models added to DB only.

df_all_model = df[['MacTarihi','Time', 'STATUS','Lig_CODE','Lig', 'EvSahibi',
                   'KonukEkip', 'ModelType','Mdl_Socore','MS_SELECTION', 'Ms1', 'Ms2',
                   'Standing','LeagueSize','Diff_position',
                   'StakeComment','period', 'Version','RunTime','GameLink']]




# add to log into db for all model stake commentted.
lst_all_model_link = list(fn_read_data_db('FINAL_ALLMODEL_STAKER')['GameLink'])
lst_all_model_link = list(set(lst_all_model_link))

# check added to db before
diff_all_model = df_all_model[~df_all_model['GameLink'].isin(lst_all_model_link)]


diff_all_model.to_sql(name=f'FINAL_ALLMODEL_STAKER', con=engine, if_exists='append', index=False)
# %%
## all games for Focus selected model

#  filter focus model
df_model = df_all_model[df_all_model['ModelType']==focus_model_live]
df_model = df_model.sort_values(['MacTarihi'],ascending=True)
df_model['HomeStand'] = df_model['Standing'].str.extract(r'(?:H=|h_all=)(\d+)').astype(int)

# set risk value for bottom away teams. 
df_model = fn_set_risky_weeks(df_model)

# set prios
df_model = set_prio_rate(df_model)
df_model = set_prio_odds(df_model)
df_model = set_prio_confidence(df_model)

# filter by CI_Score
df_model["CI_Score"] = df_model["CI_Score"].astype(str).str.replace(",", ".", regex=False)
df_model['CI_Score'] = df_model['CI_Score'].astype('float32')
df_model =df_model[df_model['CI_Score']>init_CI_Score_threshold] # from initial file
df_model["RISK_Value"] = df_model["RISK_Value"].astype(int)
df_model =df_model[df_model['RISK_Value']<init_RISK_VALUE_threshold] # from initial file

# select sorted version. Prio_Odds: sort by Ms1, Prio_Rate: sort by rate calc
df_model_sorted = df_model.sort_values(
    by=["MacTarihi", "Prio_Rate", "CI_Score"],
    ascending=[True, True, False])

df_model_sorted = df_model_sorted.drop_duplicates(subset='GameLink', keep='last')

df_model_sorted=df_model_sorted[['MacTarihi','Time', 'STATUS','Lig_CODE','Lig', 
        'EvSahibi','KonukEkip', 'ModelType','Mdl_Socore','MS_SELECTION', 'Ms1', 'Ms2',
        'Standing','LeagueSize','Diff_position','RISK_Value',
            'StakeComment','Prio_Odds','Prio_Rate','CI_Score','Prio_CI_Rank','period',
            'Version','RunTime','GameLink']]
# %%
list_focus_all_links = fn_read_from_google(spreadsheet_id, sheet_name='LOG_FOCUS_MODEL_A',path=GOOGLE_API_PATH)['GameLink']
df_model_sorted_dist = df_model_sorted[~df_model_sorted['GameLink'].isin(list_focus_all_links)]


df_model_sorted_dist.to_sql(name='MK_FOCUS_ALL_GAMES', con=engine, if_exists='append', index=False)

# write to google
print(f'### Focus Model Selection Game Size: {len(df_model_sorted)} ###')
fn_write_to_google(df_model_sorted_dist,spreadsheet_id,'LOG_FOCUS_MODEL_A',replace_or_append = 'append',path=GOOGLE_API_PATH)

# %%
## FINAL SELECTION based on Focus selected model

# loser ligleri final seciminden once listeden cikarir. 
temp_loser_leagues = fn_read_data_db('log_LOSER_LEAGUES')['LoserLeague'].tolist()

df_semi_final = df_model_sorted[~df_model_sorted['Lig_CODE'].isin(temp_loser_leagues)]
print(f'! Loser leagues are listed out from final stake: {temp_loser_leagues} !!')

df_final = df_semi_final.groupby('MacTarihi').head(3)
# %%
list_final_links = list(fn_read_from_google(spreadsheet_id, sheet_name='FINAL_FOCUS_SELECTION',path=GOOGLE_API_PATH)['GameLink'])

df_final_dist = df_final[~df_final['GameLink'].isin(list_final_links)]

df_final_dist.to_sql(name='MK_FOCUS_FINAL_GAMES', con=engine, if_exists='append', index=False)

fn_write_to_google(df_final_dist,spreadsheet_id,'FINAL_FOCUS_SELECTION',replace_or_append = 'append',path=GOOGLE_API_PATH)
# %%
print(f'** FOCUS MODEL: {focus_model_live}')
print(f"±± RunTime > {datetime.now().strftime('%d.%m.%Y | %H:%M:%S')}")
print(f'------------------ END of FINAL STAKER ---------------------')