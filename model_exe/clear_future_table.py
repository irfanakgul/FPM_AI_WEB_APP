#!/usr/bin/env python3
import sys
from pathlib import Path
from initial import *


if len(sys.argv) == 1:
    print(f"[QUESTION] ? Are you sure to clean table: {button_clean_tableName} ? ", flush=True)
    print("[TYPE] 'confirm', PRESS enter", flush=True)
    sys.exit(0)


from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

# ------------------------
# LOG HELPER (ANLIK LOG)
# ------------------------
def log(msg):
    print(msg)
    sys.stdout.flush()

# ------------------------
# DB SETUP
# ------------------------
DB_PATH = init_DB_PATH
# DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)

# ------------------------
# TABLE NAME (initial.py'den geliyor)
# ------------------------
clean_table_name = button_clean_tableName

# ------------------------
# CLEAR TABLE FUNCTION
# ------------------------
def clear_table(tableName):
    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {tableName}"))

# ------------------------
# WEB INPUT (argv)
# ------------------------
if len(sys.argv) < 2:
    log("❌ Missing confirmation argument")
    log("Usage: python clear_future_table.py <confirm|cancel>")
    sys.exit(1)

IS_SURE = sys.argv[1].strip().lower()

# log(f"⚠️ Clean table requested: {clean_table_name}")
# log(f"⚠️ Confirmation received: {IS_SURE}")

# ------------------------
# EXECUTION
# ------------------------

IS_SURE = sys.argv[1]

if IS_SURE.lower() == "confirm":
    clear_table(clean_table_name)
    print(f"✅ [SYSTEM] TABLE CLEANED: {clean_table_name}", flush=True)
else:
    print("❌ [SYSTEM] Table cleaning cancelled", flush=True)
