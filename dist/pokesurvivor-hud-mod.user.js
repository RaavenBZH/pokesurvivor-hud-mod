// ==UserScript==
// @name         PokéSurvivor HUD mod
// @namespace    https://github.com/RaavenBZH/pokesurvivor-hud-mod
// @version      0.3.2
// @description  Barres de vie en bas au centre, dégradé vert→rouge, alerte de vie basse, flèches de repérage autour du joueur et panneau des passifs. Mod non officiel.
// @author       RaavenBZH
// @homepageURL  https://github.com/RaavenBZH/pokesurvivor-hud-mod
// @supportURL   https://github.com/RaavenBZH/pokesurvivor-hud-mod/issues
// @match        https://pokesurvivor.com/*
// @match        https://www.pokesurvivor.com/*
// @run-at       document-start
// @grant        none
// @inject-into page
// @license      PolyForm-Noncommercial-1.0.0
// @downloadURL  https://raw.githubusercontent.com/RaavenBZH/pokesurvivor-hud-mod/main/dist/pokesurvivor-hud-mod.user.js
// @updateURL    https://raw.githubusercontent.com/RaavenBZH/pokesurvivor-hud-mod/main/dist/pokesurvivor-hud-mod.user.js
// ==/UserScript==

/* Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)
 *
 * Œuvre dérivée de PokéSurvivor, sous PolyForm Noncommercial License 1.0.0
 * (https://polyformproject.org/licenses/noncommercial/1.0.0). Usage non
 * commercial uniquement. Mod NON officiel, sans affiliation avec l’auteur du
 * jeu ni avec Nintendo. Détail : https://github.com/RaavenBZH/pokesurvivor-hud-mod/blob/main/LICENSE
 */

/* ======== src/ui/hud-mod.js ======== */
/* ============ hud-mod.js — HUD remanié [monde MAIN, document_start] ============
 *
 * Ce que fait ce module :
 *   1. masque la barre de vie du joueur que le jeu dessine en haut à gauche,
 *      ainsi que la liste des alliés en cooperatif ;
 *   2. les redessine en bas au centre, juste au-dessus de la rangée d'attaques ;
 *   3. colore MA barre en dégradé vert → jaune → rouge selon la vie restante ;
 *   4. ajoute un contour rouge dégradé et pulsé quand ma vie passe sous 20 % ;
 *   5. ramène les flèches de repérage (shinies, grieta, coéquipiers, Pokémon
 *      perdu, voleurs, Arceus) du bord de l'écran vers un anneau autour du
 *      joueur — voir la section « flèches » plus bas.
 *
 * Le jeu n'est pas modifié : on observe son rendu, on supprime quelques appels
 * de dessin et on ajoute les nôtres après coup, sur son canvas.
 *
 * Pourquoi dans le monde MAIN et à document_start : seul le monde de la page
 * voit le contexte 2D du jeu, et il faut avoir enveloppé le prototype avant que
 * app.min.js (chargé en defer) ne tourne.
 *
 * ---------------------------------------------------------------------------
 * Géométrie d'origine, relevée dans js/ui/hud.js (px CSS, passe écran) :
 *   px = 16, py = 20
 *   ma barre     bar(ctx, px+48, py+17, 168, 11)   → (64, 37, 168, 11)
 *   mes chiffres fillText("h / m", 148, 46), centré
 *   barre alliée bar(ctx, px+78, y+1, 110, 8)      → x = 94, hauteur 8
 *   nom allié    fillText(nom, 16, y+9), aligné à gauche, y ∈ {69,84,99,…}
 *   "CAÍDO"      fillText("CAÍDO", 210, y+9)
 *   attaques     roundRect(x, y, 54, 54, 12), rangée centrée en bas
 * Ces nombres sont des constantes du jeu : ils ne bougeront qu'à une refonte du
 * HUD. Si la signature de ma barre disparaît, le module se désarme (FAILSAFE)
 * et le HUD d'origine réapparaît intact.
 * ---------------------------------------------------------------------------
 */
