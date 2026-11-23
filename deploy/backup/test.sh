#!/usr/bin/env bash
# Prova completa del backup senza Google Drive e senza dati reali:
# database usa e getta con le migration dell'API e dati finti → backup verso una cartella locale →
# ripristino in un database vuoto → stessi utenti, capi e utilizzi. Controlla anche foto,
# conservazione dei vecchi file, chiave sbagliata e conferma obbligatoria per il ripristino.
#
#   bash deploy/backup/test.sh          con Docker: costruisce e prova l'immagine vera (CI)
#   bash deploy/backup/test.sh --local  senza Docker: script e Postgres 16 della macchina
#                                       (servono initdb/pg_ctl 16, rclone, python3 + cryptography)
set -euo pipefail

MODE="${1:-docker}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ID="dressit-backup-test-$$"
NET="$ID-net"
WORK="$(mktemp -d)"
REMOTE="$WORK/remote"
IMG="$ID-img"
PASS="testpass"
mkdir -p "$REMOTE" "$WORK/uploads/items" "$WORK/restored-uploads" "$WORK/state" "$WORK/tmp"

cleanup() {
  if [ "$MODE" = --local ]; then
    for db in src dst; do
      [ -d "$WORK/pg-$db" ] && runuser_pg pg_ctl -D "$WORK/pg-$db" -m fast stop >/dev/null 2>&1 || true
    done
  else
    docker rm -f "$ID-src" "$ID-dst" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    docker image rm "$IMG" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; exit 1; }

# --- Le due modalità espongono le stesse funzioni: sql, sql_file, genkey, bk ---------------------

if [ "$MODE" = --local ]; then
  PGBIN="$(ls -d /usr/lib/postgresql/16/bin 2>/dev/null || dirname "$(command -v pg_ctl)")"
  export PATH="$PGBIN:$PATH"
  # Postgres non parte come root: se serve usa l'utente postgres.
  runuser_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- env PATH="$PATH" "$@"; else "$@"; fi; }
  port() { [ "$1" = src ] && echo 54331 || echo 54332; }
  sql() { psql -h 127.0.0.1 -p "$(port "$1")" -U dressit -d dressit -qtAc "$2"; }
  sql_file() { psql -h 127.0.0.1 -p "$(port "$1")" -U dressit -d dressit -q -v ON_ERROR_STOP=1; }
  genkey() { python3 "$ROOT/deploy/backup/fernet_stream.py" genkey; }
  # bk <db> <cartella foto|-> [VAR=valore...] -- comando di backup.sh
  bk() {
    local db="$1" up="$2"; shift 2
    local envs=()
    while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
    [ "$up" = - ] && up="$WORK/no-uploads"
    env PGHOST=127.0.0.1 PGPORT="$(port "$db")" PGUSER=dressit PGDATABASE=dressit PGPASSWORD="$PASS" \
      BACKUP_FERNET_KEY="$KEY" BACKUP_REMOTE="$REMOTE" BACKUP_STATE_DIR="$WORK/state" \
      BACKUP_UPLOADS_DIR="$up" TMPDIR="$WORK/tmp" "${envs[@]}" sh "$ROOT/deploy/backup/backup.sh" "$@"
  }
  setup() {
    chmod 755 "$WORK"
    for db in src dst; do
      mkdir -p "$WORK/pg-$db" && chown postgres "$WORK/pg-$db" 2>/dev/null || true
      runuser_pg initdb -D "$WORK/pg-$db" -U dressit --auth=trust >/dev/null
      runuser_pg pg_ctl -D "$WORK/pg-$db" -o "-p $(port "$db") -k /tmp -c listen_addresses=127.0.0.1" -w -l "$WORK/pg-$db/log" start >/dev/null
      psql -h 127.0.0.1 -p "$(port "$db")" -U dressit -d postgres -qc "create database dressit" >/dev/null
    done
  }
else
  sql() { docker exec "$ID-$1" psql -U dressit -d dressit -qtAc "$2"; }
  sql_file() { docker exec -i "$ID-$1" psql -U dressit -d dressit -q -v ON_ERROR_STOP=1; }
  genkey() { docker run --rm "$IMG" genkey; }
  bk() {
    local db="$1" up="$2"; shift 2
    local envs=() mounts=()
    while [ "$1" != "--" ]; do envs+=(-e "$1"); shift; done; shift
    [ "$up" != - ] && mounts=(-v "$up:/uploads")
    docker run --rm --network "$NET" -e PGHOST="$ID-$db" -e PGUSER=dressit -e PGDATABASE=dressit \
      -e PGPASSWORD="$PASS" -e BACKUP_FERNET_KEY="$KEY" -e BACKUP_REMOTE=/remote \
      -v "$REMOTE:/remote" -v "$WORK/state:/state" "${mounts[@]}" "${envs[@]}" "$IMG" "$@"
  }
  setup() {
    docker build -q -t "$IMG" "$ROOT/deploy/backup" >/dev/null
    docker network create "$NET" >/dev/null
    for db in src dst; do
      docker run -d --name "$ID-$db" --network "$NET" -e POSTGRES_USER=dressit -e POSTGRES_DB=dressit \
        -e POSTGRES_PASSWORD="$PASS" postgres:16-alpine >/dev/null
    done
    for db in src dst; do
      # pg_isready risponde già durante l'init: aspetta che il server definitivo accetti query.
      for _ in $(seq 1 60); do sql "$db" 'select 1' >/dev/null 2>&1 && break; sleep 1; done
    done
  }
fi

