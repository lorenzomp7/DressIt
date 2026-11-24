# Wardrobe Outfit Planner – scheda da fonti pubbliche

- Data: 2026-11-24. **Fonti pubbliche, non l'APK**.

Il nome è generico: negli store ci sono più app quasi omonime («GetWardrobe Outfit Planner»,
«Outfit Maker and Planner», «Wardrobe Snap» e altre) e il Piano non riporta il pacchetto.
Questa scheda raccoglie quindi ciò che le app di questo tipo dichiarano; va legata all'app
giusta quando c'è l'APK (`adb shell pm list packages | grep -i wardrobe`).

| # | Domanda | Trovato in app di questo tipo | Fonte |
|---|---|---|---|
| 1 | Sfondo (23) | ritaglio automatico allo scatto, anche **senza rete** | [Wardrobe Snap](https://apps.apple.com/us/app/-/id6770147139) |
| 2 | Meteo (7, 26) | più proposte al giorno in base alle previsioni | [Outfit Maker and Planner](https://apps.apple.com/us/app/-/id6584526008) |
| 5 | Offline (31) | app «100% offline», senza account né cloud; altre offline-first con sincronizzazione iCloud facoltativa | [Wardrobe Snap](https://apps.apple.com/us/app/-/id6770147139), [ClosetLog](https://apps.apple.com/bb/app/closetlog/id6746719497) |

## Cosa conviene fare in DressIt

- Punto 31: l'uso senza rete è una funzione richiesta e venduta: la copia in IndexedDB è giustificata.
- Punto 23: una rimozione nel browser (modello locale) funziona anche offline.