(() => {
  'use strict';

  const VERSION = '0.3.2';

  const CFG = {
    lowHp: 0.20,          // seuil du contour rouge
    barW: 320,            // largeur fixe : la barre ne doit pas changer de
                          // taille quand on apprend une attaque de plus
    barH: 15,
    allyH: 9,
    gapAbove: 14,         // écart visible entre ma barre et le nom de l'attaque
    showNumbers: true,    // "123 / 456" au centre de ma barre
    vignette: true,       // contour rouge sous le seuil
    arrows: true,         // flèches de repérage autour du joueur
    ringR: 120,           // rayon de l'anneau, en px CSS
    lead: 420             // correction de relèvement (voir relocate())
  };

  /* -- signatures du HUD d'origine -- */
  const MY = { x: 64, y: 37, w: 168, h: 11, textX: 148, textY: 46 };
  const ALLY = { x: 94, w: 110, h: 8, nameX: 16, deadX: 210, yMin: 58, yMax: 160 };
  const SLOT = 54;
  // Le jeu écrit le nom du mouvement ACTIF au-dessus de sa case
  // (`fillText(m.name, x + S/2, y - 7)`, police 10 px), et cette case est
  // elle-même remontée de 6 px. Il faut donc dégager cette hauteur avant de
  // poser notre barre, sinon elle chevauche le nom.
  const SLOT_LABEL = 18;
  const FAILSAFE = 1500;  // ms sans voir ma barre d'origine → on rend la main

  /* Les cinq sites de flèche de bord, chacun avec sa marge M et ses bornes
   * verticales. Relevés dans le jeu :
   *   34  shinies hors écran      hud.js:119       clamp(sy, M+60, h-M-70)
   *   42  coéquipiers hors vue    hud.js:428       clamp(sy, M+70, h-M-80)
   *   44  Pokémon perdu, voleurs  events.js:327    idem
   *   46  Arceus (Sentencia)      judgment.js:633  idem
   *   52  grieta hors écran       hud.js:160       idem
   * Tous suivent le même patron : ctx.translate(ex, ey) avec
   * ex = clamp(sx, M, w-M) et ey = clamp(sy, haut, bas).
   */
  const ARROWS = [
    { M: 34, dTop: 60, dBot: 70 },
    { M: 42, dTop: 70, dBot: 80 },
    { M: 44, dTop: 70, dBot: 80 },
    { M: 46, dTop: 70, dBot: 80 },
    { M: 52, dTop: 70, dBot: 80 }
  ];

  const C = CanvasRenderingContext2D.prototype;
  const O = {
    fill: C.fill, fillRect: C.fillRect, fillText: C.fillText, clearRect: C.clearRect,
    beginPath: C.beginPath, moveTo: C.moveTo, lineTo: C.lineTo, arcTo: C.arcTo,
    rect: C.rect, arc: C.arc, ellipse: C.ellipse,
    translate: C.translate, restore: C.restore
  };

  // Drapeau de dessin PARTAGÉ avec src/ui/stats-mod.js : les deux modules
  // dessinent sur le canvas du jeu et aucun des deux ne doit voir passer les
  // appels de l'autre dans ses sondes. Le premier chargé crée l'objet.
  const PSX = window.__psx = window.__psx || { painting: false };
  let armed = true;
  let errors = 0;
  let hits = 0;            // appels de dessin observés sur #game

  /* ---------------- état de la frame ---------------- */
  const me = { frac: 0, hp: 0, max: 0, seen: 0, sawBar: 0 };
  let allies = [];        // { name, color, frac, dead }
  let coopSeen = 0;       // horodatage de la dernière barre alliée reconnue
  let slots = null;       // mesure en cours des cases d'attaque
  let slotRow = null;     // mesure de la frame précédente (les attaques sont
                          // dessinées en dernier : une frame de retard, invisible)

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isGame = ctx => { const cv = ctx.canvas; return !!cv && cv.id === 'game'; };
  const dprOf = cv => (cv.clientWidth > 0 ? cv.width / cv.clientWidth : 1);
  const coopActive = () => performance.now() - coopSeen < 1000;
  const inRun = () => armed && performance.now() - me.sawBar < FAILSAFE;

  /** Passe écran (HUD) : pas de mise à l'échelle caméra ni de translation. */
  function screenPass(ctx) {
    const m = ctx.getTransform();
    return Math.abs(m.a - dprOf(ctx.canvas)) < 0.01 && Math.abs(m.e) < 0.01 && Math.abs(m.f) < 0.01;
  }

  /* ---------------- boîte englobante du chemin courant ----------------
   * Les barres du jeu passent par son helper roundRect() (arcTo), pas par le
   * roundRect natif : pour reconnaître « ce fill() dessine ma barre », il faut
   * suivre le chemin en cours. Une quinzaine de lignes, et c'est tout.
   */
  let bb = null;
  const pt = (x, y) => {
    if (!bb) bb = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < bb.x0) bb.x0 = x; if (y < bb.y0) bb.y0 = y;
      if (x > bb.x1) bb.x1 = x; if (y > bb.y1) bb.y1 = y;
    }
  };
  const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
  const boxIs = (x, y, w, h) => !!bb && near(bb.x0, x) && near(bb.y0, y)
    && near(bb.x1 - bb.x0, w) && near(bb.y1 - bb.y0, h);

  /* ================= flèches de repérage =================
   *
   * Le jeu plaque ses flèches contre le bord de l'écran. On veut les voir
   * autour du Pokémon du joueur.
   *
   * Chaque flèche est un bloc save() … translate(ex, ey) … restore() : tout ce
   * qui suit le translate (triangle, icône, étiquette) est dessiné en
   * coordonnées locales. Il suffit donc d'ajouter UN translate correctif pour
   * déplacer le bloc entier, sans rien réimplémenter ni perdre un détail.
   *
   * Seule difficulté : on ne connaît la direction de la flèche qu'au premier
   * moveTo (le jeu y écrit la pointe en cos/sin de l'angle), c'est-à-dire
   * APRÈS le translate. Deux conséquences :
   *   - on laisse le translate d'origine passer, puis on corrige à ce moveTo ;
   *   - la grieta, les coéquipiers et Arceus dessinent un halo circulaire
   *     AVANT la pointe : on le met de côté et on le rejoue au nouvel endroit,
   *     dans le même ordre, pour conserver la superposition.
   *
   * Si le bloc se termine sans pointe reconnue (ce n'était pas une flèche),
   * les halos mis de côté sont rejoués là où ils étaient : l'image est alors
   * identique à celle du jeu. Un faux positif ne se voit donc pas.
   *
   * Centre de l'anneau : le centre de la caméra. Le jeu l'amortit vers le
   * joueur (damp, taux 9), donc le Pokémon est à ~20 px près au centre ; sur un
   * anneau de 120 px, l'écart ne se voit pas. Les entités hors écran n'étant
   * pas dessinées, il n'existe aucune source exacte de leur position : la
   * direction est celle du point de bord d'origine, vu depuis ce centre.
   */
  let pend = null;        // { x, y, halos: [], done }

  function isArrowAnchor(cv, x, y) {
    const w = cv.clientWidth, h = cv.clientHeight;
    for (const p of ARROWS) {
      const top = p.M + p.dTop, bot = h - p.M - p.dBot;
      if (x < p.M - 0.6 || x > w - p.M + 0.6 || y < top - 0.6 || y > bot + 0.6) continue;
      // Hors écran, le clamp colle forcément au moins une coordonnée à sa borne.
      const atX = near(x, p.M, 0.6) || near(x, w - p.M, 0.6);
      const atY = near(y, top, 0.6) || near(y, bot, 0.6);
      if (atX || atY) return true;
    }
    return false;
  }

  /** Un cercle centré sur l'origine locale : le halo d'une flèche. */
  const isHalo = () => !!bb && Math.abs(bb.x0 + bb.x1) < 1 && Math.abs(bb.y0 + bb.y1) < 1
    && near(bb.x1 - bb.x0, bb.y1 - bb.y0, 1) && bb.x1 - bb.x0 <= 120 && bb.x1 > 2;

  function replayHalos(ctx) {
    PSX.painting = true;
    const a0 = ctx.globalAlpha, f0 = ctx.fillStyle;
    for (const hl of pend.halos) {
      ctx.globalAlpha = hl.alpha; ctx.fillStyle = hl.fill;
      O.beginPath.call(ctx); O.arc.call(ctx, 0, 0, hl.r, 0, 6.2832); O.fill.call(ctx);
    }
    ctx.globalAlpha = a0; ctx.fillStyle = f0;
    // Le jeu avait déjà ouvert son chemin avant ce moveTo : on le remet à zéro
    // pour ne pas lui laisser nos arcs dedans.
    O.beginPath.call(ctx);
    PSX.painting = false;
  }

  /** Appelé au premier moveTo du bloc : c'est là qu'on apprend la direction.
   *
   * Le relèvement : le point de bord seul est biaisé, parce que le clamp écrase
   * la composante hors écran (une cible très à gauche et un peu en haut donne un
   * point de bord qui paraît beaucoup plus haut qu'elle ne l'est). Mais la
   * pointe que le jeu vient de tracer est en cos/sin de l'angle VERS la cible :
   * on prolonge donc le point de bord de `lead` px dans cette direction avant
   * de prendre l'angle. Sur les cas d'école ça divise l'erreur par trois
   * (13° → 4°). Ça reste une estimation : les entités hors écran ne sont pas
   * dessinées, leur position exacte n'est nulle part.
   */
  function relocate(ctx, mx, my) {
    const r = Math.hypot(mx, my);
    if (r < 14 || r > 70) return;              // pas la pointe d'une flèche
    pend.done = true;
    const cv = ctx.canvas, cx = cv.clientWidth / 2, cy = cv.clientHeight / 2;
    const a = Math.atan2(my, mx);
    const ang = Math.atan2((pend.y - cy) + Math.sin(a) * CFG.lead,
                           (pend.x - cx) + Math.cos(a) * CFG.lead);
    const tx = cx + Math.cos(ang) * CFG.ringR, ty = cy + Math.sin(ang) * CFG.ringR;
    // On est déjà translaté de (pend.x, pend.y) : le correctif est relatif.
    O.translate.call(ctx, tx - pend.x, ty - pend.y);
    if (pend.halos.length) replayHalos(ctx);
  }

  /** Enveloppe sûre : en cas d'ennui on se désarme, le jeu continue normalement. */
  function guard(fn, fallback) {
    return function (...args) {
      if (PSX.painting || !armed || !isGame(this)) return fallback.apply(this, args);
      hits++;
      try {
        if (fn.call(this, args) === true) return undefined;      // appel supprimé
      } catch (e) {
        if (++errors >= 30) { armed = false; console.warn('[psx] hud-mod désarmé :', e.message); }
      }
      return fallback.apply(this, args);
    };
  }

  /* ---------------- sondes de chemin (aucune suppression, juste la bbox) ---------------- */
  C.beginPath = function () { if (!PSX.painting && isGame(this)) bb = null; return O.beginPath.call(this); };
  C.moveTo = function (x, y) {
    if (!PSX.painting && isGame(this)) {
      pt(x, y);
      // Premier moveTo d'un bloc de flèche : on y lit sa direction.
      if (pend && !pend.done && armed) {
        try { relocate(this, x, y); }
        catch (e) { pend = null; if (++errors >= 30) { armed = false; console.warn('[psx] hud-mod désarmé :', e.message); } }
      }
    }
    return O.moveTo.apply(this, arguments);
  };
  C.lineTo = function (x, y) { if (!PSX.painting && isGame(this)) pt(x, y); return O.lineTo.apply(this, arguments); };
  C.arcTo = function (x1, y1, x2, y2) { if (!PSX.painting && isGame(this)) { pt(x1, y1); pt(x2, y2); } return O.arcTo.apply(this, arguments); };
  C.rect = function (x, y, w, h) { if (!PSX.painting && isGame(this)) { pt(x, y); pt(x + w, y + h); } return O.rect.apply(this, arguments); };
  C.arc = function (x, y, r) { if (!PSX.painting && isGame(this)) { pt(x - r, y - r); pt(x + r, y + r); } return O.arc.apply(this, arguments); };
  C.ellipse = function (x, y, rx, ry) { if (!PSX.painting && isGame(this)) { pt(x - rx, y - ry); pt(x + rx, y + ry); } return O.ellipse.apply(this, arguments); };

  /* ---------------- début d'un bloc de flèche ---------------- */
  C.translate = guard(function (args) {
    if (!CFG.arrows || !screenPass(this)) return;
    if (isArrowAnchor(this.canvas, args[0], args[1])) pend = { x: args[0], y: args[1], halos: [], done: false };
    // le translate d'origine s'applique normalement
  }, O.translate);

  /* ---------------- fin du bloc : garde-fou ---------------- */
  C.restore = function () {
    if (!PSX.painting && isGame(this) && pend) {
      // Ce n'était pas une flèche : on remet les halos là où le jeu les voulait.
      if (!pend.done && pend.halos.length) { try { replayHalos(this); } catch (e) { /* tant pis */ } }
      pend = null;
    }
    return O.restore.call(this);
  };

  /* ---------------- frontière de frame ---------------- */
  C.clearRect = guard(function () {
    if (screenPass(this)) {
      slotRow = slots;          // la mesure de la frame qui vient de finir
      slots = null;
      allies = [];
      bb = null;
      pend = null;
    }
  }, O.clearRect);

  /* ---------------- fill() : fonds de barres et cases d'attaque ---------------- */
  C.fill = guard(function () {
    if (!bb) return;

    // halo d'une flèche, dessiné avant qu'on connaisse sa direction : mis de
    // côté, rejoué au bon endroit (ou à l'ancien, si ce n'était pas une flèche).
    // Testé AVANT screenPass() : dans un bloc de flèche on est déjà translaté,
    // donc screenPass() y est faux. `pend` suffit — il n'est posé que dans la
    // passe écran.
    if (pend && !pend.done && isHalo()) {
      pend.halos.push({ r: (bb.x1 - bb.x0) / 2, fill: String(this.fillStyle), alpha: this.globalAlpha });
      return true;
    }

    if (!screenPass(this)) return;

    // fond de MA barre de vie → supprimé, et on note sa présence.
    if (boxIs(MY.x, MY.y, MY.w, MY.h)) {
      me.sawBar = performance.now();
      me.frac = 0;                      // écrasé juste après par le fillRect de remplissage
      return true;
    }

    // fond d'une barre alliée (110 × 8 à x = 94) → supprimé, et on arme le coop.
    if (near(bb.x0, ALLY.x) && near(bb.x1 - bb.x0, ALLY.w) && near(bb.y1 - bb.y0, ALLY.h)
        && bb.y0 >= ALLY.yMin - 4 && bb.y0 <= ALLY.yMax) {
      coopSeen = performance.now();
      const a = allies[allies.length - 1];
      if (a && a.frac == null) a.frac = 0;
      return true;
    }

    // case d'attaque 54 × 54 : on mesure la rangée (on ne supprime rien).
    // Restreint à la moitié basse de l'écran pour qu'une icône carrée de la
    // même taille ailleurs ne vienne pas polluer la mesure.
    if (near(bb.x1 - bb.x0, SLOT) && near(bb.y1 - bb.y0, SLOT)
        && bb.y0 > this.canvas.clientHeight * 0.5) {
      if (!slots) slots = { left: bb.x0, right: bb.x1, top: bb.y0 };
      else {
        if (bb.x0 < slots.left) slots.left = bb.x0;
        if (bb.x1 > slots.right) slots.right = bb.x1;
        if (bb.y0 < slots.top) slots.top = bb.y0;
      }
    }
  }, O.fill);

  /* ---------------- fillRect() : remplissage des barres ---------------- */
  C.fillRect = guard(function (args) {
    if (!screenPass(this)) return;
    const x = args[0], y = args[1], w = args[2], h = args[3];

    // remplissage de MA barre : la largeur donne la fraction, au pixel près.
    if (near(x, MY.x) && near(y, MY.y) && near(h, MY.h) && w <= MY.w + 2) {
      me.frac = clamp(w / MY.w, 0, 1);
      me.seen = performance.now();
      return true;
    }

    // remplissage d'une barre alliée. On supprime même si le nom n'a pas encore
    // été capté (première frame du coop) : sinon un morceau de barre reste
    // affiché tout seul, sans son fond.
    if (coopActive() && near(x, ALLY.x) && near(h, ALLY.h) && w <= ALLY.w + 2
        && y >= ALLY.yMin - 4 && y <= ALLY.yMax) {
      const a = allies[allies.length - 1];
      if (a) { a.frac = clamp(w / ALLY.w, 0, 1); a.color = String(this.fillStyle); }
      return true;
    }
  }, O.fillRect);

  /* ---------------- fillText() : chiffres et noms ---------------- */
  C.fillText = guard(function (args) {
    if (!screenPass(this)) return;
    const text = args[0], x = args[1], y = args[2];
    if (typeof text !== 'string') return;

    // mes chiffres "123 / 456" : relus puis supprimés.
    if (near(x, MY.textX) && near(y, MY.textY)) {
      const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text);
      if (m) { me.hp = +m[1]; me.max = +m[2]; me.seen = performance.now(); }
      return true;
    }

    if (!coopActive()) return;

    // nom d'un allié : aligné à gauche, exactement à x = 16, dans la bande coop.
    // (Les pastilles de buff sont à x = 22 et la ligne de biome est centrée :
    //  aucune collision possible.)
    if (near(x, ALLY.nameX, 0.6) && y >= ALLY.yMin && y <= ALLY.yMax && this.textAlign === 'left') {
      allies.push({ name: text, color: String(this.fillStyle), frac: null, dead: false });
      return true;
    }
    // "CAÍDO"
    if (near(x, ALLY.deadX) && y >= ALLY.yMin && y <= ALLY.yMax) {
      const a = allies[allies.length - 1];
      if (a) a.dead = true;
      return true;
    }
  }, O.fillText);

  /* ================= dessin ================= */

  /** Vert → jaune → orange → rouge. L'exposant fait virer au jaune vers la moitié. */
  const hpHue = f => 125 * Math.pow(clamp(f, 0, 1), 1.15);

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawMyBar(ctx, x, y, w, h, frac, hp, max) {
    const hue = hpHue(frac);
    const low = frac < CFG.lowHp;
    const beat = 0.5 + 0.5 * Math.sin(performance.now() / 180);

    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fill();

    if (frac > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.clip();
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, `hsl(${hue}, 82%, 62%)`);
      g.addColorStop(0.45, `hsl(${hue}, 78%, 47%)`);
      g.addColorStop(1, `hsl(${hue}, 80%, 36%)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w * frac, h);
      // liseré clair en haut : la barre se lit mieux sur un fond chargé
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.fillRect(x, y + 1, w * frac, 1.5);
      ctx.restore();
    }

    // contour : il pulse en rouge sous le seuil
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.lineWidth = low ? 2 : 1.2;
    ctx.strokeStyle = low
      ? `rgba(255,${(70 + beat * 90) | 0},${(70 + beat * 70) | 0},.95)`
      : 'rgba(180,205,235,.30)';
    ctx.stroke();

    if (CFG.showNumbers && max > 0) {
      const txt = hp + ' / ' + max;
      ctx.font = '700 11px Pixelify, "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(txt, x + w / 2, y + h / 2 + 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, x + w / 2, y + h / 2 + 0.5);
    }
  }

  function drawAllyBar(ctx, x, y, w, h, a) {
    const NAME = 76;
    ctx.font = '800 10px Pixelify, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(a.name, x, y + h / 2);
    ctx.fillStyle = a.dead ? '#ffd0d5' : (a.color || '#cfe0ff');
    ctx.fillText(a.name, x, y + h / 2);

    const bx = x + NAME, bw = Math.max(40, w - NAME);
    roundRect(ctx, bx, y, bw, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fill();
    const f = a.frac || 0;
    if (f > 0) {
      ctx.save();
      roundRect(ctx, bx, y, bw, h, h / 2);
      ctx.clip();
      ctx.fillStyle = '#5fe08a';            // les alliés gardent la couleur du jeu
      ctx.fillRect(bx, y, bw * f, h);
      ctx.restore();
    }
    if (a.dead) {
      ctx.font = '800 9px Pixelify, "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = Math.sin(performance.now() / 125) > 0 ? '#ff8a96' : '#ffd0d5';
      ctx.fillText('K.O.', bx + bw + 6, y + h / 2);
    }
  }

  /** Contour rouge dégradé, d'autant plus marqué et rapide que la vie est basse. */
  function drawVignette(ctx, w, h, frac) {
    const k = clamp((CFG.lowHp - frac) / CFG.lowHp, 0, 1);
    if (k <= 0) return;
    const cx = w / 2, cy = h / 2;
    const r0 = Math.min(w, h) * (0.46 - 0.16 * k);     // le trou central se resserre
    const r1 = Math.hypot(w, h) * 0.62;
    const pulse = 0.80 + 0.20 * Math.sin(performance.now() / (300 - 150 * k));
    const a = (0.14 + 0.48 * k) * pulse;
    const g = ctx.createRadialGradient(cx, cy, Math.max(1, r0), cx, cy, r1);
    g.addColorStop(0, 'rgba(225,25,35,0)');
    g.addColorStop(0.55, `rgba(205,18,28,${(a * 0.42).toFixed(3)})`);
    g.addColorStop(1, `rgba(145,0,12,${a.toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Le jeu n'est pas le seul à demander des frames : on ne peint qu'une fois
  // par frame, sinon la vignette se superposerait à elle-même.
  let lastPaint = -1;

  function paint(t) {
    if (t === lastPaint) return;
    lastPaint = t;
    if (!inRun()) return;
    const cv = document.getElementById('game');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const w = cv.clientWidth, h = cv.clientHeight, dpr = dprOf(cv);
    // Rangée d'attaques mesurée sur le rendu ; si la mesure manque (HUD
    // modifié par l'auteur), on retombe sur le calcul du jeu : h - 54 - 18.
    const row = slotRow || { left: w / 2 - 140, right: w / 2 + 140, top: h - SLOT - 18 };
    const cx = (row.left + row.right) / 2;        // suit la rangée, même déplacée en mobile
    const bw = Math.min(CFG.barW, w - 40);

    PSX.painting = true;
    ctx.save();
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      if (CFG.vignette) drawVignette(ctx, w, h, me.frac);

      let y = row.top - SLOT_LABEL - CFG.gapAbove - CFG.barH;
      drawMyBar(ctx, cx - bw / 2, y, bw, CFG.barH, me.frac, me.hp, me.max);

      if (allies.length) {               // alliés empilés au-dessus de la mienne
        y -= 5;
        for (const a of allies) {
          y -= CFG.allyH + 3;
          drawAllyBar(ctx, cx - bw / 2, y, bw, CFG.allyH, a);
        }
      }
    } catch (e) {
      if (++errors >= 30) { armed = false; console.warn('[psx] hud-mod désarmé :', e.message); }
    } finally {
      ctx.restore();
      PSX.painting = false;
    }
  }

  /* ---------------- on dessine après la frame du jeu ----------------
   * En s'accrochant à requestAnimationFrame, notre dessin tombe juste après
   * tout le rendu du jeu : pas de problème d'ordre, et rien à réimplémenter.
   */
  const rafOrig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function') return rafOrig(cb);
    return rafOrig(function (t) {
      const r = cb(t);
      paint(t);
      return r;
    });
  };

  /* Chien de garde. Si le canvas du jeu existe mais qu'aucun de nos crochets
   * n'a jamais été appelé, c'est que nous ne sommes pas dans le monde de la
   * page : nos prototypes ne sont pas les siens. Ça n'émet aucune erreur, donc
   * sans ce message l'échec serait invisible. */
  setTimeout(() => {
    if (hits > 0 || !armed) return;
    if (!document.getElementById('game')) return;        // pas la page du jeu
    console.warn('[psx] Aucun appel de dessin observé sur #game après 8 s.\n' +
      'Le mod ne tourne probablement PAS dans le monde de la page : ses crochets\n' +
      'portent alors sur d’autres prototypes que ceux du jeu, sans erreur visible.\n' +
      'Userscript : vérifie « @inject-into page » dans son en-tête.\n' +
      'Extension : vérifie \'"world": "MAIN"\' dans manifest.json.');
  }, 8000);

  PSX.hud = VERSION;       // tape `__psx` dans la console : dit ce qui a chargé
  console.info('[psx] hud-mod ' + VERSION + ' installé — barres de vie en bas au centre');
})();

