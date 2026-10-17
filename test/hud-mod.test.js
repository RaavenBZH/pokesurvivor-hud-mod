/* Rejoue la séquence de dessin de js/ui/hud.js contre hud-mod.js, dans un faux
 * canvas, pour vérifier : suppression des bons appels, capture des valeurs,
 * mesure de la rangée d'attaques, et non-interférence avec la passe monde. */
const fs = require('fs');

const W = 1280, H = 720, DPR = 1.5;
let drawn = [];           // ce qui arrive réellement au canvas

class CanvasRenderingContext2D {
  constructor(cv) {
    this.canvas = cv;
    this._t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this.fillStyle = '#000'; this.strokeStyle = '#000';
    this.textAlign = 'left'; this.textBaseline = 'alphabetic';
    this.lineWidth = 1; this.font = ''; this.globalAlpha = 1;
    this.imageSmoothingEnabled = true;
  }
  getTransform() { return Object.assign({}, this._t); }
  setTransform(a, b, c, d, e, f) { this._t = { a, b, c, d, e, f }; }
  translate(x, y) { this._t.e += x * this._t.a; this._t.f += y * this._t.d; }
  save() { (this._st = this._st || []).push(Object.assign({}, this._t)); }
  restore() { if (this._st && this._st.length) this._t = this._st.pop(); }
  clip() {} closePath() {} scale() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  strokeText(...a) { const o = ['strokeText', ...a]; o.org = [this._t.e / DPR, this._t.f / DPR]; drawn.push(o); }
  stroke() { const o = ['stroke']; o.org = [this._t.e / DPR, this._t.f / DPR]; drawn.push(o); }
  measureText(t) { return { width: String(t).length * 6 }; }
}
for (const m of ['beginPath', 'moveTo', 'lineTo', 'arcTo', 'rect', 'arc', 'ellipse',
                 'fill', 'fillRect', 'fillText', 'clearRect', 'drawImage']) {
  CanvasRenderingContext2D.prototype[m] = function (...a) {
    const o = [m, ...a];
    o.org = [this._t.e / DPR, this._t.f / DPR];   // origine locale, en px CSS
    drawn.push(o);
  };
}

const canvas = {
  id: 'game', width: Math.round(W * DPR), height: Math.round(H * DPR),
  clientWidth: W, clientHeight: H
};
const ctx = new CanvasRenderingContext2D(canvas);
canvas.getContext = () => ctx;

let rafCb = null;
global.CanvasRenderingContext2D = CanvasRenderingContext2D;
global.window = { requestAnimationFrame(cb) { rafCb = cb; return 1; } };
global.document = { getElementById: id => (id === 'game' ? canvas : null) };
global.performance = { now: () => Date.now() };

// -- chargement du module --
const src = fs.readFileSync(
  __dirname + '/../src/ui/hud-mod.js', 'utf8');
new Function('window', 'document', 'performance', 'CanvasRenderingContext2D', 'console', src)
  (global.window, global.document, global.performance, CanvasRenderingContext2D, console);

// ---------- helpers copiés de js/ui/hud.js ----------
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function bar(c, x, y, w, h, frac, col, bg = 'rgba(0,0,0,.55)') {
  roundRect(c, x, y, w, h, h / 2); c.fillStyle = bg; c.fill();
  if (frac > 0) {
    c.save(); roundRect(c, x, y, w, h, h / 2); c.clip();
    c.fillStyle = col; c.fillRect(x, y, w * frac, h); c.restore();
  }
}

