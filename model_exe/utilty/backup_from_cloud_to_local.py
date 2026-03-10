# if the run doesn't work, then use this run code in terminal: 
# python /Users/irfanakgul/Desktop/FPM_AI_WEB_APP/model_exe/utilty/backup_from_cloud_to_local.py


import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
import sqlite3,sys
from datetime import datetime

def log(msg):
    print(msg, flush=True)
    sys.stdout.flush()
    
hash_code = datetime.today().strftime("%d%m%Y")

PG = URL.create(
    "postgresql+psycopg2",
    username="fpm_ai_user",
    password="ZonguldakEdirne1989",
    host="95.216.148.216",
    port=5432,
    database="fpm_ai",
)

pg_engine = create_engine(PG, pool_pre_ping=True)

sqlite_path = f"/Users/irfanakgul/Desktop/FPM_BACKUPS/database/fpm_ai_backup_{hash_code}.db"
sqlite_conn = sqlite3.connect(sqlite_path)

# tablo listesini al
tables = pd.read_sql("""
SELECT tablename
FROM pg_tables
WHERE schemaname='public'
ORDER BY tablename
""", pg_engine)["tablename"].tolist()

print("Tables:", len(tables), flush=True)

for t in tables:
    print("Exporting:", t, flush=True)

    try:
        # büyük tablolar için chunk
        chunks = pd.read_sql_query(f'SELECT * FROM "{t}"', pg_engine, chunksize=50000)
        first = True
        for chunk in chunks:
            chunk.to_sql(t, sqlite_conn, if_exists="replace" if first else "append", index=False)
            first = False
    except Exception as e:
        print(f'--> ERROR:{t} : {e}', flush=True)
        continue

sqlite_conn.close()
print("Done:", sqlite_path, flush=True)