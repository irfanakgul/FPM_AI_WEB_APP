from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


basket_games_link = "https://www.mackolik.com/basketbol/canli-sonuclar"
# Parameters for pulling games | in DATA GATHERING
bb_as_future = False
bb_best_league=False
bb_limit=0
bb_int_jump=0

# selection version
bb_init_version = 'v14'

bb_rond_threshold = 0.50

# google connection
spreadsheet_id='1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U'

bb_firefox_on = False

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
