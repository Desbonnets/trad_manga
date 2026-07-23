# Analyse du code — Manga Translator

Date : 2026-07-23
Branche analysée : `dev` (avec modifications non commitées sur `background/background.js`, `content/content.css`, `content/content.js`, `ocr/ocr-frame.js`)

## Vue d'ensemble

**Manga Translator** est une extension navigateur (Manifest V3) qui fait de l'OCR (Tesseract.js) sur des images de manga puis traduit le texte via une API externe (Lingva / DeepL / MyMemory / LibreTranslate). Architecture en 4 acteurs :

- `background/background.js` — service worker (permissions réseau, capture d'écran, stockage des settings)
- `content/content.js` + `content/content.css` — injecté dans les pages, orchestre capture d'image, OCR, traduction, UI
- `ocr/ocr-frame.js` (+ `ocr-frame.html`) — iframe isolée en contexte `chrome-extension://`, exécute Tesseract.js
- `popup/` et `options/` — UI de l'extension (actions rapides et réglages)

Le code est globalement **soigné** : bonne séparation des responsabilités, commentaires utiles expliquant le *pourquoi* (pas le *quoi*), gestion d'erreurs cohérente, CSS namespacé (`mt-*`), pas de dépendances superflues.

## Points forts

- **Stratégie de capture d'image à 3 niveaux** (`getImageDataUrl` dans `content.js`) : canvas direct → fetch via background (contourne CORS) → capture d'écran + scroll-and-stitch (contourne le hotlinking). Robuste et bien pensé pour un cas d'usage difficile (CDN de scans protégés).
- **Isolation de l'OCR dans une iframe dédiée** avec son propre protocole `postMessage` — évite de charger tesseract.js/wasm dans le contexte de la page hôte.
- **Fallback en cascade** pour la traduction (Lingva → MyMemory, DeepL → Lingva si pas de clé) et plusieurs instances publiques Lingva testées dans l'ordre.

## Problèmes identifiés

### Sécurité / robustesse

1. **`postMessage` avec origine `'*'` partout** (`content.js:283`, `ocr-frame.js:33,55,80,83`) — n'importe quelle frame/fenêtre pourrait injecter un faux `MT_OCR_RESULT` ou `MT_OCR_REQUEST`. Le listener de `content.js` (ligne 224) ne vérifie ni `e.origin` ni `e.source === state.ocrFrame.contentWindow`. Risque faible vu le contexte (extension), mais facile à corriger.
2. **`langPath: 'https://tessdata.projectnaptha.com/...'`** (`ocr-frame.js:29`) — dépendance à un service tiers non contrôlé pour les données linguistiques. Si le service tombe ou change, l'OCR casse silencieusement au premier lancement (ensuite mis en cache). À vendorer idéalement, comme le reste de Tesseract.
3. **`host_permissions: ["<all_urls>"]`** + `fetchImageAsDataUrl` sans allowlist — le service worker peut fetcher n'importe quelle URL avec `credentials: 'omit'` (bien, évite la fuite de cookies), mais sans validation que `url` est bien une image ni de limite de taille.
4. **`readAsDataURL` dupliqué 3 fois** dans `background.js` (`fetchImageAsDataUrl`, `captureImageRegion` x2) — même pattern promisifié répété, mériterait une petite fonction utilitaire `blobToDataUrl`.

### Bugs potentiels

5. ~~**`translatePage` séquentiel avec `await translateImage(img)` dans une boucle**~~ — **Corrigé.** `translatePage` utilise désormais un pipeline partagé (`runOCRTranslatePipeline`) avec un seul loader et un seul modal combiné (groupé par image via `showTranslationModal(results, groups)`), au lieu d'empiler un modal par image. Les échecs par image sont catchés individuellement sans interrompre le batch.
6. ~~**`captureFullImageByScrolling`** : `naturalWidth`/`naturalHeight` à 0 sur une image lazy-load pas encore chargée~~ — **Corrigé.** Nouvelle fonction `ensureImageLoaded(img)` qui attend la fin du chargement (événement `load`/`error`, timeout 5s) après le `scrollIntoView` — qui déclenche justement le chargement des images `loading="lazy"`. Les dimensions naturelles sont maintenant lues après ce délai, avec un contrôle explicite (`natW <= 0 || natH <= 0` → erreur claire) au lieu de laisser passer un canvas 0×0 qui échouait silencieusement plus loin.
7. ~~Dans `getWorker` (`ocr-frame.js`), état incohérent de `worker`/`workerLang` si `Tesseract.createWorker`/`setParameters` échoue en cours de route~~ — **Corrigé.** Le nouveau worker est construit dans une variable locale (`newWorker`) et n'est commité à l'état de module (`worker`/`workerLang`) qu'une fois `createWorker` **et** `setParameters` réussis tous les deux. En cas d'échec partiel, le worker éventuellement créé est terminé (`newWorker.terminate()`) et l'erreur est propagée sans laisser de worker à moitié configuré (ni de fuite mémoire du worker WASM).

### Qualité / maintenabilité

8. **Duplication de `defaultSettings()`** entre `background.js` et `content.js` (et `DEFAULTS` dans `options.js`) — 3 copies de la même config par défaut à maintenir en synchro manuellement. Un module partagé (ou lecture via message vers `background`) éviterait la dérive silencieuse.
9. **`content.css`** et le CSS inline dans `content.js` (loader, notifications) mélangent deux approches de style pour la même extension — cohérent pour la raison indiquée (résister au CSS de la page hôte) mais pourrait être unifié en un seul système d'injection de styles avec `!important`.
10. **Aucun test automatisé** (pas de fichier `*.test.js`) — acceptable pour une petite extension, mais rend les refactors comme celui en cours plus risqués sans vérification manuelle.

## Sur le diff en cours (non commité)

Le diff remplace l'ancienne capture "un seul screenshot centré" par un pipeline `fetch → scroll-and-stitch` beaucoup plus robuste pour les webtoons (images très hautes). C'est une nette amélioration. Points d'attention spécifiques :

- `captureFullImageByScrolling` (`content.js`) : la boucle `while (capturedNatH < natH)` n'a pas de garde-fou contre un blocage si `window.scrollBy` ne fait plus progresser le scroll (ex. `overflow: hidden` sur un parent, scroll-snap) alors qu'`img` reste partiellement visible. Le `break` sur `visH <= 2` couvre le cas où l'image sort du viewport, mais un compteur d'itérations maximum sécuriserait davantage.
- `user_defined_dpi: '70'` dans `ocr-frame.js` est un bon correctif pour éviter un crash du cœur WASM (auto-détection DPI erronée sur les screenshots), bien documenté en commentaire.

## Pistes de suite possibles

- Corriger la vérification d'origine sur les `postMessage` OCR.
- Fermer/regrouper les modals dans `translatePage` (un seul modal cumulatif au lieu d'un par image).
- Factoriser `defaultSettings()` dans un module partagé.
- Ajouter un garde-fou (max itérations) dans `captureFullImageByScrolling`.