/* ======== src/ui/stats-mod.js ======== */
/* ============ stats-mod.js — panneau des passifs [monde MAIN, document_start] ============
 *
 * Affiche en partie les passifs améliorables : dégâts, vitesse, cadence
 * d'attaque, armure, régénération, aimant, expérience et vie maximale.
 *
 * -------------------------------------------------------------------------
 * POURQUOI CE N'EST PAS LU DANS LE JEU
 * Ces valeurs vivent dans l'objet joueur (`pl.atkMul`, `pl.cdMul`, …), enfermé
 * dans l'IIFE obfusquée de la version publiée : `window.G` n'existe pas. Et le
 * HUD ne les dessine nulle part — il n'y a donc rien à intercepter.
 *
 * On les RECONSTITUE donc, à partir de deux sources exactes :
 *
 *   1. LA BASE — les améliorations achetées en boutique, par Pokémon.
 *      Le jeu recopie la sauvegarde dans localStorage (`ps.cloud.<uid>` en mode
 *      nuage, `ps.save.<clé>` en local, JSON en clair) : on y lit
 *      `save.partner` et `save.pupg[dex]`, puis on applique les mêmes formules
 *      que G.Upgrades.perks() (table SHOP ci-dessous).
 *
 *   2. LES GAINS DE LA RUN — les cartes de niveau choisies.
 *      Les cartes sont du DOM (`#cards .card`) : on observe le clic ou la
 *      touche 1/2/3, on lit le titre et la description de la carte prise, et on
 *      applique l'effet (table RUN ci-dessous, copiée de js/systems/levelup.js).
 *
 * Les deux tables dupliquent donc des données du jeu. C'est assumé, et
 * `tools/verif-signatures.js` les revérifie face aux sources : si l'auteur
 * rééquilibre, le script le dit.
 *
 * Identification d'une carte : titre EXACT (espagnol ou anglais) **et** nombre
 * attendu dans la description. Les nombres sont identiques dans les deux
 * langues, et aucun des 64 mouvements du jeu ne porte un de ces titres : pas de
 * confusion possible avec une carte « nouveau mouvement » ou « amélioration ».
 * -------------------------------------------------------------------------
 */
