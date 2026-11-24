# Backend sulla VM Oracle Cloud (Always Free)

La parte statica del progetto è su **GitHub Pages**; il server gira su una VM Oracle Cloud
*Always Free*, condivisa con gli altri progetti (BoatRadar, DressIt, QuantTradingSystem). Costo: **0 €/mese** entro i limiti Always Free (Ampere A1: 2 OCPU e
12 GB di RAM in totale, 200 GB di disco, 10 TB/mese di traffico in uscita).

## Una volta sola: crea la VM

1. Registrati su <https://www.oracle.com/cloud/free/> (serve una carta per la verifica;
   finché resti nei limiti Always Free non viene addebitato nulla). Scegli una *home region*
   vicina, per esempio Frankfurt o Milan: non si può cambiare dopo.
2. **Compute → Instances → Create instance**
   - Image: **Ubuntu 24.04** · Shape: **VM.Standard.A1.Flex**, 2 OCPU e 12 GB.
   - Rete: lascia la VCN proposta con IP pubblico.
   - SSH keys: *Generate a key pair* e scarica la **chiave privata**.
   Se compare *Out of capacity*, riprova più tardi o scegli un altro *availability domain*.
3. **Networking → Virtual cloud networks → (la tua VCN) → Security → Security List di default →
   Add Ingress Rules**: sorgente `0.0.0.0/0`, TCP, porte di destinazione `80,443`.
   (Il firewall interno della VM lo apre da solo `deploy/bootstrap.sh`.)
4. Annota l'**IP pubblico** della VM.