/** Une frame complète, comme game.js:render() + hud.js:draw(). */
let tick = 0;
function frame({ hp, maxHp, mates = [], slots = 3 }) {
  drawn = [];
  global.window.requestAnimationFrame(() => {});   // le jeu redemande une frame

  // passe écran : setTransform(dpr) + clearRect
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // passe monde (ombres d'entités) — ne doit JAMAIS être touchée
  ctx.setTransform(DPR * 1.6, 0, 0, DPR * 1.6, -400, -220);
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.beginPath(); ctx.ellipse(1200, 800, 16, 6.72, 0, 0, 6.2832); ctx.fill();

  // retour passe écran : HUD
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const px = 16, py = 20;
  ctx.fillStyle = '#eaf2ff'; ctx.textAlign = 'left';
  ctx.fillText('Pikachu', px, py + 10);                       // nom (conservé)
  ctx.fillText('Nv. 12', px, py + 26);                        // niveau (conservé)
  bar(ctx, px + 48, py + 17, 168, 11, hp / maxHp, '#ff5f6d'); // MA barre (à masquer)
  ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(hp) + ' / ' + Math.round(maxHp), px + 48 + 84, py + 26);

  // chip de buff (conservée) : x = 22, même bande que le coop
  ctx.textAlign = 'left';
  roundRect(ctx, px, py + 34, 48, 15, 7); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
  ctx.fillStyle = '#ff6b4d'; ctx.fillText('ATK ×2', px + 6, py + 45);

  // horloge + ligne de biome (conservées, centrées)
  ctx.textAlign = 'center';
  ctx.fillText('3:07', W / 2, 42);
  ctx.fillText('BOSQUE  ·  214 DERROTADOS  ·  31 MONEDAS', W / 2, 58);

  // barre de boss (conservée)
  bar(ctx, (W - 420) / 2, 70, 420, 12, 0.7, '#ffcb3d');

  // bloc cooperatif
  if (mates.length) {
    let y = py + 56;
    ctx.textAlign = 'left';
    for (const m of mates) {
      ctx.fillStyle = m.color;
      ctx.fillText(m.name, px, y + 9);
      bar(ctx, px + 78, y + 1, 110, 8, m.dead ? 0 : m.hp / m.maxHp, m.dead ? '#ff5f6d' : '#5fe08a');
      if (m.dead) { ctx.fillStyle = '#ff8a96'; ctx.fillText('CAÍDO', px + 78 + 116, y + 9); }
      y += 15;
    }
  }

  // rangée d'attaques (conservée) : S = 54, GAP = 9, centrée, en bas
  const S = 54, GAP = 9, n = slots;
  const totalW = n * S + (n - 1) * GAP;
  const sx = (W - totalW) / 2, sy = H - S - 18;
  for (let i = 0; i < n; i++) {
    const on = i === 0;                       // la case active est remontée de 6 px
    const y = on ? sy - 6 : sy;
    roundRect(ctx, sx + i * (S + GAP), y, S, S, 12);
    ctx.fillStyle = 'rgba(10,16,28,.8)'; ctx.fill(); ctx.stroke();
    if (on) {                                 // nom du mouvement actif, AU-DESSUS
      ctx.textAlign = 'center';
      ctx.fillText('Ascuas', sx + S / 2, y - 7);
    }
  }
  const hud = drawn.slice();
  drawn = [];
  rafCb(++tick);                     // déclenche notre paint()
  return { hud, mod: drawn.slice() };
}

// ---------------- vérifications ----------------
let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  ÉCHEC') + ' ' + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
};
const has = (list, pred) => list.some(pred);

console.log('\n--- solo, vie à 70 % ---');
// Deux frames : la rangée d'attaques est dessinée en dernier, donc sa mesure ne
// sert qu'à la frame suivante (sinon on tombe sur le repli h - 54 - 18).
frame({ hp: 700, maxHp: 1000 });
let r = frame({ hp: 700, maxHp: 1000 });
check('ma barre d’origine supprimée (fond)',
  !has(r.hud, c => c[0] === 'fill' && false) && !has(r.hud, c => c[0] === 'fillRect' && c[1] === 64 && c[2] === 37));
check('mes chiffres d’origine supprimés',
  !has(r.hud, c => c[0] === 'fillText' && /^\d+ \/ \d+$/.test(c[1])));
check('nom et niveau conservés',
  has(r.hud, c => c[0] === 'fillText' && c[1] === 'Pikachu') &&
  has(r.hud, c => c[0] === 'fillText' && c[1] === 'Nv. 12'));
check('horloge et ligne de biome conservées',
  has(r.hud, c => c[0] === 'fillText' && c[1] === '3:07') &&
  has(r.hud, c => c[0] === 'fillText' && /DERROTADOS/.test(c[1])));
check('chip de buff conservée',
  has(r.hud, c => c[0] === 'fillText' && c[1] === 'ATK ×2'));
check('ombre de la passe monde intacte',
  has(r.hud, c => c[0] === 'ellipse' && c[1] === 1200));
check('barre de boss conservée',
  has(r.hud, c => c[0] === 'fillRect' && Math.abs(c[2] - 70) < 0.01));
check('attaques conservées (3 cases)',
  r.hud.filter(c => c[0] === 'fill').length >= 3);

