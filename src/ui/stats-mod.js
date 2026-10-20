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

  const VERSION = '0.5.0';

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
  /* ---------------- cartes de niveau : STATS de js/systems/levelup.js ----------------
   * Le jeu parle 7 langues depuis le 18-10-2026 (es, en, fr, it, pt-BR, zh-Hans,
   * zh-Hant). Les TITRES sont traduits, mais les NOMBRES des descriptions
   * survivent — avec deux pièges relevés dans js/lang/ :
   *   - le français met une espace avant « % » et une virgule décimale (+0,9) ;
   *   - le chinois supprime le « + » de l'armure et de la régénération
   *     (« 受到的傷害減少 6% », « 每秒恢復 0.9 生命值 »).
   * Les regex ci-dessous encaissent les trois formes. test/stats-mod.test.js
   * vérifie, pour les 7 langues, que chaque description ne correspond qu'à UNE
   * seule ligne — sans quoi on ne compterait rien, ou n'importe quoi.
   *
   * `titles` ne sert plus qu'à confirmer (espagnol et anglais) : une 8ᵉ langue
   * fonctionnera sans y toucher.
   * `max` : nombre de prises maximum (0 = sans plafond).
   */
  const RUN = [
    // max: 0 = aucun plafond (le jeu n'en met ni sur Vigor ni sur Síntesis)
    { id: 'hp',  label: 'Vie max.', titles: ['Vigor', 'Vigor'],
      num: /\+\s*20(?!\s*%)/, max: 0 },
    { id: 'atk', label: 'Dégâts', titles: ['Potencia', 'Power'],
      num: /\+\s*10\s*%/, max: 40 },
    { id: 'spd', label: 'Vitesse', titles: ['Carrera', 'Sprint'],
      num: /\+\s*7\s*%/, max: 8 },
    { id: 'cd',  label: 'Cadence', titles: ['Reflejos', 'Reflexes'],
      num: /-\s*8\s*%/, max: 10 },
    // le chinois écrit « 6% » sans signe : on accepte, mais jamais « -6% »
    { id: 'def', label: 'Armure', titles: ['Coraza', 'Armor'],
      num: /(?:^|[^\d-])6\s*%/, max: 12, capAt: 0.70 },
    // « 0.9 » ou « 0,9 », avec ou sans « + » : aucune autre carte ne le porte
    { id: 'rgn', label: 'Régén.', titles: ['Síntesis', 'Synthesis'],
      num: /0[.,]9/, max: 0 },
    { id: 'mag', label: 'Aimant', titles: ['Imán', 'Magnet'],
      num: /\+\s*30\s*%/, max: 6 },
    { id: 'xp', label: 'XP', titles: ['Aprendizaje', 'Learning'],
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
  /* Les écrans qui NE sortent PAS de la partie. Tout autre <section class="scr">
   * visible signifie qu'on est dans un menu.
   *
   * La liste est prise par ce bout-là, et non par son contraire : un écran
   * ajouté par l'auteur sera alors traité comme un menu — le bon défaut — au
   * lieu de passer inaperçu. (Le jeu en a 19 au 20-10-2026.)
   */
  const RUN_SCREENS = ['scr-levelup', 'scr-pause', 'scr-over', 'scr-item', 'scr-bond'];
  const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };

  function inRun() {
    // La barre du haut est masquée pendant la partie (G.UI.chrome(false)).
    const tb = document.getElementById('topbar');
    if (!tb || !tb.classList.contains('hidden')) return false;
    if (vis('boot') || vis('tap-start')) return false;
    let menus;
    try { menus = document.querySelectorAll('section.scr'); } catch (e) { return false; }
    for (const el of menus) {
      if (el.classList.contains('hidden')) continue;
      if (!RUN_SCREENS.includes(el.id)) return false;
    }
    return true;
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

  /** Le texte d'un sous-élément de la carte. */
  const txt = (card, sel) => ((card.querySelector(sel) || {}).textContent || '');

  /** L'étiquette (le <span class="tag-chip"> dans .nm). */
  const tagOf = card => {
    const nm = card.querySelector('.nm');
    if (!nm) return '';
    // Le chip est un enfant de .nm ; on retombe sur les nœuds non-texte si la
    // structure change, plutôt que de lever une exception.
    const chip = nm.querySelector ? nm.querySelector('.tag-chip') : null;
    if (chip) return chip.textContent || '';
    return [...(nm.childNodes || [])].filter(n => n.nodeType !== 3)
      .map(n => n.textContent || '').join(' ');
  };

  /**
   * Identifie une carte de passif.
   *
   * Deux rejets STRUCTURELS d'abord, qui ne dépendent d'aucune langue :
   *   - étiquette du genre « Nv.2 > 3 » → amélioration d'un mouvement
   *     (le libellé « Nv. » est traduit, les chiffres et le « > » non) ;
   *   - titre du genre « Ascuas → Lanzallamas » → évolution.
   * Puis le nombre de la description doit correspondre à UNE seule ligne : deux
   * correspondances, c'est une ambiguïté, et on préfère ne rien compter.
   *
   * Le titre espagnol ou anglais, quand il correspond, lève tout doute ; dans
   * les autres langues on s'en passe.
   */
  function statOf(card) {
    if (!card) return null;
    const tag = tagOf(card);
    if (/\d\s*[>›→]\s*\d/.test(tag)) return null;        // amélioration de mouvement
    const t = titleOf(card);
    if (/→/.test(t)) return null;                        // évolution
    const ds = txt(card, '.ds');
    if (!ds) return null;

    const byTitle = RUN.find(s => s.titles.includes(t));
    if (byTitle && byTitle.num.test(ds)) return byTitle;

    const hits = RUN.filter(s => s.num.test(ds));
    if (hits.length === 1) return hits[0];
    return null;        // rien, ou ambigu : on ne devine pas
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
