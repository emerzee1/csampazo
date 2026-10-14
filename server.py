#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Csámpázó - Mobil és PC Web Kiszolgáló Szerver
Figyel a 0.0.0.0 címen, így számítógépről ÉS a helyi hálózaton lévő mobiltelefonról (pl. Honor Magic 6 Pro) is elérhető!
"""

import os
import sys
import json
import socket
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8085
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    """Megkeresi a számítógép helyi hálózati IP címét."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # Nem csatlakozik valójában, csak a helyi interfészt határozza meg
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class CsampazoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        # CORS és PWA fejlécek
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8', errors='ignore')

        if self.path == '/api/save-log':
            log_path = os.path.join(ROOT_DIR, 'csampazo_naplo.txt')
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'{"success":true}')
            return

        if self.path == '/api/save-routes':
            routes_path = os.path.join(ROOT_DIR, 'csampazo_utvonalak.txt')
            with open(routes_path, 'w', encoding='utf-8') as f:
                f.write(body)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'{"success":true}')
            return

        self.send_error(404, "Endpoint not found")

    def do_GET(self):
        if self.path == '/api/get-log':
            log_path = os.path.join(ROOT_DIR, 'csampazo_naplo.txt')
            content = ""
            if os.path.exists(log_path):
                with open(log_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            return

        if self.path == '/api/get-routes':
            routes_path = os.path.join(ROOT_DIR, 'csampazo_utvonalak.txt')
            content = ""
            if os.path.exists(routes_path):
                with open(routes_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            return

        if self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            resp = json.dumps({"running": True, "app": "Csampazo", "local_ip": get_local_ip()})
            self.wfile.write(resp.encode('utf-8'))
            return

        # Statikus fájlok kiszolgálása alapértelmezett viselkedéssel
        super().do_GET()

    def guess_type(self, path):
        # Biztosítjuk a PWA és modern MIME típusokat
        if path.endswith('.webmanifest'):
            return 'application/manifest+json'
        if path.endswith('.svg'):
            return 'image/svg+xml'
        if path.endswith('.apk'):
            return 'application/vnd.android.package-archive'
        return super().guess_type(path)


def run():
    local_ip = get_local_ip()
    server_address = ('0.0.0.0', PORT)
    
    try:
        httpd = HTTPServer(server_address, CsampazoHandler)
    except OSError:
        # Ha a 8085 foglalt, próbáljuk meg a 8086-ot
        fallback_port = 8086
        httpd = HTTPServer(('0.0.0.0', fallback_port), CsampazoHandler)
        print(f"Figyelem: {PORT}-es port foglalt, a szerver a {fallback_port}-os porton indult el!")

    active_port = httpd.server_port
    print("=" * 65)
    print("  🚀 CSÁMPÁZÓ MOBIL & PC WEB CSOMAG SZERVER ELINDULT!")
    print("=" * 65)
    print(f"  🖥️  Számítógépen (böngészőben):")
    print(f"      http://localhost:{active_port}")
    print()
    print(f"  📱 Telefonon (Honor Magic 6 Pro / bármely mobil Wi-Fi-n):")
    print(f"      http://{local_ip}:{active_port}")
    print("=" * 65)
    print("  Tipp: A telefon böngészőjében nyomj a 'Kezdőképernyőhöz adás'")
    print("        vagy 'Alkalmazás telepítése' gombra a teljes élményhez!")
    print("=" * 65)
    sys.stdout.flush()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nSzerver leállítva.")
        httpd.server_close()

if __name__ == '__main__':
    run()