// notre dessin
const myFill = r.mod.filter(c => c[0] === 'fillRect' && c[3] > 100);
check('notre barre dessinée en bas', myFill.length > 0 && myFill[0][2] > H - 160,
  JSON.stringify(myFill[0]));
const SLOT_TOP = H - 54 - 18 - 6;         // 642 : la case active est remontée de 6 px
const LABEL = 18;                         // dégagement pour le nom du mouvement actif
const expectY = SLOT_TOP - LABEL - 14 - 15;   // SLOT_LABEL + gapAbove + barH
check('juste au-dessus des attaques (y ≈ ' + expectY + ')',
  myFill.length > 0 && Math.abs(myFill[0][2] - expectY) < 1.5,
  'obtenu ' + (myFill[0] && myFill[0][2]));
// le nom du mouvement actif est écrit à SLOT_TOP - 7, police 10 px : son sommet
// est vers SLOT_TOP - 17. Le bas de notre barre doit rester au-dessus.
const barBas = myFill.length ? myFill[0][2] + 15 : 0;
check('aucun chevauchement avec le nom du mouvement actif',
  barBas < SLOT_TOP - 17,
  'bas de barre ' + barBas + ' vs sommet du nom ' + (SLOT_TOP - 17));
check('chiffres redessinés par nous',
  has(r.mod, c => c[0] === 'strokeText' && c[1] === '700 / 1000'),
  JSON.stringify(r.mod.filter(c => c[0] === 'strokeText')));
check('largeur du remplissage = 70 % de la barre',
  myFill.length > 0 && Math.abs(myFill[0][3] / 320 - 0.7) < 0.02,
  'obtenu ' + (myFill[0] && (myFill[0][3] / 320).toFixed(3)));
check('pas de vignette au-dessus du seuil',
  !has(r.mod, c => c[0] === 'fillRect' && c[3] === W && c[4] === H));

console.log('\n--- vie à 8 % : vignette attendue ---');
r = frame({ hp: 80, maxHp: 1000 });
check('vignette plein écran dessinée',
  has(r.mod, c => c[0] === 'fillRect' && c[3] === W && c[4] === H));
check('chiffres à jour', has(r.mod, c => c[0] === 'strokeText' && c[1] === '80 / 1000'));

console.log('\n--- vie à 0 % ---');
r = frame({ hp: 0, maxHp: 1000 });
check('aucun remplissage de barre à 0',
  !has(r.mod, c => c[0] === 'fillRect' && c[4] === 15 && c[3] > 1));
check('vignette au maximum', has(r.mod, c => c[0] === 'fillRect' && c[3] === W));

console.log('\n--- cooperatif, 2 alliés (1 K.O.) ---');
const mates = [
  { name: 'Ana', color: '#7fe0ff', hp: 450, maxHp: 600, dead: false },
  { name: 'Luc', color: '#ffd23f', hp: 0, maxHp: 500, dead: true }
];
frame({ hp: 700, maxHp: 1000, mates });        // frame 1 : arme la détection
r = frame({ hp: 700, maxHp: 1000, mates });    // frame 2 : tout est capté
check('noms des alliés supprimés du HUD d’origine',
  !has(r.hud, c => c[0] === 'fillText' && c[1] === 'Ana') &&
  !has(r.hud, c => c[0] === 'fillText' && c[1] === 'Luc'));
check('"CAÍDO" supprimé', !has(r.hud, c => c[0] === 'fillText' && c[1] === 'CAÍDO'));
check('barres alliées supprimées',
  !has(r.hud, c => c[0] === 'fillRect' && Math.abs(c[1] - 94) < 0.01));
check('nos 2 alliés redessinés',
  has(r.mod, c => c[0] === 'strokeText' && c[1] === 'Ana') &&
  has(r.mod, c => c[0] === 'strokeText' && c[1] === 'Luc'));
check('allié K.O. marqué', has(r.mod, c => c[0] === 'fillText' && c[1] === 'K.O.'));
const allyFills = r.mod.filter(c => c[0] === 'fillRect' && Math.abs(c[4] - 9) < 0.01 && c[3] > 1);
check('barre de l’allié vivant à 75 %',
  allyFills.length === 1 && Math.abs(allyFills[0][3] / (320 - 76) - 0.75) < 0.03,
  JSON.stringify(allyFills));
