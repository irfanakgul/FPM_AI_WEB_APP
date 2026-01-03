import os
import shutil

def copy_results_db(source_path, target_path):
    source_file = os.path.join(source_path, "results.db")
    target_file = os.path.join(target_path, "results.db")

    if not os.path.isfile(source_file):
        raise FileNotFoundError(f"Kaynak dosya bulunamadı: {source_file}")

    # Hedef dizin yoksa oluştur
    os.makedirs(target_path, exist_ok=True)

    # copy2 → metadata (tarih vb.) de korunur
    shutil.copy2(source_file, target_file)

    print(f"results.db başarıyla kopyalandı: {target_file}")


# clone from web APP into Jupyter FPM version 22.
copy_results_db(
    source_path="/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/database/",
    target_path="/Users/irfanakgul/Desktop/FPM/FPM_one_v22_live/database/"
)


