import subprocess
import time

def run_adb(command):
    result = subprocess.run(f"adb {command}", shell=True, capture_output=True, text=True)
    return result.stdout.strip()

print("--- ALAT KALIBRASI KOORDINAT ---")
print("1. Buka aplikasi Google Messages di HP Anda secara manual.")
print("2. Masuk ke salah satu chat hingga muncul tombol kirim (panah).")
print("3. Ketikkan sembarang teks agar tombol kirimnya muncul.")
print("4. Masih di layar HP, silahkan ketuk/sentuh fisik tombol 'Kirim' tersebut.")
print("5. JANGAN LEPAS jari Anda dari layar!")
print("6. Sekarang jalankan perintah ini (Tekan Enter):")

input("\n[Tekan ENTER jika jari sudah menempel di tombol Send]")

# Ambil data input event terakhir
event_data = run_adb("shell getevent -c 10")
print("\n--- DATA EVENT TERDETEKSI ---")
print(event_data)
print("\n[INFO] Jika di atas muncul angka hexa (seperti 000035 atau 000036), itulah koordinatnya.")
print("Namun cara termudah: Aktifkan 'Pointer Location' di Developer Options HP Anda.")
print("Lalu lihat angka X dan Y di bagian atas layar saat Anda menekan tombol Send.")
print("Masukkan angka tersebut di variabel SEND_BUTTON_X dan SEND_BUTTON_Y pada 'gateway.py'.")
