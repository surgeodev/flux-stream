#!/usr/bin/env python3
"""
FLUX Launcher - Lance FLUX en arriere-plan sans fenetre (Windows)
Mode production : construit le frontend puis sert tout via le backend Python (8080).
Le worker vixsrc est lance en parallele (8187).
Double-clique sur FLUX.exe (compile) pour tout lancer.
"""
import os
import sys
import subprocess
import time
import socket
import webbrowser

DEST = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(DEST).lower() == "dist":
    DEST = os.path.dirname(DEST)  # quand compile par pyinstaller

BACKEND_PORT = "8080"
WORKER_PORT = "8787"   # code en dur dans server.py, ne pas changer
PROCS = []

def logfile(name):
    return open(os.path.join(DEST, name), "a", buffering=1)

def build_frontend():
    """Construit le frontend si dist/index.html manque (mode production)"""
    index = os.path.join(DEST, "dist", "index.html")
    if os.path.exists(index):
        print("  [frontend] dist deja construit, skip build")
        return
    print("  [frontend] build en cours (npm run build)...")
    p = subprocess.run("npm run build", cwd=DEST, shell=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if p.returncode != 0:
        print("  [WARN] build a echoue, le site risque de ne pas s'afficher")

def start_backend():
    env = dict(os.environ)
    env["PORT"] = BACKEND_PORT
    return subprocess.Popen(
        [sys.executable, os.path.join(DEST, "server.py"), BACKEND_PORT],
        cwd=DEST, stdout=logfile("server.log"), stderr=subprocess.STDOUT, env=env,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

def start_worker():
    worker_dir = os.path.join(DEST, "worker")
    if not os.path.exists(os.path.join(worker_dir, "index.ts")):
        return None
    p = subprocess.Popen(
        "npx wrangler dev --port %s" % WORKER_PORT,
        cwd=worker_dir, stdout=logfile("worker.log"), stderr=subprocess.STDOUT, shell=True,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    time.sleep(1)
    return p

def port_open(port, timeout=2):
    try:
        s = socket.create_connection(("localhost", port), timeout=timeout)
        s.close()
        return True
    except Exception:
        return False

def wait_port(port, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if port_open(port):
            return True
        time.sleep(1)
    return False

def main():
    print("=== FLUX Launcher ===")
    print("Dossier :", DEST)

    if port_open(int(BACKEND_PORT)):
        print("FLUX tourne deja sur http://localhost:%s" % BACKEND_PORT)
        webbrowser.open("http://localhost:%s" % BACKEND_PORT)
        return

    print("\n[1/3] Verif/build frontend...")
    build_frontend()

    print("[2/3] Demarrage du backend (port %s)..." % BACKEND_PORT)
    PROCS.append(start_backend())

    print("[3/3] Demarrage du worker (port %s)..." % WORKER_PORT)
    p = start_worker()
    if p:
        PROCS.append(p)

    print("\nAttente du backend...")
    if wait_port(int(BACKEND_PORT)):
        print("FLUX pret : http://localhost:%s" % BACKEND_PORT)
        webbrowser.open("http://localhost:%s" % BACKEND_PORT)
    else:
        print("[ERREUR] Le backend n'a pas demarre. Voir server.log")

    # Garde le processus vivant tant que le backend tourne
    try:
        while PROCS and PROCS[0].poll() is None:
            time.sleep(5)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
