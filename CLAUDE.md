@AGENTS.md

## Istruzioni specifiche per Claude Code

AGENTS.md (importato sopra) vale per tutti gli agenti; qui solo ciò che riguarda Claude Code.

### Metodo di lavoro

- Un compito per sessione. Tra un compito e il successivo usa `/clear`.
- Modifiche su più file o di architettura: prima plan mode, fai approvare il piano, poi implementa.
- Prima di modificare leggi i file coinvolti e i test esistenti. Niente refactor non richiesti.
- Ogni cambio di comportamento va con un test; esegui la verifica standard di AGENTS.md.
- Alla fine riporta: cosa è cambiato, comandi eseguiti con esito, cosa resta da fare.
- Subagenti solo se l'utente lo chiede. Il caso più utile: una revisione indipendente del diff prima di chiudere un compito grande.

### Hook automatici (`.claude/settings.json`)

- Gli hook partono tramite `.claude/hooks/run.sh`, che usa il primo Python 3.9+ disponibile (`python3`, `python` o `py`). Se Python manca vengono saltati senza bloccare.
- Dopo ogni modifica un controllo rapido del file (sintassi, nomi non definiti, JSON/YAML validi). Se segnala un errore, correggilo subito.
- Prima di chiudere il turno, se hai modificato codice, partono typecheck e test dell'API, typecheck della web app (se le dipendenze sono installate). Se falliscono correggi, oppure spiega perché il problema non dipende dalle tue modifiche. Per disattivarli in una sessione: `CLAUDE_SKIP_STOP_TESTS=1`.

### Skill

- Le 5 procedure indicate in AGENTS.md sono collegate in `.claude/skills/` dal submodule `tools/agent-skills`: se risultano vuote esegui `git submodule update --init tools/agent-skills`.

### Server MCP

- `.mcp.json` carica solo `playwriter` (browser, nessuna chiave).
- `vibetest` (richiede la chiave Google) e `container-use` (richiede Docker) sono in `.mcp.optional.json`: avvia Claude con `claude --mcp-config .mcp.optional.json` quando servono.
