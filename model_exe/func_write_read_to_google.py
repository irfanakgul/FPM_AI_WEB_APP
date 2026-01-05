#!/usr/bin/env python
# coding: utf-8

# In[2]:


import gspread
from gspread_dataframe import set_with_dataframe
import pandas as pd
from google.oauth2.service_account import Credentials
from oauth2client.service_account import ServiceAccountCredentials

import sqlite3


# In[ ]:


import gspread
from google.oauth2.service_account import Credentials
from gspread_dataframe import set_with_dataframe
import pandas as pd
import numpy as np

# print('Google API writer function is imported here')

def fn_write_to_google(df, spreadsheet_id, sheet_name, replace_or_append='append', path='./google_api/google_api.json'):
    # spreadsheet_id is being taken from sheet link URL
    # example: https://docs.google.com/spreadsheets/d/1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U/edit?gid=0#gid=0
    # sheet_id is '1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U'

    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    
    creds = Credentials.from_service_account_file(path, scopes=scopes)
    client = gspread.authorize(creds)
    
    spreadsheet = client.open_by_key(spreadsheet_id)

    if replace_or_append == 'replace':
        worksheet = None
        sheets = spreadsheet.worksheets()
        sheet_names = [sheet.title for sheet in sheets]
        
        if sheet_name in sheet_names:
            worksheet = spreadsheet.worksheet(sheet_name)
            worksheet.clear()
            set_with_dataframe(worksheet, df, include_index=False)
            print(f'<--- Results are sent to google sheets: {sheet_name} / {replace_or_append}d --->')
        else:
            print(f"'{sheet_name}' not found, and a new sheet is created.")
            worksheet = spreadsheet.add_worksheet(title=sheet_name, rows="200", cols="50")
            set_with_dataframe(worksheet, df, include_index=False)
            print(f'<--- Results are sent to google sheets: {sheet_name} / {replace_or_append}d --->')

    else:  # append
        worksheet = None
        sheets = spreadsheet.worksheets()
        sheet_names = [sheet.title for sheet in sheets]
        
        if sheet_name in sheet_names: 
            worksheet = spreadsheet.worksheet(sheet_name)
            existing_data = worksheet.get_all_values()
            next_row = len(existing_data) + 1  # Son dolu satırın altına ekleme yapar

            # Verileri temizleyip append yapalım
            df_cleaned = df.replace([np.nan, np.inf, -np.inf], None)
            data_to_append = df_cleaned.values.tolist()
            worksheet.insert_rows(data_to_append, row=next_row)

            print(f'<--- Results are sent to google sheets: {sheet_name} / {replace_or_append}ed --->')
        else:
            worksheet = spreadsheet.add_worksheet(title=sheet_name, rows="200", cols="50")
            existing_data = worksheet.get_all_values()
            next_row = len(existing_data) + 1  # Son dolu satırın altına ekleme yapar

            # Verileri temizleyip append yapalım
            df_cleaned = df.replace([np.nan, np.inf, -np.inf], None)
            data_to_append = df_cleaned.values.tolist()
            worksheet.insert_rows(data_to_append, row=next_row)

            print(f"'{sheet_name}' not found and a new sheet is created.")
            print(f'<--- Results are sent to google sheets: {sheet_name} / {replace_or_append}ed --->')


# In[11]:


def fn_read_from_google(spreadsheet_id, sheet_name, path = './google_api/google_api.json'):
    """
    Google Sheets'ten veriyi okur ve bir pandas DataFrame olarak döndürür.
    
    :param spreadsheet_id: Google Sheet kimliği (URL'den alınabilir)
    :param sheet_name: Okunacak sayfanın adı
    :param path: Google API kimlik doğrulama dosyasının yolu
    :return: Google Sheets'teki veriyi içeren bir pandas DataFrame
    """
    scopes = ["https://www.googleapis.com/auth/spreadsheets", 
              "https://www.googleapis.com/auth/drive"]

    creds = Credentials.from_service_account_file(path, scopes=scopes)
    client = gspread.authorize(creds)

    spreadsheet = client.open_by_key(spreadsheet_id)
    
    try:
        worksheet = spreadsheet.worksheet(sheet_name)
        data = worksheet.get_all_values()  # Tüm veriyi al
        df = pd.DataFrame(data[1:], columns=data[0])  # İlk satırı başlık olarak kullan
        return df
    except gspread.exceptions.WorksheetNotFound:
        print(f"'{sheet_name}' sayfası bulunamadı.")
        return None
# %%
def fn_update_cell_googlesheet(
    spreadsheet_id,
    sheet_name,
    filter_col,        # örn: "GameLink"
    filter_value,      # örn: game_link
    target_col,        # örn: "STATUS"
    new_value,         # örn: "FINISHED"
    path
):
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]

    creds = Credentials.from_service_account_file(path, scopes=scopes)
    client = gspread.authorize(creds)

    spreadsheet = client.open_by_key(spreadsheet_id)
    worksheet = spreadsheet.worksheet(sheet_name)

    all_values = worksheet.get_all_values()
    header = all_values[0]
    rows = all_values[1:]

    try:
        filter_col_idx = header.index(filter_col)
        target_col_idx = header.index(target_col)
    except ValueError as e:
        raise Exception(f"Required column not found: {e}")

    updated = False

    for row_idx, row in enumerate(rows, start=2):
        if row[filter_col_idx] == str(filter_value):
            worksheet.update_cell(row_idx, target_col_idx + 1, new_value)
            updated = True

            if 'https' in filter_value:
                print(
                    f"<--- Cell updated | RowNumber={row_idx} | {target_col}={new_value} |\n {filter_value[28:]} | ---> "
                ,flush=True)
            else:
                print(
                f"<--- Cell updated | {filter_col}={filter_value} | "
                f"{target_col}={new_value} | RowNumber={row_idx} --->"
            ,flush=True)
            break

    if not updated:
        print(f"<--- No match found for {filter_col}={filter_value} --->")