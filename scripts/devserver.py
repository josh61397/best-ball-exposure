#!/usr/bin/env python3
"""Tiny static server for local dev that disables browser caching.

The default `python3 -m http.server` sends no cache headers, which means
browsers happily cache JS/CSS forever. That makes iterating painful — edits
to assets/*.js look like they don't apply. This wrapper sends
`Cache-Control: no-store` so every reload picks up the latest file.
"""

import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"Serving with no-cache headers on http://localhost:{PORT}")
    httpd.serve_forever()
