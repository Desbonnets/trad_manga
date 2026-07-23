# User Stories — Manga Translator

Format : `US-XX` — En tant que **[rôle]**, je veux **[besoin]**, afin de **[bénéfice]**.
Chaque story a des critères d'acceptation (CA) vérifiables.

## Épique 1 — Traduire une image ponctuelle

### US-01 — Traduire l'image survolée via le menu contextuel
En tant qu'**utilisateur**, je veux faire un clic droit sur une image de manga et choisir « Traduire cette image », afin d'obtenir sa traduction sans quitter la page.

- CA1 : le menu contextuel « Traduire cette image » apparaît uniquement au clic droit sur une image.
- CA2 : au clic, un indicateur de progression apparaît en bas à droite de la page.
- CA3 : une fois terminé, une fenêtre modale affiche le texte original et sa traduction pour chaque bloc détecté.
- CA4 : une notification de succès indique le nombre de blocs traduits.

### US-02 — Traduire l'image survolée via le raccourci clavier
En tant qu'**utilisateur**, je veux appuyer sur `Alt+T` pendant que ma souris survole une image, afin de la traduire sans ouvrir de menu.

- CA1 : le raccourci ne fonctionne que si une image a été survolée au préalable.
- CA2 : si aucune image n'a été survolée, une notification d'erreur explicite s'affiche.

### US-03 — Être informé si aucun texte n'est détecté
En tant qu'**utilisateur**, je veux être prévenu si l'OCR ne trouve aucun texte dans l'image, afin de comprendre pourquoi aucune traduction ne s'affiche.

- CA1 : une notification d'avertissement « Aucun texte détecté dans l'image » s'affiche, sans fenêtre modale vide.

### US-04 — Être informé si l'image est illisible
En tant qu'**utilisateur**, je veux un message clair si l'extension ne parvient pas à lire l'image (protection anti-hotlink, image non chargée, etc.), afin de savoir que ce n'est pas un blocage silencieux.

- CA1 : si les 3 méthodes de lecture d'image échouent (canvas direct, fetch, capture d'écran), une notification d'erreur précise le message technique.

## Épique 2 — Traduire une page entière

### US-05 — Traduire toutes les images d'une page en un clic
En tant qu'**utilisateur**, je veux cliquer sur « Traduire la page » dans le popup, afin de traduire toutes les images significatives sans les sélectionner une par une.

- CA1 : seules les images de taille ≥ 100×100 px sont prises en compte.
- CA2 : les doublons (même image répétée dans le DOM) ne sont traduits qu'une fois.
- CA3 : une seule fenêtre modale regroupe les résultats de toutes les images, avec un sous-titre « Image N » par groupe.
- CA4 : un seul indicateur de progression est utilisé pour l'ensemble du traitement (pas un par image).

### US-06 — Continuer malgré l'échec d'une image
En tant qu'**utilisateur**, je veux que l'échec de traduction d'une image (image cassée, texte illisible) n'interrompe pas le traitement des autres images de la page, afin d'obtenir un résultat partiel plutôt que rien.

- CA1 : le nombre d'images en échec est comptabilisé et affiché dans la notification finale.
- CA2 : si aucune image de la page ne fournit de texte exploitable, une notification d'avertissement dédiée s'affiche.

### US-07 — Rafraîchir les traductions
En tant qu'**utilisateur**, je veux utiliser le raccourci `Alt+R`, afin d'effacer les traductions existantes et relancer une traduction complète de la page.

- CA1 : les fenêtres modales existantes sont supprimées avant que le nouveau traitement démarre.

## Épique 3 — Gérer l'affichage des traductions

### US-08 — Afficher/masquer les traductions
En tant qu'**utilisateur**, je veux basculer la visibilité des fenêtres de traduction (bouton popup ou `Alt+H`), afin de comparer rapidement la page originale et sa traduction.

- CA1 : l'état de visibilité est partagé entre toutes les fenêtres ouvertes.
- CA2 : une notification confirme l'état (affiché / masqué).

### US-09 — Effacer toutes les traductions
En tant qu'**utilisateur**, je veux un bouton pour effacer toutes les fenêtres de traduction affichées, afin de nettoyer la page.

- CA1 : toutes les fenêtres modales sont retirées du DOM.
- CA2 : une notification confirme l'effacement.