echo "1. Database di prova ($MODE)"
setup
KEY="$(genkey)"
for m in "$ROOT"/apps/api/migrations/*.sql; do sql_file src < "$m"; done
sql_file src <<'SQL'
INSERT INTO users (email, password_hash, display_name)
  SELECT 'test' || g || '@example.test', 'x', 'Prova ' || g FROM generate_series(1, 3) g;
INSERT INTO items (user_id, image_url, image_key, name, category)
  SELECT u.id, 'http://localhost/uploads/items/' || g || '.jpg', 'items/' || g || '.jpg', 'Capo ' || g, 'top'
  FROM users u, generate_series(1, 4) g;
INSERT INTO item_wear_history (item_id, worn_on) SELECT id, current_date FROM items;
SQL
head -c 300000 /dev/urandom > "$WORK/uploads/items/finta.jpg"
echo "segnaposto" > "$WORK/uploads/items/nota.txt"
counts() { sql "$1" "select (select count(*) from users)||'/'||(select count(*) from items)||'/'||(select count(*) from item_wear_history)"; }
SRC_COUNTS="$(counts src)"
ok "database di partenza: utenti/capi/utilizzi = $SRC_COUNTS"

echo "2. Backup"
# File vecchio di 40 giorni: deve sparire con la conservazione a 30.
mkdir -p "$REMOTE/db" && echo vecchio > "$REMOTE/db/dressit_db_2000-01-01_000000.sql.gz.fernet"
touch -d '40 days ago' "$REMOTE/db/dressit_db_2000-01-01_000000.sql.gz.fernet"
if bk src - BACKUP_FERNET_KEY= -- once >/dev/null 2>&1; then ko "backup partito senza chiave"; fi
ok "senza BACKUP_FERNET_KEY il backup si rifiuta di partire"
if bk src - PGDATABASE=non_esiste -- once >/dev/null 2>&1; then ko "backup riuscito con un database inesistente"; fi
[ "$(ls "$REMOTE/db" | grep -vc 2000-01-01)" = 0 ] && [ ! -f "$WORK/state/last_success" ] \
  && ok "se pg_dump fallisce non resta nessun file incompleto e lo stato non cambia" \
  || ko "pg_dump fallito ma è rimasto un file in db/"
bk src "$WORK/uploads" -- once --uploads
DB_FILE="$(ls "$REMOTE/db")"
[ "$(echo "$DB_FILE" | wc -l)" = 1 ] && [[ "$DB_FILE" == dressit_db_*.sql.gz.fernet ]] \
  && ok "un solo backup del database ($DB_FILE); quello di 40 giorni è stato rimosso" \
  || ko "in db/ atteso un solo file nuovo, trovati: $DB_FILE"
[ "$(ls "$REMOTE/uploads" | wc -l)" = 1 ] && ok "archivio delle foto caricato" || ko "manca l'archivio delle foto"
if grep -aq "Capo\|example.test" "$REMOTE/db/$DB_FILE"; then ko "il backup contiene testo in chiaro"; fi
ok "il file caricato è cifrato"
[ -f "$WORK/state/last_success" ] && ok "stato aggiornato" || ko "manca state/last_success"
bk src - -- health >/dev/null && ok "healthcheck sano dopo il backup" || ko "healthcheck fallito"
echo $(( $(date +%s) - 27 * 3600 )) > "$WORK/state/last_success"
if bk src - -- health >/dev/null; then ko "healthcheck sano con un backup di 27 ore fa"; fi
ok "healthcheck in errore se l'ultimo backup ha più di 26 ore"

echo "3. Ripristino"
if bk dst - -- restore-db latest >/dev/null 2>&1; then ko "il ripristino è partito senza RESTORE_CONFIRM"; fi
ok "senza RESTORE_CONFIRM=yes il ripristino non parte"
WRONG="$(genkey)"
if bk dst - BACKUP_FERNET_KEY="$WRONG" RESTORE_CONFIRM=yes -- restore-db latest >/dev/null 2>&1; then
  ko "ripristino riuscito con una chiave sbagliata"
fi
[ "$(sql dst "select count(*) from pg_tables where schemaname='public'")" = 0 ] \
  && ok "con la chiave sbagliata si ferma e non tocca il database" || ko "chiave sbagliata: database modificato"
bk dst - RESTORE_CONFIRM=yes -- restore-db latest
DST_COUNTS="$(counts dst)"
[ "$DST_COUNTS" = "$SRC_COUNTS" ] && ok "database vuoto ripristinato: $DST_COUNTS" || ko "ripristino: $DST_COUNTS invece di $SRC_COUNTS"
TABLES="select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname='public'"
[ "$(sql dst "$TABLES")" = "$(sql src "$TABLES")" ] \
  && ok "stesse tabelle: $(sql dst "$TABLES")" || ko "tabelle diverse dopo il ripristino"
# Un secondo ripristino sopra i dati esistenti (dump con --clean) deve dare lo stesso risultato.
bk dst - RESTORE_CONFIRM=yes -- restore-db "db/$DB_FILE" >/dev/null
[ "$(counts dst)" = "$SRC_COUNTS" ] && ok "ripristino ripetuto su un database già pieno" || ko "secondo ripristino errato"
bk dst "$WORK/restored-uploads" RESTORE_CONFIRM=yes -- restore-uploads latest >/dev/null
cmp -s "$WORK/uploads/items/finta.jpg" "$WORK/restored-uploads/items/finta.jpg" \
  && ok "foto ripristinate identiche" || ko "foto ripristinate diverse"

echo "Tutti i controlli superati."
