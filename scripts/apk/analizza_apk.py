#!/usr/bin/env python3
"""Bozza di scheda di un'app Android per docs/app-analizzate/ (integrazione REA del Piano).

Legge solo dichiarazioni e nomi: manifest (permessi, servizi, ricevitori, provider), nomi di
classi e librerie, file di modello negli asset, domini nelle stringhe. Non decompila il codice
e non copia codice o risorse dell'app: nella repo va solo la scheda, l'APK resta fuori.

Uso:
  python3 scripts/apk/analizza_apk.py <app.apk | app.xapk | app.apks | cartella con gli split>
      --nome "Acloset" [--fonte "adb dal telefono, Play Store"] [--out docs/app-analizzate]

Serve Apktool (https://apktool.org) nel PATH, o il comando in APKTOOL. Senza Apktool la scheda
si fa lo stesso, ma senza manifest. Ogni scoperta rimanda a un punto del Piano.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

ANDROID_NS = "{http://schemas.android.com/apk/res/android}"

# --- Firme cercate: (testo da trovare nelle stringhe, etichetta) -----------------------------
# I nomi delle classi sono nei .dex in forma "Lcom/google/...", i pacchetti Dart nel libapp.so
# come "package:nome/", i domini ovunque. Un'app offuscata con R8 può nascondere qualcosa:
# "nessuna traccia" non è una prova di assenza.

SFONDO_LOCALE = [
    ("com/google/mlkit/vision/segmentation/subject", "ML Kit Subject Segmentation (sul telefono)"),
    ("mlkit_vision_subject_segmentation", "ML Kit Subject Segmentation via Google Play services (sul telefono)"),
    ("com/google/mlkit/vision/segmentation/selfie", "ML Kit Selfie Segmentation (sul telefono)"),
    ("com/google/mediapipe/tasks/vision/imagesegmenter", "MediaPipe Image Segmenter (sul telefono)"),
    ("com/google/mediapipe/tasks/vision/interactivesegmenter", "MediaPipe Interactive Segmenter (sul telefono)"),
    ("org/tensorflow/lite", "TensorFlow Lite"),
    ("ai/onnxruntime", "ONNX Runtime"),
    ("org/pytorch", "PyTorch Mobile"),
    ("org/opencv", "OpenCV"),
    ("package:google_mlkit_subject_segmentation/", "ML Kit Subject Segmentation (Flutter)"),
    ("package:google_mlkit_selfie_segmentation/", "ML Kit Selfie Segmentation (Flutter)"),
    ("package:tflite_flutter/", "TensorFlow Lite (Flutter)"),
    ("package:onnxruntime/", "ONNX Runtime (Flutter)"),
    ("react-native-fast-tflite", "TensorFlow Lite (React Native)"),
]
SFONDO_LIB = {
    "libtensorflowlite_jni.so": "TensorFlow Lite",
    "libtensorflowlite_gpu_jni.so": "TensorFlow Lite GPU",
    "libonnxruntime.so": "ONNX Runtime",
    "libpytorch_jni.so": "PyTorch Mobile",
    "libmediapipe_tasks_vision_jni.so": "MediaPipe",
    "libncnn.so": "ncnn",
    "libopencv_java4.so": "OpenCV",
}
MODELLI_EST = (".tflite", ".onnx", ".ort", ".ptl", ".pt", ".task", ".mlmodel")
SFONDO_SERVIZI = [
    ("api.remove.bg", "remove.bg (servizio esterno)"),
    ("photoroom.com", "PhotoRoom (servizio esterno o SDK)"),
    ("clipdrop-api.co", "Clipdrop (servizio esterno)"),
    ("api.pixian.ai", "Pixian (servizio esterno)"),
    ("api.picsart.io", "Picsart API (servizio esterno)"),
    ("api.slazzer.com", "Slazzer (servizio esterno)"),
    ("api.removal.ai", "removal.ai (servizio esterno)"),
    ("e_background_removal", "Cloudinary background removal (servizio esterno)"),
    ("generativelanguage.googleapis.com", "Gemini API (AI esterna, uso da verificare)"),
    ("api.openai.com", "OpenAI API (AI esterna, uso da verificare)"),
    ("api.replicate.com", "Replicate (AI esterna, uso da verificare)"),
]
METEO = [
    ("api.openweathermap.org", "OpenWeather"),
    ("openweathermap.org", "OpenWeather"),
    ("api.open-meteo.com", "Open-Meteo"),
    ("api.weatherapi.com", "WeatherAPI.com"),
    ("dataservice.accuweather.com", "AccuWeather"),
    ("api.tomorrow.io", "Tomorrow.io"),
    ("weather.visualcrossing.com", "Visual Crossing"),
    ("api.weather.com", "The Weather Company"),
    ("weatherkit.apple.com", "Apple WeatherKit"),
    ("api.met.no", "MET Norway"),
    ("weather.googleapis.com", "Google Weather API"),
    ("api.weatherbit.io", "Weatherbit"),
    ("api.meteomatics.com", "Meteomatics"),
    ("api.pirateweather.net", "Pirate Weather"),
    ("aerisapi.com", "Xweather (Aeris)"),
]
NOTIFICHE = [
    ("androidx/work", "WorkManager (lavori pianificati)"),
    ("com/google/firebase/messaging", "Firebase Cloud Messaging (push dal server)"),
    ("com/onesignal", "OneSignal (push dal server)"),
    ("com/braze", "Braze (push dal server)"),
    ("com/urbanairship", "Airship (push dal server)"),
    ("com/clevertap", "CleverTap (push dal server)"),
    ("com/iterable", "Iterable (push dal server)"),
    ("io/customer/messagingpush", "Customer.io (push dal server)"),
    ("com/dexterous/flutterlocalnotifications", "flutter_local_notifications (notifiche locali)"),
    ("app/notifee", "Notifee (notifiche locali, React Native)"),
    ("expo/modules/notifications", "expo-notifications"),
    ("package:flutter_local_notifications/", "flutter_local_notifications (notifiche locali)"),
    ("package:workmanager/", "workmanager (Flutter)"),
    ("package:android_alarm_manager_plus/", "android_alarm_manager_plus (Flutter)"),
]
NOTIFICHE_PERMESSI = {
    "android.permission.POST_NOTIFICATIONS": "può mostrare notifiche (Android 13+)",
    "android.permission.SCHEDULE_EXACT_ALARM": "allarmi a orario esatto",
    "android.permission.USE_EXACT_ALARM": "allarmi a orario esatto",
    "android.permission.RECEIVE_BOOT_COMPLETED": "riprende i lavori dopo il riavvio",
}
CONDIVISIONE = [
    ("androidx/core/content/FileProvider", "FileProvider (passa file ad altre app)"),
    ("com.instagram.share.ADD_TO_STORY", "condivisione nelle storie di Instagram"),
    ("com.facebook.stories.ADD_TO_STORY", "condivisione nelle storie di Facebook"),
    ("dev/fluttercommunity/plus/share", "share_plus (Flutter)"),
    ("package:share_plus/", "share_plus (Flutter)"),
    ("package:screenshot/", "screenshot (Flutter: immagine di un widget)"),
    ("cl/json/RNShare", "react-native-share"),
    ("fr/greweb/reactnativeviewshot", "react-native-view-shot (immagine di una vista)"),
    ("android.intent.action.SEND", "intent di condivisione"),
]
OFFLINE = [
    ("androidx/room", "Room (SQLite)"),
    ("app/cash/sqldelight", "SQLDelight (SQLite)"),
    ("io/realm", "Realm"),
    ("io/objectbox", "ObjectBox"),
    ("net/zetetic/database", "SQLCipher (SQLite cifrato)"),
    ("net/sqlcipher", "SQLCipher (SQLite cifrato)"),
    ("com/tekartik/sqflite", "sqflite (Flutter, SQLite)"),
    ("package:sqflite/", "sqflite (Flutter, SQLite)"),
    ("package:hive/", "Hive (Flutter)"),
    ("package:isar/", "Isar (Flutter)"),
    ("package:drift/", "Drift (Flutter, SQLite)"),
    ("com/nozbe/watermelondb", "WatermelonDB (React Native)"),
    ("com/reactnativecommunity/asyncstorage", "AsyncStorage (React Native)"),
    ("com/tencent/mmkv", "MMKV (chiave-valore)"),
    ("com/google/firebase/firestore", "Cloud Firestore (cache offline)"),
    ("com/couchbase/lite", "Couchbase Lite"),
    ("androidx/datastore", "DataStore (impostazioni)"),
]
FRAMEWORK_LIB = {
    "libflutter.so": "Flutter",
    "libreactnativejni.so": "React Native",
    "libhermes.so": "React Native (Hermes)",
    "libunity.so": "Unity",
    "libmonodroid.so": ".NET / Xamarin / MAUI",
}
# Domini che non dicono nulla dell'app.
DOMINI_IGNORATI = re.compile(
    r"(^|\.)(android\.com|w3\.org|apache\.org|xml\.org|xmlpull\.org|json\.org|example\.(com|org)|"
    r"schema\.org|purl\.org|adobe\.com|ietf\.org|mozilla\.org|unicode\.org|openxmlformats\.org|"
    r"googlesource\.com|github\.com|jetbrains\.com|kotlinlang\.org|oracle\.com|java\.com|"
    r"googleapis\.com/auth|goo\.gl|creativecommons\.org)$"
)
DOMINIO = re.compile(rb"(?:https?://|wss?://)([a-z0-9][a-z0-9.-]{1,200}\.[a-z]{2,24})", re.I)
STRINGA = re.compile(rb"[\x20-\x7e]{6,}")
TLD_VALIDI = re.compile(r"\.(com|net|org|io|ai|app|co|dev|cloud|me|it|de|fr|uk|eu|kr|jp|cn|us|info|tech|so|sh)$")


@dataclass
class Prova:
    cosa: str
    dove: str


@dataclass
class Analisi:
    nome: str
    file: Path
    sha256: str
    pacchetto: str = "?"
    versione: str = "?"
    version_code: str = "?"
    min_sdk: str = "?"
    target_sdk: str = "?"
    framework: list[str] = field(default_factory=list)
    permessi: list[str] = field(default_factory=list)
    componenti: dict[str, list[str]] = field(default_factory=dict)
    sfondo: list[Prova] = field(default_factory=list)
    meteo: list[Prova] = field(default_factory=list)
    notifiche: list[Prova] = field(default_factory=list)
    condivisione: list[Prova] = field(default_factory=list)
    offline: list[Prova] = field(default_factory=list)
    domini: dict[str, set[str]] = field(default_factory=dict)
    limiti: list[str] = field(default_factory=list)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def apk_list(src: Path, tmp: Path) -> list[Path]:
    """Gli APK da leggere: uno solo, gli split di un .xapk/.apks, o quelli di una cartella."""
    if src.is_dir():
        apks = sorted(src.glob("*.apk"))
    elif zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            inner = [n for n in z.namelist() if n.endswith(".apk")]
            if not inner:
                return [src]
            for n in inner:
                z.extract(n, tmp / "split")
            apks = sorted((tmp / "split").rglob("*.apk"))
    else:
        sys.exit(f"{src}: non è un APK, un pacchetto di split o una cartella")
    if not apks:
        sys.exit(f"{src}: nessun .apk dentro")
    # base.apk per primo: ha il manifest dell'app.
    return sorted(apks, key=lambda p: (p.name != "base.apk", p.name))


def leggi_manifest(apk: Path, tmp: Path, a: Analisi) -> None:
    apktool = shutil.which(os.environ.get("APKTOOL") or "apktool")
    if not apktool:
        a.limiti.append("Apktool non trovato: manifest, permessi e componenti non letti.")
        return
    out = tmp / "decoded"
    # -s: niente smali (il codice non serve), -f: sovrascrive la cartella temporanea.
    r = subprocess.run([apktool, "d", "-s", "-f", "-o", str(out), str(apk)], capture_output=True, text=True)
    manifest = out / "AndroidManifest.xml"
    if r.returncode != 0 or not manifest.exists():
        a.limiti.append("Apktool non è riuscito a decodificare il manifest: " + (r.stderr or r.stdout).strip()[-300:])
        return
    root = ET.parse(manifest).getroot()
    a.pacchetto = root.get("package", "?")
    a.versione = root.get(ANDROID_NS + "versionName") or a.versione
    a.version_code = root.get(ANDROID_NS + "versionCode") or a.version_code
    yml = out / "apktool.yml"
    if yml.exists():
        text = yml.read_text(errors="replace")
        for key, attr in (("versionName", "versione"), ("versionCode", "version_code"),
                          ("minSdkVersion", "min_sdk"), ("targetSdkVersion", "target_sdk")):
            m = re.search(rf"{key}:\s*'?([^'\n]+)'?", text)
            if m and getattr(a, attr) == "?":
                setattr(a, attr, m.group(1).strip())
    uses = root.find("uses-sdk")
    if uses is not None:
        a.min_sdk = uses.get(ANDROID_NS + "minSdkVersion") or a.min_sdk
        a.target_sdk = uses.get(ANDROID_NS + "targetSdkVersion") or a.target_sdk
    a.permessi = sorted({p.get(ANDROID_NS + "name", "") for p in root.iter("uses-permission")} - {""})
    app = root.find("application")
    if app is None:
        return
    for kind in ("service", "receiver", "provider"):
        items = []
        for el in app.iter(kind):
            name = el.get(ANDROID_NS + "name", "")
            actions = [x.get(ANDROID_NS + "name", "") for x in el.iter("action")]
            items.append(name + (f" ({', '.join(actions)})" if actions else ""))
        a.componenti[kind] = sorted(items)


def cerca(blob: bytes, firme: list[tuple[str, str]], dove: str, prove: list[Prova]) -> None:
    for needle, label in firme:
        if needle.encode() in blob and not any(p.cosa == label for p in prove):
            prove.append(Prova(label, f"`{needle}` in {dove}"))


def leggi_contenuto(apk: Path, a: Analisi) -> None:
    with zipfile.ZipFile(apk) as z:
        for info in z.infolist():
            name = info.filename
            base = name.rsplit("/", 1)[-1]
            if name.startswith("lib/"):
                if base in FRAMEWORK_LIB and FRAMEWORK_LIB[base] not in a.framework:
                    a.framework.append(FRAMEWORK_LIB[base])
                if base in SFONDO_LIB:
                    label = SFONDO_LIB[base] + " (libreria nativa)"
                    if not any(p.cosa == label for p in a.sfondo):
                        a.sfondo.append(Prova(label, f"`{name}`"))
            if name.lower().endswith(MODELLI_EST) and not name.startswith("META-INF/"):
                a.sfondo.append(Prova(f"file di modello `{base}` ({info.file_size // 1024} kB): leggerne il nome e la provenienza", f"`{name}`"))
            if name.startswith("assets/") and name.endswith((".db", ".sqlite", ".realm")):
                a.offline.append(Prova(f"database precompilato `{base}`", f"`{name}`"))
            if name == "assets/index.android.bundle" and "React Native" not in a.framework:
                a.framework.append("React Native")
            # Stringhe: codice Java/Kotlin (.dex), Dart (libapp.so), JavaScript (bundle e asset .js).
            leggibile = (
                name.endswith(".dex")
                or base == "libapp.so"
                or name == "assets/index.android.bundle"
                or (name.startswith("assets/") and name.endswith((".js", ".json")) and info.file_size < 50 << 20)
            )
            if not leggibile:
                continue
            blob = z.read(info)
            dove = f"`{name}`"
            cerca(blob, SFONDO_LOCALE, dove, a.sfondo)
            cerca(blob, SFONDO_SERVIZI, dove, a.sfondo)
            cerca(blob, METEO, dove, a.meteo)
            cerca(blob, NOTIFICHE, dove, a.notifiche)
            cerca(blob, CONDIVISIONE, dove, a.condivisione)
            cerca(blob, OFFLINE, dove, a.offline)
            if b"kotlin/" in blob and "Kotlin" not in a.framework and name.endswith(".dex"):
                a.framework.append("Kotlin")
            for m in DOMINIO.finditer(blob):
                host = m.group(1).decode(errors="replace").lower().rstrip(".")
                if TLD_VALIDI.search(host) and not DOMINI_IGNORATI.search(host):
                    a.domini.setdefault(host, set()).add(name)


def analizza(src: Path, nome: str) -> Analisi:
    a = Analisi(nome=nome, file=src, sha256=sha256(src) if src.is_file() else "cartella di split")
    with tempfile.TemporaryDirectory() as tmp_s:
        tmp = Path(tmp_s)
        apks = apk_list(src, tmp)
        leggi_manifest(apks[0], tmp, a)
        for apk in apks:
            leggi_contenuto(apk, a)
    if len(apks) > 1:
        a.limiti.append(f"Letti {len(apks)} APK (base e split).")
    if "Flutter" in a.framework:
        a.limiti.append("App Flutter: la logica è in `libapp.so` (Dart compilato); qui si leggono solo i nomi dei pacchetti Dart e i domini.")
    if not a.framework:
        a.framework.append("Java/Kotlin (nessun framework multipiattaforma riconosciuto)")
    a.limiti.append("Lettura statica: ciò che l'app fa sul server o scarica dopo l'installazione non si vede. "
                    "Con R8 i nomi delle classi dell'app sono offuscati; quelli delle librerie di solito no.")
    return a


def blocco(prove: list[Prova], vuoto: str) -> str:
    if not prove:
        return f"- Nessuna traccia. {vuoto}\n"
    return "".join(f"- **{p.cosa}**: {p.dove}\n" for p in prove)


def scheda(a: Analisi, fonte: str) -> str:
    oggi = dt.date.today().isoformat()
    perm_notifiche = [f"`{p}` ({NOTIFICHE_PERMESSI[p]})" for p in a.permessi if p in NOTIFICHE_PERMESSI]
    notif = list(a.notifiche) + [Prova(x, "manifest") for x in perm_notifiche]
    for kind in ("service", "receiver"):
        for c in a.componenti.get(kind, []):
            if "BOOT_COMPLETED" in c or "alarm" in c.lower() or "SystemJobService" in c:
                notif.append(Prova(f"{kind} `{c}`", "manifest"))
    cond = list(a.condivisione) + [
        Prova(f"provider `{c}`", "manifest") for c in a.componenti.get("provider", []) if "FileProvider" in c
    ]
    meteo = list(a.meteo)
    if any(p.endswith(("ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION")) for p in a.permessi):
        meteo.append(Prova("chiede la posizione (meteo locale o altro)", "manifest"))
    domini = "\n".join(f"- `{d}`" for d in sorted(a.domini)[:60]) or "- nessuno"
    permessi = "\n".join(f"- `{p}`" for p in a.permessi) or "- nessuno letto"
    limiti = "\n".join(f"- {x}" for x in a.limiti)
    return f"""# {a.nome}

