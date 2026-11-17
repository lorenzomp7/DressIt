# DressIt 👗✨

Fotografa i tuoi vestiti, l'AI li cataloga e ti suggerisce outfit in base a meteo, occasione, stile e capi indossati nei giorni precedenti.

## Funzionalità

- **Guardaroba digitale:** foto da fotocamera o galleria, catalogazione AI, filtri e modifica manuale dei capi.
- **Stylist in chat:** fino a tre proposte con immagini e spiegazioni, usando i capi del tuo account.
- **Meteo facoltativo:** la posizione permette di adattare i consigli alle condizioni locali.
- **Memoria degli utilizzi:** conferma «Indosso questo oggi» per aiutare lo stylist a variare capi e combinazioni.
- **PWA per smartphone:** utilizzabile dal browser e aggiungibile alla schermata Home su Android e iPhone.
- **Pannello amministratore:** statistiche, utenti, capi e monitoraggio delle chiamate AI.

## Primi passi

1. Apri l'indirizzo del frontend fornito dal tuo deploy e crea un account.
2. Aggiungi le foto dei tuoi capi e controlla i tag riconosciuti dall'AI.
3. Apri la chat e descrivi l'occasione, ad esempio «Un outfit casual per l'ufficio».
4. Consenti la posizione se vuoi consigli basati sul meteo.
5. Quando scegli una proposta, premi **Indosso questo oggi** per registrarla.

Su iPhone, apri il sito in Safari e usa **Condividi → Aggiungi alla schermata Home**.
Su Android, usa l'opzione di installazione o aggiunta alla schermata Home del browser.
Le funzioni di account, guardaroba e AI richiedono la connessione Internet.

## Memoria dei capi indossati

Con «Indosso questo oggi» DressIt registra i capi e il giorno nel database del tuo account,
anche tra sessioni e dispositivi diversi. Lo stylist riceve gli ultimi 30 giorni registrati
e l’ultimo utilizzo di ogni capo: preferisce alternative ai capi degli ultimi 3 giorni
e varia le combinazioni, rispettando meteo, occasione e richieste esplicite.
I suggerimenti non confermati non entrano nella memoria. Conferme ripetute nello stesso
giorno non duplicano gli utilizzi; il giorno segue il fuso orario del dispositivo.
La migrazione conserva l’ultimo utilizzo già noto; non ricostruisce lo storico precedente.
La preferenza per la varietà è applicata dal modello AI, non è un divieto assoluto.

## Dati e servizi esterni

Account e guardaroba sono salvati sul server in PostgreSQL. Le immagini vengono
inviate all'API e a Gemini per l'analisi; con Cloudinary configurato vengono conservate
su quel servizio. Lo stylist riceve guardaroba, richiesta, conversazione recente e
storico degli utilizzi. Se autorizzi la posizione, l'API la usa per interrogare
Open-Meteo.

## Architettura

| Componente | Ruolo | Collegamenti |
|---|---|---|
| PWA Next.js | Interfaccia, foto, chat | API via HTTPS e JWT |
| API Fastify | Autenticazione, guardaroba, suggerimenti | PostgreSQL, Gemini, Cloudinary, Open-Meteo |
| PostgreSQL | Account, capi, utilizzi e monitoraggio AI | Accesso dal backend |

**Flusso "aggiungi capo":** foto dal browser (ridimensionata lato client) → `POST /items` → `sharp` ruota (EXIF), toglie i metadati GPS e ridimensiona a 1024px → **in parallelo** Gemini estrae dalla foto gli attributi in JSON strutturato e l'immagine va su Cloudinary → riga salvata in Postgres.

**Flusso "cosa mi metto?":** la chat invia messaggio, storico e posizione (facoltativa) → l'API carica il guardaroba, legge il meteo da Open-Meteo e chiede a Gemini uno o più outfit in JSON strutturato → l'API **scarta ogni ID che non appartiene all'utente** e restituisce capi completi di immagine.

