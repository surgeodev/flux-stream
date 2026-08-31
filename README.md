# FLUX Streaming

Application de streaming (films / séries) - React + TypeScript + Vite, backend Python, worker Cloudflare.

## ⚡ Démarrage rapide sur Windows (1 commande)

Clique deux fois sur **`start-windows.bat`** (ou tape sa commande complète ci-dessous) :

```bat
git clone https://github.com/surgeodev/flux-stream.git && cd flux-stream && start-windows.bat
```

Le script installe tout, construit le frontend et démarre le backend automatiquement.

**Accès :** http://localhost:8080

## 🧱 Architecture

| Port | Rôle |
|------|------|
| **8080** | Backend Python (`server.py`) - sert le frontend buildé + API |
| **5173** | Vite dev server (optionnel, dev) |
| **8787** | Worker Cloudflare (source de streaming vixsrc) |

## 🔧 Prérequis (à installer manuellement, une fois)

- [Node.js](https://nodejs.org) (v18+)
- [Python](https://python.org) (v3.9+)

## 📦 Installation manuelle (sans le .bat)

```bat
git clone https://github.com/surgeodev/flux-stream.git
cd flux-stream
npm install
copy .env.example .env
```

## 🚀 Lancer en mode production (recommandé)

```bat
npm run build
python server.py 8080
```

→ http://localhost:8080

## 💻 Mode développement (frontend)

```bat
:: Terminal 1 - backend
python server.py 8080

:: Terminal 2 - frontend Vite
npm run dev
```

→ http://localhost:5173 (Vite)
→ Les requêtes API vont vers le backend via le proxy.

## 🌐 Worker (source de streaming - requis pour regarder)

Le streaming passe par le worker Cloudflare (port 8787). Il doit tourner dans un 2e terminal :

```bat
cd worker
npx wrangler dev
```

### Déployer le worker en ligne (optionnel)

```bat
cd worker
npx wrangler deploy
```

Puis renseigne l'URL du worker déployé dans `server.py` (sinon il utilise localhost:8787).

## 🔑 Clés API

- **TMDB** : déjà incluse dans `server.py`
- **OpenSubtitles** : renseigner dans `.env` (`OPENSUBTITLES_API_KEY`) — un fallback est inclus

## 📁 Structure

```
stream-site-v2/
├── server.py            # Backend Python (API, streaming, proxy)
├── package.json         # Dépendances frontend
├── vite.config.ts       # Config Vite (alias @, build)
├── src/                 # Frontend React/TS
│   ├── components/     # Composants UI
│   ├── hooks/          # Hooks (tmdb, stream, presence, room...)
│   └── pages/          # Pages (home, watch, movie, tv...)
├── public/             # Assets statiques
│   ├── lite*.html      # Version TV optimisée (Samsung)
│   └── subtitles/      # Fichiers VTT
├── worker/             # Worker Cloudflare (source vixsrc)
└── samsung-app/        # App Samsung TV
```

## 📺 Version TV (Samsung)

Le site détecte automatiquement les navigateurs TV et redirige vers `lite.html` (navigation par télécommande LRUD).
