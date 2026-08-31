#!/usr/bin/env python3
"""
FLUX Desktop - application fenetree (WebView) qui lance FLUX et l'affiche.
Double-clique sur FLUX-Desktop.exe pour tout demarrer dans une fenetre.
"""
import os
import sys
import subprocess
import time
import socket
import threading

DEST = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(DEST).lower() in ("dist", "_internal"):
    DEST = os.path.dirname(DEST)

BACKEND_PORT = os.environ.get("FLUX_PORT", "8080")
WORKER_PORT = "8787"

def logfile(name):
    return open(os.path.join(DEST, name), "a", buffering=1)

def port_open(port, timeout=2):
    try:
        s = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        s.close()
        return True
    except Exception:
        return False

def build_if_needed():
    if os.path.exists(os.path.join(DEST, "dist", "index.html")):
        return
    print("[FLUX] construction du frontend...")
    subprocess.run("npm run build", cwd=DEST, shell=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def start_backend():
    if port_open(int(BACKEND_PORT)):
        return
    env = dict(os.environ); env["PORT"] = BACKEND_PORT
    subprocess.Popen(
        [sys.executable, os.path.join(DEST, "server.py"), BACKEND_PORT],
        cwd=DEST, stdout=logfile("server.log"), stderr=subprocess.STDOUT,
        env=env, creationflags=subprocess.CREATE_NO_WINDOW,
    )

def start_worker():
    if port_open(int(WORKER_PORT)):
        return
    wdir = os.path.join(DEST, "worker")
    if not os.path.exists(os.path.join(wdir, "index.ts")):
        return
    subprocess.Popen("npx wrangler dev --port %s" % WORKER_PORT,
                     cwd=wdir, stdout=logfile("worker.log"), stderr=subprocess.STDOUT,
                     shell=True, creationflags=subprocess.CREATE_NO_WINDOW)

def wait_port(port, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if port_open(port):
            return True
        time.sleep(1)
    return False

def boot():
    build_if_needed()
    start_backend()
    start_worker()
    wait_port(int(BACKEND_PORT))

def main():
    # demarre le serveur dans un thread pour ne pas bloquer l'UI
    t = threading.Thread(target=boot, daemon=True)
    t.start()
    boot  # demarrage deja lance par le thread

    try:
        import webview
    except ImportError:
        import webbrowser
        webbrowser.open("http://localhost:%s" % BACKEND_PORT)
        print("pywebview absent -> ouverture navigateur. Pour la fenetre, installe : pip install pywebview")
        # garde le process tant que le serveur tourne
        while True:
            time.sleep(5)
        return

    # attend le backend avant d'afficher
    wait_port(int(BACKEND_PORT))

    webview.create_window(
        "FLUX",
        "http://localhost:%s" % BACKEND_PORT,
        width=1200, height=800, resizable=True,
    )
    webview.start()

if __name__ == "__main__":
    main()
