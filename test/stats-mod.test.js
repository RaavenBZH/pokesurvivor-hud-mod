/* Vérifie le panneau des passifs : lecture de la base en localStorage,
 * identification des cartes de niveau, cumul, plafonds, et détection de partie.
 *
 * Les valeurs attendues sont calculées à la main depuis les sources du jeu
 * (js/data/upgrades.js et js/systems/levelup.js), pas reprises du module.
 */
const fs = require('fs');
const path = require('path');

const MOD = path.join(__dirname, '..', 'src', 'ui', 'stats-mod.js');

/* ---------- faux navigateur ---------- */
const store = {};
const localStorage = {
  get length() { return Object.keys(store).length; },
  key: i => Object.keys(store)[i],
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

const nodes = {};
function el(id, { hidden = false, html = '' } = {}) {
  const e = {
    id, _hidden: hidden, innerHTML: html,
    classList: {
      contains: c => c === 'hidden' && e._hidden,
      add: c => { if (c === 'hidden') e._hidden = true; },
      remove: c => { if (c === 'hidden') e._hidden = false; }
    }
  };
  nodes[id] = e;
  return e;
}

let cardEls = [];
const SCR_IDS = ['scr-login', 'scr-test', 'scr-result', 'scr-starters', 'scr-menu', 'scr-dex',
  'scr-upgrades', 'scr-gacha', 'scr-levelup', 'scr-pause', 'scr-over', 'scr-nick', 'scr-friends',
  'scr-lobby', 'scr-rank', 'scr-item', 'scr-goals', 'scr-bond', 'scr-mod', 'scr-settings'];
const document_ = {
  documentElement: {},
  getElementById: id => nodes[id] || null,
  querySelectorAll: sel => {
    if (sel === '#cards .card') return cardEls;
    // section.scr : tous les écrans déclarés dans le faux DOM
    if (sel === 'section.scr') return SCR_IDS.map(id => nodes[id]).filter(Boolean);
    return [];
  },
  addEventListener: () => {}
};

global.window = { addEventListener: () => {}, requestAnimationFrame: cb => cb(0) };
global.document = document_;
global.localStorage = localStorage;
global.MutationObserver = class { observe() {} disconnect() {} };
global.performance = { now: () => 0 };
global.module = { exports: {} };

const src = fs.readFileSync(MOD, 'utf8');
new Function('window', 'document', 'localStorage', 'MutationObserver', 'performance', 'module', 'console', src)
  (global.window, document_, localStorage, global.MutationObserver, global.performance, global.module, console);
const M = global.module.exports;

/* ---------- fabrique de cartes, fidèle à run-ui.js:renderCards ----------
 *   <div class="card">
 *     <div class="nm">TITRE <span class="tag-chip">TAG</span></div>
 *     <div class="ds">DESCRIPTION</div>
 *     <div class="key">1</div>
 *   </div>
 */
function card(title, tag, desc) {
  const chip = { nodeType: 1, className: 'tag-chip', textContent: tag };
  const nm = {
    childNodes: [{ nodeType: 3, textContent: title + ' ' }, chip],
    querySelector: sel => (sel === '.tag-chip' ? chip : null)
  };
  const ds = { textContent: desc };
  return { querySelector: sel => (sel === '.nm' ? nm : sel === '.ds' ? ds : null) };
}

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  ÉCHEC') + ' ' + name + (cond ? '' : '  ' + extra));
  if (!cond) fails++;
};
const close = (a, b, tol = 0.005) => Math.abs(a - b) < tol;

