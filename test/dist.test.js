/* Teste l'ARTÉFACT publié, pas les sources : le userscript est la
 * concaténation des deux modules, et rien ne garantit a priori qu'ils
 * cohabitent (ils enveloppent les mêmes méthodes de canvas et le même
 * requestAnimationFrame, et partagent window.__psx).
 *
 *   node tools/build.js && node test/dist.test.js
 */
const fs = require('fs');
const path = require('path');

const USERJS = path.join(__dirname, '..', 'dist', 'pokesurvivor-hud-mod.user.js');
if (!fs.existsSync(USERJS)) {
  console.error('dist/ absent : lance d’abord `node tools/build.js`.');
  process.exit(2);
}
const src = fs.readFileSync(USERJS, 'utf8');

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  ÉCHEC') + ' ' + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
};

/* ---------- métadonnées ---------- */
console.log('\n--- bloc de métadonnées ---');
const meta = src.slice(0, src.indexOf('// ==/UserScript=='));
check('bloc UserScript présent et fermé', src.startsWith('// ==UserScript==') && src.includes('// ==/UserScript=='));
for (const k of ['@name', '@version', '@match', '@run-at', '@grant', '@downloadURL', '@updateURL', '@license']) {
  check('métadonnée ' + k, meta.includes(k));
}
check('@grant none (donc monde de la page, indispensable)', /@grant\s+none/.test(meta));
check('@run-at document-start', /@run-at\s+document-start/.test(meta));
check('pas de @match localhost dans ce qu’on publie', !/@match.*localhost/.test(meta));
check('mention de licence obligatoire reprise',
  src.includes('Required Notice: Copyright 2026 JPTER78'));
check('mod annoncé comme non officiel', /NON officiel/i.test(src));

/* ---------- exécution des deux modules ensemble ---------- */
console.log('\n--- exécution dans un faux navigateur ---');
const W = 1280, H = 720, DPR = 1.5;
let drawn = 0;

class Ctx {
  constructor(cv) {
    this.canvas = cv; this._t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; this._st = [];
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.textAlign = 'left';
    this.textBaseline = 'alphabetic'; this.lineWidth = 1; this.font = ''; this.globalAlpha = 1;
  }
  getTransform() { return Object.assign({}, this._t); }
  setTransform(a, b, c, d, e, f) { this._t = { a, b, c, d, e, f }; }
  translate(x, y) { this._t.e += x * this._t.a; this._t.f += y * this._t.d; }
  save() { this._st.push(Object.assign({}, this._t)); }
  restore() { if (this._st.length) this._t = this._st.pop(); }
  clip() {} closePath() {} scale() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  measureText(t) { return { width: String(t).length * 6 }; }
  strokeText() { drawn++; }
  stroke() { drawn++; }
}
for (const m of ['beginPath', 'moveTo', 'lineTo', 'arcTo', 'rect', 'arc', 'ellipse',
                 'fill', 'fillRect', 'fillText', 'clearRect', 'drawImage']) {
  Ctx.prototype[m] = function () { drawn++; };
}

const canvas = { id: 'game', width: Math.round(W * DPR), height: Math.round(H * DPR), clientWidth: W, clientHeight: H };
const ctx = new Ctx(canvas);
canvas.getContext = () => ctx;

const el = (id, hidden) => ({
  id, classList: { contains: c => c === 'hidden' && hidden, add() {}, remove() {} },
  querySelector: () => null, querySelectorAll: () => []
});
const nodes = { game: canvas, topbar: el('topbar', true), boot: el('boot', true), 'tap-start': el('tap-start', true) };
for (const id of ['scr-menu', 'scr-levelup', 'scr-pause', 'scr-over', 'scr-dex', 'scr-gacha', 'scr-settings',
                  'scr-login', 'scr-test', 'scr-result', 'scr-starters', 'scr-upgrades', 'scr-nick',
                  'scr-friends', 'scr-lobby', 'scr-rank', 'scr-goals', 'scr-mod', 'cards']) nodes[id] = el(id, true);

let rafCb = null;
const store = {};
const logs = [];

