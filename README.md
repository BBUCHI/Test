# Atlas

## Structure

```
index.html          Page d'accueil, liens vers les outils
wiki.html            L'éditeur de monde (le fichier "principal")
wiki.js               Toute la logique de l'éditeur : état, rendu, édition
style.css             Styles partagés par toutes les pages
core/
  schema.js            Le modèle de données : types d'entités, formulaires,
                        valeurs par défaut. Pur — aucune dépendance au DOM.
  store.js             Lecture/écriture de fichiers JSON locaux (générique).
  github.js            Lecture/écriture d'un fichier via l'API GitHub Contents
                        (générique — ne connaît rien du "monde" d'Atlas).
```

## Pourquoi ce découpage

`core/` ne connaît rien de l'interface — ce sont des fonctions pures ou des
utilitaires I/O génériques. Une future page (frise chronologique, carte…)
peut réutiliser `core/schema.js`, `core/store.js` et `core/github.js` tel
quel, sans dupliquer de logique : elle n'a qu'à écrire sa propre vue
(`timeline.html` + `timeline.js`, par exemple) et importer ce dont elle a
besoin.

`wiki.js` est le seul endroit qui possède l'état mutable (le monde en
mémoire, la fiche affichée, etc.) et qui touche au DOM. C'est volontaire :
ça garde `core/` simple à tester et à réutiliser.

## Développer en local

Les modules ES (`import`/`export`) refusent de se charger en `file://`
(double-clic direct) dans la plupart des navigateurs. Pour tester avant de
pousser sur GitHub Pages, lancer un petit serveur local depuis ce dossier :

```
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000/wiki.html` (ou `index.html`).

## Ajouter une nouvelle page

1. Créer `nom-outil.html` (copier la structure de `wiki.html` : `<link>` vers
   `style.css`, `<script type="module" src="nom-outil.js">`).
2. Créer `nom-outil.js`, avec en haut :
   ```js
   import { TYPE_ORDER, TYPE_META, FORM_SPEC, normalizeWorld, ... } from './core/schema.js';
   import { readJsonFile, downloadJson } from './core/store.js';
   import { getGithubConfig, githubLoadFile, githubSaveFile } from './core/github.js';
   ```
3. Ajouter un lien vers `nom-outil.html` dans `index.html`.

## Modifier le modèle de données (ajouter un champ, un type d'entité…)

Tout se passe dans `core/schema.js` — `FORM_SPEC` pour les champs d'un type,
`ensureRecordDefaults` pour ses valeurs par défaut. Le reste (formulaires,
infobox, page de lecture) s'adapte automatiquement dans `wiki.js`.