/* ================= identification des cartes ================= */
console.log('\n--- identification des cartes de niveau ---');
const es = {
  hp: card('Vigor', 'Mejora', '+20 de vida máxima (y la recupera).'),
  atk: card('Potencia', 'Mejora', '+10% de daño con todos los movimientos.'),
  spd: card('Carrera', 'Mejora', '+7% de velocidad de movimiento.'),
  cd: card('Reflejos', 'Mejora', '-8% de recarga en todos los movimientos.'),
  def: card('Coraza', 'Mejora', '+6% de reducción de daño recibido.'),
  rgn: card('Síntesis', 'Mejora', '+0.9 de vida regenerada por segundo.'),
  mag: card('Imán', 'Mejora', '+30% de radio de recogida de experiencia.'),
  xp: card('Aprendizaje', 'Mejora', '+12% de experiencia ganada.')
};
for (const id in es) {
  const s = M.statOf(es[id]);
  check('ES ' + id, s && s.id === id, s ? 'reconnu ' + s.id : 'non reconnu');
}
const en = {
  hp: card('Vigor', 'Upgrade', '+20 max HP (and heals it).'),
  atk: card('Power', 'Upgrade', '+10% damage with every move.'),
  spd: card('Sprint', 'Upgrade', '+7% movement speed.'),
  cd: card('Reflexes', 'Upgrade', '-8% cooldown on every move.'),
  def: card('Armor', 'Upgrade', '+6% damage reduction.'),
  rgn: card('Synthesis', 'Upgrade', '+0.9 HP regenerated per second.'),
  mag: card('Magnet', 'Upgrade', '+30% experience pickup radius.'),
  xp: card('Learning', 'Upgrade', '+12% experience gained.')
};
for (const id in en) {
  const s = M.statOf(en[id]);
  check('EN ' + id, s && s.id === id, s ? 'reconnu ' + s.id : 'non reconnu');
}


/* ================= les 7 langues du jeu =================
 * Les descriptions sont reprises TELLES QUELLES de js/lang/ et js/data/lang-en.js
 * (relevées le 20-10-2026). Chacune doit correspondre à une seule ligne : si une
 * langue cassait la reconnaissance, le panneau ne compterait rien — en silence.
 */
console.log('\n--- identification dans les 7 langues ---');
const LANGUES = {
  es: { hp: '+20 de vida máxima (y la recupera).', atk: '+10% de daño con todos los movimientos.',
        spd: '+7% de velocidad de movimiento.', cd: '-8% de recarga en todos los movimientos.',
        def: '+6% de reducción de daño recibido.', rgn: '+0.9 de vida regenerada por segundo.',
        mag: '+30% de radio de recogida de experiencia.', xp: '+12% de experiencia ganada.' },
  en: { hp: '+20 max HP (and heals it).', atk: '+10% damage with every move.',
        spd: '+7% movement speed.', cd: '-8% cooldown on every move.',
        def: '+6% damage reduction.', rgn: '+0.9 HP regenerated per second.',
        mag: '+30% experience pickup radius.', xp: '+12% experience gained.' },
  // le français : espace avant « % », et virgule décimale
  fr: { hp: '+20 PV max (et les récupère).', atk: '+10 % de dégâts avec toutes les capacités.',
        spd: '+7 % de vitesse de déplacement.', cd: '-8 % de recharge sur toutes les capacités.',
        def: '+6 % de réduction des dégâts subis.', rgn: '+0,9 PV régénéré par seconde.',
        mag: "+30 % de rayon de ramassage de l'expérience.", xp: "+12 % d'expérience gagnée." },
  it: { hp: '+20 PS massimi (e li ripristina).', atk: '+10% di danno con ogni mossa.',
        spd: '+7% di velocità di movimento.', cd: '-8% di ricarica su ogni mossa.',
        def: '+6% di riduzione dei danni subiti.', rgn: '+0.9 PS rigenerati al secondo.',
        mag: '+30% di raggio di raccolta esperienza.', xp: '+12% di esperienza guadagnata.' },
  'pt-BR': { hp: '+20 de vida máxima (e recupera essa vida).', atk: '+10% de dano com todos os golpes.',
        spd: '+7% de velocidade de movimento.', cd: '-8% de recarga em todos os golpes.',
        def: '+6% de redução de dano recebido.', rgn: '+0.9 de vida regenerada por segundo.',
        mag: '+30% de raio de coleta de experiência.', xp: '+12% de experiência ganha.' },
  // le chinois : pas de « + » pour l'armure ni la régénération
  'zh-Hans': { hp: '最大生命值 +20，并恢复等量生命值。', atk: '所有招式伤害 +10%。',
        spd: '移动速度 +7%。', cd: '所有招式冷却时间 -8%。',
        def: '受到的伤害减少 6%。', rgn: '每秒恢复 0.9 生命值。',
        mag: '经验拾取半径 +30%。', xp: '获得的经验 +12%。' },
  'zh-Hant': { hp: '最大生命值 +20，並恢復等量生命值。', atk: '所有招式傷害 +10%。',
        spd: '移動速度 +7%。', cd: '所有招式冷卻時間 -8%。',
        def: '受到的傷害減少 6%。', rgn: '每秒恢復 0.9 生命值。',
        mag: '經驗拾取半徑 +30%。', xp: '獲得的經驗 +12%。' }
};

