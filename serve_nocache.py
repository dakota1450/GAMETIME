#!/usr/bin/env python3
"""Dev static server that disables caching, so editing js/*.js and CSS/PNG and
hitting reload always serves fresh files. (python -m http.server sends no
cache headers, but browsers still heuristically cache JS — this kills that.)

Usage: python serve_nocache.py [port]   (default 8767)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
