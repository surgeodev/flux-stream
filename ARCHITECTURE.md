# FLUX Streaming Site - Architecture Overview

## Project Structure

```
stream-site-v2/
├── server.py                 # Main HTTP server (Python) - serves dist/ + API endpoints
├── package.json              # Node.js dependencies & scripts
├── vite.config.ts            # Vite build config with noModule redirect for Samsung TV
├── tsconfig.json             # TypeScript config
├── tsconfig.app.json         # TypeScript app config
├── index.html                # Main SPA entry point
├── ARCHITECTURE.md           # This file
├── .env.example              # Environment variables template
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml        # CI/CD deployment
├── public/                   # Static assets (copied to dist/ on build)
│   ├── lite.html             # Samsung TV optimized player (no ES modules)
│   ├── lrud.js               # BBC LRUD remote control navigation
│   ├── logo.png
│   ├── favicon.png/svg
│   ├── Fluxsymbol.png
│   ├── 404.html
│   ├── robots.txt
│   ├── hls/                  # HLS test segments
│   └── subtitles/            # Local VTT subtitle files
│       └── spider-man-brand-new-day-french.vtt
├── dist/                     # Built production output (served by server.py)
│   ├── index.html            # Main SPA with noModule Samsung TV redirect
│   ├── lite.html             # TV-optimized player (copied from public/)
│   ├── lrud.js
│   ├── assets/               # Vite-bundled JS/CSS
│   │   ├── index-*.js
│   │   └── index-*.css
│   ├── hls/                  # HLS test segments
│   └── subtitles/            # Local VTT files (copied from public/)
├── src/                      # React/TypeScript SPA source
│   ├── main.tsx              # App entry point
│   ├── App.tsx               # Root component + routing
│   ├── index.css             # Global styles (Tailwind-like)
│   ├── vite-env.d.ts
│   ├── lib/                  # Utilities
│   │   ├── utils.ts
│   │   └── base-path.ts
│   ├── hooks/                # Custom React hooks
│   │   ├── use-local-storage.ts
│   │   ├── use-preferences.ts
│   │   ├── use-tmdb.ts
│   │   ├── use-stream.ts
│   │   ├── use-watch-progress.ts
│   │   ├── use-playlist.ts
│   │   └── use-presence.ts
│   ├── components/           # React components
│   │   ├── ui/               # Base UI components
│   │   ├── layout.tsx        # Main layout wrapper
│   │   ├── navbar.tsx        # Top navigation
│   │   ├── media-card.tsx    # Movie/TV card
│   │   ├── media-row.tsx     # Horizontal media row
│   │   ├── hls-player.tsx    # HLS video player (main app)
│   │   ├── video-player.tsx  # Video player wrapper
│   │   ├── playlist-button.tsx
│   │   ├── launch-sound.tsx
│   │   ├── remote-control.tsx
│   │   └── error-guard.tsx
│   ├── pages/                # Route pages
│   │   ├── home.tsx          # Trending/popular
│   │   ├── search.tsx        # Search results
│   │   ├── movie/[id].tsx    # Movie detail + player
│   │   ├── tv/[id].tsx       # TV show detail + player
│   │   ├── watch.tsx         # Player page
│   │   ├── playlist.tsx      # User playlist
│   │   ├── categories.tsx    # Category browser
│   │   ├── category/[id].tsx # Category detail
│   │   ├── admin.tsx         # Admin dashboard
│   │   └── not-found.tsx
│   └── assets/
│       └── flux-tudum.mp3    # Startup sound
├── worker/                   # Cloudflare Worker (edge deployment)
│   ├── index.ts              # Worker entry point
│   └── wrangler.toml         # Cloudflare config
├── samsung-app/              # Samsung Tizen TV app (WGT)
│   └── FLUX/
│       ├── config.xml        # Tizen app manifest
│       ├── widget.info       # Widget metadata
│       ├── lrud.js           # Remote navigation
│       ├── icon.png
│       ├── thumbnail.png
│       └── logo.png
└── content-fixer/            # Separate utility project (not needed for runtime)
```

## Key Components

### 1. Server (`server.py`)
- **ThreadingHTTPServer** on port 3002 (configurable via CLI arg)
- Serves static files from `dist/` with SPA fallback (`index.html`)
- **Samsung TV Detection**: User-Agent check for `samsung` + `sm-` or `tv` → serves `lite.html` directly
- API Endpoints:
  - `/api/resolve` - Get streams from play.xpass.top + backend (port 8787)
  - `/api/streams/movie|series/:id` - Proxy to backend streams
  - `/api/subtitles` - External subtitles (YIFY via TMDB IMDb ID)
  - `/api/subtitles/local` - **NEW**: Local VTT files from `dist/subtitles/`
  - `/api/subtitle-download` - Download & convert external SRT to VTT
  - `/api/subtitle-download-local` - **NEW**: Serve local VTT files
  - `/api/search` - TMDB search
  - `/api/lite/trending` - TMDB trending/popular
  - `/api/proxy` - M3U8 proxy with URL rewriting
  - `/api/dlproxy` - Direct stream proxy (Vixsrc)
  - `/api/download-movie` - FFmpeg download with audio/subtitle selection
  - `/api/health`, `/api/presence`, `/api/admin/*` - Monitoring & admin