for (const [lang, descs] of Object.entries(LANGUES)) {
  let bad = [];
  for (const [id, ds] of Object.entries(descs)) {
    // titre volontairement inconnu : on teste la reconnaissance par le NOMBRE seul
    const s = M.statOf(card('Titre Inconnu', 'Amélioration', ds));
    if (!s || s.id !== id) bad.push(id + (s ? '→' + s.id : '→rien'));
  }
  check(lang.padEnd(8) + ' les 8 passifs reconnus sans le titre', bad.length === 0, bad.join(' '));
}

console.log('\n--- aucune ambiguïté entre les 8 lignes ---');
for (const [lang, descs] of Object.entries(LANGUES)) {
  const multi = [];
  for (const [id, ds] of Object.entries(descs)) {
    const n = M.RUN.filter(s => s.num.test(ds)).length;
    if (n !== 1) multi.push(id + ' correspond à ' + n + ' lignes');
  }
  check(lang.padEnd(8) + ' chaque description ne vise qu’une ligne', multi.length === 0, multi.join(' · '));
}

console.log('\n--- rejets structurels, valables dans toutes les langues ---');
check('amélioration de mouvement rejetée par son étiquette « 2 > 3 »',
  M.statOf(card('Flammèche', 'Niv.2 > 3', '+10 % de dégâts de cette capacité.')) === null);
check('idem en chinois',
  M.statOf(card('火花', '等级 2 > 3', '这个招式伤害 +10%。')) === null);
check('évolution rejetée par le « → » du titre',
  M.statOf(card('Flammèche → Lance-Flammes', 'ÉVOLUTION', '+30 % de dégâts et plus de portée.')) === null);
check('description ambiguë → rien plutôt que n’importe quoi',
  M.statOf(card('Truc', 'Amélioration', '+10% et +30% et +12%')) === null);
check('carte sans description ignorée',
  M.statOf(card('Truc', 'Amélioration', '')) === null);


console.log('\n--- cartes qui ne sont PAS des passifs ---');
check('soin instantané (Baya Zidra) ignoré',
  M.statOf(card('Baya Zidra', 'Mejora', 'Recupera el 45% de tu vida ahora mismo.')) === null);
check('nouveau mouvement ignoré',
  M.statOf(card('Bomba Imán', 'Acero', 'Lanza un orbe magnético que persigue al enemigo.')) === null);
check('évolution ignorée',
  M.statOf(card('Ascuas → Lanzallamas', 'EVOLUCIÓN', 'Más daño y más alcance.')) === null);
check('amélioration de mouvement ignorée (même avec un %)',
  M.statOf(card('Ascuas', 'Nv.2 > 3', '+10% de daño de este movimiento.')) === null);
check('titre juste mais nombre faux → ignoré',
  M.statOf(card('Potencia', 'Mejora', '+25% de daño con todos los movimientos.')) === null);

/* ================= base lue dans la sauvegarde ================= */
console.log('\n--- base : améliorations de boutique ---');
check('sans sauvegarde → tout à la valeur neutre', (() => {
  const b = M.readBase();
  return b.atkMul === 1 && b.cdMul === 1 && b.dmgReduce === 0 && b.hp === 0 && b.source === 'défaut';
})());