Bozza generata da `scripts/apk/analizza_apk.py` il {oggi}: rivederla e completare la conclusione.
Si leggono solo dichiarazioni e nomi di librerie, per capire come funziona l'app; nessun codice o
risorsa copiati. L'APK non è nella repo.

| | |
|---|---|
| Pacchetto | `{a.pacchetto}` |
| Versione | {a.versione} (versionCode {a.version_code}) |
| Android | minSdk {a.min_sdk}, targetSdk {a.target_sdk} |
| Tecnologia | {", ".join(a.framework)} |
| Data dell'analisi | {oggi} |
| Fonte dell'APK | {fonte} |
| SHA-256 | `{a.sha256}` |

## 1. Rimozione dello sfondo → [DressIt 23]
{blocco(a.sfondo, "Forse lo fa sul server: cercare un servizio esterno tra i domini qui sotto.")}
## 2. Meteo → [DressIt 7] e [DressIt 26]
{blocco(meteo, "Forse passa dal suo server: vedere i domini.")}
## 3. Notifica del mattino → [DressIt 25]
{blocco(notif, "")}
## 4. Immagine del look da condividere → [DressIt 22]
{blocco(cond, "")}
## 5. Dati offline → [DressIt 31]
{blocco(a.offline, "Forse tiene tutto sul server: l'app senza rete non mostrerebbe l'armadio.")}
## Conclusione per DressIt

