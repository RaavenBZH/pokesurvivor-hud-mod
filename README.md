# PokéSurvivor HUD mod

Mod d'interface pour [PokéSurvivor](https://pokesurvivor.com) : barres de vie
repositionnées, alerte de vie basse, flèches de repérage autour du joueur et
panneau des passifs de la run.

> **Mod non officiel.** Aucune affiliation avec l'auteur du jeu, ni avec
> Nintendo. La seule adresse officielle du jeu est https://pokesurvivor.com.
> Usage **non commercial** uniquement — voir [LICENSE](LICENSE).

**Le jeu n'est pas modifié** : le mod regarde ce qu'il dessine, en retire
quelques éléments et ajoute les siens par-dessus. Il ne demande aucune
permission, n'envoie rien sur le réseau, ne touche ni aux sauvegardes ni aux
serveurs du jeu.

Détails techniques : [TECHNIQUE.md](TECHNIQUE.md).

---

## 1. Installer

**Rien à installer d'autre que le navigateur.** Pas de `npm install`, pas de
`package.json`, pas de dépendance, aucune étape de compilation : le mod est du
JavaScript que Chrome lit directement. Node.js ne sert qu'à lancer les tests si
tu touches au code (§5).

Chrome, Edge, Brave, Opera — tout navigateur basé sur Chromium.

**1.** Récupère le mod, au choix :
- le `.zip` de la [dernière version](../../releases/latest), **dézippé** ;
- ou `git clone https://github.com/RaavenBZH/pokesurvivor-hud-mod`.

Le dossier doit **rester** à sa place : Chrome le relit à chaque démarrage.

**2.** Ouvre `chrome://extensions` et active **« Mode développeur »** (en haut
à droite).

**3.** Clique **« Charger l'extension non empaquetée »** et choisis le dossier
qui contient `manifest.json`.

**4.** Ouvre https://pokesurvivor.com **dans un onglet normal** et lance une
partie.

> Chrome affichera un bandeau « Désactiver les extensions en mode développeur »
> à chaque démarrage. C'est normal pour une extension chargée hors du Web Store,
> et il n'y a pas d'autre voie : Chrome bloque l'installation d'un `.crx` hors
> de son Store, et le passage par le Store demande un compte développeur payant.

### Vérifier que c'est chargé

En jeu, `F12` → onglet Console :

```
[psx] hud-mod 0.6.0 installé — barres de vie en bas au centre
[psx] stats-mod 0.6.0 installé — panneau des passifs (F2 pour masquer)
```

Ou tape `__psx` dans la console : tu dois voir
`{painting: false, hud: "0.6.0", stats: "0.6.0"}`.

| Console | Cause | Remède |
|---|---|---|
| les deux lignes, et le HUD a changé | tout va bien | — |
| les deux lignes **+** `Aucun appel de dessin observé` | le mod ne tourne pas dans le monde de la page | vérifie `"world": "MAIN"` dans `manifest.json` |
| **rien du tout** | l'extension n'est pas active sur cette page | vérifie qu'elle est activée dans `chrome://extensions`, et que tu es bien sur `pokesurvivor.com` dans un **onglet** |

> **Pas depuis l'application installée.** Le jeu s'installe comme application
> (PWA) ; dans une fenêtre d'application autonome, les extensions n'injectent
> pas de façon fiable. Joue dans un onglet.

### Note sur Tampermonkey
Les versions ≤ 0.3.2 proposaient aussi un userscript. **Abandonné en 0.6.0** :
depuis Chrome 120, Tampermonkey exige de toute façon le mode développeur, et il
n'obéit pas toujours à `@inject-into page` — or ce mod n'a aucun sens hors du
monde de la page. L'extension ne coûte donc pas plus cher et ne laisse aucune
incertitude. Si tu avais installé le userscript, **supprime-le** de Tampermonkey
(son URL de mise à jour ne répond plus).

---

## 2. Ce que ça change en jeu

