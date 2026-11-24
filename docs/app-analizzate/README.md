# App di riferimento analizzate (REA)

Integrazione 2 del Piano di battaglia. Si studiano le app di guardaroba concorrenti per vedere come
risolvono cinque cose che servono anche a DressIt. Per ognuna si chiarisce se lavora sul telefono o
su un servizio esterno:

| # | Domanda | Punto del Piano |
|---|---|---|
| 1 | Come toglie lo sfondo alle foto: libreria sul telefono (ML Kit, TensorFlow Lite, file di modello) o servizio esterno? | DressIt 23 |
| 2 | Da dove prende il meteo? | DressIt 7, 26 |
| 3 | Come manda la proposta del mattino (WorkManager, allarmi, push dal server)? | DressIt 25 |
| 4 | Come crea l'immagine del look da condividere? | DressIt 22 |
| 5 | Cosa tiene sul telefono per funzionare senza rete? | DressIt 31 |

**Regole.** Gli APK sono di terzi e restano fuori dalla repo: `.gitignore` blocca `*.apk`,
`*.apks`, `*.xapk` e `*.aab`. Nella repo va solo una scheda per app, con versione, data e prove.
Si leggono dichiarazioni (manifest) e nomi di librerie per capire funzioni e interoperabilità.
Niente codice o risorse copiati.

## App da analizzare

| App | Scheda |
|---|---|
| Acloset | [scheda](acloset.md) (fonti pubbliche) |
| Whering | [scheda](whering.md) (fonti pubbliche) |
| Indyx | [scheda](indyx.md) (fonti pubbliche) |
| Pureple | [scheda](pureple.md) (fonti pubbliche) |
| Cladwell | [scheda](cladwell.md) (fonti pubbliche) |
| Pronti | [scheda](pronti.md) (fonti pubbliche) |
| Combyne | [scheda](combyne.md) (fonti pubbliche) |
| GetWardrobe | [scheda](getwardrobe.md) (fonti pubbliche) |
| Wardrobe Outfit Planner | [scheda](wardrobe-outfit-planner.md) (fonti pubbliche) |
| Alta Daily | [scheda](alta-daily.md) (fonti pubbliche) |

Le dieci schede sono compilate da **fonti pubbliche** (store, siti, confronti), con la fonte
per ogni riga; le righe «da APK» si completano con la procedura qui sotto, aggiornando la
scheda esistente invece di crearne un'altra.

## Come si fa una scheda (1-2 ore per app, 0 €)

1. **Prendi l'APK dal tuo telefono**, con l'app installata dal Play Store. Ti serve `adb`, dai
   platform-tools Android gratuiti (<https://developer.android.com/tools/releases/platform-tools>),
   e il debug USB attivo:
   ```bash
   adb shell pm list packages | grep -i acloset     # trova il nome del pacchetto
   adb shell pm path <pacchetto>                     # base.apk ed eventuali split
   mkdir -p ~/apk/acloset && for p in $(adb shell pm path <pacchetto> | sed 's/package://'); do
     adb pull "$p" ~/apk/acloset/; done
   ```
   Tieni gli APK fuori dalla cartella della repo.
2. **Genera la bozza.** Ti servono Python 3 e Apktool (<https://apktool.org>):
   ```bash
   python3 scripts/apk/analizza_apk.py ~/apk/acloset --nome "Acloset" \
     --fonte "adb dal telefono, Play Store" --out docs/app-analizzate
   ```
   Lo script accetta un `.apk`, un `.xapk`/`.apks` o una cartella di split, e scrive
   `docs/app-analizzate/acloset.md`. Se la scheda esiste già, non la sovrascrive: crea
   `acloset_2.md`. Ogni risultato riporta dove è stato trovato: classe, libreria, file di modello,
   dominio o voce del manifest.
3. **Approfondisci con REA** se la bozza lascia dubbi: per esempio un servizio esterno sospetto, un
   file di modello o un'app Flutter. REA ([morluto/rea](https://github.com/morluto/rea), MIT)
   decodifica il manifest e le risorse (Apktool), elenca classi e librerie (JADX), controlla la firma
   (`inspect_apk_signature`) e, via `adb`, scarica gli APK dal telefono. È già attivo in ogni
   sessione Claude Code su questa repo, nel cloud e sul PC: server MCP `rea` in `.mcp.json`
   (famiglie `android,apktool,artifact,adb,flutter`), con JADX e Apktool installati da Claude
   (skill `rea`, controllo `node .claude/rea/check.mjs [file.apk]`).
4. **Scrivi la conclusione** nella scheda: per ogni punto, cosa fa l'app e cosa conviene fare in
   DressIt. Poi aggiorna la tabella qui sopra e la riga DressIt 2 del Piano.

Lo script è provato da `bash scripts/apk/test.sh`, che usa APK costruiti apposta e nessuna app di
terzi. Lo stesso test gira anche nella CI (job *apk*).
