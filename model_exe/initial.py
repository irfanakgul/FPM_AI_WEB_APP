from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

firefox_on = False
football_games_link = "https://www.mackolik.com/futbol/canli-sonuclar"


# Parameters for pulling games | in DATA GATHERING
as_future = False
best_league=False
limit=0
int_jump=0

# list of clear button tables
lst_clear_button_tables = ['tbl_futureGames']

#protected tables. avoid to remove tables below:
lst_protected_tables = ['tbl_future_all_collect_RAW','LEGACY_FOCUS_ALL_container','MK_WEEKLY_STANDINGS_rawContainer',\
                        'LOG_MK_IM_STAKER_ALL_COMMENT_ALLMODEL_ALL_TIME','log_time_jump','tables','selection_Driver_List'\
                        'results']

# selection version
init_version = 'v14'

#rond thrs
rond_threshold = 0.50

selected_odds_list = 'odds_select_B'
target_cols = ['home_HT','away_HT','home_FT','Away_FT']
train_table_name = 'results'
model_first_cleaned_data = 'model_first_cleaned_TrainData'

# init_root = Path(__file__).resolve().parents[1]

model_inUse = True
model_size = 11
model_list = ['Lin_Reg','RF_Reg','KN_Reg','DT_Reg','SVM_Reg','XGB_Reg','AB_Regressor','XGB_Reg','BR_Reg']
focus_model_live = 'Lin_Reg'

exclude_terms = ['U20', 'Kadınlar', 'u20', 'U19', 'u19','u23', 'kadınlar', 'kadin', 'Kadinlar','Kupa','kupa','KUPA','CUP','Cup','cup','Kupası', 'Bölgesel','U21','Hazırlık','hazirlik']


# hangi haftadan sonraki ligler hesaba katilsin? 
week_threshold = 6              # after this week, will be take into account
init_CI_Score_threshold = 0.5 # 0.64 default. it will be used in 'FINAL_STAKE_MAKER' for final selection
init_RISK_VALUE_threshold = 2 # ADJUST RISK VALUE < 'FINAL_STAKE_MAKER'

weekend_low = 1.30
weekend_high = 1.7
week_low = 1.22
week_high = 1.7


# google connection
spreadsheet_id='1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U'


# connection into cloud db (central)
def cloud_connection():
    url = URL.create(
    "postgresql+psycopg2",
    username="fpm_ai_user",
    password="ZonguldakEdirne1989",
    host="95.216.148.216",
    port=5432,
    database="fpm_ai",
)

    engine = create_engine(url, pool_pre_ping=True)

    with engine.connect() as conn:
        print('========|',conn.execute(text("SELECT current_user, current_database()")).fetchone(),'|========')

    print('*** ✅ SUCCESSFUL CLOUD CONNECTION ⛓️ ***')
    
    return engine

engine = cloud_connection()
