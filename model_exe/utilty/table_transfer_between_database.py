import sqlite3

def transfer_table_between_databases(
    source_db_path: str,
    target_db_path: str,
    table_name: str,
    replace_or_append: str
):
    if replace_or_append not in ("replace", "append"):
        raise ValueError("replace_or_append sadece 'replace' veya 'append' olabilir")

    source_conn = sqlite3.connect(source_db_path)
    target_conn = sqlite3.connect(target_db_path)

    try:
        source_cursor = source_conn.cursor()
        target_cursor = target_conn.cursor()

        # Source tablonun CREATE TABLE sorgusunu al
        source_cursor.execute("""
            SELECT sql FROM sqlite_master
            WHERE type='table' AND name=?
        """, (table_name,))
        create_table_sql = source_cursor.fetchone()

        if not create_table_sql:
            raise Exception(f"Source DB'de '{table_name}' tablosu bulunamadı")

        create_table_sql = create_table_sql[0]

        if replace_or_append == "replace":
            # Hedefte tablo varsa sil
            target_cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
            # Yeniden oluştur
            target_cursor.execute(create_table_sql)

        # Source tablodan verileri çek
        source_cursor.execute(f"SELECT * FROM {table_name}")
        rows = source_cursor.fetchall()

        if not rows:
            return  # tablo boşsa çık

        # Kolon sayısına göre placeholder oluştur
        column_count = len(rows[0])
        placeholders = ",".join(["?"] * column_count)

        # Append işlemi
        insert_sql = f"INSERT INTO {table_name} VALUES ({placeholders})"
        target_cursor.executemany(insert_sql, rows)

        target_conn.commit()
        print(f'Copy is succesful : {table_name}')
    finally:
        source_conn.close()
        target_conn.close()

transfer_table_between_databases(
    source_db_path="/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/database/results.db",
    target_db_path="/Users/irfanakgul/Desktop/FPM/FPM_one_v22_live/database/results.db",
    table_name="?",
    replace_or_append="replace")