(() => {
  'use strict';

  const VERSION = '0.3.2';

  const CFG = {
    show: true,           // panneau visible au démarrage
    toggleKey: 'F2',      // touche pour l'afficher / le masquer (libre dans le jeu)
    x: 18,                // coin haut-gauche du panneau, en px CSS
    y: 80,                // sous les pastilles de buff du jeu
    w: 150,
    row: 15,
    counts: false         // true pour afficher aussi « 3/8 » (prises / plafond)
  };

  // Drapeau de dessin partagé avec src/ui/hud-mod.js (voir son en-tête).
  const PSX = window.__psx = window.__psx || { painting: false };

  /* ---------------- boutique : G.Upgrades.perks() (js/data/upgrades.js) ---------------- */
  const SHOP = {
    hp:     { max: 10, per: 8,    apply: (b, n) => b.hp += n * 8 },
    atk:    { max: 10, per: 0.04, apply: (b, n) => b.atkMul = 1 + n * 0.04 },
    spd:    { max: 8,  per: 0.03, apply: (b, n) => b.spdMul = 1 + n * 0.03 },
    cd:     { max: 8,  per: 0.03, apply: (b, n) => b.cdMul = 1 - n * 0.03 },
    def:    { max: 8,  per: 0.02, apply: (b, n) => b.dmgReduce = n * 0.02 },
    regen:  { max: 5,  per: 0.2,  apply: (b, n) => b.regen = n * 0.2 },
    magnet: { max: 6,  per: 0.12, apply: (b, n) => b.magnetMul = 1 + n * 0.12 },
    xp:     { max: 8,  per: 0.05, apply: (b, n) => b.xpMul = 1 + n * 0.05 }
  };

  /* ---------------- cartes de niveau : STATS de js/systems/levelup.js ----------------
   * `titles` : titre exact en espagnol puis en anglais (js/data/lang-en.js).
   * `num`    : nombre attendu dans la description (identique dans les 2 langues).
   * `max`    : nombre de prises maximum (0 = sans plafond).
   */
  const RUN = [
    // max: 0 = aucun plafond (le jeu n'en met pas sur Vigor ni Síntesis :
    // `room()` dans levelup.js laisse passer une stat sans `max`). Affichés
    // sans dénominateur dans le panneau.
    { id: 'hp',  label: 'Vie max.', titles: ['Vigor', 'Vigor'],
      num: /\+\s*20\b/, max: 0 },
    { id: 'atk', label: 'Dégâts', titles: ['Potencia', 'Power'],
      num: /\+\s*10\s*%/, max: 40 },
    { id: 'spd', label: 'Vitesse', titles: ['Carrera', 'Sprint'],
      num: /\+\s*7\s*%/, max: 8 },
    { id: 'cd',  label: 'Cadence', titles: ['Reflejos', 'Reflexes'],
      num: /-\s*8\s*%/, max: 10 },
    // deux plafonds : 12 prises, ET un effet borné à 70 % par le jeu
    // (Math.min(0.7, …) dans levelup.js). Avec 8 niveaux de boutique (0.16) les
    // 70 % tombent dès la 9ᵉ prise : les suivantes ne servent plus à rien.
    { id: 'def', label: 'Armure', titles: ['Coraza', 'Armor'],
      num: /\+\s*6\s*%/, max: 12, capAt: 0.70 },
    { id: 'rgn', label: 'Régén.', titles: ['Síntesis', 'Synthesis'],
      num: /\+\s*0[.,]9/, max: 0 },
    { id: 'mag', label: 'Aimant', titles: ['Imán', 'Magnet'],
      num: /\+\s*30\s*%/, max: 6 },
    { id: 'xp',  label: 'XP', titles: ['Aprendizaje', 'Learning'],
      num: /\+\s*12\s*%/, max: 8 }
  ];

  /** Base boutique + prises de la run → valeurs affichées. */
  function compute(base, taken) {
    const n = id => taken[id] || 0;
    return {
      hp:  { v: base.hp + n('hp') * 20,                       txt: v => '+' + Math.round(v) },
      atk: { v: base.atkMul * Math.pow(1.10, n('atk')),        txt: v => '×' + v.toFixed(2) },
      spd: { v: base.spdMul * Math.pow(1.07, n('spd')),        txt: v => '×' + v.toFixed(2) },
      // le jeu stocke une recharge (plus bas = plus rapide) ; on montre la
      // cadence, son inverse, qui se lit dans le même sens que les autres
      cd:  { v: 1 / (base.cdMul * Math.pow(0.92, n('cd'))),    txt: v => '×' + v.toFixed(2) },
      // additif et plafonné à 70 % par le jeu
      def: { v: Math.min(0.70, base.dmgReduce + n('def') * 0.06), txt: v => (v * 100).toFixed(0) + ' %' },
      rgn: { v: base.regen + n('rgn') * 0.9,                   txt: v => v.toFixed(1) + '/s' },
      mag: { v: base.magnetMul * Math.pow(1.30, n('mag')),     txt: v => '×' + v.toFixed(2) },
      xp:  { v: base.xpMul * Math.pow(1.12, n('xp')),          txt: v => '×' + v.toFixed(2) }
    };
  }

  /** Ce passif ne peut plus rien apporter : plafond de prises OU effet borné. */
  function isMaxed(s, n, value) {
    if (s.max && n >= s.max) return true;
    if (s.capAt != null && value >= s.capAt - 1e-9) return true;
    return false;
  }

  const DEFAULT_BASE = () => ({ hp: 0, atkMul: 1, spdMul: 1, cdMul: 1, dmgReduce: 0, regen: 0, magnetMul: 1, xpMul: 1 });

  /* ---------------- base : la sauvegarde recopiée en localStorage ---------------- */
  function readBase() {
    const b = DEFAULT_BASE();
    b.source = 'défaut';
    let best = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^ps\.(cloud|save)\./.test(k)) continue;
        let s;
        try { s = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
        if (!s || typeof s !== 'object' || !s.partner) continue;
        if (!best || (s.updated || 0) > (best.updated || 0)) best = s;
      }
    } catch (e) { return b; }                 // localStorage bloqué
    if (!best) return b;                      // invité, ou rien de sauvegardé
    const levels = (best.pupg && best.pupg[best.partner]) || {};
    for (const id in SHOP) {
      const u = SHOP[id];
      const n = Math.max(0, Math.min(u.max, Math.floor(+levels[id] || 0)));
      if (n) u.apply(b, n);
    }
    b.source = 'boutique';
    return b;
  }

  /* ---------------- où en est-on ? (DOM, voir docs/03-GAME-REFERENCE.md §2) ----------------
   * En partie : la barre du haut est masquée (G.UI.chrome(false)) et aucun écran
   * hors-partie n'est ouvert. Les écrans de run (niveau, pause, objet, vínculo,
   * résumé) n'interrompent pas l'affichage.
   */
  const OUT_SCREENS = ['scr-login', 'scr-test', 'scr-result', 'scr-starters', 'scr-menu',
    'scr-dex', 'scr-upgrades', 'scr-gacha', 'scr-nick', 'scr-friends', 'scr-lobby',
    'scr-rank', 'scr-goals', 'scr-mod', 'scr-settings', 'scr-gacha'];
  const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };

  function inRun() {
    const tb = document.getElementById('topbar');
    if (!tb || !tb.classList.contains('hidden')) return false;
    if (vis('boot') || vis('tap-start')) return false;
    return !OUT_SCREENS.some(vis);
  }

  /* ---------------- suivi des cartes prises ---------------- */
  let base = DEFAULT_BASE();
  let taken = {};
  let picked = false;        // une carte déjà comptée pour cette montée de niveau
  let wasRun = false;

  function startRun() {
    base = readBase();
    taken = {};
    picked = false;
  }

  /** Le titre seul : .nm contient le titre puis un <span class="tag-chip">. */
  function titleOf(card) {
    const nm = card.querySelector('.nm');
    if (!nm) return '';
    return [...nm.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  }

  /** Identifie une carte stat : titre exact ET nombre attendu. */
  function statOf(card) {
    const t = titleOf(card);
    if (!t) return null;
    const ds = (card.querySelector('.ds') || {}).textContent || '';
    for (const s of RUN) if (s.titles.includes(t) && s.num.test(ds)) return s;
    return null;                              // mouvement, évolution, ou la Baya Zidra
  }

  function take(card) {
    if (picked || !card) return;
    const s = statOf(card);
    picked = true;                            // même si ce n'était pas un passif
    if (!s) return;
    if (s.max && (taken[s.id] || 0) >= s.max) return;   // plafond du jeu
    taken[s.id] = (taken[s.id] || 0) + 1;
  }

  const cards = () => [...document.querySelectorAll('#cards .card')];

  document.addEventListener('click', e => {
    if (!vis('scr-levelup')) return;
    const card = e.target && e.target.closest && e.target.closest('#cards .card');
    if (card) take(card);
  }, true);

  window.addEventListener('keydown', e => {
    if (!vis('scr-levelup') || e.repeat) return;
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code || '');
    if (m) take(cards()[+m[1] - 1]);
  }, true);

  if (CFG.toggleKey) {
    window.addEventListener('keydown', e => {
      if (e.code === CFG.toggleKey) { CFG.show = !CFG.show; e.preventDefault(); }
    }, true);
  }

  // Les cartes sont reconstruites à chaque montée de niveau ET à chaque
  // changement d'options (touche R) : c'est le signal d'une nouvelle décision.
  function watchCards() {
    const box = document.getElementById('cards');
    if (!box) return false;
    new MutationObserver(() => { picked = false; }).observe(box, { childList: true });
    return true;
  }
  if (!watchCards()) {
    // `document` et pas `document.documentElement` : au document-start d'un
    // userscript, <html> peut ne pas encore exister, et observe(null) lève une
    // exception qui tuerait tout ce qui suit (crochet d'animation compris).
    const target = document.documentElement || document;
    try {
      const wait = new MutationObserver(() => { if (watchCards()) wait.disconnect(); });
      wait.observe(target, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[psx] stats-mod : surveillance des cartes indisponible —', e.message);
    }
  }

  /* ---------------- dessin ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const F = (w, s) => `${w} ${s}px Pixelify, "Segoe UI", system-ui, sans-serif`;

  function draw(ctx) {
    const vals = compute(base, taken);
    const x = CFG.x, w = CFG.w;
    const head = 17, pad = 7;
    const h = head + pad + RUN.length * CFG.row + pad - 3;
    const y = CFG.y;

    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = 'rgba(6,11,22,.72)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150,180,220,.22)';
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.font = F(800, 9);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8fa3c4';
    ctx.fillText('PASSIFS', x + pad, y + head / 2 + 1);

    let ry = y + head + pad + CFG.row / 2 - 2;
    for (const s of RUN) {
      const v = vals[s.id];
      const n = taken[s.id] || 0;
      const maxed = isMaxed(s, n, v.v);

      ctx.font = F(700, 10);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(190,205,230,.78)';
      ctx.fillText(s.label, x + pad, ry);

      ctx.font = F(800, 11);
      ctx.textAlign = 'right';
      // doré quand la run a amélioré ce passif, gris sinon
      ctx.fillStyle = n > 0 ? (maxed ? '#9ae6ff' : '#ffd23f') : 'rgba(210,222,240,.6)';
      ctx.fillText(v.txt(v.v), x + w - pad - (CFG.counts ? 38 : 0), ry);

      if (CFG.counts) {
        ctx.font = F(700, 9);
        ctx.fillStyle = n > 0 ? 'rgba(190,205,230,.6)' : 'rgba(190,205,230,.28)';
        ctx.fillText(s.max ? n + '/' + s.max : String(n), x + w - pad, ry);
      }
      ry += CFG.row;
    }
  }

  let lastPaint = -1;

  function paint(t) {
    if (t === lastPaint) return;
    lastPaint = t;

    const run = inRun();
    if (run && !wasRun) startRun();           // nouvelle partie : on repart de la base
    wasRun = run;
    if (!run || !CFG.show) return;

    const cv = document.getElementById('game');
    if (!cv || !cv.clientWidth) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = cv.width / cv.clientWidth;

    PSX.painting = true;                      // nos appels ne doivent pas être sondés
    ctx.save();
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx);
    } catch (e) {
      CFG.show = false;
      console.warn('[psx] stats-mod désactivé :', e.message);
    } finally {
      ctx.restore();
      PSX.painting = false;
    }
  }

  const rafOrig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function') return rafOrig(cb);
    return rafOrig(function (ts) { const r = cb(ts); paint(ts); return r; });
  };

  // Pour les tests (node) : rien n'est exposé à la page en dehors de __psx.
  if (typeof module === 'object' && module.exports) {
    module.exports = { CFG, SHOP, RUN, compute, readBase, statOf, titleOf, inRun, isMaxed, DEFAULT_BASE, _take: take, _newChoice: () => { picked = false; }, _reset: startRun, _state: () => ({ base, taken, get picked() { return picked; } }) };
  }

  PSX.stats = VERSION;     // tape `__psx` dans la console : dit ce qui a chargé
  console.info('[psx] stats-mod ' + VERSION + ' installé — panneau des passifs (' + CFG.toggleKey + ' pour masquer)');
})();
