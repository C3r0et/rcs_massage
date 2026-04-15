import os
import time
import requests
import subprocess

# --- KONFIGURASI ---
BACKEND_URL = "http://localhost:3000/api"
POLL_INTERVAL = 3  # Detik antara pengecekan
ADB_PATH = r"C:\adb\adb.exe"  # Jalur langsung ke executor ADB
# KOORDINAT TOMBOL SEND (Sesuaikan dengan HP Anda!)
# Gunakan script 'get_pos.py' di bawah untuk mencari koordinat ini.
SEND_BUTTON_X = 981.7
SEND_BUTTON_Y = 2209.8

def run_adb(args_list):
    """Fungsi pembantu untuk menjalankan perintah ADB menggunakan list argumen."""
    try:
        # Menjalankan tanpa shell=True untuk menghindari masalah quote di Windows
        result = subprocess.run([ADB_PATH] + args_list, capture_output=True, text=True)
        if result.stderr:
            print(f"[DEBUG ADB Error]: {result.stderr.strip()}")
        return result.stdout.strip()
    except Exception as e:
        print(f"Error ADB (Exception): {e}")
        return None

def send_rcs_via_adb(phone_number, text):
    """Membuka pesan dan mensimulasikan tap tombol kirim."""
    print(f"[*] Menyiapkan pengiriman ke {phone_number}...")
    
    # 0. Bangunkan layar (WAKEUP tidak akan mematikan layar jika sudah nyala)
    run_adb(["shell", "input", "keyevent", "224"])
    
    # 1. Gunakan format VIEW dengan package spesifik agar tidak muncul pilihan aplikasi
    shell_command = (
        f'am start -a android.intent.action.VIEW '
        f'-d sms:{phone_number} '
        f'--es sms_body "{text}" '
        f'com.google.android.apps.messaging'
    )
    
    print(f"[DEBUG] Menjalankan: adb shell {shell_command}")
    run_adb(["shell", shell_command])
    
    # 2. Tunggu sebentar sampai aplikasi terbuka sempurna
    time.sleep(4)
    
    # 3. Simulasi Tap Tombol Kirim (Utama)
    target_x = int(float(SEND_BUTTON_X))
    target_y = int(float(SEND_BUTTON_Y))
    run_adb(["shell", "input", "tap", str(target_x), str(target_y)])
    
    # 4. Simulasi Tombol Enter (Cadangan)
    run_adb(["shell", "input", "keyevent", "66"])
    
    print("[+] Terkirim (Simulasi)")
    return True
    
    # 3. Simulasi Tap Tombol Kirim
    # Pastikan koordinat adalah integer
    target_x = int(float(SEND_BUTTON_X))
    target_y = int(float(SEND_BUTTON_Y))
    run_adb(["shell", "input", "tap", str(target_x), str(target_y)])
    
    print("[+] Terkirim (Simulasi)")
    return True

def poll_and_process():
    """Loop utama untuk mengecek antrean pesan dari backend."""
    while True:
        try:
            print("[.] Mengecek antrean...")
            response = requests.get(f"{BACKEND_URL}/rcs/pending")
            data = response.json()
            
            if data['success'] and data['data']:
                for msg in data['data']:
                    msg_id = msg['id']
                    recipient = msg['recipient']
                    content = msg['message_content']
                    
                    # Jalankan proses ADB
                    success = send_rcs_via_adb(recipient, content)
                    
                    if success:
                        # Update status ke Webhook Backend
                        requests.post(f"{BACKEND_URL}/rcs/webhook", json={
                            "message_id": msg_id,
                            "new_status": "sent",
                            "provider_info": {"gateaway": "android-adb-python"}
                        })
                        print(f"[OK] Pesan ID {msg_id} berhasil diteruskan ke HP.")
            else:
                print("[ ] Tidak ada antrean.")
                
        except Exception as e:
            print(f"Error Koneksi: {e}")
            
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    # Cek apakah ADB terdeteksi
    devices_output = run_adb(["devices"])
    if devices_output is None:
        devices_output = ""
    lines = [line.strip() for line in devices_output.split("\n") if line.strip()]
    
    # Mencari apakah ada baris yang mengandung 'device' setelah header
    has_device = any("device" in line and "List of" not in line for line in lines)

    if not has_device:
        print("!!! HP Android tidak terdeteksi via ADB. Pastikan USB Debugging aktif dan kabel tersambung.")
        print("Output ADB:", devices_output)
    else:
        print("🚀 Gateway Aktif. Menunggu antrean dari backend...")
        poll_and_process()
