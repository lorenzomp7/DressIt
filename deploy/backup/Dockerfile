# Backup giornaliero di DressIt su Google Drive (logica ispirata a TheManchineel/mariadb-drive-dump:
# dump → gzip → cifratura Fernet → upload → cancellazione dei file più vecchi di N giorni).
# Base postgres:16-alpine: pg_dump e psql sono della stessa versione del database
# e l'immagine è multi-architettura (la VM Oracle è ARM, la CI è x86).
FROM postgres:16-alpine

RUN apk add --no-cache rclone python3 py3-cryptography tzdata

COPY backup.sh fernet_stream.py /opt/backup/
RUN chmod 755 /opt/backup/*.sh && mkdir -p /state

ENV BACKUP_REMOTE="gdrive:DressIt-backup" \
    BACKUP_HOUR="3" \
    BACKUP_RETENTION_DAYS="30" \
    BACKUP_UPLOADS_WEEKDAY="7" \
    TZ="Europe/Rome"

# Sano se l'ultimo backup riuscito ha meno di 26 ore (o se non ne è ancora stato fatto uno).
HEALTHCHECK --interval=30m --timeout=10s --start-period=2h \
  CMD /opt/backup/backup.sh health

ENTRYPOINT ["/opt/backup/backup.sh"]
CMD ["loop"]
