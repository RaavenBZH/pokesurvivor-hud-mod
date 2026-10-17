# Notes techniques

Guide d'utilisation : [README.md](README.md).

## Principe

Extension Chrome MV3, deux content scripts, tous deux dans le **monde de la
page** (`world: "MAIN"`, `document_start`) :

| Module | Rôle | Sources de données |
|---|---|---|
| `src/ui/hud-mod.js` | barres de vie, flèches de repérage | interception du canvas |
| `src/ui/stats-mod.js` | panneau des passifs | DOM + localStorage |

Ils partagent un seul drapeau, `window.__psx.painting` : chacun dessine sur le
canvas du jeu, et aucun des deux ne doit voir passer les appels de l'autre dans
ses sondes. Le premier chargé crée l'objet.

## hud-mod.js — interception du canvas

Le HUD en partie est dessiné **dans le `<canvas>`** (`js/ui/hud.js`), donc hors
d'atteinte du CSS. Ce module tourne dans le **monde de la page**
(`world: "MAIN"`) à `document_start` — avant `app.min.js`, chargé en `defer` —
et enveloppe quelques méthodes de `CanvasRenderingContext2D.prototype` :

| Méthode | Rôle |
|---|---|
| `beginPath`, `moveTo`, `lineTo`, `arcTo`, `rect`, `arc`, `ellipse` | suivi de la boîte englobante du chemin courant (les barres passent par le helper `roundRect()` du jeu, en `arcTo`, pas par le `roundRect` natif) |
| `fill`, `fillRect` | reconnaître et supprimer les barres d'origine ; mesurer la rangée d'attaques ; mettre de côté le halo d'une flèche |
| `fillText` | relire les chiffres de vie et les noms d'alliés, puis les supprimer |
| `translate`, `restore` | délimiter les blocs de flèche |
| `clearRect` | frontière de frame |
| `requestAnimationFrame` (sur `window`) | dessiner nos ajouts **après** la frame complète du jeu : pas de problème d'ordre, rien à réimplémenter |

Deux passes de rendu à distinguer, via `getTransform()` :
`a ≈ dpr` → passe **écran** (px CSS, le HUD) ; `a ≈ dpr × scale` avec une
translation → passe **monde**. L'extension ne touche jamais à la passe monde.

Les constantes reprises du jeu sont listées ci-dessous, avec leur fichier et
leur ligne d'origine ; `tools/verif-signatures.js` les revérifie face aux
sources.

## Signatures du HUD d'origine

Ce sont des constantes du code du jeu, regroupées en haut de `hud-mod.js` :

```
px = 16, py = 20
ma barre      bar(ctx, px+48, py+17, 168, 11)   → (64, 37, 168, 11)
mes chiffres  fillText("h / m", 148, 46), centré
barre alliée  bar(ctx, px+78, y+1, 110, 8)      → x = 94, hauteur 8
nom allié     fillText(nom, 16, y+9), aligné à gauche
"CAÍDO"       fillText("CAÍDO", 210, y+9)
attaques      roundRect(x, y, 54, 54, 12)
```

Les cinq sites de flèche de bord, chacun avec sa marge `M` :

| M | Cible | Source | Bornes verticales | Halo avant la pointe |
|---|---|---|---|---|
| 34 | shinies hors écran | `js/ui/hud.js:119` | `M+60`, `h-M-70` | — |
| 42 | coéquipiers hors vue | `js/ui/hud.js:428` | `M+70`, `h-M-80` | cercle noir r=17 |
| 44 | Pokémon perdu, voleurs | `js/systems/events.js:327` | idem | — |
| 46 | Arceus (Sentencia) | `js/systems/judgment.js:633` | idem | halo r≈26–32 |
| 52 | grieta | `js/ui/hud.js:160` | idem | halo r≈30–38 |

Tous suivent le même patron : `ctx.translate(ex, ey)` avec
`ex = clamp(sx, M, w-M)` et `ey = clamp(sy, haut, bas)`.

Dégagement vertical : le jeu écrit le nom du mouvement **actif** au-dessus de sa
case (`fillText(m.name, x + S/2, y - 7)`, police 10 px), et cette case est
elle-même remontée de 6 px. D'où la constante `SLOT_LABEL = 18`, sans laquelle
notre barre chevauche ce nom.