| | Jeu d'origine | Avec l'extension |
|---|---|---|
| Ma barre de vie | en haut à gauche, rouge fixe | **en bas au centre**, juste au-dessus des attaques, **dégradé vert → rouge** |
| Barres des alliés (cooperatif) | liste en haut à gauche | **empilées au-dessus de la mienne**, en bas au centre |
| Vie basse | rien | **contour rouge dégradé** sur les bords sous 20 %, qui s'intensifie et pulse plus vite à mesure que la vie descend |
| Flèches vers ce qui est hors écran | plaquées contre le bord | **en anneau autour de ton Pokémon** |
| Passifs de la run (dégâts, vitesse…) | invisibles | **panneau en haut à gauche** |
| Attaque / Att. Spé., défenses, dégâts par seconde | seulement dans la pause | **dans le panneau, en partie** |
| Nom, niveau, chrono, XP, buffs, boss, attaques | — | inchangés |

**Couleur de ma barre** selon la vie restante :

| Vie | 100 % | 75 % | 50 % | 30 % | 20 % | 5 % |
|---|---|---|---|---|---|---|
| Couleur | vert | vert-jaune | jaune | orange | orange-rouge | rouge |

**Flèches reprises** (les cinq que le jeu possède) : shinies hors écran, grieta,
coéquipiers hors de vue, Pokémon perdu et voleurs, et Arceus pendant la
Sentencia. Chaque flèche garde son dessin, sa couleur, son icône et son
étiquette — seul son point d'ancrage change.

### Le panneau

En haut à gauche, pendant la partie, en trois blocs :

```
  PASSIFS
  Vie max.       +120
  Dégâts        ×1.45
  Vitesse       ×1.24
  Cadence       ×1.10
  Armure         26 %
  Régén.        1.3/s
  Aimant        ×1.24
  XP            ×1.30

  STATS · il y a 2 min
  Attaque       ×2,41
  Att. Spé.     ×1,18
  Défense          40
  Déf. Spé.        50
  Critique        9 %

  DÉGÂTS / s
  Flammèche     412/s
  Rayo Burbuja   96/s
```

**PASSIFS** suit en direct ce que la run a amélioré (voir plus bas).

**STATS** montre les statistiques que le jeu a ajoutées le 18-10-2026 : Attaque
et Attaque Spéciale séparées — chaque mouvement est désormais physique ou
spécial, et taper du mauvais côté coûte cher — puis les deux défenses et le taux
de critique. **Le côté fort est mis en couleur** : c'est lui qui décide quels
mouvements valent le coup.

**DÉGÂTS / s** donne les dégâts par seconde de chacune de tes attaques, soit
laquelle porte réellement ta run.

> Ces deux derniers blocs viennent du **résumé de la pause** : le jeu les
> calcule, l'extension les lit là. Ils ne se rafraîchissent donc qu'à chaque
> ouverture de la pause (`Échap`), et le panneau affiche l'âge de la mesure —
> grisée au-delà de 3 minutes. Avant la première pause, il affiche
> « Ouvre la pause ».
>
> Pourquoi pas en direct ? Ces valeurs viennent des données d'espèce des
> 966 Pokémon : le jeu ne les dessine jamais en partie et ne les sert pas à
> part. Les recopier dans l'extension aurait créé une dette qui se périme à
> chaque rééquilibrage. Les lire là où le jeu les affiche lui-même, c'est zéro
> duplication et zéro dérive.

- La valeur est le **total** : améliorations achetées en boutique **plus** cartes
  prises dans la run.
- **Couleur** : doré quand la run a amélioré ce passif, **bleu clair quand il est
  au plafond** (inutile d'en reprendre), gris quand la run n'y a pas touché.
- **Cadence** est l'inverse de la recharge : `×1.10` = tu attaques 10 % plus
  souvent. Le jeu raisonne en « −8 % de recharge », ce qui se lit à l'envers des
  autres lignes — d'où l'inversion.
- **Armure** est la réduction des dégâts subis, plafonnée à 70 % par le jeu.

### Les plafonds

Le jeu limite le nombre de fois qu'une carte peut être prise — mais **pas pour
tous les passifs** :

| Passif | Plafond de prises | Effet au plafond |
|---|---|---|
| Dégâts | 40 | ×45 |
| Cadence | 10 | ×2,30 |
| Armure | 12 **et** 70 % d'effet | 70 % |
| Vitesse | 8 | ×1,72 |
| XP | 8 | ×2,48 |
| Aimant | 6 | ×4,83 |
| **Vie max.** | **aucun** | — |
| **Régén.** | **aucun** | — |

L'armure est le seul cas à deux plafonds : si tu as acheté les 8 niveaux de
boutique (+16 %), les 70 % tombent dès la **9ᵉ** prise et les trois suivantes ne
servent plus à rien. Le panneau le signale en passant la ligne en bleu clair.

À part ça, la cadence a un plancher : la recharge réelle d'un mouvement ne
descend jamais sous 0,12 s, donc les dernières prises rapportent moins sur les
attaques déjà rapides.

`counts: true` dans `src/ui/stats-mod.js` ajoute le détail « prises / plafond »
(`2/40`) à droite de chaque ligne, si tu veux suivre ça de près.

**`F2` affiche / masque le panneau.** Cette touche n'est pas utilisée par le jeu.

### Ce qui n'est pas possible
Il n'y a **pas** de flèche vers les boss ordinaires (pseudo-légendaires,
Slaking…), et je ne peux pas en créer une : le jeu ne les signale que par la
barre de vie en haut de l'écran, et un boss hors écran n'est pas dessiné — sa
position est donc inconnue de l'extension. Le seul « boss » fléché est Arceus.

