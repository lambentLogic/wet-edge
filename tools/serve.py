"""Dev server for the app: like `python3 -m http.server`, but tells the
browser never to cache, so a reload always runs the current code. (The
plain server sends no cache headers and Chrome then caches modules on a
heuristic, serving stale code after edits.)

    python3 tools/serve.py [port]
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'Serving {root} at http://127.0.0.1:{port}/ (no-store)')
        httpd.serve_forever()