`tools/verif-signatures.js` réextrait ces valeurs des sources du jeu et les
compare à celles de l'extension (voir README §4c).

## Relocalisation des flèches

Chaque flèche est un bloc `save() … translate(ex, ey) … restore()` : tout ce qui
suit le `translate` (triangle, icône, étiquette) est en coordonnées locales. Un
seul **translate correctif** déplace donc le bloc entier, intact.

La difficulté : la direction n'est connue qu'au premier `moveTo` (le jeu y écrit
la pointe en `cos/sin` de l'angle), c'est-à-dire **après** le `translate`. D'où :

1. on laisse le `translate` d'origine s'appliquer ;
2. les halos circulaires dessinés avant la pointe sont **mis de côté** (leur
   `fill` est supprimé, avec rayon, couleur et alpha) ;
3. au premier `moveTo` de rayon 14–70 px, on calcule la direction, on applique
   le translate correctif, et on **rejoue les halos** au nouvel endroit — dans
   le même ordre, pour conserver la superposition ;
4. `restore()` clôt le bloc.

**Relèvement.** Le point de bord seul est biaisé : le clamp écrase la composante
hors écran, donc une cible très à gauche et un peu en haut semble beaucoup plus
haute qu'elle ne l'est. La pointe, elle, pointe vers la vraie cible. On prolonge
donc le point de bord de `CFG.lead` px dans cette direction avant de prendre
l'angle :

| Cible (écran 1280×720) | Vrai | Point de bord seul | Corrigé |
|---|---|---|---|
| loin à gauche, un peu en haut | 190° | 203° (13,6°) | 194° (4,6°) |
| diagonale haut-gauche | 212° | 204° (8,2°) | 209° (3,2°) |
| loin à droite | 355° | 345° (9,6°) | 351° (3,7°) |
| plein haut | 270° | 270° (0°) | 270° (0°) |

## stats-mod.js — reconstitution des passifs

Les passifs (`pl.atkMul`, `pl.cdMul`, `pl.dmgReduce`…) vivent dans l'objet
joueur, enfermé dans l'IIFE obfusquée : `window.G` n'existe pas en production.
Et **le HUD ne les dessine nulle part** — il n'y a donc rien à intercepter. Ils
sont reconstitués à partir de deux sources exactes :

**1. La base — les améliorations achetées en boutique.**
`commit()` dans `js/core/db.js` recopie la sauvegarde dans `localStorage`, en
JSON non compressé (`fold()` ne compresse rien) :
- mode nuage : `ps.cloud.<uid>`
- mode local : `ps.save.<clé>`

On y lit `save.partner` (le Pokémon actif) et `save.pupg[dex]` (ses niveaux
achetés — les améliorations sont par Pokémon), puis on applique les formules de
`G.Upgrades.perks()`. Plusieurs sauvegardes possibles : on prend la plus grande
`updated`. Niveaux bornés comme le fait le jeu (« une partie éditée à la main ne
donne pas plus de pouvoir »).

**2. Les gains de la run — les cartes de niveau prises.**
Les cartes sont du DOM (`#cards .card`). On observe le clic (en capture) et les
touches `Digit1-3` / `Numpad1-3` quand `#scr-levelup` est visible, puis on lit la
carte choisie.

Identification d'une carte : **titre exact** (espagnol ou anglais) **et** nombre
attendu dans la description. Les nombres sont identiques dans les deux langues
(`js/data/lang-en.js` ne traduit que le texte), et aucun des 64 mouvements du jeu
ne porte un de ces huit titres — donc pas de confusion avec une carte
« nouveau mouvement », « amélioration » ou « évolution ». Le titre est extrait
des seuls nœuds texte de `.nm`, pour exclure le `<span class="tag-chip">`.

Double comptage : un drapeau `picked`, remis à zéro par un `MutationObserver` sur
`#cards` — les cartes sont reconstruites à chaque montée de niveau et à chaque
changement d'options (`R`), ce qui marque exactement une nouvelle décision. En
cooperatif l'écran reste ouvert après le choix sans reconstruire les cartes,
donc le drapeau tient.

Règles de cumul, copiées de `js/systems/levelup.js` :

| Passif | Effet par prise | Cumul | Plafond de prises |
|---|---|---|---|
| Vie max. (`hp`) | +20 | additif | **aucun** |
| Dégâts (`atk`) | ×1.10 | **multiplicatif** | 40 |
| Vitesse (`spd`) | ×1.07 | multiplicatif | 8 |
| Recharge (`cd`) | ×0.92 | multiplicatif | 10 |
| Armure (`def`) | +0.06 | additif, effet plafonné à 0.70 | 12 |
| Régén. (`rgn`) | +0.9/s | additif | **aucun** |
| Aimant (`mag`) | ×1.30 | multiplicatif | 6 |
| XP (`xp`) | ×1.12 | multiplicatif | 8 |

La ligne « Cadence » affiche `1 / cdMul` : le jeu raisonne en recharge (plus bas
= plus rapide), ce qui se lit à l'envers des autres lignes.

`isMaxed()` traite deux plafonds distincts : le nombre de prises (`max`) et,
pour l'armure seule, l'effet borné à 70 % (`capAt`), que le jeu applique dans
`Math.min(0.7, …)`. Avec les 8 niveaux de boutique (+16 %) ce second plafond
tombe dès la 9ᵉ prise, avant celui des 12 prises.

Le plafond de prises est-il contournable ? Non. `levelup.js` propose hors
`room()` une stat réclamée par une évolution — mais seulement quand son compteur
vaut 0 (`ev.ready = !!statsTaken[needs]`), cas où `room()` passe de toute façon.
Noter que le commentaire de l'auteur dit « Cada mejora tiene un tope de veces »,
alors que le code n'en met ni sur `hp` ni sur `rgn`.

Détection de partie, sans toucher au canvas : la barre du haut est masquée
(`G.UI.chrome(false)` au démarrage de la run) et aucun écran hors-partie n'est
ouvert. Les écrans de run (niveau, pause, objet, vínculo, résumé) ne coupent pas
l'affichage. Le passage hors-partie → partie remet les compteurs à zéro et
relit la base.

**Dette assumée** : ce module duplique deux tables d'équilibrage du jeu. Un
rééquilibrage de l'auteur ne casserait rien visiblement — les chiffres
deviendraient faux en silence. C'est pourquoi `tools/verif-signatures.js`
revérifie aussi ces tables face aux sources.

## Garde-fous

- **La sonde n'altère rien** : chaque enveloppe se termine par l'appel d'origine.
  Les seules suppressions sont les quatre éléments que l'on redessine.
- **Filtrage sur `#game`** dès l'entrée de chaque enveloppe : le jeu crée
  d'autres canvas (sprites de menus, variante blanche du flash de dégât).
- **Drapeau `painting`** : nos propres appels de dessin ne repassent pas dans
  les sondes.
- **FAILSAFE** : 1,5 s sans voir la barre d'origine → le module rend la main,
  le HUD du jeu réapparaît intact.
- **30 erreurs** → désarmement complet et un avertissement unique en console.
- **Faux positif de flèche** : un bloc qui ressemble à une flèche sans en être
  une (pas de pointe reconnue avant son `restore()`) est rendu **exactement**
  comme le jeu le voulait, halos compris. Il ne se voit donc pas.
- Une frame de retard sur la mesure de la rangée d'attaques (elle est dessinée
  en dernier), invisible à l'œil. Repli sur le calcul du jeu (`h - 54 - 18`) si
  la mesure manque.

