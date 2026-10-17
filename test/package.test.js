/* Teste le PAQUET tel que Chrome le charge, pas les sources isolées :
 *   - le manifeste déclare-t-il les invariants sans lesquels le mod ne fait
 *     rien (world MAIN, document_start) ?
 *   - les deux content scripts cohabitent-ils ? Ils enveloppent les mêmes
 *     méthodes de canvas et le même requestAnimationFrame, et partagent
 *     window.__psx. Chrome les exécute l'un après l'autre dans le même monde :
 *     on reproduit cet enchaînement.
 *   - que se passe-t-il au document_start, quand <html> n'existe pas encore ?
 *   - et si le mod se retrouvait malgré tout hors du monde de la page ?
 *
 *   node tools/build.js && node test/package.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const cs = manifest.content_scripts[0];
// Chrome exécute les content scripts dans l'ordre du manifeste, dans le même
// monde : les concaténer reproduit fidèlement cet enchaînement.
const src = cs.js.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

const manifestVersion = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).version;

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  ÉCHEC') + ' ' + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
};

/* ---------- le manifeste ---------- */
console.log('\n--- manifeste ---');
check('manifest_version 3', manifest.manifest_version === 3);
check('un seul bloc de content scripts', manifest.content_scripts.length === 1);
// L'INVARIANT : un monde isolé a ses propres copies des prototypes natifs, donc
// hors du monde de la page les crochets ne toucheraient pas ceux du jeu — et le
// mod ne ferait rien, sans erreur. C'est la panne la plus coûteuse qu'on ait eue.
check('world = MAIN (sinon le mod ne fait rien, en silence)', cs.world === 'MAIN', String(cs.world));
check('run_at = document_start', cs.run_at === 'document_start', String(cs.run_at));
check('les deux modules sont déclarés, dans l’ordre',
  cs.js[0].endsWith('hud-mod.js') && cs.js[1].endsWith('stats-mod.js'), JSON.stringify(cs.js));
check('tous les fichiers déclarés existent',
  cs.js.every(f => fs.existsSync(path.join(ROOT, f))), JSON.stringify(cs.js));
check('aucune permission demandée',
  !manifest.permissions && !manifest.host_permissions,
  JSON.stringify({ p: manifest.permissions, h: manifest.host_permissions }));
check('le site du jeu est couvert',
  cs.matches.some(m => /pokesurvivor\.com/.test(m)), JSON.stringify(cs.matches));
check('pas d’injection dans les sous-cadres', cs.all_frames === false);

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
check('les deux content scripts s’exécutent sans erreur', !threw, threw && threw.message);

check('hud-mod s’est installé', logs.some(l => /hud-mod .* installé/.test(l)), JSON.stringify(logs));
check('stats-mod s’est installé', logs.some(l => /stats-mod .* installé/.test(l)), JSON.stringify(logs));
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


/* ================= DOM pas encore construit =================
 * En document_start, <html> peut ne pas encore exister. Un observe(null) levait
 * alors une exception qui tuait silencieusement tout ce qui suivait dans le
 * module (bug trouvé en 0.3.1). Chrome construit en général documentElement
 * avant d'injecter, mais rien ne le garantit — et ça avait mordu ailleurs.
 */