## Stack del progetto

| Livello | Scelta | Motivo |
|---|---|---|
| Frontend | **Next.js 16 (App Router, export statico) + React 19 + Tailwind CSS 4**, servito come Render Static Site | PWA installabile (manifest + service worker), `<input capture>` per la fotocamera nativa, tema chiaro/scuro |
| Backend | **Node 22 + Fastify 5 + TypeScript** | veloce, multipart nativo, rate limiting e JWT come plugin ufficiali |
| AI | **Google Gemini (`gemini-3.8-flash`) via `@google/genai`** | un solo modello multimodale per vision e ragionamento, veloce ed economico; **output JSON vincolato** da schema (`responseJsonSchema`) e rivalidato con Zod |
| Database | **PostgreSQL 16 su Render** + `pg` + migration SQL | gestito nativamente da Render; array nativi (`TEXT[]`) per colori/tag/stagioni |
| Immagini | **Cloudinary** (fallback: disco locale) | CDN e storage persistente; il disco di Render è effimero |
| Meteo | **Open-Meteo** | gratuito, senza API key |
| Deploy | **Render Blueprint (`render.yaml`)** | DB + API + web creati e collegati da un solo file |

> Il modello è configurabile con `GEMINI_MODEL` (default `gemini-3.8-flash`). Se Gemini blocca una richiesta per i filtri di sicurezza o la risposta non rispetta lo schema, l'API restituisce un errore chiaro invece di salvare dati sbagliati.

## Struttura delle cartelle

```
DressIt/
├── .github/workflows/ci.yml     # CI: typecheck + build di api e web su ogni PR
├── .github/workflows/keep-alive.yml # ping all'API ogni 10 min per evitare lo sleep del piano free
├── render.yaml                  # Infrastructure as Code (DB + API + web)
├── docker-compose.yml           # Postgres per lo sviluppo locale
├── apps/
│   ├── api/                     # Backend Fastify
│   │   ├── migrations/001_init.sql
│   │   ├── Dockerfile           # alternativa al runtime Node nativo
│   │   └── src/
│   │       ├── server.ts        # bootstrap + graceful shutdown
│   │       ├── app.ts           # plugin (CORS, rate limit, multipart, JWT, static)
│   │       ├── config.ts        # validazione ENV con Zod
│   │       ├── domain.ts        # schema del capo (condiviso da AI e API)
│   │       ├── db/              # pool pg + migration runner
│   │       ├── plugins/auth.ts  # JWT + decorator `authenticate`
│   │       ├── repositories/    # query SQL (users, items)
│   │       ├── routes/          # auth, items, outfits, health
│   │       └── services/
│   │           ├── ai.ts        # ⭐ integrazione Gemini (tagging + stylist)
│   │           ├── image.ts     # normalizzazione con sharp
│   │           ├── storage.ts   # Cloudinary | disco locale
│   │           └── weather.ts   # Open-Meteo
│   └── web/                     # Frontend Next.js PWA
│       ├── public/sw.js         # service worker
│       ├── public/icons/        # icone PWA (generate da scripts/generate-icons.mjs)
│       └── src/
│           ├── app/
│           │   ├── page.tsx           # armadio (griglia + filtri)
│           │   ├── add/page.tsx       # fotocamera/galleria + coda di analisi AI
│           │   ├── item/page.tsx      # dettaglio e modifica capo
│           │   ├── assistant/page.tsx # chat stylist
│           │   ├── login/page.tsx
│           │   └── manifest.ts        # web app manifest
│           ├── components/      # AuthProvider, BottomNav, OutfitCard, ItemCard…
│           └── lib/             # client API, tipi, resize immagini, geolocalizzazione
```

## API