_Da completare: per ogni punto, cosa fa l'app (sul telefono o su un servizio esterno) e cosa
conviene fare in DressIt, con il rimando al punto del Piano._

## Domini trovati nelle stringhe

{domini}

## Permessi

{permessi}

## Limiti di questa lettura

{limiti}
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("apk", type=Path)
    ap.add_argument("--nome", required=True, help="Nome dell'app, es. Acloset")
    ap.add_argument("--fonte", default="APK fornito dal proprietario della repo", help="Da dove viene l'APK")
    ap.add_argument("--out", type=Path, help="Cartella delle schede (es. docs/app-analizzate); senza, stampa a video")
    args = ap.parse_args()
    if not args.apk.exists():
        sys.exit(f"{args.apk}: non esiste")
    a = analizza(args.apk, args.nome)
    text = scheda(a, args.fonte)
    if not args.out:
        sys.stdout.write(text)
        return
    args.out.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", args.nome.lower()).strip("-")
    dest = args.out / f"{slug}.md"
    n = 2
    while dest.exists():  # mai sovrascrivere una scheda: nuova revisione numerata
        dest = args.out / f"{slug}_{n}.md"
        n += 1
    dest.write_text(text, encoding="utf-8")
    print(dest)


if __name__ == "__main__":
    main()