const env = {
  window: {
    requestAnimationFrame(cb) { rafCb = cb; return 1; },
    addEventListener() {}, dispatchEvent() {}, devicePixelRatio: DPR
  },
  document: {
    documentElement: {},
    getElementById: id => nodes[id] || null,
    querySelectorAll: () => [],
    addEventListener() {}
  },
  localStorage: {
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i],
    getItem: k => (k in store ? store[k] : null),
    setItem(k, v) { store[k] = String(v); }
  },
  MutationObserver: class { observe() {} disconnect() {} },
  performance: { now: () => 1000 },
  CanvasRenderingContext2D: Ctx,
  console: { info: m => logs.push(m), warn: m => logs.push('WARN ' + m), log: () => {} }
};

let threw = null;
try {
  new Function(...Object.keys(env), src)(...Object.values(env));
} catch (e) { threw = e; }
check('le userscript s’exécute sans erreur', !threw, threw && threw.message);

check('hud-mod s’est installé', logs.some(l => /hud-mod installé/.test(l)), JSON.stringify(logs));
check('stats-mod s’est installé', logs.some(l => /stats-mod installé/.test(l)), JSON.stringify(logs));
check('aucun avertissement au chargement', !logs.some(l => /^WARN/.test(l)), JSON.stringify(logs));
check('drapeau partagé window.__psx créé', !!env.window.__psx);

/* les deux modules enveloppent requestAnimationFrame : la chaîne doit tenir */
console.log('\n--- cohabitation des deux modules ---');
check('requestAnimationFrame a bien été enveloppé', env.window.requestAnimationFrame.toString().includes('rafOrig'));

// Une frame complète : le jeu redemande une frame, dessine son HUD, puis les
// deux modules peignent par-dessus.
env.window.requestAnimationFrame(() => {});
check('un callback a été enregistré', typeof rafCb === 'function');

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
let frameThrew = null;
try {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.fillText('Pikachu', 16, 30);
  ctx.fillText('Nv. 12', 16, 46);
  roundRect(ctx, 64, 37, 168, 11, 5.5); ctx.fill();
  ctx.save(); roundRect(ctx, 64, 37, 168, 11, 5.5); ctx.clip();
  ctx.fillRect(64, 37, 168 * 0.35, 11); ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillText('350 / 1000', 148, 46);
  for (let i = 0; i < 3; i++) { roundRect(ctx, 550 + i * 63, 642, 54, 54, 12); ctx.fill(); }
  const before = drawn;
  rafCb(1);
  check('les modules ont dessiné par-dessus la frame', drawn > before, 'appels : ' + (drawn - before));
} catch (e) { frameThrew = e; }
check('une frame complète passe sans erreur', !frameThrew, frameThrew && frameThrew.message);
check('toujours aucun avertissement', !logs.some(l => /^WARN/.test(l)), JSON.stringify(logs.filter(l => /^WARN/.test(l))));
check('la pile de transformations est revenue à l’état neutre',
  ctx._st.length === 0, 'profondeur ' + ctx._st.length);

/* ---------- le zip ---------- */
console.log('\n--- paquet zip ---');
const { execFileSync } = require('child_process');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const zip = path.join(__dirname, '..', 'dist', `pokesurvivor-hud-mod-${manifest.version}.zip`);
check('zip présent', fs.existsSync(zip));
if (fs.existsSync(zip)) {
  const list = execFileSync('unzip', ['-Z1', zip]).toString();
  for (const f of ['manifest.json', 'src/ui/hud-mod.js', 'src/ui/stats-mod.js', 'LICENSE', 'LICENSE-NONCOMMERCIAL.md']) {
    check('zip contient ' + f, list.includes(f));
  }
  check('zip SANS les tests ni l’outillage', !/test\/|tools\//.test(list));
  check('version du userscript = version du manifeste',
    meta.includes('@version      ' + manifest.version));
}

console.log(fails === 0 ? '\nTOUT PASSE\n' : `\n${fails} ÉCHEC(S)\n`);
process.exit(fails ? 1 : 0);