// Pikachu (25) : atk 5, cd 3, magnet 2, regen 2, def 4, hp 10, spd 8, xp 6
store['ps.cloud.u1'] = JSON.stringify({
  updated: 100, partner: 25,
  pupg: { 25: { atk: 5, cd: 3, magnet: 2, regen: 2, def: 4, hp: 10, spd: 8, xp: 6 }, 6: { atk: 10 } }
});
let b = M.readBase();
check('source = boutique', b.source === 'boutique');
check('atkMul = 1 + 5×0.04 = 1.20', close(b.atkMul, 1.20), String(b.atkMul));
check('cdMul = 1 − 3×0.03 = 0.91', close(b.cdMul, 0.91), String(b.cdMul));
check('magnetMul = 1 + 2×0.12 = 1.24', close(b.magnetMul, 1.24), String(b.magnetMul));
check('regen = 2×0.2 = 0.4', close(b.regen, 0.4), String(b.regen));
check('dmgReduce = 4×0.02 = 0.08', close(b.dmgReduce, 0.08), String(b.dmgReduce));
check('hp = 10×8 = 80', b.hp === 80, String(b.hp));
check('spdMul = 1 + 8×0.03 = 1.24', close(b.spdMul, 1.24), String(b.spdMul));
check('xpMul = 1 + 6×0.05 = 1.30', close(b.xpMul, 1.30), String(b.xpMul));
check('les niveaux d’un AUTRE Pokémon sont ignorés', close(b.atkMul, 1.20));

console.log('\n--- base : cas limites ---');
store['ps.cloud.u1'] = JSON.stringify({ updated: 100, partner: 25, pupg: { 25: { atk: 999, spd: -4 } } });
b = M.readBase();
check('niveau au-delà du plafond ramené au max (atk 10 → ×1.40)', close(b.atkMul, 1.40), String(b.atkMul));
check('niveau négatif ramené à 0', close(b.spdMul, 1), String(b.spdMul));

store['ps.save.vieux'] = JSON.stringify({ updated: 50, partner: 25, pupg: { 25: { atk: 1 } } });
store['ps.cloud.recent'] = JSON.stringify({ updated: 900, partner: 25, pupg: { 25: { atk: 3 } } });
delete store['ps.cloud.u1'];
check('la sauvegarde la plus récente gagne (atk 3 → ×1.12)', close(M.readBase().atkMul, 1.12),
  String(M.readBase().atkMul));
for (const k of Object.keys(store)) delete store[k];

store['ps.cloud.x'] = '{pas du json';
check('sauvegarde illisible → base neutre', M.readBase().atkMul === 1);
store['ps.cloud.x'] = JSON.stringify({ updated: 1, pupg: {} });   // sans partner
check('sauvegarde sans partenaire ignorée', M.readBase().source === 'défaut');
for (const k of Object.keys(store)) delete store[k];

/* ================= cumul ================= */
console.log('\n--- cumul des prises de la run ---');
const neutre = M.DEFAULT_BASE();
let v = M.compute(neutre, {});
check('run vide : dégâts ×1.00', close(v.atk.v, 1));
check('run vide : cadence ×1.00', close(v.cd.v, 1));
check('run vide : armure 0 %', close(v.def.v, 0));

v = M.compute(neutre, { atk: 3 });
check('3× Potencia = ×1.10³ = 1.331 (multiplicatif)', close(v.atk.v, 1.331), String(v.atk.v));
check('affichage « ×1.33 »', v.atk.txt(v.atk.v) === '×1.33', v.atk.txt(v.atk.v));

v = M.compute(neutre, { cd: 4 });
check('4× Reflejos : recharge 0.92⁴ = 0.716 → cadence ×1.40', close(v.cd.v, 1 / Math.pow(0.92, 4)), String(v.cd.v));

v = M.compute(neutre, { def: 5 });
check('5× Coraza = 30 % (additif)', close(v.def.v, 0.30), String(v.def.v));
v = M.compute(neutre, { def: 12 });
check('12× Coraza = 72 % → plafonné à 70 % par le jeu', close(v.def.v, 0.70), String(v.def.v));