---

## 3. Régler à ton goût

Tout est en haut de `src/ui/hud-mod.js`, dans le bloc `CFG` :

```js
const CFG = {
  lowHp: 0.20,        // seuil du contour rouge (0.20 = 20 % de vie)
  barW: 320,          // largeur de ma barre, en px
  barH: 15,           // hauteur de ma barre
  allyH: 9,           // hauteur des barres alliées
  gapAbove: 14,       // écart entre ma barre et le haut des attaques
  showNumbers: true,  // "123 / 456" au centre de ma barre
  vignette: true,     // contour rouge quand la vie est basse
  arrows: true,       // flèches autour du joueur
  ringR: 120,         // rayon de l'anneau des flèches, en px
  lead: 420           // correction de direction des flèches (ne pas toucher)
};
```

Et dans `src/ui/stats-mod.js`, pour le panneau des passifs :

```js
const CFG = {
  show: true,         // panneau visible au démarrage
  toggleKey: 'F2',    // touche d'affichage / masquage
  x: 18, y: 80,       // coin haut-gauche, en px
  w: 150,             // largeur
  row: 15,            // hauteur d'une ligne
  counts: false,      // true pour ajouter « 3/8 » (prises / plafond)
  passifs: true,      // bloc PASSIFS
  stats: true,        // bloc STATS (résumé de pause)
  degats: true        // bloc DÉGÂTS / s (résumé de pause)
};
```

Quelques exemples :
- **barre plus haute** : `gapAbove: 60`
- **pas de chiffres** sur la barre : `showNumbers: false`
- **alerte plus tôt** (sous 35 % de vie) : `lowHp: 0.35`
- **flèches plus écartées** du Pokémon : `ringR: 170`
- **panneau des passifs ailleurs** : `x: 18, y: 420` (plus bas à gauche)
- **panneau avec les compteurs de prises** : `counts: true`
- **revenir au comportement d'origine** pour une seule fonction :
  `vignette: false` ou `arrows: false`

Après chaque modification, applique-la : voir §4.

---

## 4. Mettre à jour

### a) Recevoir les nouvelles versions du mod
Retélécharge le zip de la [dernière version](../../releases/latest) et remplace
le dossier — ou `git pull` si tu as cloné. Puis **↻** sur la carte du mod dans
`chrome://extensions`, et recharge la page du jeu.

### b-bis) Après avoir modifié le code toi-même
1. `chrome://extensions` → bouton **↻** sur la carte du mod.
2. Recharge la page du jeu (`Ctrl+R` / `Cmd+R`).

Et relance les tests :
```
node test/hud-mod.test.js      # barres de vie et flèches
node test/stats-mod.test.js    # panneau des passifs
node tools/build.js            # refait dist/ (zip + userscript)
node test/dist.test.js         # teste l'artéfact publié
```

### b) Quand le jeu se met à jour tout seul
Le jeu vérifie sa version toutes les 5 minutes et recharge la page quand une
nouvelle sort (parfois en coupant la partie en cours, si l'auteur l'a marquée
obligatoire). **Tu n'as rien à faire** : les extensions Chrome se réinjectent à
chaque chargement de page, donc le mod revient tout seul.

### c) Quand le jeu change son HUD

> Cette partie ne concerne que **la maintenance du mod** : elle demande un
> clone du jeu et un terminal. En simple utilisateur, tu n'as rien à faire —
> au pire le mod se met en retrait tout seul, et une version corrigée arrivera
> par la mise à jour automatique. Tu peux [ouvrir une issue](../../issues) pour
> le signaler.

