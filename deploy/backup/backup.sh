#!/bin/sh
# Backup di DressIt: database ogni giorno, foto (volume uploads) ogni settimana, su Google Drive.
# Ogni file è compresso con gzip e cifrato con Fernet (fernet_stream.py) prima di uscire dalla VM.
#
#   backup.sh loop                 servizio: un backup al giorno alle BACKUP_HOUR (ora di TZ)
#   backup.sh once [--uploads]     un backup subito (--uploads include anche le foto)
#   backup.sh list                 elenco dei backup su Drive
#   backup.sh restore-db <file|latest>        ripristina il database (serve RESTORE_CONFIRM=yes)
#   backup.sh restore-uploads <file|latest>   ripristina le foto in /uploads (serve RESTORE_CONFIRM=yes)
#   backup.sh health               controllo di salute del container
#
# Variabili: PGHOST, PGUSER, PGDATABASE, PGPASSWORD; BACKUP_FERNET_KEY; RCLONE_DRIVE_TOKEN
# (token OAuth di `rclone config`, vedi deploy/README.md); BACKUP_REMOTE (di base gdrive:DressIt-backup);
# BACKUP_HOUR, BACKUP_RETENTION_DAYS, BACKUP_UPLOADS_WEEKDAY (1 = lunedì … 7 = domenica).
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
STATE="${BACKUP_STATE_DIR:-/state}"
REMOTE="${BACKUP_REMOTE:-gdrive:DressIt-backup}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
HOUR="$(echo "${BACKUP_HOUR:-3}" | sed 's/^0*//')"   # "08" → "8": printf leggerebbe l'ottale
HOUR="${HOUR:-0}"
WEEKDAY="${BACKUP_UPLOADS_WEEKDAY:-7}"
UPLOADS="${BACKUP_UPLOADS_DIR:-/uploads}"
TMP="${TMPDIR:-/tmp}"

# Remote "gdrive" di rclone definito da variabili d'ambiente: nessun file di configurazione sulla VM.
# Scope drive.file: rclone vede e tocca solo i file che ha creato lui, non il resto del tuo Drive.
if [ -n "${RCLONE_DRIVE_TOKEN:-}" ]; then
  export RCLONE_CONFIG_GDRIVE_TYPE=drive
  export RCLONE_CONFIG_GDRIVE_SCOPE=drive.file
  export RCLONE_CONFIG_GDRIVE_TOKEN="$RCLONE_DRIVE_TOKEN"
fi

rc() { rclone -q "$@"; }
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [backup] $*"; }
fail() { log "ERRORE: $*" >&2; exit 1; }
encrypt() { python3 "$DIR/fernet_stream.py" encrypt; }
decrypt() { python3 "$DIR/fernet_stream.py" decrypt; }

check_config() {
  [ -n "${BACKUP_FERNET_KEY:-}" ] || fail "manca BACKUP_FERNET_KEY"
  case "$REMOTE" in
    gdrive:*) [ -n "${RCLONE_DRIVE_TOKEN:-}" ] || fail "manca RCLONE_DRIVE_TOKEN" ;;
  esac
}

# Comprime, cifra e carica lo stdin come <cartella>/<nome>. Il file viene scritto prima in locale
# e caricato solo se tutta la pipeline è riuscita: niente backup a metà su Drive.
upload_stream() {
  folder="$1" name="$2" tmp="$TMP/$2"
  if ! { gzip -6 | encrypt > "$tmp"; }; then rm -f "$tmp"; return 1; fi
  rc copyto --retries 5 "$tmp" "$REMOTE/$folder/$name" || { rm -f "$tmp"; return 1; }
  log "caricato $folder/$name ($(du -h "$tmp" | cut -f1))"
  rm -f "$tmp"
}

# produce_and_upload <cartella> <nome> <comando...>: carica l'output del comando.
# In sh non c'è pipefail: l'esito del comando passa da un file, e se è fallito il file caricato
# (incompleto) viene tolto da Drive.
produce_and_upload() {
  folder="$1" name="$2"; shift 2
  rcfile="$TMP/$name.rc"
  rm -f "$rcfile"
  { if "$@"; then echo 0 > "$rcfile"; else echo 1 > "$rcfile"; fi; } | upload_stream "$folder" "$name" \
    || fail "caricamento di $folder/$name non riuscito"
  if [ "$(cat "$rcfile" 2>/dev/null)" != 0 ]; then
    rm -f "$rcfile"
    rc deletefile "$REMOTE/$folder/$name" 2>/dev/null || true
    fail "$1 non riuscito: rimosso da Drive il file incompleto $folder/$name"
  fi
  rm -f "$rcfile"
}

# Cancella i file più vecchi di RETENTION giorni. Si chiama solo dopo un backup riuscito,
# così su Drive resta sempre almeno la copia appena fatta.
prune() {
  if rc delete --min-age "${RETENTION}d" "$REMOTE/$1"; then
    log "$1: rimossi i file più vecchi di $RETENTION giorni"
  else
    log "attenzione: pulizia dei vecchi file in $1 non riuscita (riprova al prossimo backup)"
  fi
}

backup_db() {
  ts="$(date +%Y-%m-%d_%H%M%S)"
  name="dressit_db_$ts.sql.gz.fernet"
  produce_and_upload db "$name" pg_dump --clean --if-exists --no-owner --no-privileges
  prune db
}

