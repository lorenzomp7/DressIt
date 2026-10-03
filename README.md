# DressIt 👗✨

Fotografa i tuoi vestiti, l'AI li cataloga e ogni mattina ti propone l'outfit giusto in base a meteo, occasione e stile.

## Architettura

```
 Smartphone (PWA)                     Render (region Frankfurt)
┌──────────────────┐   HTTPS   ┌───────────────────────┐    ┌──────────────────────┐
│ dressit-web      │──────────▶│ dressit-api           │───▶│ dressit-db           │
│ Next.js 16 (PWA) │  JSON/JWT │ Node 22 + Fastify 5   │ SQL│ PostgreSQL 16        │
│ fotocamera, chat │           │ auth, upload, AI      │    └──────────────────────┘
└──────────────────┘           │                       │───▶ Claude API (vision + outfit)
                               │                       │───▶ Cloudinary (immagini)
                               │                       │───▶ Open-Meteo (meteo, gratis)
                               └───────────────────────┘
```

**Flusso "aggiungi capo":** foto dal browser (ridimensionata lato client) → `POST /items` → `sharp` ruota (EXIF), toglie i metadati GPS e ridimensiona a 1024px → **in parallelo** Claude Vision estrae gli attributi in JSON strutturato e l'immagine va su Cloudinary → riga salvata in Postgres.

**Flusso "cosa mi metto?":** la chat invia messaggio, storico e posizione (facoltativa) → l'API carica il guardaroba, legge il meteo da Open-Meteo e chiede a Claude uno o più outfit in JSON strutturato → l'API **scarta ogni ID che non appartiene all'utente** e restituisce capi completi di immagine.

## Stack consigliato e perché

| Livello | Scelta | Motivo |
|---|---|---|
| Frontend | **Next.js 16 (App Router) + React 19 + Tailwind CSS 4** | PWA installabile (manifest + service worker), `<input capture>` per la fotocamera nativa, tema chiaro/scuro |
| Backend | **Node 22 + Fastify 5 + TypeScript** | veloce, multipart nativo, rate limiting e JWT come plugin ufficiali |
| AI | **Claude (`claude-opus-5-5`) via `@anthropic-ai/sdk`** | un solo modello multimodale per vision e ragionamento; **structured outputs** validati con Zod, quindi niente parsing fragile |
| Database | **PostgreSQL 16 su Render** + `pg` + migration SQL | gestito nativamente da Render; array nativi (`TEXT[]`) per colori/tag/stagioni |
| Immagini | **Cloudinary** (fallback: disco locale) | CDN e storage persistente; il disco di Render è effimero |
| Meteo | **Open-Meteo** | gratuito, senza API key |
| Deploy | **Render Blueprint (`render.yaml`)** | DB + API + web creati e collegati da un solo file |

> Nel brief citavi "Claude 3.5 Sonnet": è un modello ritirato. Il codice usa `claude-opus-5-5`, il modello attuale, configurabile via `ANTHROPIC_MODEL`. È attivo anche `fallbacks: "default"`: se un classificatore di sicurezza rifiuta la richiesta, l'API la riesegue in automatico sul modello di riserva consigliato da Anthropic.

## Struttura delle cartelle

```
DressIt/
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
│   │           ├── ai.ts        # ⭐ integrazione Claude (tagging + stylist)
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
│           │   ├── items/[id]/page.tsx# dettaglio e modifica capo
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
| `POST` | `/items/wear` | segna un outfit come indossato oggi (varietà nei consigli) |
| `GET` | `/weather?lat&lon` | meteo attuale |
| `POST` | `/outfits/suggest` | `{ message, history, location?, timezone }` → `{ reply, outfits[], weather }` |
| `GET` | `/health` | health check usato da Render |

## Sviluppo locale

```bash
docker compose up -d                          # Postgres su :5432

cd apps/api
cp .env.example .env                          # inserisci ANTHROPIC_API_KEY e JWT_SECRET
npm install
npm run build && npm run migrate
npm run dev                                   # http://localhost:4000

cd ../web
cp .env.example .env.local
npm install
npm run dev                                   # http://localhost:3000
```

Per provare la fotocamera da telefono in locale serve HTTPS (es. `npx next dev --experimental-https` o un tunnel tipo ngrok); in produzione Render fornisce HTTPS automaticamente.

## Deploy su Render (passo-passo)

1. **Pusha il repo su GitHub** (questo branch o `main`).
2. Su [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → collega il repository GitHub e scegli il branch.
3. Render legge `render.yaml` e mostra le 3 risorse: `dressit-db`, `dressit-api`, `dressit-web`. Ti chiede i valori delle variabili marcate `sync: false`:
   - `ANTHROPIC_API_KEY` → creala su [console.anthropic.com](https://console.anthropic.com) → *API Keys*.
   - `CLOUDINARY_URL` → su [cloudinary.com](https://cloudinary.com) → *Dashboard → API Environment variable* (formato `cloudinary://<key>:<secret>@<cloud_name>`). Puoi lasciarla vuota per una demo, ma le foto spariranno a ogni deploy.
4. Clicca **Apply**. Render crea il database, poi l'API (che applica le migration all'avvio) e infine il frontend.
5. Apri `https://dressit-web.onrender.com` dal telefono → menu del browser → **Aggiungi a schermata Home**.

### Variabili d'ambiente

**`dressit-api`**

| Variabile | Come viene impostata | Note |
|---|---|---|
| `DATABASE_URL` | automatica (`fromDatabase`) | Internal URL, nessun SSL necessario |
| `JWT_SECRET` | automatica (`generateValue`) | stringa casuale generata da Render |
| `ANTHROPIC_API_KEY` | **manuale** | obbligatoria |
| `CLOUDINARY_URL` | **manuale** | consigliata in produzione |
| `CORS_ORIGIN` | automatica (host di `dressit-web`) | se aggiungi un dominio custom, mettilo qui (lista separata da virgole, es. `https://dressit.app,https://dressit-web.onrender.com`) |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | modificabile |
| `NODE_ENV`, `NODE_VERSION` | `production`, `22` | |
| `RENDER_EXTERNAL_URL` | impostata da Render | usata per gli URL delle immagini locali |
| `DATABASE_SSL` | opzionale | `true` solo se usi l'*External* Database URL |

**`dressit-web`**

| Variabile | Come viene impostata | Note |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | automatica (host di `dressit-api`) | letta **in fase di build**: se la cambi, fai *Manual Deploy → Clear build cache & deploy* |
| `NODE_ENV`, `NODE_VERSION` | `production`, `22` | |

### Note per la produzione

- **Piano free:** i web service vanno in sleep dopo 15 minuti di inattività (primo caricamento lento, circa 30-60 s) e il Postgres free scade dopo 30 giorni. Per uso reale passa almeno a `starter` (servizi) e `basic-256mb` (DB) in `render.yaml`.
- **Sicurezza:** password con bcrypt (cost 12), JWT a 30 giorni, rate limit globale e più stretto su login e AI, metadati EXIF/GPS rimossi dalle foto, ID restituiti dall'AI verificati contro il DB, ENV validate all'avvio.
- **Costi AI:** il tagging usa `effort: "low"` su immagini da 1024px; lo stylist usa `effort: "medium"` e mette in cache (prompt caching) istruzioni + guardaroba, che cambiano di rado.