v = M.compute(neutre, { rgn: 3 });
check('3× Síntesis = 2.7/s', close(v.rgn.v, 2.7), String(v.rgn.v));
check('affichage « 2.7/s »', v.rgn.txt(v.rgn.v) === '2.7/s', v.rgn.txt(v.rgn.v));

v = M.compute(neutre, { hp: 7 });
check('7× Vigor = +140 de vie max', v.hp.v === 140, String(v.hp.v));

v = M.compute(neutre, { mag: 2, xp: 2 });
check('2× Imán = ×1.69', close(v.mag.v, 1.69), String(v.mag.v));
check('2× Aprendizaje = ×1.2544', close(v.xp.v, 1.2544), String(v.xp.v));

console.log('\n--- base + run combinées ---');
const avecBase = Object.assign(M.DEFAULT_BASE(), { atkMul: 1.20, cdMul: 0.91, dmgReduce: 0.08, regen: 0.4, hp: 80 });
v = M.compute(avecBase, { atk: 2, def: 3, rgn: 1, hp: 2 });
check('dégâts : 1.20 × 1.10² = 1.452', close(v.atk.v, 1.452), String(v.atk.v));
check('armure : 0.08 + 3×0.06 = 26 %', close(v.def.v, 0.26), String(v.def.v));
check('régén. : 0.4 + 0.9 = 1.3/s', close(v.rgn.v, 1.3), String(v.rgn.v));
check('vie max : 80 + 2×20 = +120', v.hp.v === 120, String(v.hp.v));
check('cadence : 1/0.91 = ×1.10', close(v.cd.v, 1 / 0.91), String(v.cd.v));

/* ================= plafonds de prises ================= */
console.log('\n--- plafonds de prises (max de levelup.js) ---');
const maxAttendu = { hp: 0, atk: 40, spd: 8, cd: 10, def: 12, rgn: 0, mag: 6, xp: 8 };
for (const s of M.RUN) {
  check('plafond ' + s.id + ' = ' + (maxAttendu[s.id] || 'aucun'),
    s.max === maxAttendu[s.id], String(s.max));
}

/* ================= détection de partie ================= */

/* ================= plafonds : lesquels, et quand ils mordent ================= */
console.log('\n--- quels passifs ont un plafond ---');
const byId = {};
for (const s of M.RUN) byId[s.id] = s;
check('Vie max. SANS plafond (levelup.js n’en déclare pas)', byId.hp.max === 0);
check('Régén. SANS plafond', byId.rgn.max === 0);
check('les 6 autres ont un plafond',
  ['atk', 'spd', 'cd', 'def', 'mag', 'xp'].every(id => byId[id].max > 0));

console.log('\n--- « plafond atteint » ---');
const vAt = (id, n, base) => M.compute(base || M.DEFAULT_BASE(), { [id]: n })[id];
check('aimant 5/6 : pas encore au plafond', !M.isMaxed(byId.mag, 5, vAt('mag', 5).v));
check('aimant 6/6 : au plafond', M.isMaxed(byId.mag, 6, vAt('mag', 6).v));
check('vie max. jamais au plafond (99 prises)', !M.isMaxed(byId.hp, 99, vAt('hp', 99).v));
check('régén. jamais au plafond (99 prises)', !M.isMaxed(byId.rgn, 99, vAt('rgn', 99).v));

// l'armure a DEUX plafonds : 12 prises, et un effet borné à 70 %
check('armure 11/12 sans boutique : pas au plafond', !M.isMaxed(byId.def, 11, vAt('def', 11).v));
check('armure 12/12 : au plafond (prises)', M.isMaxed(byId.def, 12, vAt('def', 12).v));
const defBase = Object.assign(M.DEFAULT_BASE(), { dmgReduce: 0.16 });   // 8 niveaux de boutique
check('armure 9 prises + boutique 8 niv. = 70 % : au plafond AVANT les 12 prises',
  M.isMaxed(byId.def, 9, vAt('def', 9, defBase).v),
  'valeur ' + vAt('def', 9, defBase).v.toFixed(3));
check('armure 8 prises + boutique 8 niv. = 64 % : pas encore',
  !M.isMaxed(byId.def, 8, vAt('def', 8, defBase).v),
  'valeur ' + vAt('def', 8, defBase).v.toFixed(3));

