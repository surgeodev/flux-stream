#!/usr/bin/env python3
"""
FLUX - Installation one-click (Windows)
Desinstalle l'ancienne version, installe la derniere, prepare le launcher.
Usage: python install_flux.py   (ou double-clique sur install-flux.exe si compile)
"""
import os
import sys
import shutil
import subprocess
import time
import urllib.request

GITHUB = "https://github.com/surgeodev/flux-stream"
DEST = os.path.join(os.environ.get("USERPROFILE", os.path.expanduser("~")), "flux-stream")

def run(cmd, cwd=None):
    print(f"  > {cmd}")
    subprocess.run(cmd, shell=True, cwd=cwd)

def cmd_exists(cmd):
    try:
        subprocess.run(f"where {cmd}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False

def main():
    print("=" * 55)
    print("  FLUX STREAMING - INSTALLATEUR WINDOWS")
    print("=" * 55)

    # ---------- 1. Verifier Node/Python/Git ----------
    print("\n[1/6] Verification des outils...")
    missing = []
    for tool in ["node", "npm", "python", "git"]:
        if cmd_exists(tool):
            print(f"  [OK] {tool}")
        else:
            print(f"  [MANQUANT] {tool}")
            missing.append(tool)
    if missing:
        print(f"\n[ERREUR] Outils manquants : {', '.join(missing)}")
        print("  Installe-les puis relance :")
        print("    Node.js : https://nodejs.org  (coche 'Add to PATH')")
        print("    Python  : https://python.org   (coche 'Add to PATH')")
        print("    Git     : https://git-scm.com")
        input("Appuie sur Entree pour quitter...")
        sys.exit(1)

    # ---------- 2. Supprimer l'ancienne version ----------
    print("\n[2/6] Desinstallation de l'ancienne version...")
    if os.path.exists(DEST):
        try:
            for root, dirs, files in os.walk(DEST, topdown=False):
                for f in files:
                    try: os.remove(os.path.join(root, f))
                    except Exception: pass
                for d in dirs:
                    try: os.rmdir(os.path.join(root, d))
                    except Exception: pass
            os.rmdir(DEST)
            print(f"  [OK] Ancienne version supprimee : {DEST}")
        except Exception as e:
            print(f"  [WARN] Impossible de tout supprimer: {e}")
    else:
        print("  - Aucune ancienne version trouvee (dossier propre)")

    # ---------- 3. Cloner la derniere version ----------
    print("\n[3/6] Telechargement de la derniere version...")
    run(f"git clone {GITHUB} \"{DEST}\"")
    if not os.path.exists(os.path.join(DEST, "package.json")):
        print("[ERREUR] Le clone a echoue.")
        input("Appuie sur Entree...")
        sys.exit(1)
    print("  [OK] Derniere version clonee")

    # ---------- 4. npm install ----------
    print("\n[4/6] Installation des dependances npm...")
    run("npm install", cwd=DEST)

    # ---------- 5. Creer .env ----------
    print("\n[5/6] Configuration de l'environnement...")
    env_path = os.path.join(DEST, ".env")
    if not os.path.exists(env_path):
        with open(env_path, "w") as f:
            f.write("VITE_API_URL=http://localhost:8080\n")
        print("  [OK] .env cree")
    else:
        print("  - .env deja present")

    # ---------- 6. Compiler le launcher .exe ----------
    print("\n[6/6] Compilation du launcher FLUX.exe...")
    build_script = os.path.join(DEST, "windows", "build-exe.bat")
    if os.path.exists(build_script):
        run(f'call "{build_script}" <nul', cwd=DEST)
    else:
        try:
            run("python -m pyinstaller --onefile --noconsole --name FLUX launcher.py", cwd=DEST)
        except Exception as e:
            print(f"  [WARN] pyinstaller direct: {e}")
    exe = os.path.join(DEST, "dist", "FLUX.exe")
        if os.path.exists(exe):
            print(f"\n[SUCCES] Launcher cree : {exe}")
            print("  Copie FLUX.exe sur ton Bureau / double-clique pour lancer FLUX")
        else:
            print("\n[WARN] pyinstaller n'a pas produit FLUX.exe. Verifie que pyinstaller est installe :")
            print("       python -m pip install pyinstaller")
    except Exception as e:
        print(f"\n[WARN] Compilation du launcher echouee : {e}")
        print("  Installe pyinstaller : python -m pip install pyinstaller puis relance")

    print("\n" + "=" * 55)
    print("  INSTALLATION TERMINEE")
    print("=" * 55)
    print(f"\n  Dossier : {DEST}")
    print("\n  Pour lancer FLUX :")
    print("    - Double-clique sur FLUX.exe  (si compile)")
    print("    - Ou :  python launcher.py")
    print("\n  Ouverture du navigateur : http://localhost:8080")
    input("\nAppuie sur Entree pour fermer...")

if __name__ == "__main__":
    main()
