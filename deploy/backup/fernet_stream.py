#!/usr/bin/env python3
"""Cifra o decifra uno stream con Fernet, a blocchi, senza tenerlo tutto in memoria.

Formato: un token Fernet per riga, ognuno con al massimo CHUNK byte in chiaro.
Uso:
  fernet_stream.py encrypt < in > out
  fernet_stream.py decrypt < in > out
  fernet_stream.py genkey
La chiave si legge da BACKUP_FERNET_KEY.
"""
import os
import sys

from cryptography.fernet import Fernet, InvalidToken

CHUNK = 8 * 1024 * 1024


def _fernet() -> Fernet:
    key = os.environ.get("BACKUP_FERNET_KEY", "").strip()
    if not key:
        sys.exit("BACKUP_FERNET_KEY mancante")
    try:
        return Fernet(key.encode())
    except ValueError:
        sys.exit("BACKUP_FERNET_KEY non è una chiave Fernet valida (genkey ne crea una)")


def encrypt(src, dst) -> None:
    f = _fernet()
    while True:
        block = src.read(CHUNK)
        if not block:
            break
        dst.write(f.encrypt(block) + b"\n")


def decrypt(src, dst) -> None:
    f = _fernet()
    for n, line in enumerate(src, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            dst.write(f.decrypt(line))
        except InvalidToken:
            sys.exit(f"blocco {n} non decifrabile: chiave sbagliata o file danneggiato")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "genkey":
        print(Fernet.generate_key().decode())
    elif cmd == "encrypt":
        encrypt(sys.stdin.buffer, sys.stdout.buffer)
    elif cmd == "decrypt":
        decrypt(sys.stdin.buffer, sys.stdout.buffer)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
