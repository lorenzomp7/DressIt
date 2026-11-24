#!/usr/bin/env bash
# Hook SessionStart: prepara l'ambiente a ogni avvio di una sessione Claude Code cloud.
# Fuori dal cloud non fa nulla (vedi in_cloud in session_lib.sh).
source "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/session_lib.sh"
in_cloud || exit 0
cd "$ROOT" || exit 0

# Skill: le procedure in .claude/skills/ puntano al submodule tools/agent-skills.
if [ ! -f tools/agent-skills/skills/code-review-and-quality/SKILL.md ]; then
  git submodule update --init tools/agent-skills >> "$LOG" 2>&1 && note "skill agent-skills: scaricate" \
    || note "skill agent-skills: download FALLITO"
else note "skill agent-skills: già pronte"; fi
install_once api-deps "apps/api/package.json apps/api/package-lock.json" npm ci --prefix apps/api --no-audit --no-fund
install_once web-deps "apps/web/package.json apps/web/package-lock.json" npm ci --prefix apps/web --no-audit --no-fund
note "Verifica standard: npm run verify (oppure solo i test dell'API: npm test)"
# REA (analisi degli APK dalla chat): JADX, Apktool e REA in ~/.cache/rea-tools, in background.
note "$(bash "$ROOT/.claude/rea/installa.sh" --sfondo 2>&1 | tail -n 1). Prima di analizzare APK: bash .claude/rea/installa.sh --attendi (skill rea)"
REA_DIR="${REA_TOOLS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/rea-tools}"
export_env "PATH=\"$REA_DIR/bin:\$PATH\""
export_env "REA_JADX_MCP_JAR=\"$REA_DIR/jadx-headless-mcp-0.7.1-all.jar\""
export_env "REA_APKTOOL_COMMAND=\"$REA_DIR/apktool\""
finish reload