console.log('\n--- document_start : <html> pas encore là ---');
{
  const logs2 = [];
  const store2 = {};
  const ctx2 = new Ctx(canvas);
  const env2 = {
    window: { requestAnimationFrame() { return 1; }, addEventListener() {}, dispatchEvent() {}, devicePixelRatio: DPR },
    // documentElement null, et aucun élément : le DOM n'est pas construit
    document: { documentElement: null, getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { length: 0, key: () => null, getItem: () => null, setItem() {} },
    MutationObserver: class {
      observe(node) {
        // le vrai navigateur refuse autre chose qu'un Node
        if (node === null || node === undefined) throw new TypeError("parameter 1 is not of type 'Node'");
      }
      disconnect() {}
    },
    performance: { now: () => 0 },
    CanvasRenderingContext2D: Ctx,
    console: { info: m => logs2.push(m), warn: m => logs2.push('WARN ' + m), log() {} }
  };
  let t2 = null;
  try { new Function(...Object.keys(env2), src)(...Object.values(env2)); } catch (e) { t2 = e; }
  check('les deux scripts s’exécutent sans <html>', !t2, t2 && t2.message);
  check('hud-mod installé quand même', logs2.some(l => /hud-mod .* installé/.test(l)), JSON.stringify(logs2));
  check('stats-mod installé quand même (c’était le bug)',
    logs2.some(l => /stats-mod .* installé/.test(l)), JSON.stringify(logs2));
  check('les deux modules se sont annoncés dans __psx',
    env2.window.__psx && env2.window.__psx.hud && env2.window.__psx.stats,
    JSON.stringify(env2.window.__psx));
  check('requestAnimationFrame enveloppé malgré tout',
    env2.window.requestAnimationFrame.toString().includes('rafOrig'));
}

console.log('\n--- marqueurs de version (diagnostic console) ---');
check('__psx.hud porte la version', env.window.__psx.hud === manifestVersion(),
  String(env.window.__psx.hud));
check('__psx.stats porte la version', env.window.__psx.stats === manifestVersion(),
  String(env.window.__psx.stats));
check('version des modules = version du manifeste',
  env.window.__psx.hud === manifestVersion() && env.window.__psx.stats === manifestVersion());



console.log('\n--- chien de garde du monde isolé ---');
{
  // Simule un monde isolé : le canvas du jeu existe (DOM partagé) mais nos
  // crochets ne sont jamais appelés, parce que le jeu utilise d'autres
  // prototypes. Le mod doit le DIRE, pas échouer en silence.
  const logs3 = [];
  let timer = null;
  const env3 = {
    window: { requestAnimationFrame() { return 1; }, addEventListener() {}, dispatchEvent() {}, devicePixelRatio: DPR },
    document: { documentElement: {}, getElementById: id => (id === 'game' ? canvas : null), querySelectorAll: () => [], addEventListener() {} },
    localStorage: { length: 0, key: () => null, getItem: () => null, setItem() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    performance: { now: () => 0 },
    CanvasRenderingContext2D: class { getTransform() { return { a: 1, e: 0, f: 0 }; } },
    setTimeout: (fn, ms) => { timer = { fn, ms }; return 1 },
    console: { info() {}, warn: m => logs3.push(m), log() {} }
  };
  new Function(...Object.keys(env3), src)(...Object.values(env3));
  check('un chien de garde est armé', !!timer, JSON.stringify(timer && timer.ms));
  check('il attend quelques secondes', timer && timer.ms >= 3000, timer && String(timer.ms));
  if (timer) timer.fn();
  check('il avertit quand rien n’a été dessiné', logs3.some(l => /monde de la page/.test(l)),
    JSON.stringify(logs3));
  check('le message dit quoi vérifier',
    logs3.some(l => /"world": "MAIN"/.test(l)), JSON.stringify(logs3));
}


/* ---------- le zip ---------- */
console.log('\n--- paquet zip ---');
const { execFileSync } = require('child_process');
const zip = path.join(ROOT, 'dist', `pokesurvivor-hud-mod-${manifest.version}.zip`);
// Le zip n'existe pas encore au premier passage (build.js lance les tests AVANT
// de l'empaqueter, puis relance ce fichier une fois le zip produit).
if (!fs.existsSync(zip)) {
  console.log('  (zip pas encore fabriqué — contrôles du paquet ignorés)');
} else {
  let list = null;
  try {
    list = execFileSync('unzip', ['-Z1', zip]).toString();
  } catch (e) {
    console.log('  (binaire `unzip` indisponible — contenu du zip non inspecté)');
  }
  if (list === null) list = '';
  if (list) {
    for (const f of ['manifest.json', 'src/ui/hud-mod.js', 'src/ui/stats-mod.js', 'LICENSE', 'LICENSE-NONCOMMERCIAL.md']) {
      check('zip contient ' + f, list.includes(f));
    }
  }
  if (list) check('zip SANS les tests ni l’outillage', !/test\/|tools\//.test(list));
  if (list) check('zip SANS userscript (format abandonné en 0.4.0)', !/user\.js/.test(list));
}

console.log(fails === 0 ? '\nTOUT PASSE\n' : `\n${fails} ÉCHEC(S)\n`);
process.exit(fails ? 1 : 0);