## Tests

```
node test/hud-mod.test.js        # barres de vie et flèches
node test/stats-mod.test.js      # panneau des passifs
node test/package.test.js        # manifeste, cohabitation, DOM vide, chien de garde, zip
node tools/verif-signatures.js   # 54 repères, face aux sources du jeu
```
178 contrôles au total, plus les 54 repères.

`test/hud-mod.test.js` implante un faux `CanvasRenderingContext2D` **avec pile
de transformations** (c'est indispensable : dans un bloc de flèche la matrice
n'est plus à l'origine), rejoue les séquences de dessin réelles de `hud.js`,
`events.js` et `judgment.js`, et enregistre l'origine effective de chaque appel.

Couverture : appels supprimés, valeurs captées (vie, fraction, alliés, K.O.),
position de la barre au-dessus des attaques, vignette au bon seuil et absente
au-dessus, barre à 0 %, flèches relocalisées sur l'anneau (shiny à gauche, shiny
en haut, grieta à droite avec halo et étiquette), ordre halo/triangles,
direction conservée, rien laissé au point de bord, faux positif inoffensif,
passe monde intacte, rien dessiné hors partie.

`test/stats-mod.test.js` implante un faux `localStorage` et un faux DOM, et
couvre : identification des 8 cartes en espagnol **et** en anglais, rejet des
cartes qui n'en sont pas (soin instantané, mouvement, évolution, amélioration de
mouvement portant un `%`, titre juste avec un nombre faux), lecture de la base
(chaque formule de boutique vérifiée au chiffre près, niveaux hors bornes,
sauvegarde la plus récente, JSON illisible, sauvegarde sans partenaire), cumul
multiplicatif et additif, plafond d'armure à 70 %, combinaison base + run, les
8 plafonds de prises, et les 8 états de la détection de partie.

