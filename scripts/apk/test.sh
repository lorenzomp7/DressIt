#!/usr/bin/env bash
# Prova di scripts/apk/analizza_apk.py su APK costruiti qui, senza app di terzi:
# un APK con manifest vero (aapt) e un dex, una libreria e un modello finti; lo stesso diviso in
# split (.xapk); un APK vuoto. Serve: python3, apktool, aapt e un android.jar (ANDROID_JAR).
# Su Ubuntu: sudo apt-get install apktool aapt android-sdk-platform-23
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/apk/analizza_apk.py"
JAR="${ANDROID_JAR:-$(ls /usr/lib/android-sdk/platforms/*/android.jar 2>/dev/null | tail -n 1)}"
for t in apktool aapt python3; do command -v "$t" >/dev/null || { echo "manca $t"; exit 1; }; done
[ -f "$JAR" ] || { echo "manca android.jar (ANDROID_JAR)"; exit 1; }
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; exit 1; }
has() { grep -qF -- "$2" "$1" || ko "manca nella scheda: $2"; }

echo "1. APK di prova con manifest vero"
mkdir -p "$W/app/assets/models" "$W/app/lib/arm64-v8a" "$W/app/res"
cat > "$W/app/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.armadio.prova" android:versionCode="42" android:versionName="1.2.3">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.INTERNET" />
  <application android:label="Prova">
    <service android:name="androidx.work.impl.background.systemjob.SystemJobService" />
    <receiver android:name="com.example.armadio.prova.MorningAlarmReceiver">
      <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /></intent-filter>
    </receiver>
    <provider android:name="androidx.core.content.FileProvider" android:authorities="com.example.armadio.prova.files" />
  </application>
</manifest>
XML
# Un dex finto: conta solo il pool di stringhe, dove stanno nomi di classi e URL.
printf 'dex\n035\0%s\0%s\0%s\0%s\0%s\0%s\0' \
  'Lcom/google/mlkit/vision/segmentation/subject/SubjectSegmenter;' \
  'https://api.open-meteo.com/v1/forecast?latitude=' \
  'Landroidx/room/RoomDatabase;' 'Landroidx/work/Worker;' 'Lkotlin/Unit;' \
  'https://cdn.armadio-prova.com/img' > "$W/app/classes.dex"
head -c 4096 /dev/urandom > "$W/app/assets/models/segmentazione_capi.tflite"
head -c 1024 /dev/urandom > "$W/app/lib/arm64-v8a/libtensorflowlite_jni.so"
aapt package -f -M "$W/app/AndroidManifest.xml" -I "$JAR" -F "$W/prova.apk" >/dev/null
(cd "$W/app" && aapt add -k "$W/prova.apk" classes.dex >/dev/null && aapt add "$W/prova.apk" assets/models/segmentazione_capi.tflite lib/arm64-v8a/libtensorflowlite_jni.so >/dev/null)

python3 "$SCRIPT" "$W/prova.apk" --nome "App Prova" --fonte "costruito da test.sh" --out "$W/schede" >/dev/null
S="$W/schede/app-prova.md"
[ -f "$S" ] && ok "scheda creata: app-prova.md" || ko "scheda non creata"
has "$S" '`com.example.armadio.prova`'; has "$S" "1.2.3 (versionCode 42)"; has "$S" "minSdk 24, targetSdk 34"
ok "pacchetto, versione e SDK letti dal manifest binario"
has "$S" "ML Kit Subject Segmentation (sul telefono)"; has "$S" "TensorFlow Lite (libreria nativa)"
has "$S" "file di modello \`segmentazione_capi.tflite\`"
ok "sfondo: ML Kit, TensorFlow Lite e il file di modello"
has "$S" "**Open-Meteo**"; has "$S" "chiede la posizione"
ok "meteo: Open-Meteo e permesso di posizione"
has "$S" "WorkManager"; has "$S" "POST_NOTIFICATIONS"; has "$S" "MorningAlarmReceiver (android.intent.action.BOOT_COMPLETED)"
ok "notifica: WorkManager, permesso e ricevitore dopo il riavvio"
has "$S" "provider \`androidx.core.content.FileProvider\`"; ok "condivisione: FileProvider"
has "$S" "Room (SQLite)"; ok "offline: Room"
has "$S" '`cdn.armadio-prova.com`'; ok "domini trovati"
grep -q "schemas.android.com" "$S" && ko "domini di sistema non filtrati" || ok "domini di sistema esclusi"
grep -q "Kotlin" "$S" && ok "tecnologia: Kotlin" || ko "tecnologia non riconosciuta"

python3 "$SCRIPT" "$W/prova.apk" --nome "App Prova" --out "$W/schede" >/dev/null
[ -f "$W/schede/app-prova_2.md" ] && ok "seconda analisi in app-prova_2.md, la prima non è sovrascritta" || ko "revisione numerata assente"

echo "2. Stessa app divisa in split (.xapk)"
mkdir -p "$W/split/lib/arm64-v8a"
cp "$W/app/lib/arm64-v8a/libtensorflowlite_jni.so" "$W/split/lib/arm64-v8a/"
aapt package -f -M "$W/app/AndroidManifest.xml" -I "$JAR" -F "$W/base.apk" >/dev/null
(cd "$W/app" && aapt add -k "$W/base.apk" classes.dex >/dev/null)
cp "$W/base.apk" "$W/split_config.arm64_v8a.apk"
(cd "$W/split" && aapt remove "$W/split_config.arm64_v8a.apk" classes.dex >/dev/null && aapt add "$W/split_config.arm64_v8a.apk" lib/arm64-v8a/libtensorflowlite_jni.so >/dev/null)
(cd "$W" && python3 -c "import zipfile;z=zipfile.ZipFile('prova.xapk','w');z.write('base.apk');z.write('split_config.arm64_v8a.apk')")
X="$(python3 "$SCRIPT" "$W/prova.xapk" --nome "Prova split")"
grep -qF "TensorFlow Lite (libreria nativa)" <<<"$X" && grep -qF '`com.example.armadio.prova`' <<<"$X" && grep -qF "Letti 2 APK" <<<"$X" \
  && ok "manifest dal base.apk, libreria dallo split" || ko "split non letti"

echo "3. APK vuoto: nessuna invenzione"
mkdir -p "$W/vuota"
cat > "$W/vuota/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.vuota" android:versionName="0.1">
  <application android:label="Vuota" />
</manifest>
XML
aapt package -f -M "$W/vuota/AndroidManifest.xml" -I "$JAR" -F "$W/vuoto.apk" >/dev/null
V="$(python3 "$SCRIPT" "$W/vuoto.apk" --nome Vuota)"
[ "$(grep -c "Nessuna traccia" <<<"$V")" = 5 ] && ok "cinque sezioni su cinque: nessuna traccia" || ko "trovato qualcosa in un APK vuoto"
V2="$(APKTOOL=/non/esiste python3 "$SCRIPT" "$W/vuoto.apk" --nome Vuota)"
grep -qF "Apktool non trovato" <<<"$V2" && ok "senza Apktool lo dice nei limiti invece di fermarsi" || ko "Apktool mancante non segnalato"

echo "Tutti i controlli superati."