console.log('\n--- effet cumulé une fois au plafond ---');
const attendus = { atk: 45.26, spd: 1.718, cd: 2.304, mag: 4.827, xp: 2.476 };
for (const id in attendus) {
  const v = vAt(id, byId[id].max);
  check(id + ' au plafond ≈ ×' + attendus[id], close(v.v, attendus[id], 0.01), String(v.v.toFixed(3)));
}

console.log('\n--- le plafond de prises ne peut pas être dépassé ---');
// Dans levelup.js, une stat réclamée par une évolution est proposée hors
// `room()`, MAIS seulement quand son compteur vaut 0 (ev.ready = statsTaken[x]
// non nul) : le plafond reste donc infranchissable.
// _newChoice() reproduit le signal réel : les cartes sont reconstruites à
// chaque montée de niveau, ce qui autorise un nouveau comptage.
for (const k of Object.keys(store)) delete store[k];
M._reset();
for (let i = 0; i < 9; i++) { M._newChoice(); M._take(es.mag); }
check('9 prises d’Imán comptées 6 (plafond)', M._state().taken.mag === 6,
  'compté ' + M._state().taken.mag);
for (let i = 0; i < 15; i++) { M._newChoice(); M._take(es.hp); }
check('15 prises de Vigor comptées 15 (sans plafond)', M._state().taken.hp === 15,
  'compté ' + M._state().taken.hp);

console.log('\n--- une seule carte comptée par montée de niveau ---');
M._reset();
M._newChoice();
M._take(es.atk); M._take(es.atk); M._take(es.spd);   // 2ᵉ et 3ᵉ ignorés
check('un seul comptage sans nouvelle donne', M._state().taken.atk === 1 && !M._state().taken.spd,
  JSON.stringify(M._state().taken));
M._newChoice();
M._take(es.spd);
check('nouvelle donne → nouveau comptage', M._state().taken.spd === 1);
check('une carte non-passif consomme aussi la donne', (() => {
  M._reset(); M._newChoice();
  M._take(card('Baya Zidra', 'Mejora', 'Recupera el 45% de tu vida ahora mismo.'));
  M._take(es.atk);
  return !M._state().taken.atk;
})(), JSON.stringify(M._state().taken));


console.log('\n--- détection « en partie » ---');
el('topbar', { hidden: true });
el('boot', { hidden: true });
el('tap-start', { hidden: true });
for (const id of ['scr-menu', 'scr-levelup', 'scr-pause', 'scr-over', 'scr-dex', 'scr-gacha', 'scr-settings']) el(id, { hidden: true });
check('barre du haut masquée, aucun écran → en partie', M.inRun() === true);

nodes['scr-menu']._hidden = false;
check('menu ouvert → pas en partie', M.inRun() === false);
nodes['scr-menu']._hidden = true;

nodes['topbar']._hidden = false;
check('barre du haut visible → pas en partie', M.inRun() === false);
nodes['topbar']._hidden = true;

nodes['scr-levelup']._hidden = false;
check('écran de niveau ouvert → toujours en partie', M.inRun() === true);
nodes['scr-levelup']._hidden = true;

nodes['scr-pause']._hidden = false;
check('pause → toujours en partie', M.inRun() === true);
nodes['scr-pause']._hidden = true;

nodes['scr-over']._hidden = false;
check('résumé de fin → toujours en partie', M.inRun() === true);
nodes['scr-over']._hidden = true;

nodes['scr-gacha']._hidden = false;
check('gacha → pas en partie', M.inRun() === false);
nodes['scr-gacha']._hidden = true;

nodes['boot']._hidden = false;
check('chargement → pas en partie', M.inRun() === false);
nodes['boot']._hidden = true;



/* ================= le résumé de pause (stats du jeu) =================
 * Structure reprise de run-ui.js:pauseSummary() :
 *   <div class="sum-stats"><div><span>LIBELLÉ</span><b>VALEUR</b></div> ×10</div>
 *   <table class="sum-moves"><tr><th>…</th></tr><tr><td>nom</td><td>cat</td><td>dégâts</td><td>par seconde</td></tr>…</table>
 * On lit par POSITION : les libellés sont traduits en 7 langues, l'ordre non.
 */