### 2. Main SPA (`src/` + `dist/`)
- **React 18 + TypeScript + Vite**
- **React Router** for SPA routing
- **Tailwind-like CSS** in `index.css` (custom utility classes)
- **HLS.js** for HLS playback in browsers without native support
- **BBC LRUD** for remote control navigation (TV-friendly)
- Pages: Home, Search, Movie Detail, TV Detail, Watch, Playlist, Categories, Admin

### 3. Samsung TV Lite Player (`public/lite.html` → `dist/lite.html`)
- **Zero dependencies** (vanilla JS, no ES modules)
- **HLS.js v1.5.10** from CDN for HLS playback
- **Samsung TV optimized**: Large fonts, remote navigation, fullscreen support
- **Subtitle System**:
  - Loads `/api/subtitles/local` first (local VTT files)
  - Falls back to `/api/subtitles` (external YIFY)
  - Parses VTT with `parseVtt()` → cues array
  - Renders subtitles in `#sub` overlay div
  - Supports multiple subtitle tracks with language selection

### 4. Samsung Tizen App (`samsung-app/FLUX/`)
- Packaged as `.wgt` for Samsung TV App Store
- Uses same `lite.html` logic wrapped in Tizen config
- `config.xml` defines app metadata, permissions, icon

### 5. Cloudflare Worker (`worker/`)
- Edge deployment option via Cloudflare Workers
- `wrangler.toml` for configuration

## Samsung TV Support Flow

```
User Agent: SamsungBrowser/xx (SM-xxxx) or Samsung TV
                    │
                    ▼
server.py do_GET() → is_samsung_tv = 'samsung' in ua and ('sm-' in ua or 'tv' in ua)
                    │
                    ├── YES → self.path = '/lite.html' → serve dist/lite.html directly
                    │
                    └── NO  → serve dist/index.html (has noModule redirect script)
                                 │
                                 ▼
                    <script> checks: no ES modules? → redirect to /lite.html
                                 Samsung TV UA? → redirect to /lite.html
                                 After 3s no #root? → redirect to /lite.html
```

## Subtitle System (Lite Player)

```
loadSubs() called on movie open
        │
        ▼
GET /api/subtitles/local  ──────► Returns [{file, lang, name, title}] from dist/subtitles/
        │
        ├── Has results? → Use local, fetchSub(meta) → GET /api/subtitle-download-local?file=xxx.vtt
        │
        └── Empty? → GET /api/subtitles?type=movie&tmdb_id=xxx (external YIFY)
                           │
                           ▼
                    fetchSub(meta) → GET /api/subtitle-download?file_id=slug&duration=xxx
                           │
                           ▼
                    parseVtt(vttText) → [{s:start, e:end, t:text}] cues array
                           │
                           ▼
                    setInterval(250ms) → match video.currentTime with cues → display in #sub
```

## External Dependencies

### APIs Used
- **TMDB** (api.themoviedb.org) - Movie/TV metadata, search, trending
- **play.xpass.top** - Stream playlists (MEG, VRK, VXR backends)
- **Backward API** (localhost:8787) - Additional streams
- **YIFY Subtitles** (yifysubtitles.ch) - External subtitles (blocked for automation)
- **Vixsrc** (vixsrc.to) - Direct streams

### CDN Libraries
- **HLS.js** v1.5.10 (cdn.jsdelivr.net) - HLS playback in lite.html
- **Google Fonts** (Outfit, Plus Jakarta Sans) - Typography
- **BBC LRUD** (local lrud.js) - Spatial navigation

## Running the Project

### Development
```bash
npm install
npm run dev        # Vite dev server (port 5173)
python3 server.py 3002  # API + static server
```

### Production Build
```bash
npm run build      # Outputs to dist/
python3 server.py 3002  # Serves dist/ + API
```

### Samsung TV Testing
- Access `http://<server-ip>:3002/` from Samsung TV browser
- Automatically serves `lite.html` for Samsung TV User-Agents
- Or manually visit `http://<server-ip>:3002/lite.html`

## File Size Notes (Excluded from Zip)
Large media files excluded from distribution:
- `*.mp4` test videos (~500MB+ total)
- `vix_12seg.mp4` (19MB)
- `seg0*.mp4` (~360MB each)
- `compat.mp4` (507MB)
- `flux-intro.mp4` (409MB)
- `node_modules/` (145MB+)
- `.git/` 
- `__pycache__/`
- `content-fixer/` (separate utility project)

## Key Files for Samsung TV (Flux Lite)

| File | Purpose |
|------|---------|
| `dist/lite.html` | Main TV player (vanilla JS, no modules) |
| `dist/lrud.js` | Remote control navigation |
| `dist/subtitles/*.vtt` | Local subtitle files |
| `server.py` | API + static file server |
| `public/lite.html` | Source for lite.html (edit here) |
| `public/subtitles/*.vtt` | Source subtitle files |

## Samsung TV Compatibility Notes

- **ES Modules**: Not supported on older Samsung TVs (2014-2017) → `lite.html` uses vanilla JS
- **HLS**: Native support varies → HLS.js polyfill included
- **MSE**: Required for HLS.js → Available on Tizen 2.3+ (2015+)
- **Remote Control**: BBC LRUD handles spatial navigation + key codes
- **Fullscreen**: `webkitRequestFullscreen` + `webkitEnterFullscreen` for older Tizen
- **User Agent Detection**: Both server-side (Python) and client-side (JS redirect)