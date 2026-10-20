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

  const VERSION = '0.7.0';

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

  /* -- signatures du HUD d'origine --
   *
   * On ne code PLUS de position absolue. Depuis le 18-10-2026 le jeu décale son
   * bloc de vie de la zone sûre de l'écran (`px = 16 + sa.left, py = 20 + sa.top`,
   * pour l'encoche de l'iPhone) : des coordonnées en dur seraient justes sur un
   * écran d'ordinateur et fausses sur un téléphone.
   *
   * À la place on reconnaît MA barre à sa TAILLE — 168 × 11, dessinée par
   * `bar(ctx, px+48, py+17, 168, 11, …)` — et tout le reste se déduit en
   * relatif de son coin haut-gauche. Les décalages internes du bloc, eux, n'ont
   * pas bougé.
   */
  const MY = { w: 168, h: 11 };
  const ALLY = { w: 110, h: 8 };
  // Décalages depuis le coin haut-gauche de ma barre, soit (px+48, py+17) :
  const REL = {
    textX: 84, textY: 9,          // mes chiffres   : (px+132, py+26)
    allyX: 30,                     // barre alliée   : px+78
    allyNameX: -48,                // nom de l'allié : px
    allyDeadX: 146,                // « tombé »      : px+78+116
    allyYMin: 18, allyYMax: 135    // bande du bloc coop, sous ma barre
  };
  // Là où la barre peut raisonnablement se trouver : en haut à gauche. Évite
  // qu'un autre dessin de 168 × 11 ailleurs ne soit pris pour elle.
  const MY_ZONE = { maxX: 0.45, maxY: 220 };   // maxX en fraction de la largeur
  let anchor = null;               // coin haut-gauche de ma barre, cette frame
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
      anchor = null;             // redécouverte à chaque frame
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
    if (near(bb.x1 - bb.x0, MY.w) && near(bb.y1 - bb.y0, MY.h)
        && bb.x0 < this.canvas.clientWidth * MY_ZONE.maxX && bb.y0 < MY_ZONE.maxY) {
      anchor = { x: bb.x0, y: bb.y0 };
      me.sawBar = performance.now();
      me.frac = 0;                      // écrasé juste après par le fillRect de remplissage
      return true;
    }

    // fond d'une barre alliée (110 × 8 à x = 94) → supprimé, et on arme le coop.
    if (anchor && near(bb.x0, anchor.x + REL.allyX) && near(bb.x1 - bb.x0, ALLY.w)
        && near(bb.y1 - bb.y0, ALLY.h)
        && bb.y0 >= anchor.y + REL.allyYMin && bb.y0 <= anchor.y + REL.allyYMax) {
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
    if (anchor && near(x, anchor.x) && near(y, anchor.y) && near(h, MY.h) && w <= MY.w + 2) {
      me.frac = clamp(w / MY.w, 0, 1);
      me.seen = performance.now();
      return true;
    }

    // remplissage d'une barre alliée. On supprime même si le nom n'a pas encore
    // été capté (première frame du coop) : sinon un morceau de barre reste
    // affiché tout seul, sans son fond.
    if (coopActive() && anchor && near(x, anchor.x + REL.allyX) && near(h, ALLY.h)
        && w <= ALLY.w + 2 && y >= anchor.y + REL.allyYMin && y <= anchor.y + REL.allyYMax) {
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
    if (anchor && near(x, anchor.x + REL.textX) && near(y, anchor.y + REL.textY)) {
      const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text);
      if (m) { me.hp = +m[1]; me.max = +m[2]; me.seen = performance.now(); }
      return true;
    }

    if (!coopActive()) return;

    // nom d'un allié : aligné à gauche, exactement à x = 16, dans la bande coop.
    // (Les pastilles de buff sont à x = 22 et la ligne de biome est centrée :
    //  aucune collision possible.)
    if (anchor && near(x, anchor.x + REL.allyNameX, 0.6)
        && y >= anchor.y + REL.allyYMin && y <= anchor.y + REL.allyYMax && this.textAlign === 'left') {
      allies.push({ name: text, color: String(this.fillStyle), frac: null, dead: false });
      return true;
    }
    // "CAÍDO"
    if (anchor && near(x, anchor.x + REL.allyDeadX)
        && y >= anchor.y + REL.allyYMin && y <= anchor.y + REL.allyYMax) {
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
      'Vérifie que manifest.json déclare bien \'"world": "MAIN"\'.');
  }, 8000);

  PSX.hud = VERSION;       // tape `__psx` dans la console : dit ce qui a chargé
  console.info('[psx] hud-mod ' + VERSION + ' installé — barres de vie en bas au centre');
})();
