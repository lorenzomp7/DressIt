#!/usr/bin/env bash
# Eseguito sulla VM dal workflow "Deploy backend": prepara la VM (se serve),
# ricostruisce e avvia i container dell'app e pubblica il suo indirizzo HTTPS su Caddy.
# Uso: bash deploy/remote-deploy.sh <nome-app>
set -euo pipefail
APP="$1"
DIR="/opt/apps/$APP"

bash "$DIR/deploy/bootstrap.sh"
cd "$DIR"
# Servizi facoltativi (profili di compose) accesi dal workflow con BACKUP_ENABLED='1' in .env.
PROFILES=()
if grep -q "^BACKUP_ENABLED='1'" deploy/.env 2>/dev/null; then PROFILES+=(--profile backup); fi
COMPOSE=(sudo docker compose -p "$APP" -f deploy/compose.yml --env-file deploy/.env "${PROFILES[@]}")
"${COMPOSE[@]}" up -d --build --remove-orphans
sudo install -m 644 deploy/site.caddy "/opt/caddy/sites/$APP.caddy"
sudo docker exec caddy caddy reload --config /etc/caddy/Caddyfile
sudo docker image prune -f >/dev/null
"${COMPOSE[@]}" ps
