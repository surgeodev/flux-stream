import http.server
import os
import sys
import json
import io
import zipfile
import urllib.request
import re
import tempfile
import time
import subprocess
import secrets
import chardet
import hashlib
import base64
import threading
import collections
from datetime import datetime
import urllib.parse
import pysubs2

PRESENCE = {}
PRESENCE_LOCK = threading.Lock()
PRESENCE_TTL = 150
HISTORY = collections.deque(maxlen=300)
COMMANDS = {}
BANNED = {}
CAST_SIDS = {}

PROFILES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'profiles.json')
PROFILES = {}
PROFILES_LOCK = threading.Lock()
AVATAR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'avatars')
AVATAR_EXT = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}

def _ensure_avatar_dir():
    try:
        os.makedirs(AVATAR_DIR, exist_ok=True)
    except Exception:
        pass

_ensure_avatar_dir()

def avatar_path(uid):
    # uid est un hash hex -> pas de traversal possible
    return os.path.join(AVATAR_DIR, uid + '.jpg')

def _load_profiles():
    try:
        if os.path.exists(PROFILES_FILE):
            with open(PROFILES_FILE) as f:
                data = json.load(f)
                if isinstance(data, dict):
                    PROFILES.update(data)
    except Exception:
        pass

def _save_profiles():
    try:
        with open(PROFILES_FILE + '.tmp', 'w') as f:
            json.dump(PROFILES, f)
        os.replace(PROFILES_FILE + '.tmp', PROFILES_FILE)
    except Exception:
        pass

_load_profiles()

def client_uid(self):
    # Identité stable par IP + user-agent (pas de cookies/mot de passe)
    raw = self.client_address[0] + '|' + (self.headers.get('User-Agent') or '')
    return hashlib.md5(raw.encode()).hexdigest()[:16]

def _parse_extra(payload):
    try:
        v = json.loads(payload or '')
        return v if isinstance(v, dict) else {}
    except Exception:
        return {}

def _prune_cast(now=None):
    now = now if now is not None else time.time()
    for sid in list(CAST_SIDS.keys()):
        if now - CAST_SIDS[sid]['ts'] > 600:
            del CAST_SIDS[sid]

def read_json_body(self):
    length = int(self.headers.get('Content-Length', 0))
    raw = self.rfile.read(length) if length else b'{}'
    try:
        return json.loads(raw.decode('utf-8', 'replace'))
    except Exception:
        return {}

def load_admin_key():
    try:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tmdb-embed-api', 'utils', 'user-config.json')
        with open(p) as f:
            return json.load(f).get('adminKey') or 'flux-admin-7241'
    except Exception:
        return 'flux-admin-7241'

ADMIN_KEY = load_admin_key()

def ua_device(ua):
    ua = ua or ''
    low = ua.lower()
    if 'iphone' in low:
        dev = 'iPhone'
    elif 'ipad' in low:
        dev = 'iPad'
    elif 'android' in low:
        m = re.search(r'(samsung[^;)]*|pixel[^;)]*|mi[^;)]*|oneplus[^;)]*|huawei[^;)]*|redmi[^;)]*|oppo[^;)]*|vivo[^;)]*|realme[^;)]*)', low)
        dev = m.group(1).strip() if m else 'Android'
    elif 'windows' in low:
        dev = 'PC Windows'
    elif 'mac os' in low or 'macintosh' in low:
        dev = 'Mac'
    elif 'linux' in low:
        dev = 'Linux'
    elif 'playstation' in low or 'xbox' in low or 'nintendo' in low:
        dev = 'Console'
    else:
        dev = 'Navigateur'
    if 'curl' in low or 'python' in low or 'wget' in low:
        dev = 'Bot'
    return dev

TMDB_KEY = '32ab31eb2e3afebff1262e0657d6368c'

PLAYX_DOMAIN = 'https://play.xpass.top'
TMDB_API = 'https://api.themoviedb.org/3'
TMDB_CACHE = {}
TMDB_CACHE_TTL = 600
YIFY_DOMAIN = 'https://yifysubtitles.ch'
YIFY_FALLBACK = 'https://yts-subs.com'
ADDIC7ED_BASE = 'https://www.addic7ed.com'
OPENSUBTITLES_API = 'https://api.opensubtitles.com/api/v1'
# clé fournie par l'utilisateur, lue depuis .env ou env
OPENSUBTITLES_API_KEY = os.environ.get('OPENSUBTITLES_API_KEY', '').strip()
if not OPENSUBTITLES_API_KEY:
    try:
        _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
        if os.path.exists(_env_path):
            with open(_env_path, encoding='utf-8', errors='replace') as _ef:
                for _line in _ef:
                    if _line.strip().startswith('OPENSUBTITLES_API_KEY'):
                        OPENSUBTITLES_API_KEY = _line.split('=', 1)[1].strip().strip('"\'')
                        break
    except Exception:
        pass
# fallback clé injectée (perso) si pas de .env
if not OPENSUBTITLES_API_KEY:
    OPENSUBTITLES_API_KEY = 'RG6lTh29FYiRKJTN42N3GlLlygplnOeH'

