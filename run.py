"""
MyEstia - Personal Task and Reminder System
Launcher and Server Starter Script
"""

import sys
import os
import time
import threading
import webbrowser

BANNER = r"""
======================================================================
  __  __         ______     _   _       
 |  \/  |       |  ____|   | | (_)      
 | \  / |_   _  | |__   ___| |_ _  __ _ 
 | |\/| | | | | |  __| / __| __| |/ _` |
 | |  | | |_| | | |____\__ \ |_| | (_| |
 |_|  |_|\__, | |______|___/\__|_|\__,_|
          __/ |                         
         |___/                          
  Personal Task & Reminder System (Python Full-Stack)
======================================================================
"""

def open_browser(url, delay=1.2):
    """Opens browser after server starts."""
    def _open():
        time.sleep(delay)
        try:
            print(f"[*] Opening MyEstia in your browser: {url}")
            webbrowser.open(url)
        except Exception:
            pass
    threading.Thread(target=_open, daemon=True).start()

def main():
    print(BANNER)
    print("[*] Initializing MyEstia database & schema...")
    try:
        import database
        database.init_db()
        print("[+] SQLite database ready (myestia.db)")
    except Exception as e:
        print(f"[-] Database initialization warning: {e}")

    try:
        import flask
        print(f"[+] Flask {flask.__version__} detected.")
    except ImportError:
        print("[-] Flask is not installed.")
        print("[!] Please install required packages: pip install -r requirements.txt")
        sys.exit(1)

    host = "127.0.0.1"
    port = int(os.environ.get("PORT", 5000))
    url = f"http://{host}:{port}"

    print(f"[+] Server starting on {url}")
    print("[+] Default Demo Account:")
    print("    Username : demo")
    print("    Password : password123")
    print("    (Or simply click 'Demo 1-Click Login' on the login screen)")
    print("======================================================================\n")

    # Auto-open browser
    open_browser(url)

    from app import app
    app.run(host=host, port=port, debug=False)

if __name__ == '__main__':
    main()