console.log('\n--- résumé de pause : stats du jeu ---');

function statRow(label, value, small) {
  const sm = small ? { textContent: small } : null;
  const b = {
    textContent: value + (small ? ' ' + small : ''),
    querySelector: sel => (sel === 'small' ? sm : null)
  };
  return { querySelector: sel => (sel === 'b' ? b : sel === 'span' ? { textContent: label } : null) };
}
function moveRow(name, cat, dmg, dps) {
  const cells = [
    { textContent: name + ' Nv.3', querySelector: sel => (sel === 'small' ? { textContent: ' Nv.3' } : null) },
    { textContent: cat, querySelector: () => null },
    { textContent: dmg, querySelector: () => null },
    { textContent: dps, querySelector: () => null }
  ];
  return { querySelectorAll: sel => (sel === 'td' ? cells : []) };
}
function headerRow() { return { querySelectorAll: () => [] }; }

/** Installe un faux #pause-sum. `labels` permet de tester une autre langue. */
function pauseSum(stats, moves) {
  const rows = stats.map(a => statRow(a[0], a[1], a[2]));
  const trs = [headerRow(), ...moves];
  nodes['pause-sum'] = {
    id: 'pause-sum',
    classList: { contains: () => false, add() {}, remove() {} },
    querySelectorAll: sel => (sel === '.sum-stats > div' ? rows : sel === '.sum-moves tr' ? trs : [])
  };
}

// l'ordre exact du jeu, avec des libellés ESPAGNOLS
const ES_ROWS = [
  ['Vida', '120 / 240'], ['Ataque', '×2,41'], ['At. Esp.', '×1,18'],
  ['Defensa', '40', '−12 % físico'], ['Def. Esp.', '50', '−16 % especial'],
  ['Velocidad', '132'], ['Crítico', '9 %'], ['Reducción de daño', '26 %'],
  ['Recarga', '−18 %'], ['Regeneración', '1,3 /s']
];
pauseSum(ES_ROWS, [
  moveRow('Ascuas', 'Físico', '12.345', '412/s'),
  moveRow('Danza Dragón', 'Mejora', '—', '—'),
  moveRow('Rayo Burbuja', 'Especial', '3.100', '96/s')
]);
M.readPause();
let sn = M._snap();
check('instantané pris', !!sn, 'aucun');
check('Attaque lue (position 1)', sn && sn.atk === '×2,41', sn && sn.atk);
check('Att. Spé. lue (position 2)', sn && sn.satk === '×1,18', sn && sn.satk);
check('Défense sans son <small> explicatif', sn && sn.def === '40', sn && sn.def);
check('Déf. Spé. sans son <small>', sn && sn.sdef === '50', sn && sn.sdef);
check('Vitesse lue', sn && sn.spd === '132', sn && sn.spd);
check('Critique lu', sn && sn.crit === '9 %', sn && sn.crit);
check('ligne d’en-têtes du tableau ignorée', sn && sn.moves.length === 2, sn && String(sn.moves.length));
check('mouvement d’appui (sans dégâts) ignoré',
  sn && !sn.moves.some(m => /Danza/.test(m.name)), sn && JSON.stringify(sn.moves));
check('nom et dégâts/s extraits', sn && sn.moves[0].dps === '412/s' && /Ascuas/.test(sn.moves[0].name),
  sn && JSON.stringify(sn.moves[0]));
check('« Nv.3 » retiré du nom', sn && !/Nv\./.test(sn.moves[0].name), sn && sn.moves[0].name);