_imdb_cache = {}
_vtt_cache = {}
_addic_vtt_cache = {}
_os_cache = {}
_os_last_req = 0
_os_lock = threading.Lock()
_wiflix_cache = {}


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        '.m3u8': 'application/vnd.apple.mpegurl',
        '.ts': 'video/mp2t',
        '.vtt': 'text/vtt',
    })

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.handle_api()
            return
        if self.path.startswith('/seg/') and self.path.endswith('.ts'):
            self.handle_hls_seg(public_ok=True)
            return
        if self.path.startswith('/ll/') and self.path.endswith('.ts'):
            # Segments hls-lite: byte-range natif 206 obligatoire (player Samsung
            # 2014 coupe/réessaie sur un 200 complet). Ne pas laisser tomber dans
            # SimpleHTTP statique (200 sans Content-Range).
            self.handle_hls_lite(seg=True)
            return
        ua = (self.headers.get('User-Agent') or '').lower()
        # Samsung TV legacy (2014 pre-Tizen H4500) + Tizen + generic smarttv
        is_samsung_tv = ('samsung' in ua and
                         ('tizen' in ua or 'smarttv' in ua or 'smart-tv' in ua
                          or 'hinternet' in ua or re.search(r'h\s?\d{4}', ua))
                         and 'mobile' not in ua)
        print(f'DEBUG do_GET: path={self.path} ua={ua[:120]} is_samsung_tv={is_samsung_tv}')
        if is_samsung_tv:
            print(f'TV UA detected: {ua[:200]}')
        if is_samsung_tv and self.path in ('/', '/index.html'):
            self.path = '/lite.html'
            return super().do_GET()
        LITE_PAGES = {'/lite': 'lite.html', '/litemovie': 'litemovie.html', '/litetv': 'litetv.html',
                      '/litesearch': 'litesearch.html', '/litewatch': 'litewatch.html'}
        if self.path in LITE_PAGES:
            self.path = '/' + LITE_PAGES[self.path]
            return super().do_GET()
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            return super().do_GET()
        self.path = '/index.html'
        return super().do_GET()

    def end_headers(self):
        if self.path.endswith('.html'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_HEAD(self):
        if self.path.startswith('/api/'):
            self.send_error(405)
            return
        super().do_HEAD()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.handle_api()
            return
        self.send_error(404)

    VIXSRC_HEADERS = {
        'Referer': 'https://vixsrc.to/api/movie/550',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    }

    def handle_api(self):
        try:
            path = self.path.split('?')[0]
            if path == '/api/resolve':
                self.handle_resolve()
            elif path == '/api/subtitles':
                self.handle_subtitles()
            elif path == '/api/subtitles/local':
                self.handle_subtitles_local()
            elif path == '/api/subtitle-download':
                self.handle_subtitle_download()
            elif path == '/api/subtitle-download-local':
                self.handle_subtitle_download_local()
            elif path == '/api/subtitles/addic7ed':
                self.handle_subtitles_addic7ed()
            elif path == '/api/wiflix/resolve':
                self.handle_wiflix_resolve()
            elif path == '/api/health':
                self.send_json({'status': 'ok'})
            elif path == '/api/search':
                self.handle_search()
            elif path == '/api/tmdb-proxy':
                self.handle_tmdb_proxy()
            elif path == '/api/lite/trending':
                self.handle_lite_trending()
            elif path == '/api/tvdetail':
                self.handle_tvdetail()
            elif path == '/api/poster':
                self.handle_poster()
            elif path == '/api/proxy':
                self.handle_proxy()
            elif path.startswith('/api/streams/'):
                self.proxy_streams()
            elif path.startswith('/api/download/'):
                self.handle_download()
            elif path.startswith('/api/dlproxy'):
                self.handle_dlproxy()
            elif path == '/api/tvstream':
                self.handle_tvstream()
            elif path == '/api/tvchunk':
                self.handle_tvchunk()
            elif path in ('/api/hls-direct', '/api/hls-direct.m3u8'):
                self.handle_hls_direct()
            elif path == '/api/hls-lite':
                if (self.get_params().get('mode') or 'playlist') == 'seg':
                    self.handle_hls_lite(seg=True)
                else:
                    self.handle_hls_lite()
            elif path == '/api/hls-lite.m3u8':
                # Alias finissant en .m3u8 : le player Samsung 2014 (lavf52)
                # refuse les playlists sans extension .m3u8 dans l'URL (tb4
                # jouait, /api/hls-lite était rejeté silencieusement).
                self.handle_hls_lite()
            elif path == '/api/download-movie':
                self.handle_download_movie()
            elif path == '/api/error-log':
                self.handle_error_log()
            elif path == '/api/presence':
                self.handle_presence()
            elif path == '/api/cast/devices':
                self.handle_cast_devices()
            elif path == '/api/cast/request':
                self.handle_cast_request()
            elif path == '/api/cast/cmd':
                self.handle_cast_cmd()
            elif path == '/api/profile':
                self.handle_profile()
            elif path == '/api/profile/avatar':
                self.handle_avatar_upload()
            elif path.startswith('/api/avatar/'):
                self.handle_avatar_get()
            elif path == '/api/profile/like':
                self.handle_profile_like()
            elif path.startswith('/api/likes/'):
                self.handle_likes()
            elif path == '/api/admin/presence':
                self.handle_admin_presence()
            elif path == '/api/admin/command':
                self.handle_admin_command()
            elif path == '/api/admin/ban':
                self.handle_admin_ban()
            elif path == '/api/admin/unban':
                self.handle_admin_unban()
            else:
                self.send_json({'error': 'not_found'}, 404)
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_error_log(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b'{}'
            line = f"{datetime.now().isoformat()} {body.decode('utf-8', 'replace')}"
            with open('error-log.txt', 'a') as f:
                f.write(line + '\n')
            self.send_json({'ok': True})
        except Exception:
            self.send_json({'ok': False}, 500)

    def handle_cast_devices(self):
        # LAN uniquement : les téléviseurs connectés (via /api/presence).
        try:
            params = self.get_params()
            now = time.time()
            with PRESENCE_LOCK:
                self._prune_presence(now)
                _prune_cast(now)
                online = []
                for uid, v in PRESENCE.items():
                    if str(v.get('kind', '')) != 'tv':
                        continue
                    extra = v.get('extra') or {}
                    entry = {
                        'uid': uid,
                        'label': v.get('label') or 'TV',
                        'ip': v.get('ip', ''),
                        'ua': v.get('ua', ''),
                        'lastSeen': v.get('lastSeen', 0),
                        'online': (now - (v.get('lastSeen', 0)) <= 15),
                    }
                    if extra:
                        entry['state'] = {
                            'playing': extra.get('playing', False),
                            'time': float(extra.get('t', 0) or 0),
                            'dur': float(extra.get('dur', 0) or 0),
                            'vol': extra.get('vol', None),
                            'sub': extra.get('sub', None),
                            'subList': (extra.get('subList') or []),
                            'zoom': extra.get('zoom', None),
                            'zoomPct': extra.get('zoomPct', None),
                            'qual': extra.get('qual', None),
                            'qualList': (extra.get('qualList') or []),
                            'rate': extra.get('rate', None),
                            'title': extra.get('title', ''),
                            'sid': extra.get('sid', None),
                        }
                    online.append(entry)
            self.send_json({'devices': online})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_cast_request(self):
        # Phone → serveur : demande de caster un media vers un uid TV.
        try:
            params = self.get_params()
            uid = (params.get('uid', '') or '').strip()[:40]
            media_type = (params.get('type', '') or 'movie')[:8]
            mid = (params.get('id', '') or '')[:32]
            title = (params.get('title', '') or '')[:200]
            season = (params.get('season', '') or '')[:4]
            episode = (params.get('episode', '') or '')[:4]
            if not uid or not mid:
                self.send_json({'error': 'missing uid/id'}, 400); return
            sid = secrets.token_hex(4)
            payload = {
                'action': 'cast', 'payload': {
                    'sid': sid, 'type': media_type, 'id': mid,
                    'title': title, 'season': season, 'episode': episode,
                }, 'ts': time.time(),
            }
            with PRESENCE_LOCK:
                _prune_cast()
                CAST_SIDS[sid] = {'uid': uid, 'ts': time.time()}
                COMMANDS.setdefault(uid, []).append(payload)
            self.send_json({'ok': True, 'sid': sid, 'uid': uid})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_cast_cmd(self):
        # Phone → serveur → TV : commande de télécommande.
        try:
            params = self.get_params()
            uid = (params.get('uid', '') or '').strip()[:40]
            cmd = (params.get('cmd', '') or '').strip()[:24]
            sid = (params.get('sid', '') or '').strip()[:40]
            if not uid or not cmd:
                self.send_json({'error': 'missing uid/cmd'}, 400); return
            payload_raw = params.get('payload', '')
            try:
                pobj = json.loads(payload_raw) if payload_raw else {}
                if not isinstance(pobj, dict):
                    pobj = {'raw': pobj}
            except Exception:
                pobj = {'raw': payload_raw}
            with PRESENCE_LOCK:
                _prune_cast()
                live = (sid in CAST_SIDS) if sid else True
                if not live:
                    self.send_json({'ok': True, 'stale': True}); return
                COMMANDS.setdefault(uid, []).append({
                    'action': 'ctrl',
                    'payload': {'cmd': cmd, 'sid': sid, 'val': pobj, 'ts': time.time()},
                    'ts': time.time(),
                })
            self.send_json({'ok': True})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def _prune_presence(self, now=None):
        now = now if now is not None else time.time()
        for uid in list(PRESENCE.keys()):
            if now - PRESENCE[uid]['lastSeen'] > PRESENCE_TTL:
                del PRESENCE[uid]

    def handle_presence(self):
        try:
            params = self.get_params()
            uid = params.get('uid', '')[:40] or hashlib.md5((self.client_address[0] + (self.headers.get('User-Agent') or '')).encode()).hexdigest()[:16]
            now = time.time()
            label = params.get('label', '')[:120]
            path = params.get('path', '')[:120]
            with PRESENCE_LOCK:
                if uid in BANNED:
                    self.send_json({'ok': True, 'banned': True, 'reason': BANNED[uid].get('reason', '')})
                    return
                self._prune_presence(now)
                prev = PRESENCE.get(uid)
                entry = {
                    'uid': uid,
                    'ip': self.client_address[0],
                    'ua': ua_device(self.headers.get('User-Agent')),
                    'path': path,
                    'label': label,
                    'kind': params.get('kind', '')[:8],
                    'id': params.get('id', '')[:12],
                    's': params.get('s', ''),
                    'e': params.get('e', ''),
                     'img': params.get('img', '')[:120],
                    'playing': params.get('playing', ''),
                    't': float(params.get('t', 0) or 0),
                    'dur': float(params.get('dur', 0) or 0),
                    'extra': _parse_extra(params.get('extra', '')),
                    'firstSeen': prev['firstSeen'] if prev else now,
                    'lastSeen': now,
                }
                PRESENCE[uid] = entry
                if prev is None or prev.get('label') != label or now - (prev.get('lastSeen') or 0) > 60:
                    HISTORY.append({'uid': uid, 'ip': self.client_address[0], 'ua': entry['ua'], 'label': label, 'kind': entry['kind'], 'id': entry['id'], 's': entry['s'], 'e': entry['e'], 'img': entry['img'], 'ts': now})
                cmds = COMMANDS.pop(uid, [])
            self.send_json({'ok': True, 'commands': cmds})
        except Exception:
            self.send_json({'ok': False}, 500)


    def handle_avatar_upload(self):
        try:
            uid = client_uid(self)
            body = read_json_body(self)
            data_url = str(body.get('data', ''))
            if not data_url.startswith('data:image/'):
                self.send_json({'error': 'invalid_image'}, 400)
                return
            # "data:image/jpeg;base64,XXXX"
            try:
                header, _, b64 = data_url.partition(',')
                raw = base64.b64decode(b64)
            except Exception:
                self.send_json({'error': 'invalid_base64'}, 400)
                return
            if len(raw) > 8 * 1024 * 1024:
                self.send_json({'error': 'too_large'}, 413)
                return
            dest = avatar_path(uid)
            with open(dest, 'wb') as f:
                f.write(raw)
            with PROFILES_LOCK:
                p = PROFILES.setdefault(uid, {'uid': uid, 'ip': self.client_address[0], 'name': '', 'avatar': '', 'likes': [], 'createdAt': time.time()})
                p['avatar'] = '/api/avatar/{0}?v={1}'.format(uid, int(time.time()))
                p['lastSeen'] = time.time()
                _save_profiles()
            self.send_json({'ok': True, 'avatar': p['avatar']})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_avatar_get(self):
        try:
            name = self.path.split('?')[0].rsplit('/', 1)[-1]
            # sécurité : seul un hash hex est accepté
            if not re.fullmatch(r'[0-9a-f]{1,32}', name):
                self.send_json({'error': 'not_found'}, 404)
                return
            p = avatar_path(name)
            if not os.path.isfile(p):
                self.send_json({'error': 'not_found'}, 404)
                return
            with open(p, 'rb') as f:
                data = f.read()
            # détecte le vrai format (PNG/JPEG/WEBP) par les octets magiques
            if data[:8] == b'\x89PNG\r\n\x1a\n':
                ctype = 'image/png'
            elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
                ctype = 'image/webp'
            else:
                ctype = 'image/jpeg'
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_profile(self):
        try:
            uid = client_uid(self)
            ip = self.client_address[0]
            if self.command == 'POST':
                body = read_json_body(self)
                name = str(body.get('name', '')).strip()[:24]
                avatar = str(body.get('avatar', '')).strip()[:12]
                if name and name != PROFILES.get(uid, {}).get('name'):
                    with PROFILES_LOCK:
                        p = PROFILES.setdefault(uid, {'uid': uid, 'ip': ip, 'likes': [], 'createdAt': time.time()})
                        p['name'] = name
                        p['avatar'] = avatar or p.get('avatar', '')
                        p['lastSeen'] = time.time()
                        _save_profiles()
            with PROFILES_LOCK:
                p = PROFILES.get(uid)
                if p is None:
                    self.send_json({'profile': None})
                    return
                out = {k: v for k, v in p.items() if k != 'likes'}
                out['likes'] = list(p.get('likes', []))[-50:]
                self.send_json({'profile': out})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_profile_like(self):
        try:
            uid = client_uid(self)
            ip = self.client_address[0]
            body = read_json_body(self)
            media_type = str(body.get('type', ''))[:8]
            tmdb_id = body.get('id')
            title = str(body.get('title', ''))[:200]
            img = str(body.get('img', ''))[:200]
            if media_type not in ('movie', 'tv') or tmdb_id is None:
                self.send_json({'error': 'missing type/id'}, 400)
                return
            tmdb_id = int(tmdb_id)
            with PROFILES_LOCK:
                p = PROFILES.setdefault(uid, {'uid': uid, 'ip': ip, 'name': '', 'avatar': '', 'likes': [], 'createdAt': time.time()})
                likes = p.setdefault('likes', [])
                idx = next((i for i, l in enumerate(likes) if l.get('type') == media_type and l.get('id') == tmdb_id), -1)
                if idx >= 0:
                    liked = likes.pop(idx)
                    liked_flag = False
                else:
                    likes.append({'type': media_type, 'id': tmdb_id, 'title': title, 'img': img, 'ts': time.time()})
                    liked_flag = True
                p['lastSeen'] = time.time()
                _save_profiles()
            self.send_json({'ok': True, 'liked': liked_flag, 'count': len(likes)})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_likes(self):
        try:
            # /api/likes/movie/550
            parts = self.path.split('?')[0].split('/')
            if len(parts) < 5:
                self.send_json({'error': 'bad path'}, 400)
                return
            media_type = parts[3]
            tmdb_id = int(parts[4])
            with PROFILES_LOCK:
                likers = []
                for p in PROFILES.values():
                    if p.get('name') and any(l.get('type') == media_type and l.get('id') == tmdb_id for l in p.get('likes', [])):
                        likers.append({'uid': p['uid'], 'name': p['name'], 'avatar': p.get('avatar', '')})
                likers.sort(key=lambda x: x['name'].lower())
            self.send_json({'likers': likers, 'count': len(likers)})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_admin_presence(self):
        try:
            params = self.get_params()
            key = params.get('key', '')
            if key != ADMIN_KEY:
                self.send_json({'error': 'unauthorized'}, 401)
                return
            with PRESENCE_LOCK:
                self._prune_presence()
                online = [dict(v) for v in PRESENCE.values()]
                banned = [{'uid': u, **dict(v)} for u, v in BANNED.items()]
            history = [dict(v) for v in list(HISTORY)]
            self.send_json({'online': online, 'history': history, 'banned': banned, 'now': time.time()})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def _admin_check(self, params):
        if params.get('key', '') != ADMIN_KEY:
            self.send_json({'error': 'unauthorized'}, 401)
            return False
        return True

    def handle_admin_command(self):
        try:
            params = self.get_params()
            if not self._admin_check(params):
                return
            uid = params.get('uid', '')[:40]
            action = params.get('action', '')[:20]
            if not uid or not action:
                self.send_json({'error': 'missing uid/action'}, 400)
                return
            payload = params.get('payload', '')
            try:
                pobj = json.loads(payload) if payload else {}
                if not isinstance(pobj, dict):
                    pobj = {'raw': pobj}
            except Exception:
                pobj = {'raw': payload}
            with PRESENCE_LOCK:
                q = COMMANDS.setdefault(uid, [])
                q.append({'action': action, 'payload': pobj, 'ts': time.time()})
                if len(q) > 20:
                    del q[:len(q) - 20]
            self.send_json({'ok': True})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_admin_ban(self):
        try:
            params = self.get_params()
            if not self._admin_check(params):
                return
            uid = params.get('uid', '')[:40]
            reason = params.get('reason', '')[:120]
            with PRESENCE_LOCK:
                ip = PRESENCE.get(uid, {}).get('ip', '')
                BANNED[uid] = {'reason': reason, 'ip': ip, 'ts': time.time()}
            self.send_json({'ok': True})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_admin_unban(self):
        try:
            params = self.get_params()
            if not self._admin_check(params):
                return
            uid = params.get('uid', '')[:40]
            with PRESENCE_LOCK:
                BANNED.pop(uid, None)
            self.send_json({'ok': True})
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def proxy_streams(self):
        import urllib.request
        target = 'http://localhost:8787' + self.path
        try:
            req = urllib.request.Request(target, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = resp.read()
                content_type = resp.headers.get('Content-Type', 'application/json')
                # Warmup TV : pré-génération du chunk 0 pour que la TV n'attende
                # jamais la génération au moment du Lecture (genre "analyser les sources").
                try:
                    m = re.match(r'/api/streams/(movie|series)/(\d+)(?:\?.*)?$', self.path)
                    if m:
                        p = self.get_params()
                        self._warm_tv_chunks(
                            m.group(2),
                            'movie' if m.group(1) == 'movie' else 'tv',
                            p.get('season', '1'), p.get('episode', '1'))
                except Exception as ew:
                    print(f'TWARM: {ew}')
                # Rendre les URLs du backend utilisables par n'importe quel client :
                # remplacer localhost/127.0.0.1 par l'hôte public qui nous contacte,
                # pour que le player mobile n'ait jamais à deviner le bon host.
                host = (self.headers.get('Host') or '').split(':')[0] or 'localhost'
                text = data.decode('utf-8', errors='replace')
                text = text.replace('http://localhost:8787', f'http://{host}:8787')
                text = text.replace('http://127.0.0.1:8787', f'http://{host}:8787')
                data = text.encode()
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_json({'error': str(e), 'detail': 'streams proxy failed'}, 502)

    def handle_resolve(self):
        params = self.get_params()
        mtype = params.get('type', '')
        tmdb_id = params.get('id', '')
        season = params.get('s', '1')
        episode = params.get('e', '1')
        lite = params.get('lite', '')

        if not tmdb_id or mtype not in ('movie', 'tv'):
            self.send_json({'error': 'invalid params'}, 400)
            return

        sources = []
        seen = set()

        backends = [
            f'/meg/{mtype}/{tmdb_id}/1/playlist.json',
            f'/meg/{mtype}/{tmdb_id}/{season}/{episode}/playlist.json',
            f'/vrk/{mtype}/{tmdb_id}/playlist.json',
            f'/vxr/{mtype}/{tmdb_id}/playlist.json',
        ]

        for suffix in backends:
            try:
                pl = self.fetch_json(f'{PLAYX_DOMAIN}{suffix}')
                if pl and 'playlist' in pl:
                    for item in pl['playlist']:
                        for src in item.get('sources', []):
                            f = src.get('file', '')
                            if f and 'error' not in f and f not in seen:
                                seen.add(f)
                                if not src.get('label'):
                                    src['label'] = suffix.split('/')[1].upper()
                                sources.append(src)
            except:
                pass

        if not sources:
            self.send_json({'error': 'no sources found'}, 404)
            return

        if lite == '1':
            streams = self.normalize_for_lite(sources)
            try:
                if mtype == 'movie':
                    backend_path = f'http://localhost:8787/api/streams/movie/{tmdb_id}'
                else:
                    backend_path = (f'http://localhost:8787/api/streams/series/{tmdb_id}'
                                    f'?season={season}&episode={episode}')
                req = urllib.request.Request(backend_path, headers={'User-Agent': 'FLUX/1.0'})
                with urllib.request.urlopen(req, timeout=20) as resp:
                    backend = json.loads(resp.read())
                # Pré-génération du chunk 0 TV : savoir où est la vidéo dès la liste des sources
                try:
                    self._warm_tv_chunks(tmdb_id, mtype, season, episode)
                except Exception as e:
                    print(f'TWARM failed: {e}')
                seen_urls = {s.get('url', '') for s in streams}
                added = 0
                for st in backend.get('streams', []):
                    u = st.get('url', '')
                    if u and u not in seen_urls:
                        seen_urls.add(u)
                        provider = st.get('provider', '')
                        quality = st.get('quality', '')
                        streams.append({
                            'url': u,
                            'quality': quality,
                            'provider': provider,
                            'name': st.get('name', provider) or provider or 'Source',
                            'title': st.get('title', quality or provider) or quality or provider,
                        })
                        added += 1
                print(f'LITE RESOLVE: {len(sources)} play.xpass.top + {added} backend(8787) '
                      f'-> {len(streams)} streams total')
            except Exception as e:
                print(f'LITE RESOLVE backend merge failed: {e}')
            self.send_json({'streams': streams})
            return

        self.send_json({'sources': sources})

    def normalize_for_lite(self, sources):
        streams = []
        for src in sources:
            url = src.get('file', '')
            label = src.get('label', '')
            quality = ''
            provider = ''
            name = label or 'Source'

            q_match = re.search(r'(\d+p)', label, re.IGNORECASE)
            if q_match:
                quality = q_match.group(1)

            backend_match = re.search(r'(MEG|VRK|VXR)', label, re.IGNORECASE)
            if not backend_match:
                if 'ps1.1x2.space' in url:
                    backend_match = re.match(r'(MEG)', 'MEG')
                elif 'vixsrc.to' in url or 'vix-content.net' in url:
                    backend_match = re.match(r'(VXR)', 'VXR')
                elif 'hlsproxy' in url or 'asiaflix' in url:
                    backend_match = re.match(r'(VRK)', 'VRK')

            if backend_match:
                code = backend_match.group(1).upper()
                if code == 'MEG':
                    provider = 'Mega'
                elif code == 'VRK':
                    provider = 'VidLink'
                elif code == 'VXR':
                    provider = 'Vixsrc'
                name = provider
                if not quality:
                    quality = label.replace(backend_match.group(1), '', 1).strip() or ''
            elif label:
                provider = label
                name = label
            if not provider:
                provider = name

            is_vixsrc = provider == 'Vixsrc' or 'vixsrc.to' in url or 'vix-content.net' in url
            if is_vixsrc:
                url = src.get('file', '')
            elif url.endswith('.m3u8') or 'm3u8' in url:
                url = '/api/proxy?url=' + urllib.parse.quote(url, safe='')

            streams.append({
                'url': url,
                'quality': quality,
                'provider': provider,
                'name': name,
                'title': quality or name,
            })

        print(f'LITE RESOLVE: {len(sources)} sources recues -> providers: '
              f'{[s["provider"] for s in streams]} qualities: {[s["quality"] for s in streams]}')
        return streams

    def handle_proxy(self):
        params = self.get_params()
        url = params.get('url', '')
        if not url:
            self.send_error(400)
            return
        if '/api/proxy?' in url or '/api/dlproxy?' in url or url.startswith('/api/'):
            self.send_json({'error': 'nested proxy url rejected'}, 400)
            return
        headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36',
            'Referer': PLAYX_DOMAIN + '/',
        }
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                ct = resp.headers.get('Content-Type', 'application/octet-stream')

                if '/m3u8' in ct or url.endswith('.m3u8'):
                    base = url.rsplit('/', 1)[0] + '/'
                    lines = data.decode().split('\n')
                    for i, line in enumerate(lines):
                        line = line.strip()
                        if not line or line.startswith('#'):
                            continue
                        if line.startswith('/api/proxy?') or line.startswith('/api/dlproxy?'):
                            continue
                        if line.startswith('https://image.tmdb.org'):
                            continue
                        if not line.startswith('http'):
                            line = base + line
                        lines[i] = f'/api/proxy?url={urllib.parse.quote(line, safe="")}'
                    data = '\n'.join(lines).encode()
                    ct = 'application/vnd.apple.mpegurl'

                self.send_response(200)
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def rewrite_m3u8_urls(self, text, base_url):
        base = base_url.rsplit('/', 1)[0] + '/'
        parsed_base = urllib.parse.urlparse(base_url)
        origin = f'{parsed_base.scheme}://{parsed_base.netloc}'

        def rewrite(url):
            if url.startswith('/'):
                url = origin + url
            elif not url.startswith('http'):
                url = base + url
            if 'vixsrc.to' in url or 'vix-content.net' in url or url.startswith('http'):
                return '/api/dlproxy/?url=' + urllib.parse.quote(url, safe='')
            return url

        lines = text.split('\n')
        out = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                out.append(line)
                continue
            if stripped.startswith('#') and 'URI=' in stripped:
                line = re.sub(r'URI="([^"]*)"', lambda m: 'URI="' + rewrite(m.group(1)) + '"', line)
                out.append(line)
                continue
            if stripped.startswith('#'):
                out.append(line)
                continue
            out.append(rewrite(stripped))
        return '\n'.join(out)

    def handle_download(self):
        parts = self.path.split('?')[0].split('/')
        dl_type = parts[3] if len(parts) > 3 else ''
        dl_id = parts[4] if len(parts) > 4 else ''
        params = self.get_params()

        if dl_type == 'movie':
            api_url = f'http://localhost:8787/api/streams/movie/{dl_id}'
        elif dl_type == 'tv':
            s = params.get('season', '1')
            e = params.get('episode', '1')
            api_url = f'http://localhost:8787/api/streams/series/{dl_id}?season={s}&episode={e}'
        else:
            self.send_json({'error': 'invalid type'}, 400)
            return

        try:
            req = urllib.request.Request(api_url, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            self.send_json({'error': 'api failed', 'detail': str(e)}, 502)
            return

        if not data.get('streams') or not data['streams'][0].get('url'):
            self.send_json({'error': 'no stream available'}, 404)
            return

        stream_url = data['streams'][0]['url']
        h = data['streams'][0].get('headers', {})
        headers = {
            'Referer': h.get('Referer', self.VIXSRC_HEADERS['Referer']),
            'User-Agent': h.get('User-Agent', self.VIXSRC_HEADERS['User-Agent']),
        }

        try:
            req = urllib.request.Request(stream_url, headers=headers)
            with urllib.request.urlopen(req, timeout=25) as resp:
                m3u8 = resp.read().decode()
        except Exception as e:
            self.send_json({'error': 'm3u8 fetch failed', 'detail': str(e)}, 502)
            return

        m3u8 = self.rewrite_m3u8_urls(m3u8, stream_url)
        body = m3u8.encode()
        fname = f'{dl_id}.m3u8'

        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
        self.send_header('Content-Disposition', f'attachment; filename="{fname}"')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def handle_dlproxy(self):
        params = self.get_params()
        url = params.get('url', '')
        if not url:
            self.send_error(400)
            return

        headers = dict(self.VIXSRC_HEADERS)

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                ct = resp.headers.get('Content-Type', 'application/octet-stream')

                if 'mpegurl' in ct or 'm3u8' in ct or url.endswith('.m3u8') or 'playlist' in url.lower():
                    text = data.decode()
                    text = self.rewrite_m3u8_urls(text, url)
                    lines = text.split('\n')
                    filtered = []
                    skip_next = False
                    for line in lines:
                        if skip_next:
                            skip_next = False
                            continue
                        if '#EXT-X-STREAM-INF' in line and '1920x1080' in line:
                            skip_next = True
                            continue
                        filtered.append(line)
                    text = '\n'.join(filtered)
                    data = text.encode()
                    ct = 'application/vnd.apple.mpegurl'
                host = urllib.parse.urlparse(url).netloc
                print(f'DLPROXY {host} → {len(data)} bytes ct={ct}')

                self.send_response(200)
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            print(f'DLPROXY {urllib.parse.urlparse(url).netloc} → ERROR: {e}')
            self.send_json({'error': str(e)}, 502)

    def handle_tvstream(self):
        """Remuxe le HLS Vixsrc en MP4 H.264 progressif en direct, pour les
        vieillles TVs Samsung (UA32H4500 / 2014) qui ne lisent ni MSE ni le
        HLS natif mais savent lire un MP4 progressif H.264/AAC.
        Paramètres:
            id  : id tmdb
            type: 'movie' | 'series'
            season / episode (optionnel pour série)
            Okay: idx (optionnel) index de la source à prendre (défaut 0)
        """
        params = self.get_params()
        media_id = params.get('id', '')
        mtype = params.get('type', 'movie')
        season = params.get('season', '1')
        episode = params.get('episode', '1')
        profile = (params.get('profile', '') or '').lower()  # '' | 'baseline'
        if not media_id:
            self.send_error(400)
            return

        if mtype == 'tv':
            api_url = f'http://localhost:8787/api/streams/series/{media_id}?season={season}&episode={episode}'
        else:
            api_url = f'http://localhost:8787/api/streams/movie/{media_id}'

        try:
            req = urllib.request.Request(api_url, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            self.send_json({'error': 'api failed', 'detail': str(e)}, 502)
            return

        streams = data.get('streams') or data.get('sources') or []
        if not streams:
            self.send_json({'error': 'no stream available'}, 404)
            return

        # Priorité Vixsrc (source H.264 la plus fiable) sinon première source
        chosen = None
        for s in streams:
            if re.search(r'vixsrc', (s.get('provider') or '') + (s.get('name') or ''), re.I):
                chosen = s
                break
        if chosen is None:
            chosen = streams[0]
        stream_url = chosen.get('url') or ''
        if not stream_url:
            self.send_json({'error': 'invalid stream url'}, 502)
            return
        # Réécrire le host localhost/127.0.0.1 vers localhost (ffmpeg tourne ici)
        stream_url = stream_url.replace('http://localhost:8787', 'http://127.0.0.1:8787')

        is_vixsrc = bool(re.search(r'vixsrc', (chosen.get('provider') or '') + (chosen.get('name') or ''), re.I))

        print(f'TVSTREAM {mtype}/{media_id} → {chosen.get("provider")} {chosen.get("quality")} vixsrc={is_vixsrc} profile={profile or "copy"}')

        # Pour Vixsrc, on passe par le master aplati du backend (qui ré-écrit
        # chaque segment derrière /dec-ts-proxy en TS décrypté). ffmpeg a besoin
        # d'extensions .ts reconnues -> on autorise tout + filtre AAC ADTS->ASC.
        input_url = stream_url
        if is_vixsrc:
            flat_url = stream_url + ('&flat=1' if '?' in stream_url else '?flat=1')
            input_url = (f'http://127.0.0.1:8787/hls-split?ts=1&flat='
                         f'{urllib.parse.quote(flat_url, safe="")}')

        try:
            # mode défaut : remux copy (rapide) ; mode baseline : transcodage
            # H.264 Constrained Baseline 640px + AAC — format lisible par les
            # décodeurs vidéo des TV Samsung 2013-2014 (Chromium 25).
            common = [
                'ffmpeg', '-hide_banner', '-loglevel', 'error',
                '-allowed_extensions', 'ALL',
                '-allowed_segment_extensions', 'ALL',
                '-extension_picky', '0',
                '-i', input_url,
            ]
            outflags = ['-movflags', 'frag_keyframe+empty_moov+default_base_moof']
            if profile == 'baseline':
                cmd = common + [
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'veryfast',
                    '-maxrate', '900k', '-bufsize', '1800k',
                    '-vf', 'scale=640:-2',
                    '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
                    '-f', 'mp4',
                ] + outflags + ['-y', 'pipe:1']
            else:
                cmd = common + [
                    '-c', 'copy',
                    '-bsf:a', 'aac_adtstoasc',
                    '-f', 'mp4',
                ] + outflags + ['-y', 'pipe:1']
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

            self.send_response(200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()

            chunk = 65536
            first = True
            total = 0
            while True:
                data = proc.stdout.read(chunk)
                if not data:
                    break
                self.wfile.write(data)
                total += len(data)
                first = False
            proc.wait(timeout=5)
            rc = proc.returncode
            if not first and rc not in (0, None):
                print(f'TVSTREAM ffmpeg exited rc={rc} after {total} bytes')
        except BrokenPipeError:
            # client arrêté (seek / back) : on tue ffmpeg proprement
            try: proc.kill()
            except Exception: pass
        except Exception as e:
            print(f'TVSTREAM ERROR: {e}')
            try: proc.kill()
            except Exception: pass

    def _resolve_tv_input(self, media_id, mtype, season, episode):
        """Résout la source Vixsrc et construit l'URL d'entrée ffmpeg (flat). Retourne (input_url, chosen)."""
        if mtype == 'tv':
            api_url = f'http://127.0.0.1:8787/api/streams/series/{media_id}?season={season}&episode={episode}'
        else:
            api_url = f'http://127.0.0.1:8787/api/streams/movie/{media_id}'
        req = urllib.request.Request(api_url, headers={'User-Agent': 'FLUX/1.0'})
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read())
        streams = data.get('streams') or data.get('sources') or []
        # Exclut les magnets (torrentio) : pas de pipe webtorrent → ffmpeg ne peut pas les lire.
        # Le backend les enveloppe parfois dans /m3u8-proxy?url=magnet%3A... → on filtre les deux formes.
        def _is_magnet(s):
            u = s.get('url') or ''
            if u.startswith('magnet:'):
                return True
            if 'm3u8-proxy' in u and 'magnet%3A' in u:
                return True
            if 'magnet%3A' in u or 'magnet:' in u:
                return True
            return False
        streams = [s for s in streams if not _is_magnet(s)]
        if not streams:
            return None, None
        chosen = None
        for s in streams:
            if re.search(r'vixsrc', (s.get('provider') or '') + (s.get('name') or ''), re.I):
                chosen = s
                break
        if chosen is None:
            chosen = streams[0]
        stream_url = (chosen.get('url') or '').replace('http://localhost:8787', 'http://127.0.0.1:8787')
        if not stream_url:
            return None, None
        is_vixsrc = bool(re.search(r'vixsrc', (chosen.get('provider') or '') + (chosen.get('name') or ''), re.I))
        input_url = stream_url
        if is_vixsrc:
            flat_url = stream_url + ('&flat=1' if '?' in stream_url else '?flat=1')
            input_url = (f'http://127.0.0.1:8787/hls-split?ts=1&flat='
                         f'{urllib.parse.quote(flat_url, safe="")}')
        return input_url, chosen

    CHUNK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tvchunks')
    _chunks_cleaned = False
    _gen_count = 0
    _gen_lock = threading.Lock()
    _gen_queue = []

    def handle_hls_seg(self, public_ok=False):
        """Proxy same-origin vers /seg/<b64>.ts du backend (8787), en préservant
        Range/206 — le player Samsung 2014 lit les segments en byte ranges."""
        try:
            b64 = self.path.split('/seg/', 1)[1]
            target = f'http://127.0.0.1:8787/seg/{b64}'
            headers = {'User-Agent': 'FLUX/1.0', 'Accept': 'video/mp2t,*/*'}
            if 'range' in self.headers:
                headers['Range'] = self.headers['Range']
            req = urllib.request.Request(target, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'video/mp2t'))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                cr = resp.headers.get('Content-Range')
                if cr:
                    self.send_header('Content-Range', cr)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            print(f'HLS_SEG ERROR: {e}')

    def handle_hls_direct(self):
        """Retourne l'URL HLS native (master hls-split) pour un média, utilisable
        directement par le lecteur HLS natif de la TV sans re-encode de chunks.
        Paramètre same=1 : sert le m3u8 via :3002 (même origine que la page,
        requis par le player Samsung 2014 qui bloque les médias cross-origin)."""
        params = self.get_params()
        media_id = params.get('id', '')
        mtype = params.get('type', 'movie')
        season = params.get('season', '1')
        episode = params.get('episode', '1')
        mode = (params.get('mode') or 'master').lower()
        if mode not in ('master', 'v', 'a', 'mux'):
            mode = 'master'
        if not media_id:
            self.send_json({'error': 'id required'}, 400)
            return
        try:
            input_url, chosen = self._resolve_tv_input(media_id, mtype, season, episode)
            if not input_url:
                self.send_json({'error': 'no stream available'}, 404)
                return
            public_host = (self.headers.get('Host') or '').split(':')[0] or 'localhost'
            master = input_url.replace('http://127.0.0.1:8787', f'http://{public_host}:8787')
            if mode != 'master':
                sep = '&' if '?' in master else '?'
                master += f'{sep}mode={mode}'
            if (params.get('same') or '').lower() in ('1', 'true', 'yes'):
                # Sert le m3u8 par :3002 (même origine que la page) en réécrivant
                # les segments en URLs absolues /seg/... servies aussi par :3002.
                site_host = (self.headers.get('Host') or '').split(':')[0] or 'localhost'
                req2 = urllib.request.Request(master, headers={'User-Agent': 'FLUX/1.0'})
                with urllib.request.urlopen(req2, timeout=30) as resp:
                    text = resp.read().decode('utf-8', errors='replace')
                lines = []
                for line in text.split('\n'):
                    ls = line.strip()
                    if ls.startswith('/seg/') and ls.endswith('.ts'):
                        lines.append(f'http://{site_host}:3002{ls}')
                    else:
                        lines.append(line)
            new_m3u8 = '\n'.join(lines).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Content-Length', str(len(new_m3u8)))
            self.end_headers()
            self.wfile.write(new_m3u8)
            return
            self.send_json({
                'url': master,
                'input': input_url,
                'provider': (chosen or {}).get('provider', ''),
            })
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def handle_hls_lite(self, seg=False):
        """Proxy same-origin du pipeline /hls-lite du backend (8787) : transcode
        continu ffmpeg baseline 640p en segments HLS 8s. Sert ici le playlist
        (même origine que la page, requis par le player Samsung) en réécrivant
        les segments relatifs en URLs absolues :3002, ou un segment (mode=seg)."""
        params = self.get_params()
        media_id = params.get('tmdb', '') or params.get('id', '')
        mtype = params.get('type', 'movie')
        season = params.get('season', '1')
        episode = params.get('episode', '1')
        if not media_id:
            if seg:
                # /ll/<dname>/<name>.ts — résout media_id depuis le chemin
                parts = self.path.split('/')
                if len(parts) >= 4 and parts[1] == 'll':
                    dname = parts[2]
                    name = parts[3]
                    p = os.path.join(SEG_ROOT, 'll', dname, name)
                    if not os.path.isfile(p):
                        self.send_json({'error': 'no seg'}, 404)
                        return
                    self._remux_ll_segment(p)
                    self._ll_audit(f'SEG {name} rng={self.headers.get("Range","-")} ua={self.headers.get("User-Agent","?")[:30]}')
                    print(f'LL SEG ua={self.headers.get("User-Agent","?")[:40]} rng={self.headers.get("Range","-")} size={os.path.getsize(p)}')
                    return self.serve_range(p, 'video/mp2t')
            self.send_json({'error': 'tmdb required'}, 400)
            return
        base = f'http://127.0.0.1:8787/hls-lite?tmdb={media_id}&type={mtype}&season={season}&episode={episode}'
        dname = self.key_dir(mtype, media_id, season, episode)
        try:
            if seg:
                # Sert le segment en statique (dist/ll -> hlslite) : Range natif
                # 206. Le player Samsung 2014 lit les segments en byte-ranges ;
                # un proxy urllib sans Range → reset par le player → stall.
                name = (params.get('file') or '').replace('/', '').replace('\\', '')
                if not name:
                    name = self.path.rsplit('/', 1)[-1]
                p = os.path.join(SEG_ROOT, 'll', dname, name)
                if not p.startswith(os.path.join(SEG_ROOT, 'll', dname) + os.sep):
                    self.send_json({'error': 'bad file'}, 400)
                    return
                if not os.path.isfile(p):
                    self.send_json({'error': 'no seg'}, 404)
                    return
                # Remux 1er accès : le muxer HLS de ffmpeg écrit 1 seul PAT/PMT
                # par segment ; la TV 2014 (demux lavf 52) exige des tables
                # répétées (comme dist/hlsbl/s0.ts qui joue). -c copy mpegts
                # reconstruit les tables périodiques sans re-encode.
                self._remux_ll_segment(p)
                self._ll_audit(f'SEG {name} rng={self.headers.get("Range","-")} ua={self.headers.get("User-Agent","?")[:30]}')
                print(f'LL SEG ua={self.headers.get("User-Agent","?")[:40]} rng={self.headers.get("Range","-")} size={os.path.getsize(p)}')
                return self.serve_range(p, 'video/mp2t')
            req = urllib.request.Request(base + '&mode=playlist', headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=45) as resp:
                text = resp.read().decode('utf-8', errors='replace')
            self._ll_audit(f'PL entries={text.count("EXTINF")} ua={self.headers.get("User-Agent","?")[:30]}')
            dname = self.key_dir(mtype, media_id, season, episode)
            lines = []
            for line in text.split('\n'):
                ls = line.strip()
                if ls.startswith('#EXT-X-DISCONTINUITY'):
                    continue
                if ls.startswith('#EXTINF:'):
                    # durées arrondies propres + TARGETDURATION large (comme testbl.m3u8)
                    try:
                        dur = float(ls.split(':', 1)[1].rstrip(','))
                        lines.append('#EXTINF:%.1f,' % min(dur, 8.0))
                    except Exception:
                        lines.append(line)
                elif ls.startswith('#EXT-X-TARGETDURATION:'):
                    lines.append('#EXT-X-TARGETDURATION:10')
                elif ls.endswith('.ts') and not ls.startswith('#'):
                    # URL courte statique (Range natif 206, comme dist/hlsbl/s0.ts)
                    lines.append(f'/ll/{dname}/{ls}')
                else:
                    lines.append(line)
            # BUG TV 2014 : manifest > ~100 segments -> le player lavf52 refuse
            # tout (aucune requête de segment). On découpe en fenêtre de
            # MAX_LL_SEGS segments à partir du 1er (les tests tb4=5 segs jouent).
            # DVR : &start=N (secondes) sert la playlist tronquée à partir du
            # segment contenant N-8s — les segments existent déjà sur disque,
            # aucun re-transcode. Le player 2014 ne sait chercher que dans le
            # 1er manifeste reçu, donc la barre/skip passent par ce re-fetch.
            try:
                start_s = max(0, int(float(params.get('start') or 0)))
            except Exception:
                start_s = 0
            if start_s > 0:
                cum = 0.0
                out = []
                keep_next_uri = True
                segs_uri = []
                for ln in lines:
                    ls = ln.strip()
                    if ls.startswith('#EXTINF:'):
                        try:
                            dur = float(ls.split(':', 1)[1].rstrip(','))
                        except Exception:
                            dur = 8.0
                        keep_next_uri = (cum + dur) > start_s
                        cum += dur
                        if keep_next_uri:
                            out.append(ln)
                    elif ls.endswith('.ts') and not ls.startswith('#'):
                        segs_uri.append(ln)
                        if keep_next_uri:
                            out.append(ln)
                    else:
                        out.append(ln)
                # Utilisateur a sauté au-delà du transcodé : servir la fenêtre
                # dispo (derniers segments) pour que le player reparte quand le
                # transcode les aura produits (append_list = ne grandit que).
                if not any(ln.strip().endswith('.ts') and not ln.strip().startswith('#') for ln in out):
                    lines = segs_uri[-self.MAX_LL_SEGS:] if len(segs_uri) > self.MAX_LL_SEGS else segs_uri
                    lines = ['#EXT-X-TARGETDURATION:10'] + lines
                else:
                    lines = out
            seg_lines = [(i, ln) for i, ln in enumerate(lines) if ln.strip().endswith('.ts') and not ln.strip().startswith('#')]
            extra_uris = seg_lines[self.MAX_LL_SEGS:]
            if extra_uris:
                # recoupe les EXTINF correspondants et réindexe MEDIA-SEQUENCE
                seen = 0
                out = []
                for i, ln in enumerate(lines):
                    if i in {idx for idx, _ in extra_uris}:
                        continue
                    if ln.strip().startswith('#EXTINF:') and seen < self.MAX_LL_SEGS:
                        seen += 1
                        out.append(ln)
                    elif ln.strip().startswith('#EXTINF:') and seen >= self.MAX_LL_SEGS:
                        continue
                    else:
                        out.append(ln)
                lines = out
            new_m3u8 = '\n'.join(lines).encode()
            # Test compat: le player 2014 semble VOD-strict (testbl.m3u8 marche
            # avec ENDLIST; sans ENDLIST il coupe le téléchargement du premier
            # segment et stall). Sert ENDLIST par défaut. Avec &live=1 on laisse
            # la playlist ouverte pour tester le refetch (fenêtre glissante).
            # &event=1 déclare en plus #EXT-X-PLAYLIST-TYPE:EVENT : playlist
            # append-only (aucun segment retiré) -> le player peut afficher la
            # durée totale cumulée au lieu de la fenêtre fixe (~34s).
            # EVENT par défaut (append-only) : sans lui la TV (samsunghas-agent)
            # joue en LIVE catch-up -> timeline figée à la durée du premier
            # manifeste (~1 segment) -> navigation impossible. Avec EVENT le
            # player expose la durée totale cumulée -> la barre grandit.
            lst = new_m3u8.split(b'\n')
            outp = []
            for ln in lst:
                outp.append(ln)
                if ln.strip().startswith(b'#EXT-X-MEDIA-SEQUENCE') and not any(o.strip().startswith(b'#EXT-X-PLAYLIST-TYPE') for o in outp):
                    outp.append(b'#EXT-X-PLAYLIST-TYPE:EVENT')
            new_m3u8 = b'\n'.join(outp)
            # OUVERT par défaut (append-only, PAS d'ENDLIST) : c'est le
            # comportement qui marchait le 11 août — la TV (samsunghas-agent)
            # re-poll la playlist toutes les ~10 s et joue chaque segment dès
            # qu'il est listé. Un ENDLIST (VOD strict) fait jouer exactement ce
            # qui était listé au moment du fetch puis s'arrêter -> "fin de
            # segment = fin de regarde". &end=1 réserve le VOD strict pour tests.
            if params.get('end'):
                if not new_m3u8.strip().endswith(b'#EXT-X-ENDLIST'):
                    new_m3u8 = new_m3u8 + b'\n#EXT-X-ENDLIST\n'
                else:
                    new_m3u8 = new_m3u8.rstrip(b'\n') + b'\n'
            else:
                new_m3u8 = new_m3u8.replace(b'#EXT-X-ENDLIST', b'')
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Content-Length', str(len(new_m3u8)))
            self.end_headers()
            self.wfile.write(new_m3u8)
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def key_dir(self, mtype, media_id, season, episode):
        """Nom du dossier hlslite = key backend avec non-alnum remplacés par _."""
        return f'{mtype}_{media_id}_{season}_{episode}'

    def _ll_audit(self, msg):
        """Trace légère pour observer le comportement réel du player TV
        (cadence de re-poll de la playlist, patterns Range des segments)."""
        try:
            with open('/data/data/com.termux/files/home/stream-site-v2/ll-audit.log', 'a', encoding='utf-8') as f:
                f.write(f'{time.strftime("%H:%M:%S")} {msg}\n')
        except Exception:
            pass

    def _fmt_time(self, s):
        try:
            m, sec = divmod(int(s), 60)
            h, m = divmod(m, 60)
            return f'{h}:{m:02d}:{sec:02d}' if h else f'{m}:{sec:02d}'
        except Exception:
            return '--:--'

    def _warm_tv_chunks(self, media_id, mtype, season, episode):
        """Pré-génère le chunk 0 (et la chaîne suivante) dès la liste des sources :
        la génération (~30-80s) se fait pendant que l'utilisateur choisit sa source."""
        try:
            input_url, _ = self._resolve_tv_input(media_id, mtype, season, episode)
            if not input_url:
                return
            seg = 60
            key = f'{mtype}_{media_id}_{season}_{episode}_{seg}'
            path = os.path.join(self.CHUNK_DIR, f'{key}_000.mp4')
            if not os.path.isfile(path) or os.path.getsize(path) < 1024:
                scheduled = self._schedule_chunk(key, media_id, mtype, season, episode, 0, seg, input_url, chain=True)
                print(f'TWARM chunk0 {key}: {scheduled}')
        except Exception as e:
            print(f'TWARM error: {e}')

    def _schedule_chunk(self, key, media_id, mtype, season, episode, n, chunk_secs, input_url, chain=True):
        """Lance la génération de `n` en tâche de fond, puis chaîne n+1 si `chain`.
        Une seule génération par chunk (fichier .gen). Concurrence max 2 ffmpeg.
        Retourne True si génération programmée, False si déjà présente/épuisée."""
        path = os.path.join(self.CHUNK_DIR, f'{key}_{n:03d}.mp4')
        pending = path + '.gen'
        endmark = path + '.end'
        if os.path.isfile(endmark) or os.path.isfile(pending):
            return False
        if os.path.isfile(path) and os.path.getsize(path) >= 1024:
            return False
        try:
            os.makedirs(self.CHUNK_DIR, exist_ok=True)
            with open(pending, 'w') as pf:
                pf.write('pending')
        except Exception:
            return False
        if not input_url:
            input_url, _ = self._resolve_tv_input(media_id, mtype, season, episode)
            if not input_url:
                try: os.remove(pending)
                except Exception: pass
                return False

        def _run():
            while True:
                with self._gen_lock:
                    if self._gen_count < 2:
                        self._gen_count += 1
                        break
                time.sleep(3)
            tmp = path + '.tmp'
            try:
                cmd = [
                    'ffmpeg', '-hide_banner', '-loglevel', 'error',
                    '-allowed_extensions', 'ALL',
                    '-allowed_segment_extensions', 'ALL',
                    '-extension_picky', '0',
                    '-ss', str(n * chunk_secs),
                    '-i', input_url,
                    '-t', str(chunk_secs),
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'ultrafast',
                    '-maxrate', '800k', '-bufsize', '1600k',
                    '-vf', 'scale=640:-2',
                    '-c:a', 'aac', '-b:a', '64k', '-ac', '2',
                    '-f', 'mp4', '-movflags', '+faststart',
                    '-y', tmp
                ]
                try:
                    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=chunk_secs * 3)
                    rc = r.returncode
                    if rc != 0:
                        print(f'FFMPEG rc={rc} {key}_{n:03d}: ' + (r.stderr.decode(errors="replace")[-400:] or '(vide)'))
                except subprocess.TimeoutExpired:
                    rc = -1
                    print(f'FFMPEG TIMEOUT {key}_{n:03d}')
                good = rc == 0 and os.path.isfile(tmp) and os.path.getsize(tmp) >= 12000
                if good:
                    # Vérifie que le MP4 est réellement finalisé (moov en tête grâce à faststart).
                    # Un fichier tronqué (timeout) passe la taille mini mais reste illisible par la TV.
                    try:
                        with open(tmp, 'rb') as vf:
                            head = vf.read(4096)
                        if b'moov' not in head:
                            good = False
                            print(f'CHUNK NO-MOOV {key}_{n:03d} ({os.path.getsize(tmp)}B)')
                    except Exception:
                        good = False
                if good:
                    # Publication atomique : le serveur ne voit jamais un fichier partiel.
                    try:
                        os.replace(tmp, path)
                    except Exception:
                        good = False
                if not good:
                    if os.path.isfile(tmp):
                        try: os.remove(tmp)
                        except Exception: pass
                    if os.path.isfile(path):
                        try: os.remove(path)
                        except Exception: pass
                    try:
                        with open(endmark, 'w') as ef:
                            ef.write('end')
                    except Exception: pass
                elif chain:
                    # Le chunk est valide → chaîne immédiatement le suivant
                    self._schedule_chunk(key, media_id, mtype, season, episode, n + 1, chunk_secs, input_url, chain=True)
            finally:
                try: os.remove(pending)
                except Exception: pass
                with self._gen_lock:
                    self._gen_count -= 1
        threading.Thread(target=_run, daemon=True).start()
        return True

    def _clean_chunks(self):
        """Nettoie les marqueurs .gen/.end orphelins (crash du serveur)."""
        if self._chunks_cleaned:
            return
        self._chunks_cleaned = True
        try:
            for name in os.listdir(self.CHUNK_DIR):
                if name.endswith('.gen') or name.endswith('.tmp'):
                    os.remove(os.path.join(self.CHUNK_DIR, name))
        except Exception:
            pass
    CHUNK_LOCK = threading.Lock()

    def handle_tvchunk(self):
        """Sert le film par morceaux MP4 complets (+faststart) lisibles par les
        WebKit legacy (Chromium/25 Samsung 2013-2014) qui se figent sur le fMP4.
        Chaque chunk fait CHUNK_SECS*3 secondes de film ; renvoie le fichier avec
        Range/Content-Length (lecture progressive native).
        Paramètres: id, type, n (index chunk), season/episode (série), seg (durée)
        """
        import time as _time
        params = self.get_params()
        media_id = params.get('id', '')
        mtype = params.get('type', 'movie')
        season = params.get('season', '1')
        episode = params.get('episode', '1')
        try:
            n = max(0, int(params.get('n', '0')))
            chunk_secs = max(30, min(600, int(params.get('seg', '120'))))
        except Exception:
            n, chunk_secs = 0, 120
        if not media_id:
            self.send_error(400)
            return

        try:
            os.makedirs(self.CHUNK_DIR, exist_ok=True)
            self._clean_chunks()
            key = f'{mtype}_{media_id}_{season}_{episode}_{chunk_secs}'
            path = os.path.join(self.CHUNK_DIR, f'{key}_{n:03d}.mp4')
            # Fichier placeholder pour marquer la génération en cours
            pending = path + '.gen'
            endmark = path + '.end'

            if os.path.isfile(endmark):
                # Source épuisée : ce chunk (et tous les suivants) n'existent pas
                self.send_json({'error': 'end of media', 'done': True}, 404)
                return

            if os.path.isfile(pending):
                # Génération en cours par un autre thread : on signale à re-tester
                self.send_json({'error': 'generating', 'retry': True}, 202)
                return

            if not os.path.isfile(path) or os.path.getsize(path) < 1024:
                # Générer le chunk dans un thread : la réponse arrive dès le fichier écrit
                input_url, chosen = self._resolve_tv_input(media_id, mtype, season, episode)
                if not input_url:
                    self.send_json({'error': 'no stream available'}, 404)
                    return
                self._schedule_chunk(key, media_id, mtype, season, episode, n, chunk_secs, input_url, chain=True)
                self.send_json({'status': 'generating', 'retry': True}, 202)
                return

            size = os.path.getsize(path)
            # Support Range pour la lecture progressive du WebKit (nécessaire moov au début = faststart)
            range_header = self.headers.get('Range', '')
            if range_header:
                mo = re.match(r'bytes=(\d*)-(\d*)', range_header)
                start = int(mo.group(1)) if mo and mo.group(1) else 0
                end = int(mo.group(2)) if mo and mo.group(2) else size - 1
                end = min(end, size - 1)
                length = end - start + 1
                self.send_response(206)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Content-Length', str(length))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(path, 'rb') as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        data = f.read(min(65536, remaining))
                        if not data: break
                        self.wfile.write(data)
                        remaining -= len(data)
            else:
                self.send_response(200)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Content-Length', str(size))
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'max-age=3600')
                self.end_headers()
                with open(path, 'rb') as f:
                    while True:
                        data = f.read(65536)
                        if not data: break
                        self.wfile.write(data)
        except BrokenPipeError:
            pass
        except Exception as e:
            print(f'TVCHUNK ERROR: {e}')
            try: self.send_json({'error': str(e)}, 500)
            except Exception: pass

    def fetch_json(self, url):
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36',
            'Referer': PLAYX_DOMAIN + '/',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())

    def fetch_srt_text(self, slug):
        """Télécharge et extrait le texte SRT d'un slug Yify."""
        req = urllib.request.Request(
            f'{YIFY_DOMAIN}/subtitle/{slug}.zip',
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
                     'Referer': f'{YIFY_DOMAIN}/subtitles/{slug}'})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
        except Exception:
            dl = urllib.request.Request(
                f'{YIFY_DOMAIN}/subtitles/{slug}',
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
                         'Referer': f'{YIFY_DOMAIN}/movie-imdb/'})
            with urllib.request.urlopen(dl, timeout=20) as resp2:
                html = resp2.read().decode('utf-8', errors='replace')
            m2 = re.search(r'href="(/subtitle/[^"]+\.zip)"', html)
            if not m2:
                raise Exception('no zip link found')
            req = urllib.request.Request(
                f'{YIFY_DOMAIN}{m2.group(1)}',
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
                         'Referer': f'{YIFY_DOMAIN}/subtitles/{slug}'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()

        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = [n for n in zf.namelist() if n.lower().endswith('.srt')]
            if not names:
                raise Exception('no srt in archive')
            raw = zf.read(names[0])
            encoding = chardet.detect(raw)['encoding'] or 'utf-8'
            return raw.decode(encoding, errors='replace')

    def handle_download_movie(self):
        params = self.get_params()
        mtype = params.get('type', 'movie')
        tmdb_id = params.get('id', '')
        season = params.get('season', '1')
        episode = params.get('episode', '1')
        audio_lang = params.get('audio', '')
        sub_slug = params.get('sub', '')
        sub_lang = params.get('sub_lang', '')
        title = (params.get('title') or 'video').strip()

        if not tmdb_id:
            self.send_json({'error': 'id required'}, 400)
            return

        if mtype == 'movie':
            api_url = f'http://localhost:8787/api/streams/movie/{tmdb_id}'
        else:
            api_url = f'http://localhost:8787/api/streams/series/{tmdb_id}?season={season}&episode={episode}'

        try:
            req = urllib.request.Request(api_url, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            self.send_json({'error': 'api failed', 'detail': str(e)}, 502)
            return

        if not data.get('streams') or not data['streams'][0].get('url'):
            self.send_json({'error': 'no stream available'}, 404)
            return

        stream_url = data['streams'][0]['url']
        h = data['streams'][0].get('headers', {})
        referer = h.get('Referer', self.VIXSRC_HEADERS['Referer'])
        ua = h.get('User-Agent', self.VIXSRC_HEADERS['User-Agent'])

        proxy_url_m = re.search(r'[?&]url=([^&]+)', stream_url)
        if proxy_url_m:
            direct = urllib.parse.unquote(proxy_url_m.group(1))
            if direct.startswith('http'):
                headers_m = re.search(r'[?&]headers=([^&]+)', stream_url)
                if headers_m:
                    try:
                        hdrs = json.loads(urllib.parse.unquote(headers_m.group(1)))
                        referer = hdrs.get('Referer', referer)
                        ua = hdrs.get('User-Agent', ua)
                    except Exception:
                        pass
                stream_url = direct

        audio_map = '0:a:0?'
        if audio_lang:
            try:
                req = urllib.request.Request(stream_url, headers={'Referer': referer, 'User-Agent': ua})
                with urllib.request.urlopen(req, timeout=20) as resp:
                    master = resp.read().decode()
                langs = sorted(set(re.findall(r'#EXT-X-MEDIA:TYPE=AUDIO[^\n]*LANGUAGE="([^"]+)"', master)))
                lang_synonyms = {
                    'en': ['en', 'eng'], 'eng': ['en', 'eng'],
                    'fr': ['fr', 'fre', 'fra'], 'fre': ['fr', 'fre', 'fra'], 'fra': ['fr', 'fre', 'fra'],
                    'es': ['es', 'spa'], 'spa': ['es', 'spa'],
                    'it': ['it', 'ita'], 'ita': ['it', 'ita'],
                    'de': ['de', 'ger', 'deu'], 'deu': ['de', 'ger', 'deu'], 'ger': ['de', 'ger', 'deu'],
                    'pt': ['pt', 'por'], 'por': ['pt', 'por'],
                    'ja': ['ja', 'jpn'], 'jpn': ['ja', 'jpn'],
                    'ko': ['ko', 'kor'], 'kor': ['ko', 'kor'],
                    'ar': ['ar', 'ara'], 'ara': ['ar', 'ara'],
                    'hi': ['hi', 'hin'], 'hin': ['hi', 'hin'],
                    'ru': ['ru', 'rus'], 'rus': ['ru', 'rus'],
                    'tr': ['tr', 'tur'], 'tur': ['tr', 'tur'],
                    'nl': ['nl', 'dut', 'nld'], 'nld': ['nl', 'dut', 'nld'], 'dut': ['nl', 'dut', 'nld'],
                    'pl': ['pl', 'pol'], 'pol': ['pl', 'pol'],
                    'sv': ['sv', 'swe'], 'swe': ['sv', 'swe'],
                    'zh': ['zh', 'zho', 'chi'], 'zho': ['zh', 'zho', 'chi'], 'chi': ['zh', 'zho', 'chi'],
                }
                target = audio_lang
                if target not in langs:
                    candidates = lang_synonyms.get(target.lower(), [target.lower()])
                    target = next((l for l in langs if l.lower() in candidates or any(l.lower().startswith(c[:3]) for c in candidates)), '')
                if target in langs:
                    audio_map = f'0:a:m:language:{target}'
            except Exception:
                pass

        srt_path = None
        if sub_slug:
            try:
                text = self.fetch_srt_text(sub_slug)
                subs_obj = pysubs2.SSAFile.from_string(text, format_='srt')
                with tempfile.NamedTemporaryFile(suffix='.vtt', delete=False, mode='w', encoding='utf-8') as f:
                    subs_obj.save(f.name, format_='vtt')
                    srt_path = f.name
            except Exception:
                srt_path = None

        ffmpeg_headers = f'Referer: {referer}\r\nUser-Agent: {ua}\r\n'
        cmd = ['ffmpeg', '-y', '-nostdin',
               '-allowed_extensions', 'ALL',
               '-allowed_segment_extensions', 'ALL',
               '-headers', ffmpeg_headers,
               '-i', stream_url]
        if srt_path:
            cmd += ['-f', 'webvtt', '-i', srt_path]
        cmd += ['-map', '0:v:0']
        cmd += ['-map', audio_map]
        if srt_path:
            cmd += ['-map', '1:0', '-c:s', 'mov_text', '-metadata:s:s:0', f'language={sub_lang or "und"}']
        cmd += ['-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
                '-f', 'mp4', 'pipe:1']

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        time.sleep(1.5)
        if proc.poll() is not None:
            err = proc.stderr.read().decode(errors='replace')[-500:]
            if srt_path:
                os.unlink(srt_path)
            self.send_json({'error': 'ffmpeg failed', 'detail': err}, 502)
            return

        safe_title = re.sub(r'[^\w\- ]+', '', title).strip() or 'video'
        self.send_response(200)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Content-Disposition', f'attachment; filename="{safe_title}.mp4"')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        try:
            while True:
                chunk = proc.stdout.read1(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            proc.kill()
            proc.wait()
            if srt_path:
                os.unlink(srt_path)

    def resolve_imdb(self, mtype, tmdb_id):
        key = f'{mtype}:{tmdb_id}'
        if key in _imdb_cache:
            return _imdb_cache[key]
        imdb = None
        try:
            url = f'{TMDB_API}/{mtype}/{tmdb_id}/external_ids?api_key={TMDB_KEY}'
            data = self.fetch_json(url)
            imdb = data.get('imdb_id')
        except Exception:
            imdb = None
        _imdb_cache[key] = imdb
        return imdb

    def handle_subtitles(self):
        params = self.get_params()
        mtype = params.get('type', 'movie')
        tmdb_id = params.get('tmdb_id', '')
        if not tmdb_id:
            self.send_json({'subtitles': []})
            return
        if mtype == 'tv':
            season = params.get('season', '1')
            episode = params.get('episode', '1')
            # 1) Addic7ed (rapide, séries live)
            res = self._addic7ed_tv_entry(tmdb_id, season, episode)
            if res.get('subtitles'):
                self.send_json(res)
                return
            # 2) OpenSubtitles (dessins animés/animes, 5 req/s throttled)
            os_subs = self._os_search(tmdb_id, 'tv', season, episode)
            if os_subs:
                self.send_json({'subtitles': os_subs})
                return
            self.send_json({'subtitles': []})
            return

        imdb = self.resolve_imdb('movie', tmdb_id)
        if not imdb:
            self.send_json({'subtitles': []})
            return

        subs = []
        # Essaie yifysubtitles.ch puis fallback yts-subs.com (même HTML, mirror non bloqué par CF)
        for yify_base in (YIFY_DOMAIN, YIFY_FALLBACK):
            try:
                req = urllib.request.Request(
                    f'{yify_base}/movie-imdb/{imdb}',
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
                             'Accept-Language': 'en-US,en;q=0.9'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    html = resp.read().decode('utf-8', errors='replace')
                if not html or len(html) < 500:
                    continue
                # yts-subs renvoie aussi <tr data-id=...>
                tmp = []
                for block in html.split('<tr data-id=')[1:]:
                    m = re.match(r'"\d+".*?<span class="sub-lang">([^<]+)</span>.*?<a href="/subtitles/([^"]+)"', block, re.S)
                    if not m:
                        continue
                    lang = m.group(1).strip()
                    slug = m.group(2)
                    score_m = re.search(r'<span class="label[^"]*">(\d+)</span>', block)
                    score = int(score_m.group(1)) if score_m else 0
                    tmp.append({'file_id': slug, 'lang': lang, 'name': lang, 'score': score, '_base': yify_base})
                if tmp:
                    subs = tmp
                    break
            except Exception:
                continue
        if subs:
            # priorise Français, garde 3 max par langue
            lang_rank = {'English': 0, 'French': 1, 'Français': 1}
            subs.sort(key=lambda s: (lang_rank.get(s['lang'], 99), -s['score']))
            seen_lang = {}
            capped = []
            for s in subs:
                if seen_lang.get(s['lang'], 0) >= 3:
                    continue
                seen_lang[s['lang']] = seen_lang.get(s['lang'], 0) + 1
                # on garde _base pour le download (sert à choisir le bon domaine)
                capped.append(s)
            subs = capped

        # Secours Addic7ed quand YIFY ne trouve rien : VTT FR/EN par titre.
        if not subs:
            try:
                mdata = self.fetch_json(f'{TMDB_API}/movie/{tmdb_id}?api_key={TMDB_KEY}&language=fr-FR')
                mtitle = (mdata or {}).get('title', '')
                if mtitle:
                    vtt, lang = self.fetch_addic7ed_movie_vtt(mtitle)
                    if vtt:
                        subs.append({
                            'file_id': 'addic7ed:' + base64.urlsafe_b64encode(mtitle.encode('utf-8')).decode().rstrip('='),
                            'lang': 'Français' if lang == 'french' else 'English',
                            'name': 'Addic7ed',
                            'score': 999,
                        })
            except Exception:
                pass
        # Secours OpenSubtitles (films niche, 5 req/s)
        if not subs:
            os_subs = self._os_search(tmdb_id, 'movie')
            if os_subs:
                subs = os_subs

        self.send_json({'subtitles': subs})

    def _addic7ed_tv_entry(self, tmdb_id, season, episode):
        """Entrée {'file_id': 'addic7ed-tv:…'} si un VTT FR existe pour l'épisode."""
        try:
            mdata = self.fetch_json(f'{TMDB_API}/tv/{tmdb_id}?api_key={TMDB_KEY}&language=fr-FR')
            mtitle = (mdata or {}).get('name', '')
            if not mtitle:
                return {'subtitles': []}
            try:
                self.fetch_addic7ed_srt(mtitle, season, episode)
            except Exception:
                return {'subtitles': []}
            b64 = base64.urlsafe_b64encode(mtitle.encode('utf-8')).decode().rstrip('=')
            return {'subtitles': [{
                'file_id': f'addic7ed-tv:{b64}:{season}:{episode}',
                'lang': 'Français',
                'name': 'Addic7ed',
                'score': 999,
            }]}
        except Exception:
            return {'subtitles': []}

    def handle_subtitle_download(self):
        params = self.get_params()
        slug = params.get('file_id', '')
        video_duration = params.get('duration')
        try:
            video_duration = float(video_duration) if video_duration else None
        except (ValueError, TypeError):
            video_duration = None

        if not slug:
            self.send_json({'error': 'file_id required'}, 400)
            return

        # file_id addic7ed-tv:<b64(title)>:<season>:<episode> — série.
        if slug.startswith('addic7ed-tv:'):
            try:
                parts = slug.split(':')
                title = base64.urlsafe_b64decode(parts[1] + '==').decode('utf-8', errors='replace')
                season = parts[2] if len(parts) > 2 else '1'
                episode = parts[3] if len(parts) > 3 else '1'
                vtt = self.addic7ed_tv_vtt(title, season, episode)
            except Exception as e:
                self.send_json({'error': str(e)}, 502)
                return
            body = vtt.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # file_id os:<file_id> — OpenSubtitles (anime/cartoon)
        if slug.startswith('os:'):
            try:
                fid = slug.split(':', 1)[1]
                vtt = self._os_download_vtt(fid)
                # le client refait le scaling, on renvoie tel quel
            except Exception as e:
                self.send_json({'error': str(e)}, 502)
                return
            body = vtt.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # file_id addic7ed:<b64(title)> — sous-titre film via Addic7ed.
        if slug.startswith('addic7ed:'):
            try:
                title = base64.urlsafe_b64decode(slug.split(':', 1)[1] + '==').decode('utf-8', errors='replace')
            except Exception:
                self.send_json({'error': 'bad addic7ed file_id'}, 400)
                return
            try:
                vtt, _lang = self.fetch_addic7ed_movie_vtt(title)
            except Exception as e:
                self.send_json({'error': str(e)}, 502)
                return
            body = vtt.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        cache_key = f"{slug}:{video_duration or 'nosync'}"
        if cache_key in _vtt_cache:
            body = _vtt_cache[cache_key].encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        try:
            # Essaie yifysubtitles.ch puis yts-subs.com (même slug, 2 domaines)
            data = None
            last_err = None
            for base in (YIFY_DOMAIN, YIFY_FALLBACK):
                try:
                    req = urllib.request.Request(
                        f'{base}/subtitle/{slug}.zip',
                        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
                                 'Referer': f'{base}/subtitles/{slug}'})
                    try:
                        with urllib.request.urlopen(req, timeout=30) as resp:
                            data = resp.read()
                            if data and len(data) > 100:
                                break
                    except Exception as e:
                        last_err = e
                        # fallback via page html
                        dl = urllib.request.Request(
                            f'{base}/subtitles/{slug}',
                            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
                                     'Referer': f'{base}/movie-imdb/'})
                        with urllib.request.urlopen(dl, timeout=20) as resp2:
                            html = resp2.read().decode('utf-8', errors='replace')
                        m2 = re.search(r'href="(/subtitle/[^"]+\.zip)"', html)
                        if not m2:
                            continue
                        req2 = urllib.request.Request(
                            f'{base}{m2.group(1)}',
                            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
                                     'Referer': f'{base}/subtitles/{slug}'})
                        with urllib.request.urlopen(req2, timeout=30) as resp:
                            data = resp.read()
                            if data and len(data) > 100:
                                break
                except Exception as e:
                    last_err = e
                    continue
            if not data:
                self.send_json({'error': str(last_err) if last_err else 'no zip link found'}, 502)
                return
            srt_text = None
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = [n for n in zf.namelist() if n.lower().endswith('.srt')]
                if not names:
                    self.send_json({'error': 'no srt in archive'}, 502)
                    return
                raw = zf.read(names[0])
                encoding = chardet.detect(raw)['encoding'] or 'utf-8'
                srt_text = raw.decode(encoding, errors='replace')

            subs = pysubs2.SSAFile.from_string(srt_text, format_='srt')
            if video_duration and video_duration > 60 and len(subs) > 5:
                last_end_ms = max(line.end for line in subs)
                last_end_s = last_end_ms / 1000.0
                if last_end_s > 60:
                    scale = video_duration / last_end_s
                    if 0.85 <= scale <= 1.15:
                        for line in subs:
                            line.start = int(line.start * scale)
                            line.end = int(line.end * scale)

            with tempfile.NamedTemporaryFile(suffix='.vtt', delete=False, mode='w', encoding='utf-8') as f:
                tmp_path = f.name
            try:
                subs.save(tmp_path, format_='vtt')
                with open(tmp_path, 'r', encoding='utf-8') as f:
                    vtt = f.read()
            finally:
                os.unlink(tmp_path)

            _vtt_cache[cache_key] = vtt
            body = vtt.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def handle_subtitles_local(self):
        params = self.get_params()
        query = (params.get('q', '') or '').lower().strip()
        subs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'subtitles')
        if not os.path.isdir(subs_dir):
            self.send_json({'subtitles': []})
            return
        files = sorted([f for f in os.listdir(subs_dir) if f.lower().endswith('.vtt')])
        subs = []
        for f in files:
            norm = f.lower().replace('-', ' ').replace('_', ' ').replace('.vtt', '')
            if query and query.replace('-', ' ').replace('_', ' ') not in norm:
                continue
            name = f.replace('.vtt', '')
            lang = 'Français' if 'french' in f.lower() or 'fr' in f.lower() else 'Anglais'
            title = name.replace('-', ' ').title()
            subs.append({'file': f, 'lang': lang, 'name': title, 'title': title})
        self.send_json({'subtitles': subs})

    def handle_subtitle_download_local(self):
        params = self.get_params()
        filename = params.get('file', '')
        if not filename or '..' in filename or '/' in filename or '\\' in filename:
            self.send_json({'error': 'invalid file'}, 400)
            return
        subs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'subtitles')
        filepath = os.path.join(subs_dir, filename)
        if not os.path.isfile(filepath):
            self.send_json({'error': 'file not found'}, 404)
            return
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                vtt = f.read()
            body = vtt.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def _srt_to_vtt(self, srt_text):
        subs = pysubs2.SSAFile.from_string(srt_text, format_='srt')
        with tempfile.NamedTemporaryFile(suffix='.vtt', delete=False, mode='w', encoding='utf-8') as f:
            tmp_path = f.name
        try:
            subs.save(tmp_path, format_='vtt')
            with open(tmp_path, 'r', encoding='utf-8') as f:
                return f.read()
        finally:
            os.unlink(tmp_path)

    def fetch_addic7ed_movie_srt(self, title):
        """Cherche et télécharge le SRT (FR puis EN) d'un film sur Addic7ed.

        Addic7ed a migré les films en /movie/<id> numérique : la page
        /movie/<slug> ne répond plus (404). La recherche (search.php)
        redirige en 302 vers la fiche du film ; on itère des variantes de
        titre. La fiche liste une ligne par version, avec sa langue + un
        lien /original/<id>/<lang>. Cookie applang=fr + Referer requis.
        Retourne (srt_text, lang).
        """
        import http.cookiejar as cookielib

        jar = cookielib.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        ua = self.VIXSRC_HEADERS['User-Agent']
        try:
            opener.open(urllib.request.Request(f'{ADDIC7ED_BASE}/changeapplang.php?applang=fr', headers={'User-Agent': ua}), timeout=15).read()
        except Exception:
            pass

        def _page(url):
            try:
                resp = opener.open(urllib.request.Request(url, headers={'User-Agent': ua}), timeout=15)
            except Exception as e:
                if getattr(e, 'code', None) == 404:
                    return None
                raise
            raw = resp.read().decode('utf-8', errors='replace')
            if 'class="language"' not in raw and 'Télécharger' not in raw:
                return None
            return raw

        html = None
        page = None
        for qname in (title, title.replace('The ', 'The_'), f'The {title}'):
            try:
                req = urllib.request.Request(
                    f'{ADDIC7ED_BASE}/search.php?search={urllib.parse.quote(qname)}&Submit=Search',
                    headers={'User-Agent': ua})
                resp = opener.open(req, timeout=15)
                loc = resp.geturl()
                m = re.search(r'/movie/(\d+)', loc)
                if not m:
                    resp.read()
                    continue
                resp.read()
                page = f'{ADDIC7ED_BASE}/movie/{m.group(1)}'
                html = _page(page)
                if html is not None:
                    break
            except Exception:
                continue
        if html is None:
            raise Exception('movie not found on addic7ed')

        target = None
        target_href = None
        lang = None
        for want in ('french', 'english'):
            for block in re.split(r'<tr[ >]', html)[1:]:
                lg = re.search(r'class="language">([^<]+)<', block)
                m = re.search(r'href="(/[^"]+)"', block)
                if lg and m and want in lg.group(1).lower():
                    href = m.group(1)
                    if '/original/' in href or '/updated/' in href:
                        target = m
                        target_href = href
                        lang = want
                        break
            if target:
                break
        if not target or not target_href:
            raise Exception('no french/english version on addic7ed')

        dl = f'{ADDIC7ED_BASE}{target_href}'
        req = urllib.request.Request(dl, headers={'User-Agent': ua, 'Referer': page})
        raw = opener.open(req, timeout=30).read()
        if b'<!DOCTYPE html' in raw[:2000]:
            raise Exception('addic7ed served html instead of srt')
        encoding = chardet.detect(raw)['encoding'] or 'utf-8'
        return raw.decode(encoding, errors='replace'), lang

    def fetch_addic7ed_movie_vtt(self, title):
        """VTT caché d'un film (retourne (vtt, lang))."""
        cache_key = f'movie:{title}'
        if cache_key in _addic_vtt_cache:
            return _addic_vtt_cache[cache_key]
        srt_text, lang = self.fetch_addic7ed_movie_srt(title)
        vtt = self._srt_to_vtt(srt_text)
        _addic_vtt_cache[cache_key] = (vtt, lang)
        return vtt, lang

    def fetch_addic7ed_srt(self, title, season, episode):
        """Cherche et télécharge le SRT français d'un épisode sur Addic7ed.

        Addic7ed ignore le slug du titre dans l'URL (seuls le nom, la saison
        et l'épisode comptent). Le cookie de langue + le Referer sont requis
        pour obtenir le fichier SRT (sinon le serveur renvoie du HTML).
        """
        import http.cookiejar as cookielib

        jar = cookielib.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        ua = self.VIXSRC_HEADERS['User-Agent']
        try:
            opener.open(urllib.request.Request(f'{ADDIC7ED_BASE}/changeapplang.php?applang=fr', headers={'User-Agent': ua}), timeout=7).read()
        except Exception:
            pass

        name = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
        page = f'{ADDIC7ED_BASE}/serie/{name}/{int(season)}/{int(episode)}/episode'

        def _fetch_episode(url):
            # Retourne le HTML si c'est bien une page d'épisode (avec table de
            # versions), sinon None (redirection, 404, page sans versions).
            try:
                resp = opener.open(urllib.request.Request(url, headers={'User-Agent': ua}), timeout=7)
            except Exception as e:
                if getattr(e, 'code', None) == 404:
                    return None
                raise
            raw = resp.read().decode('utf-8', errors='replace')
            if resp.geturl() != url:
                return None
            if 'class="language"' not in raw and 'Télécharger' not in raw:
                return None
            return raw

        html = _fetch_episode(page)
        if html is None:
            # Nom inconnu/redirigé : résoudre le vrai slug via la recherche.
            ok = False
            for qname in (title, title.replace('The ', 'The_'), f'The {title}'):
                try:
                    q = urllib.request.Request(f'{ADDIC7ED_BASE}/search.php?search={urllib.parse.quote(qname)}&Submit=Search', headers={'User-Agent': ua})
                    sh = opener.open(q, timeout=7).read().decode('utf-8', errors='replace')
                except Exception:
                    continue
                slugs = re.findall(r'/serie/([^/"]+)/\d+/\d+/', sh)
                canon = re.sub(r'[^a-z0-9]', '', qname.lower())
                best = None
                for s in slugs:
                    sn = re.sub(r'[^a-z0-9]', '', s.lower())
                    if best is None or len(set(sn) & set(canon)) >= len(set(best) & set(canon)):
                        best = s
                if best:
                    html = _fetch_episode(f'{ADDIC7ED_BASE}/serie/{best}/{int(season)}/{int(episode)}/episode')
                    if html is not None:
                        ok = True
                        break
            if not ok:
                raise Exception('show not found on addic7ed')

        target = None
        target_href = None
        for block in re.split(r'<tr[ >]', html)[1:]:
            lang = re.search(r'class="language">([^<]+)<', block)
            m = re.search(r'href="(/[^"]+)"', block)
            if lang and m and 'french' in lang.group(1).lower():
                href = m.group(1)
                # Addic7ed utilise /original/<id>/<id> ou /updated/<langs>/<id>/<version>
                if '/original/' in href or '/updated/' in href:
                    target = m
                    target_href = href
                    break
        if not target or not target_href:
            raise Exception('no french version on addic7ed')

        dl = f'{ADDIC7ED_BASE}{target_href}'
        req = urllib.request.Request(dl, headers={'User-Agent': ua, 'Referer': page})
        raw = opener.open(req, timeout=30).read()
        if b'<!DOCTYPE html' in raw[:2000]:
            raise Exception('addic7ed served html instead of srt')
        encoding = chardet.detect(raw)['encoding'] or 'utf-8'
        return raw.decode(encoding, errors='replace')

    def addic7ed_tv_vtt(self, title, season, episode):
        """VTT français caché d'un épisode (série), réutilisé par la liste,
        la route directe et le téléchargement."""
        cache_key = f'{title}|{season}|{episode}'
        if cache_key in _addic_vtt_cache:
            return _addic_vtt_cache[cache_key]
        srt_text = self.fetch_addic7ed_srt(title, season, episode)
        vtt = self._srt_to_vtt(srt_text)
        _addic_vtt_cache[cache_key] = vtt
        return vtt

    # ===== OpenSubtitles (anime/cartoon fallback, 5 req/s) =====
    def _os_throttle(self):
        global _os_last_req
        with _os_lock:
            now = time.time()
            delta = now - _os_last_req
            if delta < 0.22:
                time.sleep(0.22 - delta)
            _os_last_req = time.time()

    def _os_search(self, tmdb_id, mtype, season=None, episode=None):
        if not OPENSUBTITLES_API_KEY:
            return []
        cache_key = f"os:list:{mtype}:{tmdb_id}:{season}:{episode}"
        if cache_key in _os_cache and isinstance(_os_cache[cache_key], list):
            return _os_cache[cache_key]
        # 5 req/s + cache not-found négatif (évite de re-taper l'API pour S4E24 vide)
        self._os_throttle()
        q = f"{OPENSUBTITLES_API}/subtitles?tmdb_id={tmdb_id}&languages=fr"
        if mtype == 'tv' and season and episode:
            q += f"&season_number={int(season)}&episode_number={int(episode)}"
        try:
            req = urllib.request.Request(q, headers={
                'Api-Key': OPENSUBTITLES_API_KEY,
                'User-Agent': 'FLUX/1.0',
                'Accept': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            out = []
            for item in (data.get('data') or [])[:5]:
                attrs = item.get('attributes') or {}
                files = attrs.get('files') or []
                if not files:
                    continue
                fid = files[0].get('file_id')
                if not fid:
                    continue
                # privilégie le plus téléchargé
                download_count = attrs.get('download_count', 0) or attrs.get('new_download_count', 0) or 0
                out.append({
                    'file_id': f"os:{fid}",
                    'lang': 'Français',
                    'name': f"OpenSubtitles · {attrs.get('release') or 'FR'}",
                    'score': int(download_count),
                    'fps': attrs.get('fps') or 0,
                })
            out.sort(key=lambda x: -x['score'])
            _os_cache[cache_key] = out
            # cache négatif 10 min si vide
            if not out:
                _os_cache[cache_key + ":ts"] = time.time()
            return out
        except Exception as e:
            # 429 ou autre → on renvoie vide, le caller fallbackera
            try:
                # si 429, on marque le cache négatif 60s
                if '429' in str(e) or 'Too Many' in str(e):
                    _os_cache[cache_key] = []
            except:
                pass
            return []

    def _os_download_vtt(self, file_id):
        # file_id est le file_id opensubtitles (sans préfixe os:)
        cache_key = f"os:vtt:{file_id}"
        if cache_key in _os_cache:
            return _os_cache[cache_key]
        self._os_throttle()
        try:
            payload = json.dumps({"file_id": int(file_id)}).encode()
            req = urllib.request.Request(f"{OPENSUBTITLES_API}/download", data=payload, headers={
                'Api-Key': OPENSUBTITLES_API_KEY,
                'Content-Type': 'application/json',
                'User-Agent': 'FLUX/1.0',
                'Accept': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=20) as resp:
                j = json.loads(resp.read().decode())
            link = j.get('link')
            if not link:
                raise Exception('no link from opensubtitles')
            # lien direct vers le SRT
            self._os_throttle()
            req2 = urllib.request.Request(link, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req2, timeout=30) as resp2:
                raw = resp2.read()
            # détection encodage + zip possible
            if raw[:2] == b'PK':
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    names = [n for n in zf.namelist() if n.lower().endswith('.srt')]
                    if not names:
                        raise Exception('no srt in os zip')
                    raw = zf.read(names[0])
            enc = chardet.detect(raw)['encoding'] or 'utf-8'
            srt_text = raw.decode(enc, errors='replace')
            vtt = self._srt_to_vtt(srt_text)
            _os_cache[cache_key] = vtt
            return vtt
        except Exception as e:
            raise

    def handle_subtitles_addic7ed(self):
        params = self.get_params()
        title = params.get('title', '').strip()
        if not title:
            self.send_json({'error': 'title required'}, 400)
            return
        # Films : type=movie ou absence de saison/épisode -> page /movie/<slug>.
        is_movie = params.get('type') == 'movie' or (not params.get('season') and not params.get('episode'))
        if is_movie:
            try:
                vtt, _lang = self.fetch_addic7ed_movie_vtt(title)
            except Exception as e:
                self.send_json({'error': str(e)}, 502)
                return
            body = vtt.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        season = params.get('season', '1')
        episode = params.get('episode', '1')
        try:
            vtt = self.addic7ed_tv_vtt(title, season, episode)
        except Exception as e:
            self.send_json({'error': str(e)}, 502)
            return
        body = vtt.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/vtt; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_wiflix_resolve(self):
        params = self.get_params()
        tmdb_id = params.get('tmdb_id', '') or params.get('id', '')
        mtype = params.get('type', 'movie')
        season = params.get('season', '1')
        episode = params.get('episode', '1')
        if not tmdb_id:
            self.send_json({'error': 'tmdb_id required'}, 400)
            return
        cache_key = f"wiflix:{mtype}:{tmdb_id}:{season}:{episode}"
        if cache_key in _wiflix_cache:
            cached = _wiflix_cache[cache_key]
            if cached:
                self.send_json({'url': cached})
            else:
                self.send_json({'error': 'not found'}, 404)
            return
        try:
            # 1) titre TMDB
            if mtype == 'tv':
                tdata = self.fetch_json(f'{TMDB_API}/tv/{tmdb_id}?api_key={TMDB_KEY}&language=fr-FR')
                title = (tdata or {}).get('name') or (tdata or {}).get('original_name') or ''
            else:
                tdata = self.fetch_json(f'{TMDB_API}/movie/{tmdb_id}?api_key={TMDB_KEY}&language=fr-FR')
                title = (tdata or {}).get('title') or (tdata or {}).get('original_title') or ''
            if not title:
                raise Exception('no title')
            # 2) search wiflix — essaie plusieurs variantes (wiflix est sensible à "Spider-Man 3" vs "Spider-Man")
            queries = []
            if mtype == 'tv':
                queries.append(f"{title} saison {season}")
                queries.append(title)
                # fallback sans "Ultimate" etc, juste le mot le plus distinctif
                if ' ' in title:
                    queries.append(title.split(' ')[-1])
                    queries.append(title.split(' ')[0])
                queries.append("Spider-Man")
            else:
                queries.append(title)
                queries.append(title.replace('-', ' '))
                # sans le numéro à la fin ("Spider-Man 3" -> "Spider-Man")
                if re.search(r'\s+\d+$', title):
                    queries.append(re.sub(r'\s+\d+$', '', title))
                if ' ' in title:
                    queries.append(title.split(' ')[0])
                queries.append("Spider-Man")
            # déduplique en gardant l'ordre
            seen_q = set()
            uniq_queries = []
            for qq in queries:
                if qq and qq not in seen_q:
                    seen_q.add(qq)
                    uniq_queries.append(qq)
            href = None
            for q in uniq_queries:
                try:
                    search_url = f"https://www.wiflix.tv/search?keywords={urllib.parse.quote(q)}"
                    req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.wiflix.tv/'})
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        html = resp.read().decode('utf-8', errors='replace')
                    candidates = re.findall(r'href="(/watch/[^"]+)"', html)
                    if not candidates:
                        continue
                    # scoring précis : évite le 1er au hasard
                    def score_candidate(h, title_words, want_saison=None):
                        norm_h = re.sub(r'[^a-z0-9]', '', h.lower())
                        s = 0
                        for w in title_words:
                            nw = re.sub(r'[^a-z0-9]', '', w.lower())
                            if nw and nw in norm_h:
                                s += len(nw) * 2
                                # bonus si le mot complet est présent
                                if nw in norm_h:
                                    s += 5
                        if want_saison and want_saison in h.lower():
                            s += 20
                        # malus si c'est une saison alors qu'on cherche un film et inversement
                        if mtype == 'movie' and 'saison' in h.lower():
                            s -= 50
                        if mtype == 'tv' and want_saison and want_saison not in h.lower():
                            s -= 15
                        return s
                    title_words = [w for w in re.split(r'\s+', title) if w]
                    # pour "Spider-Man 3" on veut aussi "3" et "2007"
                    if mtype == 'movie' and re.search(r'\s+\d+$', title):
                        # ajoute l'année si dispo pour mieux matcher spider-man-3-2007
                        try:
                            year = (tdata or {}).get('release_date','')[:4] or (tdata or {}).get('first_air_date','')[:4]
                            if year:
                                title_words.append(year)
                        except:
                            pass
                    best_h = None
                    best_sc = -999
                    want_saison = f"saison-{season}" if mtype == 'tv' else None
                    for h in candidates:
                        sc = score_candidate(h, title_words, want_saison)
                        if sc > best_sc:
                            best_sc = sc
                            best_h = h
                    # on ne prend que si le score est correct (évite de prendre n'importe quoi)
                    if best_h and best_sc > 5:
                        href = best_h
                    elif candidates:
                        # fallback : premier non-saison pour film, premier avec saison pour TV
                        if mtype == 'movie':
                            for h in candidates:
                                if 'saison' not in h.lower():
                                    href = h
                                    break
                            if not href:
                                href = candidates[0]
                        else:
                            href = candidates[0]
                    if href:
                        break
                except Exception:
                    continue
            if not href:
                _wiflix_cache[cache_key] = None
                self.send_json({'error': 'not found on wiflix'}, 404)
                return
            base_url = f"https://www.wiflix.tv{href}"
            if mtype == 'tv':
                if '?' in base_url:
                    if 'episode=' not in base_url:
                        base_url += f"&episode={episode}"
                    if 'language=' not in base_url:
                        base_url += "&language=VF"
                else:
                    base_url += f"?language=VF&episode={episode}"
            # on extrait le 1er hoster clean (uqload/do7go/flixeo) pour avoir un iframe propre type vidsrc
            try:
                req2 = urllib.request.Request(base_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.wiflix.tv/'})
                with urllib.request.urlopen(req2, timeout=10) as resp2:
                    watch_html = resp2.read().decode('utf-8', errors='replace')
                # wiflix met les hosters en data-src="https://uqload.net/embed-..." et data-src="https://do7go.com/e/..."
                hosters = re.findall(r'data-src="([^"]+)"', watch_html)
                # fallback aussi sur iframe src
                if not hosters:
                    hosters = re.findall(r'src="(https://[^"]*embed[^"]+)"', watch_html)
                # on préfère un hoster non expiré : on teste rapidement le 1er qui ne contient pas "File is no longer available"
                chosen = None
                for h in hosters:
                    # normalise les //////
                    h = re.sub(r'/{3,}', '//', h)
                    h = h.replace('/////////////', '//').replace('////////', '//')
                    # flixeo a des ///// dans l'url, on le normalise
                    if 'flixeo.xyz' in h:
                        # flixeo a souvent des /uptoboxx2//newPlayer.php?id=...
                        h = h.replace('/////////////', '/').replace('///', '/').replace('//newPlayer', '/newPlayer')
                        # garde le https://
                        if h.startswith('https:/') and not h.startswith('https://'):
                            h = h.replace('https:/', 'https://')
                    # on teste si le hoster n'est pas expiré (uqload)
                    if 'uqload.net' in h:
                        try:
                            probe_req = urllib.request.Request(h, headers={'User-Agent': 'Mozilla/5.0', 'Referer': base_url})
                            with urllib.request.urlopen(probe_req, timeout=7) as pr:
                                probe_html = pr.read().decode(errors='replace')
                                if 'File is no longer available' in probe_html:
                                    continue
                        except:
                            pass
                    chosen = h
                    break
                if chosen:
                    base_url = chosen
            except Exception:
                pass
            _wiflix_cache[cache_key] = base_url
            self.send_json({'url': base_url})
        except Exception as e:
            _wiflix_cache[cache_key] = None
            self.send_json({'error': str(e)}, 404)

    def handle_search(self):
        params = self.get_params()
        query = params.get('q', '').strip()
        if not query:
            self.send_json({'results': []})
            return
        try:
            url = f'{TMDB_API}/search/multi?query={urllib.parse.quote(query)}&api_key={TMDB_KEY}&language=fr-FR&include_adult=false'
            req = urllib.request.Request(url, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            results = []
            for r in data.get('results', []):
                if r.get('adult'):
                    continue
                t = r.get('title') or r.get('name') or ''
                year = ''
                if r.get('release_date'):
                    year = r['release_date'][:4]
                elif r.get('first_air_date'):
                    year = r['first_air_date'][:4]
                results.append({
                    'id': r.get('id'),
                    'title': t,
                    'year': year,
                    'type': 'movie' if r.get('media_type') == 'movie' or r.get('release_date') else 'tv',
                    'poster': r.get('poster_path') or '',
                    'rating': r.get('vote_average') or 0,
                })
            self.send_json({'results': results[:12]})
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def handle_lite_trending(self):
        params = self.get_params()
        req_type = params.get('type', 'all')
        if req_type not in ('all', 'movie', 'tv'):
            req_type = 'all'
        try:
            items = []
            seen = set()
            types = [('movie', '/trending/movie/week'), ('tv', '/trending/tv/week')]
            if req_type != 'all':
                types = [(req_type, f'/trending/{req_type}/week')]
            for media_type, tmdb_path in types:
                paths = [tmdb_path, f'/{media_type}/popular']
                for p in paths:
                    url = f'{TMDB_API}{p}?api_key={TMDB_KEY}&language=fr-FR'
                    req = urllib.request.Request(url, headers={'User-Agent': 'FLUX/1.0'})
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        data = json.loads(resp.read().decode())
                    for r in data.get('results', []):
                        if r.get('adult') or r.get('id') in seen:
                            continue
                        seen.add(r.get('id'))
                        items.append({
                            'id': r.get('id'),
                            'title': r.get('title') or r.get('name') or '',
                            'year': (r.get('release_date') or r.get('first_air_date') or '')[:4],
                            'type': media_type,
                            'poster': r.get('poster_path') or '',
                            'backdrop': r.get('backdrop_path') or '',
                            'rating': r.get('vote_average') or 0,
                            'overview': r.get('overview') or '',
                        })
                    if len(items) >= 24:
                        break
                if len(items) >= 24:
                    break
            self.send_json({'items': items[:24]})
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def handle_tvdetail(self):
        params = self.get_params()
        tid = params.get('id', '')
        if not tid or re.match(r'^\d+$', tid) is None:
            self.send_json({'error': 'id required'}, 400)
            return
        try:
            url = f'{TMDB_API}/tv/{tid}?api_key={TMDB_KEY}&language=fr-FR'
            req = urllib.request.Request(url, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                d = json.loads(resp.read().decode())
            seasons = []
            for s in d.get('seasons', []):
                if s.get('season_number', 0) < 1:
                    continue
                seasons.append({
                    's': s.get('season_number', 0),
                    'eps': s.get('episode_count', 0) or 0,
                    'name': s.get('name') or ('Saison ' + str(s.get('season_number') or '')),
                })
            if not seasons:
                self.send_json({'error': 'no seasons'}, 404)
                return
            self.send_json({
                'id': d.get('id'),
                'title': d.get('name') or '',
                'overview': d.get('overview') or '',
                'backdrop': d.get('backdrop_path') or '',
                'poster': d.get('poster_path') or '',
                'seasons': seasons,
            })
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def handle_poster(self):
        params = self.get_params()
        path = params.get('path', '')
        if not path:
            self.send_json({'error': 'path required'}, 400)
            return
        if path.startswith('/'):
            path = path[1:]
        size = params.get('size', 'w342')
        if re.match(r'^w\d+$', size) is None:
            size = 'w342'
        url = f'https://image.tmdb.org/t/p/{size}/{path}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
                ct = resp.headers.get('Content-Type', 'image/jpeg')
                self.send_response(200)
                self.send_header('Content-Type', ct)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def handle_tmdb_proxy(self):
        params = self.get_params()
        endpoint = params.get('path', '')
        if not endpoint:
            self.send_json({'error': 'path required'}, 400)
            return
        # Le cache serveur évite les appels redondants (l'accueil lance ~30 requêtes
        # d'un coup -> rate-limit TMDB 401/429 qui casse les fiches "introuvable").
        hit = TMDB_CACHE.get(endpoint)
        if hit and time.time() - hit[0] < TMDB_CACHE_TTL:
            self.send_json_raw(hit[1], 'application/json')
            return
        # L'endpoint peut déjà contenir une query string ("/discover/movie?with_genres=..").
        # Il faut joindre avec '&', sinon api_key est mangé -> 401 Unauthorized.
        sep = '&' if '?' in endpoint else '?'
        url = f'{TMDB_API}/{endpoint}{sep}api_key={TMDB_KEY}&language=fr-FR'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'FLUX/1.0', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
                TMDB_CACHE[endpoint] = (time.time(), data)
                self.send_json_raw(data, resp.headers.get('Content-Type', 'application/json'))
        except Exception as e:
            # Erreur réseau/rate-limit : servir une copie périmée si on en a une,
            # plutôt que de faire croire que le film n'existe pas.
            stale = TMDB_CACHE.get(endpoint)
            if stale:
                self.send_json_raw(stale[1], 'application/json')
                return
            # Fallback dessins animés : si TMDB rate-limit sur /tv/{id}/season/{n},
            # on renvoie une saison synthétique 26 épisodes pour ne pas bloquer le player
            if re.match(r'^/?tv/\d+/season/\d+$', endpoint):
                try:
                    season_num = int(endpoint.split('/')[-1])
                    fake = {
                        "id": 0,
                        "episodes": [
                            {"episode_number": i+1, "name": f"Épisode {i+1}", "overview": "", "still_path": ""}
                            for i in range(26)
                        ],
                        "_season": season_num
                    }
                    data = json.dumps(fake).encode()
                    TMDB_CACHE[endpoint] = (time.time(), data)
                    self.send_json_raw(data, 'application/json')
                    return
                except Exception:
                    pass
            self.send_json({'error': str(e)}, 502)

    def send_json_raw(self, data, content_type):
        try:
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            pass

    def get_params(self):
        if self.command == 'POST':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode() if length > 0 else ''
            qs = urllib.parse.parse_qs(body)
            return {k: v[0] if len(v) == 1 else v for k, v in qs.items()}
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        # flatten single-value arrays
        return {k: v[0] if len(v) == 1 else v for k, v in qs.items()}

    _ll_remuxed = {}  # path -> (mtime,size) déjà remuxés (nouveau transcode = purge + régénération)
    MAX_LL_SEGS = 99999  # limite mis en veille : à re-mesurer avec URL .m3u8

    def _remux_ll_segment(self, path):
        """Remux -c copy en TS mpegts (tables PAT/PMT répétées) SI le segment
        vient du muxer HLS ffmpeg (PAT unique en tête, non lu par la TV 2014).
        -mpegts_copyts 1 : préserve les PTS originaux (continuité inter-segments
        exigée par le lavf52 Samsung — sans copyts ffmpeg rebase chaque fichier
        et les PTS reculent -> stall au 2e segment). -copyts requis aussi :
        sans lui -mpegts_copyts 1 seul ne suffit pas à préserver les PTS."""
        try:
            st = os.stat(path)
            stamp = (int(st.st_mtime), st.st_size)
            if self._ll_remuxed.get(path) == stamp:
                return
            with open(path, 'rb') as fh:
                d = fh.read(min(2 * 1024 * 1024, os.path.getsize(path)))
            pat = sum(1 for j in range(0, len(d) - 188, 188) if d[j] == 0x47 and ((d[j+1] & 0x1f) << 8 | d[j+2]) == 0)
            if pat >= 4:
                self._ll_remuxed[path] = stamp
                return
            tmp = path + '.remux'
            r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                                '-copyts', '-i', path, '-c', 'copy', '-mpegts_copyts', '1',
                                '-f', 'mpegts', tmp],
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=40)
            if r.returncode == 0 and os.path.getsize(tmp) > 0:
                os.replace(tmp, path)
                print(f'LL REMUX ok: {os.path.basename(path)}')
            else:
                try: os.unlink(tmp)
                except Exception: pass
                print(f'LL REMUX failed: {r.stderr.decode(errors="replace")[:120]}')
            self._ll_remuxed[path] = stamp
        except Exception as e:
            print(f'LL REMUX err: {e}')

    def serve_range(self, path, ctype):
        """Sert un fichier en 200 complet (le player Samsung 2014 lit les .ts
        en GET simple — 206 partiel <=> stall). Range ignoré volontairement."""
        try:
            size = os.path.getsize(path)
            with open(path, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return True
        except Exception as e:
            print(f'SERVE_RANGE ERROR: {e}')
            return False

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        if self.client_address[0] == '192.168.11.103' or (args and isinstance(args[0], str) and '/api/' in args[0]):
            super().log_message(format, *args)

SEG_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')

# Les segments hls-lite sont générés par le backend (8787) dans son dossier
# HLS_LITE_DIR. Le serveur les sert via /ll/<dname>/<seg>.ts (route GET simple
# 200, requis par la TV 2014). On pointe dist/ll vers ce dossier (symlink).
HLS_LITE_BACKEND_DIR = os.environ.get('FLUX_HLSLITE_DIR', '/data/data/com.termux/files/usr/tmp/opencode/hlslite')


def _ensure_ll_link():
    """Recrée dist/ll -> dossier hlslite du backend s'il manque (perdu si le
    dossier dist est reconstruit/copié à la main)."""
    try:
        link = os.path.join(SEG_ROOT, 'll')
        if os.path.islink(link):
            if os.readlink(link) == HLS_LITE_BACKEND_DIR:
                return
            os.unlink(link)
        if not os.path.lexists(link):
            os.makedirs(os.path.dirname(link), exist_ok=True)
            os.symlink(HLS_LITE_BACKEND_DIR, link)
            print(f'LL link created: {link} -> {HLS_LITE_BACKEND_DIR}')
    except Exception as e:
        print(f'LL link warning: {e}')


_ensure_ll_link()
os.chdir(SEG_ROOT)
port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 8080))
http.server.ThreadingHTTPServer(('0.0.0.0', port), SPAHandler).serve_forever()