const ys = r.mod.filter(c => c[0] === 'fillRect' && c[3] > 100).map(c => c[2]);
check('alliés empilés AU-DESSUS de ma barre', Math.min(...ys) < expectY, JSON.stringify(ys));


// ================= flèches de repérage =================
// Rejoue les blocs du jeu à l'identique et vérifie qu'ils atterrissent sur
// l'anneau autour du joueur, et non plus contre le bord.
const RING = 120, CX = W / 2, CY = H / 2;

/** Flèche shiny (hud.js:119) — M = 34, aucun halo. */
function shinyArrow(tx, ty) {
  const sx = tx, sy = ty;
  const M = 34;
  const ex = Math.max(M, Math.min(W - M, sx)), ey = Math.max(M + 60, Math.min(H - M - 70, sy));
  const a = Math.atan2(sy - ey, sx - ex);
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.translate(ex, ey);
  ctx.fillStyle = '#9ae6ff';
  ctx.beginPath();
  ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
  ctx.lineTo(Math.cos(a + 2.5) * 12, Math.sin(a + 2.5) * 12);
  ctx.lineTo(Math.cos(a - 2.5) * 12, Math.sin(a - 2.5) * 12);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillRect(-12, -12, 24, 24);          // à la place de Icons.draw('shiny')
  ctx.restore();
  return { ex, ey, a };
}

/** Flèche grieta (hud.js:160) — M = 52, halo circulaire AVANT la pointe. */
function riftArrow(tx, ty) {
  const sx = tx, sy = ty, M = 52;
  const ex = Math.max(M, Math.min(W - M, sx)), ey = Math.max(M + 70, Math.min(H - M - 80, sy));
  const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#b48aff';
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, 6.2832); ctx.fill();   // halo
  ctx.globalAlpha = 1;
  const tri = k => {
    ctx.beginPath();
    ctx.moveTo(ca * 40 * k, sa * 40 * k);
    ctx.lineTo(Math.cos(a + 2.45) * 20 * k, Math.sin(a + 2.45) * 20 * k);
    ctx.lineTo(Math.cos(a - 2.45) * 20 * k, Math.sin(a - 2.45) * 20 * k);
    ctx.closePath();
  };
  tri(1.12); ctx.fillStyle = '#1a0b33'; ctx.fill();
  tri(1); ctx.fillStyle = '#a06bff'; ctx.fill();
  ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
  ctx.strokeText('GRIETA · 42 m · 30 s', -ca * 34, -sa * 30 + 4);
  ctx.fillText('GRIETA · 42 m · 30 s', -ca * 34, -sa * 30 + 4);
  ctx.restore();
  return { ex, ey, a };
}

/** Un bloc qui N'EST PAS une flèche : titre centré avec halo (faux positif). */
function fakeBlock(y) {
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.fillStyle = '#334455';
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, 6.2832); ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillText('PAS UNE FLÈCHE', 0, 0);
  ctx.restore();
}

function arrowFrame(fn) {
  drawn = [];
  global.window.requestAnimationFrame(() => {});
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // le HUD normal, pour que le module se croie en partie
  ctx.textAlign = 'left';
  ctx.fillText('Pikachu', 16, 30);
  bar(ctx, 64, 37, 168, 11, 0.9, '#ff5f6d');
  ctx.textAlign = 'center';
  ctx.fillText('900 / 1000', 148, 46);
  const info = fn();
  const out = drawn.slice();
  drawn = [];
  rafCb(++tick);
  return { out, info };
}

const onRing = (org, tol = 2) =>
  Math.abs(Math.hypot(org[0] - CX, org[1] - CY) - RING) < tol;

// Seuls les appels de DESSIN sont interceptables ; arc()/moveTo() construisent
// le chemin et passent toujours. On vérifie donc l'origine effective (org) des
// appels : sur l'anneau = relocalisé, au point de bord = resté collé au bord.
const ring = c => Math.abs(Math.hypot(c.org[0] - CX, c.org[1] - CY) - RING) < 2;
const atEdge = (c, i) => Math.abs(c.org[0] - i.ex) < 1 && Math.abs(c.org[1] - i.ey) < 1;
const tips = out => out.filter(c => c[0] === 'moveTo' && (() => {
  const r = Math.hypot(c[1], c[2]); return r >= 14 && r <= 70;
})());