| Metodo | Path | Descrizione |
|---|---|---|
| `POST` | `/auth/register` · `/auth/login` | restituisce `{ token, user }` |
| `GET` | `/auth/me` | utente corrente |
| `GET` | `/items` · `/items/:id` | guardaroba |
| `POST` | `/items` | multipart `image` → tagging AI + salvataggio |
| `PATCH` · `DELETE` | `/items/:id` | modifica manuale / eliminazione (anche dell'immagine) |
| `POST` | `/items/wear` | `{ itemIds, timezone? }` → registra i capi indossati nel giorno locale |
| `GET` | `/weather?lat&lon` | meteo attuale |
| `POST` | `/outfits/suggest` | `{ message, history, location?, timezone }` → `{ reply, outfits[], weather }` |
| `GET` | `/health` | health check usato da Render |
| `GET` | `/admin/stats` · `/admin/users` · `/admin/items` | **solo admin**: statistiche, utenti, ultimi capi analizzati |
| `DELETE` | `/admin/users/:id` | **solo admin**: elimina un account con tutti i suoi capi e immagini |

## Sviluppo locale

Richiede Node.js 22+, npm e Docker per il database. Esegui i comandi dalla radice del repository.

```bash
docker compose up -d                          # Postgres su :5432

cd apps/api
cp .env.example .env                          # inserisci GEMINI_API_KEY e JWT_SECRET
npm ci
npm run build
node --env-file=.env dist/db/migrate.js
npm run dev                                   # http://localhost:4000

cd ../web
cp .env.example .env.local
npm ci
npm run dev                                   # http://localhost:3000
```

Per verificare typecheck e build di entrambe le app, dalla radice:

```bash
npm ci
npm run check
```

Per provare la fotocamera da telefono in locale serve HTTPS (es. `npx next dev --experimental-https` o un tunnel tipo ngrok); in produzione Render fornisce HTTPS automaticamente.

## Deploy su Render (passo-passo)

1. **Pusha il repo su GitHub** (questo branch o `main`).
2. Su [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → collega il repository GitHub e scegli il branch.
3. Render legge `render.yaml` e mostra le 3 risorse: `dressit-db`, `dressit-api`, `dressit-web`. Ti chiede i valori delle variabili marcate `sync: false`:
   - `GEMINI_API_KEY` → creala su [Google AI Studio](https://aistudio.google.com/apikey) → *Create API key*. Per un uso oltre la quota gratuita, collega un progetto con fatturazione attiva.
   - `CLOUDINARY_URL` → su [cloudinary.com](https://cloudinary.com) → *Dashboard → API Environment variable* (formato `cloudinary://<key>:<secret>@<cloud_name>`). Puoi lasciarla vuota per una demo, ma le foto spariranno a ogni deploy.
4. Clicca **Apply**. Render crea il database, poi l'API (che applica le migration all'avvio) e infine il frontend.
5. Apri `https://dressit-web.onrender.com` dal telefono → menu del browser → **Aggiungi a schermata Home**.

### Accesso admin

1. Su Render → `dressit-api` → **Environment** → imposta `ADMIN_EMAILS` con la tua email (più email separate da virgola). Il servizio si riavvia da solo.
2. Nell'app **registrati** (o accedi) con quella email: in alto a destra nell'armadio compare l'icona 🛡️ che apre `/admin`.
3. Il pannello mostra:
   - **Panoramica:** utenti e capi totali/ultimi 7 giorni, chiamate AI con tasso d'errore e latenza media/p95 (analisi foto e stylist separati), capi per categoria, ultimi errori AI.
   - **Utenti:** elenco con numero di capi e chiamate AI; puoi vederne i capi o eliminare l'account.
   - **Capi:** gli ultimi capi caricati con foto e tag generati dall'AI, per valutarne la qualità.

Il ruolo è verificato a ogni richiesta dal backend: togliendo un'email da `ADMIN_EMAILS` l'accesso viene revocato subito. Nessuna password admin è scritta nel codice.

### Migrazione del frontend a Static Site (deploy già esistenti)

Se avevi già creato il Blueprint quando `dressit-web` era un servizio Node, Render non può convertirlo da solo:
1. Su Render apri `dressit-web` → **Settings** → **Delete Web Service**.
2. Apri il Blueprint → **Manual Sync**: Render ricrea `dressit-web` come Static Site con lo stesso nome. Di solito l'indirizzo resta `dressit-web.onrender.com`; se Render aggiunge un suffisso, `CORS_ORIGIN` si aggiorna da solo.

### Variabili d'ambiente

**`dressit-api`**

| Variabile | Come viene impostata | Note |
|---|---|---|
| `DATABASE_URL` | automatica (`fromDatabase`) | Internal URL, nessun SSL necessario |
| `JWT_SECRET` | automatica (`generateValue`) | stringa casuale generata da Render |
| `GEMINI_API_KEY` | **manuale** | obbligatoria |
| `ADMIN_EMAILS` | **manuale** | email degli amministratori separate da virgola (es. `tu@gmail.com`) |
| `CLOUDINARY_URL` | **manuale** | consigliata in produzione |
| `CORS_ORIGIN` | automatica (host di `dressit-web`) | se aggiungi un dominio custom, mettilo qui (lista separata da virgole, es. `https://dressit.app,https://dressit-web.onrender.com`) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | modificabile |
| `GEMINI_BASE_URL` | opzionale | endpoint alternativo (proxy aziendale o mock per i test) |
| `NODE_ENV`, `NODE_VERSION` | `production`, `22` | |
| `RENDER_EXTERNAL_URL` | impostata da Render | usata per gli URL delle immagini locali |
| `DATABASE_SSL` | opzionale | `true` solo se usi l'*External* Database URL |

**`dressit-web`**

| Variabile | Come viene impostata | Note |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | automatica (host di `dressit-api`) | letta **in fase di build**: se la cambi, fai *Manual Deploy → Clear build cache & deploy* |
| `NODE_VERSION` | `22` | |

### Note per la produzione

- **Sempre online sul piano free:**
  - `dressit-web` è uno **Static Site**: HTML/JS serviti dalla CDN di Render, gratis e mai in sleep.
  - `dressit-api` è un web service free, che Render addormenta dopo 15 minuti senza traffico. Il workflow `.github/workflows/keep-alive.yml` chiama `/health` ogni 10 minuti per tenerlo sveglio (un servizio acceso 24/7 sono circa 744 ore, dentro le 750 ore gratuite al mese). I workflow pianificati girano solo dal **branch di default** del repo (imposta `main` in *Settings → General*) e GitHub li disattiva dopo 60 giorni senza attività sul repo; inoltre può ritardarli di qualche minuto: per più affidabilità aggiungi anche un monitor gratuito esterno, per esempio [UptimeRobot](https://uptimerobot.com) o [cron-job.org](https://cron-job.org), su `https://dressit-api.onrender.com/health` ogni 5-10 minuti.
  - Se l'API dorme comunque, il frontend ritenta le richieste per circa un minuto mentre si riavvia, invece di mostrare subito un errore.
  - **Limite del piano free:** il Postgres gratuito scade dopo 30 giorni. Per un uso reale passa a `basic-256mb` (DB) e `starter` (API) in `render.yaml`.
- **Sicurezza:** password con bcrypt (cost 12), JWT a 30 giorni, rate limit globale e più stretto su login e AI, metadati EXIF/GPS rimossi dalle foto, ID restituiti dall'AI verificati contro il DB, ENV validate all'avvio.
- **Costi AI:** il tagging usa `thinkingLevel: LOW` su immagini da 1024px; lo stylist usa `thinkingLevel: MEDIUM` e mette istruzioni + guardaroba (che cambiano di rado) all'inizio del prompt, così la cache implicita di Gemini li riutilizza.

## Strumenti per lo sviluppo con agenti

Il repository integra agent-skills, Playwriter, Vibetest, configurazione
MCP per container-use e Gemini CLI. Sono strumenti di sviluppo, separati dalle
dipendenze dell'app. Istruzioni e prerequisiti in
[development-tools.md](docs/agents/development-tools.md), scenari DressIt in
[qa.md](docs/agents/qa.md).

Gli strumenti si eseguono sul computer dello sviluppatore, su un host dell'agente
o nei workflow GitHub Actions configurati. La presenza nel repository non li
abilita automaticamente in ChatGPT o Claude Code: il client deve caricare la
configurazione e l'host deve avere i prerequisiti.

| Strumento | Utilizzo |
|---|---|
| agent-skills | Procedure per sviluppo e revisione |
| Playwriter | Controllo e verifiche del browser collegato |
| Vibetest | Esplorazione e test browser con modello configurato |
| container-use | Ambienti isolati su un host con Docker |
| Gemini CLI | Assistente da terminale con autenticazione propria |

Le verifiche browser in CI usano risposte API simulate; non attestano il
funzionamento del deploy, delle credenziali Google o delle chiamate AI reali.

## Stato delle verifiche

Verifiche concluse il **17 novembre 2026** sul commit di merge
[`d733cbf`](https://github.com/lorenzomp7/DressIt/commit/d733cbf24c76013bffa0335c229cfc0350e72c06)
della [PR #3](https://github.com/lorenzomp7/DressIt/pull/3), integrata in `main`.

| Verifica | Risultato | Esecuzione |
|---|---|---|
| API: typecheck e build | Superata | [CI](https://github.com/lorenzomp7/DressIt/actions/runs/44152288645) |
| Web: typecheck e build | Superata | [CI](https://github.com/lorenzomp7/DressIt/actions/runs/44152288645) |
| Inizializzazione protocollo MCP | Superata, senza chiamate API ai modelli | [Agent tools](https://github.com/lorenzomp7/DressIt/actions/runs/44152288525) |
| Runtime browser | Superata: frontend con risposte API simulate e ciclo di avvio/chiusura browser Vibetest | [Agent tools](https://github.com/lorenzomp7/DressIt/actions/runs/44152288525) |
| Runtime container-use | Superata: ambiente isolato e comando eseguito nel container | [Agent tools](https://github.com/lorenzomp7/DressIt/actions/runs/44152288525) |

Questi risultati riguardano il commit indicato. Non verificano le chiamate reali a
Gemini, l'autenticazione Google, la qualità dei suggerimenti AI, le migrazioni su
un database di produzione o il deploy Render. Le esecuzioni precedenti fallite
degli strumenti sono state seguite dalle esecuzioni riuscite riportate sopra.

## Risultati CI — 17 novembre 2026

Verifiche della [PR #3](https://github.com/lorenzomp7/DressIt/pull/3), head
`08df07c35827b8078a3c6d08307728086dd1bcb4` e merge
`d733cbf24c76013bffa0335c229cfc0350e72c06`: tutte terminate con esito positivo;
nessun fallimento nelle esecuzioni controllate.

| Ambito | Risultato effettivo |
|---|---|
| Typecheck e build | API e web superati: [CI PR](https://github.com/lorenzomp7/DressIt/actions/runs/44152217746), [CI merge](https://github.com/lorenzomp7/DressIt/actions/runs/44152288645). |
| Browser con fixture | Job Runtime · browser superato con risposte API simulate; non verifica il deploy o servizi esterni reali. |
| Runtime container | Job Runtime · container superato senza credenziali del modello. |
| Protocollo MCP | Inizializzazione superata senza chiamate API. |
| AI reale | Non testata: nessuna attestazione sul funzionamento delle credenziali Google, sul tagging o sui suggerimenti Gemini reali. |

Esecuzioni Agent tools: [head push](https://github.com/lorenzomp7/DressIt/actions/runs/44152038770),
[PR](https://github.com/lorenzomp7/DressIt/actions/runs/44152217838),
[merge](https://github.com/lorenzomp7/DressIt/actions/runs/44152288525).
Gli step di preparazione browser/container saltati nella matrice sono condizionali:
non costituiscono prove eseguite.