Docker, firewall e Caddy (HTTPS automatico con Let's Encrypt) li installa il primo deploy.

## Per ogni repository

In **Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valore |
|---|---|---|
| Variable | `VM_HOST` | IP pubblico della VM, es. `130.61.10.20` |
| Variable | `VM_USER` | facoltativa, di base `ubuntu` |
| Secret | `VM_SSH_KEY` | contenuto della chiave privata scaricata al punto 2 |
| Variable | `API_HOST` | facoltativa: tuo dominio per il server, es. `api.miosito.it` |

Gli altri secret dipendono dal progetto (vedi il README principale).

Poi in **Settings → Pages → Build and deployment → Source** scegli **GitHub Actions**
(se il progetto ha una parte su Pages) e lancia una volta da **Actions** i workflow
*Deploy backend* e *GitHub Pages* (*Run workflow*). Il primissimo deploy installa Docker sulla VM:
fallo per un progetto alla volta, poi gli altri. Dai push successivi su `main` si
aggiornano da soli.

## Indirizzi

Senza un dominio, ogni server riceve un nome gratuito di [sslip.io](https://sslip.io) che punta
all'IP della VM, con certificato HTTPS valido: `<app>.<IP con i trattini>.sslip.io`,
per esempio `boatradar.130-61-10-20.sslip.io`. Con un dominio tuo crea un record DNS `A`
verso l'IP e mettilo in `API_HOST`.

## Comandi utili sulla VM

```bash
ssh -i chiave.key ubuntu@IP
sudo docker ps                                  # container attivi
sudo docker logs -f <app>                       # log di un'app
sudo docker compose -p <app> -f /opt/apps/<app>/deploy/compose.yml restart
```

## Backup su Google Drive (DressIt)

Il servizio `backup` di `deploy/compose.yml` (cartella `deploy/backup`) salva ogni notte il database
e ogni domenica le foto del volume `uploads` nella cartella **DressIt-backup** del tuo Google Drive.
Ogni file è compresso e cifrato (Fernet) prima di lasciare la VM, e i file più vecchi di 30 giorni
vengono cancellati, ma solo dopo un backup riuscito. Costo: **0 €**, perché usa i 15 GB gratuiti del
tuo Drive. Un backup del database pesa pochi kB o MB; le foto pesano quanto il volume `uploads`.
Se usi Cloudinary il volume è vuoto e le foto restano lì.

La logica (dump → gzip → Fernet → Drive → conservazione) è quella di
[TheManchineel/mariadb-drive-dump](https://github.com/TheManchineel/mariadb-drive-dump), riscritta
perché quella repo non ha licenza ed è archiviata. Un'altra differenza: carica con **rclone e il
tuo account Google**, non con un service account. I service account creati dopo il 15 aprile 2025
non hanno spazio su un Drive personale e possono scrivere solo nei Drive condivisi di Workspace.

### Attivazione (una volta sola, dal tuo PC)

1. **Chiave di cifratura.** Generala e salvala anche in un password manager: senza questa chiave
   i backup non si possono leggere.
   ```bash
   python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
2. **Token di Google Drive.** Installa rclone (<https://rclone.org/downloads/>) e lancia:
   ```bash
   rclone config create gdrive drive scope=drive.file
   rclone config show gdrive
   ```
   Il primo comando apre il browser: entra con il tuo account Google e consenti l'accesso.
   Con lo scope `drive.file` rclone vede solo i file che crea lui, non il resto del tuo Drive.
   Il secondo comando mostra una riga `token = {"access_token": …, "refresh_token": …}`:
   copia tutto il JSON dopo `token = `.
   Se il browser non si apre, usa `rclone config` interattivo: `n`, nome `gdrive`, storage `drive`,
   scope `drive.file`, poi *Use auto config? → y*.
3. In **Settings → Secrets and variables → Actions** aggiungi:

   | Tipo | Nome | Valore |
   |---|---|---|
   | Secret | `BACKUP_FERNET_KEY` | la chiave del punto 1 |
   | Secret | `RCLONE_DRIVE_TOKEN` | il JSON del punto 2 |
   | Variable | `BACKUP_HOUR` | facoltativa, ora del backup (ora italiana), di base `3` |
   | Variable | `BACKUP_RETENTION_DAYS` | facoltativa, giorni di conservazione, di base `30` |

4. Rilancia **Actions → Deploy backend → Run workflow**. Il log del deploy scrive
   *Backup su Google Drive: attivo*. Il primo backup, foto comprese, parte subito; poi ce n'è
   uno al giorno. Senza i due secret il deploy funziona come prima e mostra un avviso.

### Controllare

```bash
sudo docker logs dressit-backup                     # cosa ha fatto e quando farà il prossimo
sudo docker ps --filter name=dressit-backup          # "healthy" = ultimo backup riuscito da meno di 26 ore
cd /opt/apps/dressit
B="sudo docker compose -p dressit -f deploy/compose.yml --env-file deploy/.env --profile backup"
$B exec backup /opt/backup/backup.sh list            # elenco dei file su Drive
$B exec backup /opt/backup/backup.sh once --uploads  # backup immediato, foto comprese
```

### Ripristino

Il ripristino del database avviene in una sola transazione: se qualcosa va storto, il database resta
com'era. Senza `RESTORE_CONFIRM=yes` non parte. Al posto di `latest` puoi indicare un file preciso
preso da `list`, per esempio `db/dressit_db_2026-11-24_030000.sql.gz.fernet`.

```bash
cd /opt/apps/dressit
B="sudo docker compose -p dressit -f deploy/compose.yml --env-file deploy/.env --profile backup"
$B stop api                                                     # nessuna scrittura durante il ripristino
$B run --rm -e RESTORE_CONFIRM=yes backup restore-db latest     # database
$B run --rm -e RESTORE_CONFIRM=yes -e BACKUP_UPLOADS_DIR=/restore \
  -v dressit_uploads:/restore backup restore-uploads latest     # foto (solo senza Cloudinary)
$B start api
```

**Su una VM nuova:** crea la VM, rimetti `VM_HOST` e `VM_SSH_KEY` se sono cambiati e lancia
*Deploy backend* (con gli stessi secret, chiave Fernet compresa). Poi esegui i comandi qui sopra.

**Senza VM, dal PC:** scarica il file da Drive e decifralo con lo stesso script:
```bash
BACKUP_FERNET_KEY='la-tua-chiave' python3 deploy/backup/fernet_stream.py decrypt \
  < dressit_db_….sql.gz.fernet | gunzip > dressit.sql      # poi: psql <database> < dressit.sql
```

### Prova in locale

`bash deploy/backup/test.sh` costruisce l'immagine e prova backup, cifratura, conservazione e
ripristino con due Postgres usa e getta e dati finti. Lo stesso test gira nella CI (job *backup*).
Senza Docker: `bash deploy/backup/test.sh --local`, che usa Postgres 16, rclone e Python della macchina.
