import sqlite3
from typing import List
from initial import *


def deduplicate_tables(
    db_path: str,
    table_list: List[str],
    uniq_col_list: List[str]
):
    """
    db_path: sqlite database path
    table_list: ['table_a', 'table_b']
    uniq_col_list: ['col1', 'col2', 'col3']
    """

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    for table in table_list:
        print(f"\nProcessing table: {table}")

        # --- tablo sütunlarını al ---
        cur.execute(f"PRAGMA table_info({table})")
        table_columns = [row["name"] for row in cur.fetchall()]

        # --- uniq için kullanılacak sütunları sırayla kontrol et ---
        existing_uniq_cols = [
            col for col in uniq_col_list if col in table_columns
        ]

        if not existing_uniq_cols:
            print("  → No matching uniq columns found, skipping.")
            continue

        print(f"  → Using uniq columns: {existing_uniq_cols}")

        uniq_cols_sql = ", ".join(existing_uniq_cols)

        # --- TEMP tablo ile deduplication ---
        # Aynı anahtardan ROWID en büyük olan (son eklenen) tutulur
        dedup_sql = f"""
        CREATE TEMP TABLE tmp_dedup AS
        SELECT *
        FROM {table}
        WHERE rowid IN (
            SELECT MAX(rowid)
            FROM {table}
            GROUP BY {uniq_cols_sql}
        );
        """

        cur.execute("DROP TABLE IF EXISTS tmp_dedup;")
        cur.execute(dedup_sql)

        # --- eski tabloyu temizle ---
        cur.execute(f"DELETE FROM {table};")

        # --- dedup edilmiş veriyi geri yaz ---
        columns_sql = ", ".join(table_columns)
        insert_sql = f"""
        INSERT INTO {table} ({columns_sql})
        SELECT {columns_sql}
        FROM tmp_dedup;
        """

        cur.execute(insert_sql)

        # --- temp tabloyu temizle ---
        cur.execute("DROP TABLE tmp_dedup;")

        conn.commit()
        print("  ✓ Deduplication completed.")

    conn.close()


db_path = f"{init_DB_PATH}"

table_list = [
    "tbl_futureGames",
    "FINAL_ALLMODEL_STAKER",
    "MK_FOCUS_ALL_GAMES",
    "MK_UNFILTERED_GAMES_container",
    "MK_REM_PRE_ELECTION_ALLMODEL",
    "LOG_MK_IM_STAKER_ALL_COMMENT_ALLMODEL_ALL_TIME"
]

uniq_col_list = [
    "GameLink",
    "REGTYPE",
    "MacTarihi"
]

deduplicate_tables(
    db_path=db_path,
    table_list=table_list,
    uniq_col_list=uniq_col_list
)