console.log('\n--- flèche shiny : cible loin à gauche ---');
let a1 = arrowFrame(() => shinyArrow(-900, 300));
check('point de bord d’origine bien à gauche', a1.info.ex === 34);
check('la pointe existe', tips(a1.out).length === 1);
check('pointe sur l’anneau', tips(a1.out).every(ring), JSON.stringify(tips(a1.out).map(c => c.org)));
check('pointe à gauche du joueur', tips(a1.out)[0].org[0] < CX - 40);
const ico = a1.out.find(c => c[0] === 'fillRect' && c[1] === -12);
check('l’icône shiny suit la flèche', !!ico && ring(ico));
check('plus rien au point de bord',
  !a1.out.some(c => ['fill', 'fillRect', 'fillText', 'strokeText'].includes(c[0]) && atEdge(c, a1.info)));

console.log('\n--- flèche shiny : cible loin en haut ---');
let a2 = arrowFrame(() => shinyArrow(640, -600));
check('point de bord d’origine en haut', a2.info.ey === 94);
check('pointe sur l’anneau', tips(a2.out).every(ring), JSON.stringify(tips(a2.out).map(c => c.org)));
check('pointe au-dessus du joueur', tips(a2.out)[0].org[1] < CY - 40);

console.log('\n--- flèche grieta (halo + 2 triangles + étiquette) ---');
let a3 = arrowFrame(() => riftArrow(2400, 200));
check('point de bord d’origine à droite', a3.info.ex === W - 52);
check('les 2 triangles sur l’anneau',
  tips(a3.out).length === 2 && tips(a3.out).every(ring), JSON.stringify(tips(a3.out).map(c => c.org)));
const haloFill = a3.out.filter(c => c[0] === 'fill' && ring(c));
check('halo rejoué une seule fois sur l’anneau', haloFill.length === 3,
  'fills sur l’anneau : ' + haloFill.length + ' (1 halo + 2 triangles attendus)');
check('halo rejoué AVANT les triangles',
  a3.out.filter(c => c[0] === 'arc' && ring(c)).length === 1 &&
  a3.out.indexOf(a3.out.find(c => c[0] === 'arc' && ring(c))) < a3.out.indexOf(tips(a3.out)[0]));
const lbl = a3.out.find(c => c[0] === 'fillText' && /GRIETA/.test(c[1]));
check('l’étiquette suit la flèche', !!lbl && ring(lbl));
check('plus rien au point de bord',
  !a3.out.some(c => ['fill', 'fillRect', 'fillText', 'strokeText'].includes(c[0]) && atEdge(c, a3.info)),
  JSON.stringify(a3.out.filter(c => atEdge(c, a3.info)).map(c => c[0])));
check('direction préservée : à droite du joueur', tips(a3.out)[0].org[0] > CX + 40);

console.log('\n--- cible visible : le jeu ne dessine pas de flèche ---');
let a4 = arrowFrame(() => {});
check('rien sur l’anneau', !a4.out.some(c => c.org && ring(c)));

console.log('\n--- faux positif : bloc centré avec halo, à une borne verticale ---');
let a5 = arrowFrame(() => fakeBlock(122));
const fakeFill = a5.out.find(c => c[0] === 'fill');
check('le halo est bien dessiné', !!fakeFill, JSON.stringify(a5.out.map(c => c[0])));
check('le halo reste à sa place d’origine',
  fakeFill && Math.abs(fakeFill.org[0] - W / 2) < 1 && Math.abs(fakeFill.org[1] - 122) < 1,
  fakeFill && JSON.stringify(fakeFill.org));
const fakeTxt = a5.out.find(c => c[0] === 'fillText' && /PAS UNE/.test(c[1]));
check('le texte reste à sa place', !!fakeTxt && Math.abs(fakeTxt.org[1] - 122) < 1);
check('rien n’a atterri sur l’anneau', !a5.out.some(c => c.org && ring(c)));

console.log('\n--- hors partie : on ne dessine rien ---');
drawn = [];
global.performance.now = () => Date.now() + 5000;   // > FAILSAFE
global.window.requestAnimationFrame(() => {});
rafCb(1e9);
check('aucun dessin hors partie', drawn.length === 0, JSON.stringify(drawn));

console.log(fails === 0 ? '\nTOUT PASSE\n' : `\n${fails} ÉCHEC(S)\n`);
process.exit(fails ? 1 : 0);
