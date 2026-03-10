from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL



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




basket_games_link = "https://www.mackolik.com/basketbol/canli-sonuclar"

# game pull chahpter
bb_as_future = False
bb_best_league=False
bb_limit=0
bb_int_jump=0
bb_firefox_on = False



bb_init_version = 'v14' # selection version

bb_rond_threshold = 0.50

# google connection
spreadsheet_id='1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U'


# standing pull is active code = 1 will be pulled
bb_is_active=1
bb_lst_double_lg_list = []



## prediction chapter
bb_selected_odds_list = 'odds_select_B'
bb_target_cols = ['home_FT','Away_FT']
bb_rond_threshold = 0.6  # threshold for round up/down on predicted scores
bb_model_size = 11
bb_model_first_cleaned_data = 'BB_model_first_cleaned_TrainData'

# model fit chapter
bb_train_table_name = 'BB_results'
bb_exclude_terms = ['U20', 'u20', 'U19', 'u19','u23','Kupa','kupa','KUPA','CUP','Cup','cup','Kupası', 'Bölgesel','U21','Hazırlık','hazirlik']

# clear table chapter
# list of clear button tables
bb_lst_clear_button_tables = ['BB_futureGames']

#protected tables. avoid to remove tables below:
bb_lst_protected_tables = ['BB_futureGames_container','BB_WEEKLY_STANDINGS_rawContainer',\
                        'BB_WEEKLY_STANDINGS','log_time_jump','tables','selection_Driver_List'\
                        'BB_results']