Les valeurs attendues y sont calculées à la main depuis les sources du jeu, pas
reprises du module : un chiffre faux dans l'extension fait échouer le test.

Ce que les tests **ne** couvrent pas : le rendu réel à l'écran, le cooperatif en
vraie partie à plusieurs, et les effets des objets ramassés en jeu (non comptés
dans le panneau).

## L'invariant : le monde de la page

C'est la contrainte dont tout dépend, et celle qui a coûté le plus cher à
diagnostiquer.

Le mod remplace des méthodes de `CanvasRenderingContext2D.prototype`. Or **un
monde isolé possède ses propres copies des prototypes natifs**. Exécuté hors du
monde de la page, le mod patche donc des objets que le jeu n'utilise jamais : il
ne fait rien, ne lève aucune erreur, et `window.__psx` n'est même pas visible
depuis la console de la page — puisque ce n'est pas le même `window`.

Trois protections, parce qu'un échec silencieux ne se corrige pas :

1. `manifest.json` déclare `"world": "MAIN"`.
2. `tools/build.js` **refuse de produire un paquet** si cette déclaration
   manque, de même pour `document_start`.
3. Un **chien de garde** dans `hud-mod.js` : si le canvas du jeu existe mais
   qu'aucun crochet n'a été appelé après 8 s, un avertissement en console dit la
   cause et quoi vérifier.

Un userscript Tampermonkey (`@grant none` + `@inject-into page`) a été proposé
jusqu'à la 0.3.2 puis abandonné : Tampermonkey n'obéit pas toujours à
`@inject-into page`, et depuis Chrome 120 il exige de toute façon le mode
développeur — donc il ne faisait économiser aucune étape tout en ajoutant cette
incertitude.

À l'inverse, accrocher les prototypes **tard** n'est pas un problème : les
méthodes sont résolues à chaque appel, et le jeu redemande une frame à chaque
tour de boucle. Même installé après le démarrage du jeu, le mod reprend la main
dès la frame suivante. `document_start` reste préférable, ce n'est pas une
condition de fonctionnement.

## Aucune dépendance

Rien à installer : pas de `npm install`, pas de `package.json`, pas de
`node_modules`, aucune étape de compilation. Le mod est du JavaScript que Chrome
lit tel quel, et l'outillage n'utilise que `fs`, `path` et `child_process`,
natifs à Node.

Seule exigence hors Node : le binaire système `zip`, et uniquement pour publier.
`unzip` sert aux tests à inspecter le paquet, et son absence est signalée au
lieu de faire échouer la suite. Utiliser le mod ne demande que le navigateur.

C'est un choix, pas un hasard : un mod qu'on installe à la main dans son
navigateur doit pouvoir être lu, vérifié et chargé sans chaîne de construction
à faire tourner d'abord.

## Construire le paquet

```
node tools/build.js        # vérifie, puis produit dist/*.zip, puis revérifie le zip
node test/package.test.js  # manifeste, cohabitation des modules, DOM vide, chien de garde, zip
```

Rien n'est minifié — ce qu'on publie reste lisible, ce qui est la moindre des
choses pour du code qu'on installe dans son navigateur. Le zip n'est pas
versionné : il est fabriqué à la demande et attaché aux releases. Cloner le
dépôt suffit d'ailleurs à charger l'extension, le manifeste étant à la racine.

`test/package.test.js` concatène les deux content scripts dans l'ordre du
manifeste — ce que Chrome fait, dans le même monde — et vérifie qu'ils
cohabitent : ils enveloppent les mêmes méthodes de canvas et le même
`requestAnimationFrame`, et partagent `window.__psx`.
