#!/usr/bin/env python3
import sys,re
from bb_initial import engine, bb_lst_clear_button_tables,bb_lst_protected_tables
import pandas as pd


if len(sys.argv) == 1:
    print(f"[QUESTION] ? Are you sure to clean table: {bb_lst_clear_button_tables} ? ", flush=True)
    print("[TYPE] 'confirm', PRESS enter", flush=True)
    sys.exit(0)


from sqlalchemy import text

# ------------------------
# LOG HELPER (ANLIK LOG)
# ------------------------
def log(msg):
    print(msg)
    sys.stdout.flush()

# ------------------------
# DB SETUP
# ------------------------
#read data with column name correction  

# needs to read correct column names from cloud db
def read_sql_case_safe(engine, query: str):

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


def fn_read_data_db(tableName):
    # basit güvenlik: sadece harf/rakam/_ izin ver
    if not re.fullmatch(r"[A-Za-z0-9_]+", tableName):
        raise ValueError("Invalid table name")

    query = f'SELECT * FROM "{tableName}"'
    
    return read_sql_case_safe(engine, query)


# ------------------------
# WEB INPUT (argv)
# ------------------------
if len(sys.argv) < 2:
    log("❌ Missing confirmation argument")
    log("Usage: python clear_future_table.py <confirm|cancel>")
    sys.exit(1)

IS_SURE = sys.argv[1].strip().lower()

# ------------------------
# EXECUTION
# ------------------------

IS_SURE = sys.argv[1]

cln_tables = []
non_cln_tables = []
if IS_SURE.lower() == "confirm":
    for table in bb_lst_clear_button_tables:
        if table not in bb_lst_protected_tables:

            lst_col = fn_read_data_db(table).columns
           
            df_empty = pd.DataFrame(columns=lst_col)
            df_empty.to_sql(name=table, con=engine, if_exists='replace', index=False)
           
            print(f'☑️ {table} cleaned')
            cln_tables.append(table)
        else:
            non_cln_tables.append(table)
            print(f'⛔️ ^{table}^ cannot be deleted. It is a protected table ⛔️')
    
    if len(cln_tables)>0:
        print(f"✅✅✅ [SYSTEM] TABLES CLEANED: {cln_tables}✅", flush=True)
    if len(non_cln_tables)>0:
        print(f"❌ [SYSTEM] TABLES CANNOT CLEANED: {non_cln_tables}❌", flush=True)


else:
    print(f"❌❌❌ [SYSTEM] Table cleaning cancelled because 'confirm' is not entered ❌❌❌", flush=True)