L'extension reconnaît les éléments du HUD à leurs **coordonnées exactes**, qui
sont des constantes du code du jeu. Si l'auteur refond son HUD, ces repères
disparaissent.

**Ce que tu verras alors** : la barre de vie **revient en haut à gauche** et/ou
les flèches **retournent au bord de l'écran**. C'est voulu — l'extension rend la
main plutôt que de dessiner n'importe où. Le jeu reste parfaitement jouable.

**Diagnostic** : il faut un clone du jeu
(`git clone https://github.com/JPTER78/pokesurvivor`), puis :
```
cd pokesurvivor && git pull && cd -
node tools/verif-signatures.js ../pokesurvivor
```
(Sans argument, le script cherche un clone voisin du dépôt du mod.)
Le script relit les sources du jeu, en réextrait les **54 repères** (coordonnées
du HUD, marges des flèches, et les tables d'équilibrage que le panneau des
passifs est obligé de dupliquer) et les compare à ceux de l'extension. Il
affiche soit :

```
Tout concorde : l’extension est à jour.
```

soit la liste de ce qui a bougé, par exemple :

```
  DIFF MY.y          jeu    43   extension    37
  MANQUE M= 30  +60 / -70   js/ui/hud.js
  EN TROP M= 34  +60 / -70   (plus dans le jeu)
```

**Correction** : reporte les valeurs de la colonne « jeu » là où le script
l'indique —
`src/ui/hud-mod.js` pour les constantes `MY` / `ALLY` / `SLOT` et le tableau
`ARROWS` (tous en haut du fichier), `src/ui/stats-mod.js` pour les tables `SHOP`
et `RUN` des passifs. Puis relance les tests, recharge l'extension (§4a) et
vérifie à l'œil en partie.

C'est aussi ce script qui protège le panneau des passifs : comme le jeu
n'affiche ces valeurs nulle part, l'extension les **recalcule** avec les formules
d'équilibrage du jeu. Si l'auteur rééquilibre une amélioration, rien ne casse
visiblement — les chiffres deviennent simplement faux, en silence. Le script est
le seul moyen de s'en apercevoir.

Le script ne modifie rien et ne devine rien : il dit seulement quoi corriger et
où.

### d) Vérification de routine
Rien n'oblige à vérifier régulièrement : le jour où le HUD change, ça se voit
tout de suite (la barre remonte en haut à gauche). Le script est là pour ce
jour-là.

---

## 5. Modifier le code

Toujours aucune installation. Il faut seulement **Node.js** (n'importe quelle
version récente) pour lancer les tests :

```
node test/hud-mod.test.js      # barres de vie et flèches
node test/stats-mod.test.js    # panneau des passifs
node test/package.test.js      # manifeste, cohabitation des modules, zip
```

Et, pour fabriquer le zip d'une release :

```
node tools/build.js            # vérifie le manifeste, lance tout, empaquette
```

Les scripts n'utilisent que `fs`, `path` et `child_process`, natifs à Node. La
seule exigence hors Node est le binaire système **`zip`** (fourni avec macOS et
Linux), et uniquement pour publier — jamais pour utiliser le mod. `unzip` sert
à inspecter le paquet dans les tests, et son absence est simplement signalée.

Pour contrôler que le mod est toujours aligné sur le jeu, il faut en plus un
clone du jeu — voir §4c.

