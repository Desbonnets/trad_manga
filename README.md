# Manga Translator

Extension navigateur (Chrome & Firefox) pour traduire automatiquement le texte présent dans des images de mangas, comics et manhwas, avec affichage en fenêtres flottantes déplaçables sans modifier l'image originale.

## Fonctionnalités (MVP v1.0)

- **Clic droit → Traduire cette image** sur n'importe quelle image
- **Bouton extension** → Traduire toute la page
- **Fenêtres flottantes** déplaçables, masquables, fermables individuellement
- OCR anglais via [Tesseract.js](https://tesseract.projectnaptha.com/)
- Traduction **anglais → français** via [MyMemory API](https://mymemory.translated.net/) (gratuit, sans clé)
- Support **LibreTranslate** configurable (auto-hébergé)
- Raccourcis clavier : `Alt+T` (traduire), `Alt+H` (afficher/masquer), `Alt+R` (rafraîchir)
- Paramètres persistés : taille, opacité, couleurs, API de traduction

## Installation (développement)

### Prérequis

- Node.js ≥ 18
- Chrome ≥ 109 ou Firefox ≥ 109

### Setup

```bash
git clone https://github.com/Desbonnets/trad_manga.git
cd trad_manga
npm install
node scripts/setup.js
```

Le script `setup.js` copie les fichiers Tesseract.js depuis `node_modules` vers `lib/` et génère les icônes PNG.

### Charger dans Chrome

1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite)
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner le dossier `trad_manga/`

### Charger dans Firefox

1. Ouvrir `about:debugging#/runtime/this-firefox`
2. Cliquer **Charger un module complémentaire temporaire**
3. Sélectionner `manifest.json`

## Utilisation

| Action | Comment |
|--------|---------|
| Traduire une image | Clic droit sur l'image → **Traduire cette image** |
| Traduire la page | Clic sur l'icône extension → **Traduire la page** |
| Afficher / Masquer | Icône extension → **Afficher / Masquer** ou `Alt+H` |
| Effacer | Icône extension → **Effacer les traductions** |
| Déplacer un overlay | Glisser la barre de titre de la fenêtre |
| Fermer un overlay | Bouton `×` sur la fenêtre |
| Paramètres | Icône extension → **Paramètres** |

> **Note :** La première traduction télécharge les données OCR anglais (~4 MB depuis le CDN Tesseract). Elles sont ensuite mises en cache dans le navigateur.

## Architecture

```
trad_manga/
├── manifest.json              # Manifest V3 (Chrome + Firefox)
├── background/
│   └── background.js          # Service worker : menus, raccourcis, fetch cross-origin
├── content/
│   ├── content.js             # Overlays flottants + appels traduction
│   └── content.css            # Styles des overlays et notifications
├── ocr/
│   ├── ocr-frame.html         # Iframe extension pour Tesseract.js (context isolé)
│   └── ocr-frame.js           # Worker OCR via postMessage
├── popup/                     # Interface bouton extension
├── options/                   # Page paramètres
├── lib/                       # Tesseract.js (généré par setup.js, non versionné)
├── icons/                     # Icônes SVG source + PNG générés
└── scripts/
    └── setup.js               # Script de setup (copie Tesseract.js, génère icônes)
```

## APIs de traduction supportées

| API | Gratuite | Clé requise | Auto-hébergeable |
|-----|----------|-------------|------------------|
| [MyMemory](https://mymemory.translated.net/) | ✅ (5000 mots/jour) | ❌ | ❌ |
| [LibreTranslate](https://libretranslate.com/) | ✅ (instance propre) | Optionnelle | ✅ |

Configurer LibreTranslate dans **Paramètres → URL du serveur**.

## Roadmap

### v1.1
- [ ] Détection automatique des bulles de manga
- [ ] Mode overlay (texte par-dessus l'image, opacité configurable)
- [ ] Cache des traductions récentes

### v2.0
- [ ] Support japonais (jpn) et coréen (kor)
- [ ] Backend Symfony / Spring Boot
- [ ] Export JSON / PDF traduit

## Licence

MIT