### US-10 — Déplacer une fenêtre de traduction
En tant qu'**utilisateur**, je veux glisser-déposer une fenêtre de traduction par son en-tête, afin de la repositionner sans qu'elle gêne ma lecture.

- CA1 : le glisser-déposer fonctionne à la souris depuis l'en-tête (pas depuis les boutons).
- CA2 : la fenêtre garde sa nouvelle position tant qu'elle n'est pas fermée.

### US-11 — Fermer une fenêtre de traduction individuellement
En tant qu'**utilisateur**, je veux fermer une fenêtre de traduction précise via son bouton « × », afin de ne garder que celles qui m'intéressent.

- CA1 : seule la fenêtre ciblée est retirée ; les autres restent affichées.

## Épique 4 — Configurer l'extension

### US-12 — Choisir la langue source/cible et la langue OCR
En tant qu'**utilisateur**, je veux configurer la langue du texte à reconnaître (OCR) et les langues source/cible de traduction, afin d'adapter l'extension à mes lectures (manga anglais → français, etc.).

- CA1 : les réglages sont persistés (`chrome.storage.local`) et rechargés à l'ouverture de la page des options.
- CA2 : des valeurs par défaut sensées sont appliquées au premier lancement (`eng` / `en` → `fr`).

### US-13 — Choisir le service de traduction
En tant qu'**utilisateur**, je veux choisir parmi Lingva (gratuit), DeepL (avec clé), MyMemory (gratuit) ou LibreTranslate (auto-hébergé), afin d'adapter la qualité/quota à mes besoins.

- CA1 : le champ « clé DeepL » n'apparaît que si DeepL est sélectionné.
- CA2 : le champ « endpoint LibreTranslate » n'apparaît que si LibreTranslate est sélectionné.
- CA3 : si DeepL est choisi sans clé, un avertissement prévient que Lingva sera utilisé en repli.

### US-14 — Personnaliser l'apparence des fenêtres de traduction
En tant qu'**utilisateur**, je veux régler la taille de police, l'opacité, la couleur de fond et la couleur du texte, afin d'adapter la lisibilité à mes préférences.

- CA1 : les aperçus (valeur affichée) se mettent à jour en direct pendant le réglage des curseurs.
- CA2 : les couleurs personnalisées sont appliquées immédiatement aux nouvelles fenêtres de traduction.

### US-15 — Réinitialiser les réglages
En tant qu'**utilisateur**, je veux un bouton « Réinitialiser », afin de revenir aux valeurs par défaut si ma configuration pose problème.

- CA1 : une confirmation est demandée avant la réinitialisation.

## Épique 5 — Résilience du service de traduction

### US-16 — Basculer automatiquement vers un autre service en cas de panne
En tant qu'**utilisateur**, je veux que l'extension essaie automatiquement un autre service de traduction si celui configuré échoue, afin de ne pas être bloqué par une panne ponctuelle.

- CA1 : le service choisi dans les réglages est tenté en premier.
- CA2 : les autres services correctement configurés (clé/endpoint présents) sont essayés ensuite, dans un ordre fixe.
- CA3 : les services non configurés (DeepL sans clé, LibreTranslate sans endpoint) sont ignorés, pas comptés comme échec.

### US-17 — Être averti si tous les services de traduction sont indisponibles
En tant qu'**utilisateur**, je veux un message d'erreur clair si la traduction échoue totalement, afin de comprendre que c'est une panne externe et pas un texte non détecté.

- CA1 : après l'échec de 3 services distincts, l'extension arrête d'essayer et lève une erreur (pas de boucle infinie, pas de texte non traduit affiché silencieusement).
- CA2 : le message d'erreur liste les services qui ont échoué et pourquoi.

### US-25 — Ne pas réessayer un service en panne à chaque bloc/image
En tant qu'**utilisateur**, je veux qu'un service de traduction en panne ne soit plus sollicité pendant un moment après son échec, afin de ne pas perdre de temps à répéter les mêmes requêtes ratées sur chaque bloc de texte ou image d'une page.

- CA1 : un service qui échoue est mis en veille (« cooldown ») pendant 5 minutes ; il n'est plus proposé dans la chaîne de secours tant que ce délai n'est pas écoulé.
- CA2 : si tous les services configurés sont en veille simultanément, l'extension les retente quand même plutôt que d'abandonner sans essayer (mieux vaut retenter un service peut-être rétabli que ne rien proposer).
- CA3 : dès qu'un service répond avec succès, sa mise en veille est levée immédiatement (pas besoin d'attendre la fin des 5 minutes pour qu'il redevienne éligible).