## 6. En cas de problème

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| Rien ne change en jeu | mod pas chargé | Console : les deux lignes `[psx] … installé` sont-elles là ? Sinon vérifie que tu as choisi le dossier contenant `manifest.json`, et que l'extension est activée |
| Chrome a désactivé l'extension au démarrage | bandeau « extensions en mode développeur » | Réactive-la depuis le bandeau ou `chrome://extensions` |
| Rien ne change, mais la console est vide | tu joues peut-être dans l'application installée (PWA) | Ouvre le jeu dans un onglet normal |
| La barre est revenue en haut à gauche | le jeu a changé son HUD | §4c |
| `[psx] hud-mod désarmé : …` en console | 30 erreurs d'affilée, le module s'est coupé | Note le message et relance `node tools/verif-signatures.js` puis `node test/hud-mod.test.js` |
| Les flèches restent au bord | `arrows: false`, ou les marges ont changé | §3, puis §4c |
| Pas de panneau | masqué (`F2`), ou `show: false` | Appuie sur `F2` en partie |
| STATS et DÉGÂTS disent « Ouvre la pause » | aucun instantané encore pris | Appuie une fois sur `Échap` en partie |
| STATS grisées | instantané de plus de 3 min | Rouvre la pause pour rafraîchir |
| `Aucun appel de dessin observé sur #game` | le mod tourne hors du monde de la page | `manifest.json` doit déclarer `"world": "MAIN"` |
| Les passifs affichent des valeurs douteuses | le jeu a été rééquilibré | §4c — c'est exactement ce que le script détecte |
| Les passifs partent d'une base fausse | achat en boutique pas encore enregistré | Reviens au menu puis relance une partie |
| Le jeu rame | peu probable (le surcoût est de l'ordre de la fraction de milliseconde) | Active l'affichage des FPS dans les **Ajustes** du jeu et compare extension activée / désactivée |
| Je veux tout désactiver d'un coup | — | Interrupteur sur la carte du mod dans `chrome://extensions`, puis recharge la page |

**Garantie de non-casse** : l'extension n'écrit jamais dans le jeu, ne touche ni
aux sauvegardes ni au réseau. Au moindre doute elle se désarme et le HUD
d'origine réapparaît intact. Désactiver l'extension suffit toujours à retrouver
le jeu d'origine.

---

## 7. Limites assumées

- **Centre de l'anneau** = centre de la caméra, pas la position exacte du
  sprite. Le jeu amortit la caméra vers le joueur, donc ton Pokémon s'en écarte
  d'environ 20 px quand tu cours. Sur un anneau de 120 px, ça ne se voit pas.
- **Direction des flèches** : estimation à ~4° près au pire. Les entités hors
  écran ne sont pas dessinées, leur position exacte n'existe nulle part dans ce
  que l'extension peut observer. Le quadrant est toujours juste.
- **Cooperatif** : le code des barres alliées est validé en simulation, mais je
  ne l'ai pas vu tourner dans une vraie partie à plusieurs. Sur la première
  frame d'une partie en groupe, le nom d'un allié peut clignoter une fois.
- **Panneau des passifs** : les valeurs sont **reconstituées**, pas lues dans le
  jeu (il ne les affiche nulle part et son code est obfusqué). La base vient de
  la sauvegarde recopiée en localStorage, les gains viennent des cartes
  observées. Deux conséquences : une amélioration achetée en boutique mais pas
  encore enregistrée n'est pas comptée (reviens au menu et relance une partie),
  et un rééquilibrage du jeu fausserait les chiffres sans rien casser — d'où le
  script de vérification (§4c).
- **Les objets ramassés en jeu** (qui donnent aussi des effets) ne sont pas
  comptés dans le bloc PASSIFS : seules les cartes de niveau le sont. Ils sont
  en revanche inclus dans le bloc STATS, puisque le jeu les y intègre.
- **STATS et DÉGÂTS / s** sont un instantané de la dernière pause, pas du
  direct — pour la raison expliquée en §2.

---

## 8. Licence et limites d'usage

Ce mod est une **œuvre dérivée** de PokéSurvivor : il reprend les coordonnées de
son interface et ses tables d'équilibrage. Il est donc distribué sous la même
licence, **PolyForm Noncommercial 1.0.0** :

- **autorisé** : utiliser, étudier, modifier, redistribuer — usage non commercial ;
- **interdit** : vendre, faire payer, mettre de la publicité, monétiser ;
- **obligatoire** si tu redistribues : joindre les termes (ou leur URL) et la
  ligne `Required Notice: Copyright 2026 JPTER78`.

Détail dans [LICENSE](LICENSE) et [LICENSE-NONCOMMERCIAL.md](LICENSE-NONCOMMERCIAL.md).

Ce mod ne contient **aucune ressource** du jeu ni de Nintendo : uniquement du
code. Il ne joue pas à ta place, n'automatise rien et n'écrit rien sur les
serveurs du jeu — en particulier, il ne touche pas au classement.

## 9. Signaler un problème

[Ouvrir une issue](../../issues). Précise la version du mod, le format
(userscript ou extension), ton navigateur, et ce que dit la console (`F12`).

Et si l'auteur du jeu souhaite que ce mod cesse d'exister, il suffit qu'il le
demande dans une issue : ce dépôt disparaîtra.
