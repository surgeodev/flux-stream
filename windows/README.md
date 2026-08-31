# FLUX - Installation Windows (one-click .exe)

Des executables (`install-flux.exe` + `FLUX.exe`) pour installer et lancer FLUX en un double-clic, sans terminal.

## Workflow final (ce que tu cherches)

1. **Double-clique sur `install-flux.exe`** (une seule fois)
   - Desinstalle toute ancienne version
   - Clone la derniere version depuis GitHub
   - Installe les dependances
   - Compile et cree `FLUX.exe`

2. **Double-clique sur `FLUX.exe`** (a chaque fois que tu veux lancer FLUX)
   - Lance le backend + worker en arriere-plan (aucune fenetre)
   - Ouvre le navigateur sur http://localhost:8080

## Comment obtenir les .exe

Le repo ne contient **pas** les binaires (impossible de stocker un .exe compile pour Windows dans un repo Git de facon portable). Tu compiles les .exe **une fois** sur ta machine Windows :

```bat
git clone https://github.com/surgeodev/flux-stream.git
cd flux-stream
windows\build-all.bat
```

Ensuite, dans le dossier `dist\` tu as :

| Executable | Usage |
|------------|-------|
| `install-flux.exe` | Premiere installation / reinstallation |
| `FLUX.exe` | Lancer FLUX en arriere-plan |

## Fichiers du dossier `windows/`

| Fichier | Role |
|---------|------|
| `install_flux.py` | Source de `install-flux.exe` (desinstalle + installe + build) |
| `launcher.py` (racine) | Source de `FLUX.exe` (lance backend + worker en arriere-plan) |
| `build-all.bat` | Compile les deux executables |
| `build-exe.bat` | Compile uniquement le launcher `FLUX.exe` |