## Épique 6 — Robustesse de la capture d'image

### US-18 — Traduire une image protégée contre le hotlinking
En tant qu'**utilisateur**, je veux que l'extension puisse traduire une image même si le site bloque les requêtes directes (403), afin de lire des scans hébergés sur des CDN protégés.

- CA1 : en cas d'échec du fetch direct, l'extension capture l'image via une capture d'écran du navigateur (contourne la protection réseau).

### US-19 — Traduire une image plus grande que l'écran (webtoon)
En tant qu'**utilisateur**, je veux que l'extension puisse traduire une image très haute (webtoon), afin de ne pas être limité aux images qui tiennent dans la fenêtre.

- CA1 : l'extension défile automatiquement à travers l'image et assemble les captures successives.
- CA2 : la position de défilement initiale de la page est restaurée une fois la capture terminée.

### US-20 — Traduire une image chargée en différé (lazy-load)
En tant qu'**utilisateur**, je veux que l'extension attende qu'une image en chargement différé soit chargée avant de la capturer, afin d'éviter un échec silencieux sur les pages avec lazy-loading.

- CA1 : l'extension attend la fin du chargement de l'image (événement `load`) avant de lire ses dimensions.
- CA2 : si l'image ne charge jamais (timeout), une erreur explicite est renvoyée plutôt qu'une capture vide.

## Épique 7 — Qualité de l'OCR

### US-21 — Ne pas traduire le bruit visuel du dessin
En tant qu'**utilisateur**, je veux que les artefacts graphiques (trames, traits de vitesse) mal reconnus comme texte ne soient pas envoyés à la traduction, afin d'avoir des résultats propres et pertinents.

- CA1 : les fragments très courts (≤ 3 caractères alphanumériques) à faible confiance sont exclus.
- CA2 : les blocs purement symboliques (sans lettre ni chiffre) sont exclus.
- CA3 : le texte réel, même à confiance modérée (police manga stylisée), n'est pas filtré à tort.

### US-22 — Voir la progression de l'OCR
En tant qu'**utilisateur**, je veux voir une barre de progression et un message d'étape (chargement du moteur, téléchargement des données linguistiques, reconnaissance), afin de savoir que le traitement est toujours en cours lors du premier lancement (téléchargement ~4 Mo).

### US-23 — Regrouper les lignes d'une même bulle avant traduction
En tant qu'**utilisateur**, je veux que les lignes successives d'une même bulle de dialogue soient traduites comme une seule phrase, afin de ne pas perdre le sens du texte (traduire chaque ligne isolément produit un charabia).

- CA1 : des blocs de texte verticalement proches et horizontalement alignés (même colonne) sont fusionnés en un seul bloc avant traduction.
- CA2 : un bloc de texte éloigné ou dans une autre colonne (ex. un panneau dans le décor) n'est pas fusionné avec une bulle de dialogue.
- CA3 : la confiance du bloc fusionné reflète la moyenne des lignes qui le composent.

### US-24 — Détecter le texte incliné (analyse approfondie)
En tant qu'**utilisateur**, je veux pouvoir activer une « analyse approfondie » dans les réglages, afin que l'extension détecte aussi le texte incliné (panneaux, onomatopées en perspective) que l'OCR standard rate.

- CA1 : l'option est désactivée par défaut (elle multiplie le temps de traitement par 2 à 3).
- CA2 : quand elle est activée, l'image est aussi analysée pivotée (±25°), et les résultats des différentes passes sont fusionnés en un seul jeu de blocs.
- CA3 : un texte retrouvé à l'identique dans plusieurs passes n'apparaît qu'une fois (on garde la lecture la plus confiante) ; un texte trouvé dans une seule passe (ex. le panneau incliné) est conservé.
- CA4 : l'indicateur de progression affiche quelle passe est en cours (ex. « Passe 2/3 »).

> **Limite connue** : la détection reste heuristique (angles fixes ±25°, pas de détection automatique de l'angle réel) et une erreur de lecture de caractères sur une police stylisée (ex. « IS » lu « /5 ») n'est pas corrigée par cette fonctionnalité — c'est une limite du moteur Tesseract, pas un manque de détection de zone.