backup_uploads() {
  if [ ! -d "$UPLOADS" ] || [ -z "$(ls -A "$UPLOADS" 2>/dev/null)" ]; then
    log "nessuna foto in $UPLOADS (con Cloudinary è normale): salto"
    return 0
  fi
  name="dressit_uploads_$(date +%Y-%m-%d_%H%M%S).tar.gz.fernet"
  # tar già compresso da gzip in upload_stream: qui solo l'archivio.
  produce_and_upload uploads "$name" tar -C "$UPLOADS" -cf - .
  date +%s > "$STATE/last_uploads"
  prune uploads
}

once() {
  check_config
  mkdir -p "$STATE"
  log "inizio backup verso $REMOTE"
  backup_db
  if [ "${1:-}" = "--uploads" ] || [ "$(date +%u)" = "$WEEKDAY" ] || [ ! -f "$STATE/last_uploads" ]; then
    backup_uploads
  fi
  date +%s > "$STATE/last_success"
  log "backup completato"
}

age_hours() { [ -f "$1" ] && echo $(( ( $(date +%s) - $(cat "$1") ) / 3600 )) || echo 9999; }

seconds_to_next_run() {
  now=$(date +%s)
  target=$(date -d "$(date +%Y-%m-%d) $(printf '%02d' "$HOUR"):00:00" +%s)
  [ "$target" -gt "$now" ] || target=$((target + 86400))
  echo $((target - now))
}

loop() {
  check_config
  case "$HOUR" in [0-9]|1[0-9]|2[0-3]) ;; *) fail "BACKUP_HOUR deve essere un'ora da 0 a 23" ;; esac
  mkdir -p "$STATE"
  [ -f "$STATE/first_start" ] || date +%s > "$STATE/first_start"
  log "servizio attivo: database ogni giorno alle $HOUR:00, foto il giorno $WEEKDAY della settimana, conservazione $RETENTION giorni"
  while :; do
    # Dovuto se non ce n'è mai stato uno o se l'ultimo ha più di 20 ore (al risveglio delle
    # BACKUP_HOUR ne ha ~24). Dopo un riavvio con un backup recente non ne rifà un altro.
    if [ "$(age_hours "$STATE/last_success")" -ge 20 ]; then
      if ! (once); then
        log "nuovo tentativo tra un'ora"
        sleep 3600
        continue
      fi
    fi
    wait_s=$(seconds_to_next_run)
    log "prossimo backup tra $((wait_s / 3600)) h $((wait_s % 3600 / 60)) min"
    sleep "$wait_s"
  done
}

pick() {
  folder="$1" file="$2"
  if [ "$file" = latest ]; then
    file="$(rc lsf --files-only "$REMOTE/$folder" | sort | tail -n 1)"
    [ -n "$file" ] || fail "nessun backup in $REMOTE/$folder"
  fi
  echo "${file#"$folder"/}"
}

# Scarica un backup, lo decifra e controlla il gzip prima di toccare qualsiasi cosa.
# Stampa il percorso del file .gz decifrato.
fetch_plain() {
  enc="$TMP/$2" gz="$TMP/$2.gz"
  rc copyto "$REMOTE/$1/$2" "$enc" || fail "download di $1/$2 non riuscito"
  if ! decrypt < "$enc" > "$gz"; then rm -f "$enc" "$gz"; fail "decifratura non riuscita: chiave sbagliata o file danneggiato"; fi
  rm -f "$enc"
  gzip -t "$gz" 2>/dev/null || { rm -f "$gz"; fail "archivio danneggiato: $1/$2"; }
  echo "$gz"
}

restore_db() {
  [ "${RESTORE_CONFIRM:-}" = yes ] || fail "il ripristino sovrascrive il database ${PGDATABASE:-}: rilancia con RESTORE_CONFIRM=yes"
  check_config
  file="$(pick db "${1:?indica il file o latest}")"
  log "ripristino db/$file nel database ${PGDATABASE:-} su ${PGHOST:-}"
  gz="$(fetch_plain db "$file")"
  gunzip -c "$gz" | psql -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null \
    || { rm -f "$gz"; fail "ripristino non riuscito: il database non è stato modificato"; }
  rm -f "$gz"
  log "database ripristinato"
}

restore_uploads() {
  [ "${RESTORE_CONFIRM:-}" = yes ] || fail "il ripristino scrive in $UPLOADS: rilancia con RESTORE_CONFIRM=yes"
  check_config
  file="$(pick uploads "${1:?indica il file o latest}")"
  log "ripristino uploads/$file in $UPLOADS"
  gz="$(fetch_plain uploads "$file")"
  mkdir -p "$UPLOADS"
  gunzip -c "$gz" | tar -C "$UPLOADS" -xf - || { rm -f "$gz"; fail "ripristino delle foto non riuscito"; }
  rm -f "$gz"
  log "foto ripristinate"
}

health() {
  if [ -f "$STATE/last_success" ]; then
    [ "$(age_hours "$STATE/last_success")" -lt 26 ] || { echo "ultimo backup riuscito più di 26 ore fa"; exit 1; }
  else
    [ "$(age_hours "$STATE/first_start")" -lt 26 ] || { echo "nessun backup riuscito dall'avvio"; exit 1; }
  fi
  echo ok
}

case "${1:-loop}" in
  loop) loop ;;
  once) once "${2:-}" ;;
  list) rc lsl "$REMOTE" ;;
  restore-db) restore_db "${2:-}" ;;
  restore-uploads) restore_uploads "${2:-}" ;;
  health) health ;;
  genkey) python3 "$DIR/fernet_stream.py" genkey ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