console.log('\n--- libellés traduits : la lecture par position tient ---');
const FR_ROWS = [
  ['Vie', '120 / 240'], ['Attaque', '×2,41'], ['Att. Spé.', '×1,18'],
  ['Défense', '40', '−12 % physique'], ['Déf. Spé.', '50', '−16 % spécial'],
  ['Vitesse', '132'], ['Critique', '9 %'], ['Réduction des dégâts', '26 %'],
  ['Recharge', '−18 %'], ['Régénération', '1,3 /s']
];
pauseSum(FR_ROWS, [moveRow('Flammèche', 'Physique', '12.345', '412/s')]);
M.readPause();
sn = M._snap();
check('français : Attaque toujours lue', sn && sn.atk === '×2,41', sn && sn.atk);
check('français : Critique toujours lu', sn && sn.crit === '9 %', sn && sn.crit);

console.log('\n--- formats inattendus : on ne casse rien ---');
const bon = M._snap();
pauseSum(ES_ROWS.slice(0, 6), []);          // moins de 10 lignes
M.readPause();
check('tableau tronqué → l’instantané précédent est conservé',
  M._snap() === bon, 'écrasé');
pauseSum([['Vida', '1 / 2'], ['Ataque', '2,41'], ['At. Esp.', '1,18'],
  ['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j'], ['k', 'l'], ['m', 'n']], []);
M.readPause();
check('Attaque sans « × » → format non reconnu, rien n’est écrasé',
  M._snap() === bon, 'écrasé');
delete nodes['pause-sum'];
M.readPause();
check('#pause-sum absent → aucune erreur', M._snap() === bon);



console.log('\n--- les 9 lignes affichées, et lesquelles sont invariantes ---');
const shown = M.SHOWN.map(r => r.k);
check('les 9 lignes utiles du résumé sont affichées',
  shown.join(',') === 'atk,satk,def,sdef,spd,crit,red,cd,rgn', shown.join(','));
check('« Vida » n’est pas repris (déjà sur la barre de vie)', !shown.includes('hp'));
const fixes = M.SHOWN.filter(r => r.fixe).map(r => r.k);
check('Défense, Déf. Spé. et Critique marquées invariantes',
  fixes.join(',') === 'def,sdef,crit', fixes.join(','));
check('Attaque et Vitesse NE sont pas invariantes (cartes, objets, météo, terrain)',
  !M.SHOWN.find(r => r.k === 'atk').fixe && !M.SHOWN.find(r => r.k === 'spd').fixe);
check('les 3 lignes de plus sont bien lues', (() => {
  pauseSum(ES_ROWS, []); M.readPause();
  const sn = M._snap();
  return sn.red === '26 %' && sn.cd === '−18 %' && sn.rgn === '1,3 /s';
})(), JSON.stringify(M._snap()));

console.log('\n--- Aimant et XP : les seuls passifs que le jeu n’affiche pas ---');
const extras = M.EXTRAS.map(e => e.id);
check('deux extras seulement : aimant et XP', extras.join(',') === 'mag,xp', extras.join(','));
check('aucun doublon avec les lignes du résumé',
  !extras.some(id => shown.includes(id)), extras.join(','));
check('le bloc PASSIFS a disparu de la configuration', M.CFG.passifs === undefined);
check('les extras restent calculés exactement', (() => {
  M._reset(); M._newChoice(); M._take(es.mag); M._newChoice(); M._take(es.xp);
  const v = M.compute(M.DEFAULT_BASE(), M._state().taken);
  return close(v.mag.v, 1.30) && close(v.xp.v, 1.12);
})(), JSON.stringify(M._state().taken));


console.log('\n--- un écran inconnu est traité comme un menu ---');
// Garantie de la logique inversée : ce que l'auteur ajoutera plus tard ne doit
// pas faire croire qu'on est en partie.
nodes['scr-nouveau'] = el('scr-nouveau', { hidden: true });
SCR_IDS.push('scr-nouveau');
check('écran inconnu masqué → toujours en partie', M.inRun() === true);
nodes['scr-nouveau']._hidden = false;
check('écran inconnu visible → pas en partie', M.inRun() === false,
  'un écran ajouté par le jeu doit compter comme un menu');
nodes['scr-nouveau']._hidden = true;
check('refermé → de nouveau en partie', M.inRun() === true);


console.log(fails === 0 ? '\nTOUT PASSE\n' : `\n${fails} ÉCHEC(S)\n`);
process.exit(fails ? 1 : 0);
