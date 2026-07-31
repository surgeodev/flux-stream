import http.server
import os
import sys
import json
import urllib.request
import re
import urllib.parse

TMDB_KEY = '32ab31eb2e3afebff1262e0657d6368c'

PLAYX_DOMAIN = 'https://play.xpass.top'
TMDB_API = 'https://api.themoviedb.org/3'

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.handle_api()
            return
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            return super().do_GET()
        self.path = '/index.html'
        return super().do_GET()

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
            elif path == '/api/proxy':
                self.handle_proxy()
            elif path.startswith('/api/streams/'):
                self.proxy_streams()
            elif path.startswith('/api/download/'):
                self.handle_download()
            elif path.startswith('/api/dlproxy'):
                self.handle_dlproxy()
            else:
                self.send_json({'error': 'not_found'}, 404)
        except Exception as e:
            self.send_json({'error': str(e)}, 500)

    def proxy_streams(self):
        import urllib.request
        target = 'http://localhost:8787' + self.path
        try:
            req = urllib.request.Request(target, headers={'User-Agent': 'FLUX/1.0'})
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
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

        self.send_json({'sources': sources})

    def handle_proxy(self):
        params = self.get_params()
        url = params.get('url', '')
        if not url:
            self.send_error(400)
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
                        if line and not line.startswith('#') and not line.startswith('http'):
                            lines[i] = f'/api/proxy?url={urllib.parse.quote(base + line, safe="")}'
                        elif line.startswith('http') and not line.startswith('https://image.tmdb.org'):
                            lines[i] = f'/api/proxy?url={urllib.parse.quote(line, safe="")}'
                    data = '\n'.join(lines).encode()
                    ct = 'application/vnd.apple.mpegurl'

                self.send_response(200)
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Access-Control-Allow-Origin', '*')
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
                    data = text.encode()
                    ct = 'application/vnd.apple.mpegurl'

                self.send_response(200)
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_json({'error': str(e)}, 502)

    def fetch_json(self, url):
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36',
            'Referer': PLAYX_DOMAIN + '/',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())

    def get_params(self):
        if self.command == 'POST':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode() if length > 0 else ''
            return urllib.parse.parse_qs(body)
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        # flatten single-value arrays
        return {k: v[0] if len(v) == 1 else v for k, v in qs.items()}

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        if args and isinstance(args[0], str) and '/api/' in args[0]:
            super().log_message(format, *args)

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist'))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
http.server.HTTPServer(('0.0.0.0', port), SPAHandler).serve_forever()
