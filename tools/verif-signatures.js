/* ============ verif-signatures.js — l'extension est-elle encore d'actualité ? ============
 *
 *   node tools/verif-signatures.js [chemin du dépôt du jeu]
 *
 * hud-mod.js reconnaît les éléments du HUD à leurs coordonnées exactes, qui
 * sont des constantes du code du jeu. Si l'auteur les change, l'extension se
 * désarme et le HUD d'origine revient (c'est voulu), mais il faut alors mettre
 * les constantes à jour.
 *
 * Ce script relit les sources du jeu, en réextrait les valeurs et les compare à
 * celles de hud-mod.js. Il ne modifie rien : il dit quoi corriger, et où.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* Où est le dépôt du jeu ? En argument, sinon on cherche un clone voisin.
 * (Ce mod est un dépôt autonome : le jeu n'est plus le dossier parent.) */
const CANDIDATS = [
  path.join(__dirname, '..', '..', 'pokesurvivor'),
  path.join(__dirname, '..', 'pokesurvivor'),
  path.join(__dirname, '..', '..', '..')
];
const GAME = process.argv[2] || CANDIDATS.find(d => fs.existsSync(path.join(d, 'js', 'ui', 'hud.js'))) || CANDIDATS[0];
const MOD = path.join(__dirname, '..', 'src', 'ui', 'hud-mod.js');

function read(rel) {
  const p = path.join(GAME, rel);
  if (!fs.existsSync(p)) {
    console.error(`Introuvable : ${p}

Ce script compare l'extension aux sources du jeu : il lui faut un clone de
https://github.com/JPTER78/pokesurvivor . Donne son chemin en argument :

    node tools/verif-signatures.js ~/chemin/vers/pokesurvivor
`);
    process.exit(2);
  }
  return fs.readFileSync(p, 'utf8');
}

const hud = read('js/ui/hud.js');
const events = read('js/systems/events.js');
const judgment = read('js/systems/judgment.js');
const mod = fs.readFileSync(MOD, 'utf8');

const grab = (src, re, what) => {
  const m = re.exec(src);
  if (!m) { console.error(`\n✗ Motif introuvable dans le jeu : ${what}\n  ${re}`); missing.push(what); return null; }
  return m;
};
let missing = [];

/* ---------- ce que dit le jeu ---------- */
const pxpy = grab(hud, /const px = (\d+), py = (\d+);/, 'px / py du bloc de vie');
const myBar = grab(hud, /bar\(ctx, px \+ (\d+), py \+ (\d+), (\d+), (\d+), pl\.hp/, 'barre de vie du joueur');
const myTxt = grab(hud, /fillText\(Math\.ceil\(pl\.hp\)[^,]*,\s*px \+ (\d+) \+ (\d+), py \+ (\d+)\)/, 'chiffres de vie');
const allyX = grab(hud, /const lx = px \+ (\d+);/, 'décalage des barres alliées');
const allyBar = grab(hud, /bar\(ctx, lx, y \+ 1, (\d+), (\d+),/, 'barre de vie alliée');
const allyDead = grab(hud, /fillText\('CA[ÍI]DO', lx \+ (\d+),/, 'étiquette « tombé »');
const slot = grab(hud, /const S = (\d+), GAP = (\d+);/, 'taille des cases d’attaque');

const px = pxpy ? +pxpy[1] : NaN, py = pxpy ? +pxpy[2] : NaN;

const game = {
  'MY.x': myBar && px + +myBar[1],
  'MY.y': myBar && py + +myBar[2],
  'MY.w': myBar && +myBar[3],
  'MY.h': myBar && +myBar[4],
  'MY.textX': myTxt && px + +myTxt[1] + +myTxt[2],
  'MY.textY': myTxt && py + +myTxt[3],
  'ALLY.x': allyX && px + +allyX[1],
  'ALLY.w': allyBar && +allyBar[1],
  'ALLY.h': allyBar && +allyBar[2],
  'ALLY.nameX': px,
  'ALLY.deadX': allyX && allyDead && px + +allyX[1] + +allyDead[1],
  'SLOT': slot && +slot[1]
};

/* Les cinq sites de flèche : pour chaque clamp vertical, la marge M déclarée
 * juste avant (dans le même fichier). */
function arrowsOf(src, file) {
  const out = [];
  // Toutes les déclarations de marge, avec leur position.
  const decls = [];
  const dre = /const M = (\d+)[,;]/g;
  let d;
  while ((d = dre.exec(src))) decls.push({ at: d.index, M: +d[1] });

  const re = /G\.U\.clamp\(sy, M \+ (\d+), h - M - (\d+)\)/g;
  let m;
  while ((m = re.exec(src))) {
    // la marge est celle déclarée le plus près AVANT ce clamp (souvent sur la
    // même ligne : `const M = 52, ex = …, ey = G.U.clamp(sy, M + 70, …)`)
    const own = decls.filter(x => x.at <= m.index).pop();
    if (!own) continue;
    out.push({ M: own.M, dTop: +m[1], dBot: +m[2], file });
  }
  return out;
}
const gameArrows = [
  ...arrowsOf(hud, 'js/ui/hud.js'),
  ...arrowsOf(events, 'js/systems/events.js'),
  ...arrowsOf(judgment, 'js/systems/judgment.js')
].sort((a, b) => a.M - b.M);

/* ---------- ce que dit l'extension ---------- */
const lit = (name, re) => {
  const m = re.exec(mod);
  if (!m) { console.error(`✗ ${name} introuvable dans hud-mod.js`); process.exit(2); }
  return new Function('return ' + m[1])();
};
const MY = lit('MY', /const MY = (\{[^}]*\});/);
const ALLY = lit('ALLY', /const ALLY = (\{[^}]*\});/);
const SLOT = lit('SLOT', /const SLOT = (\d+);/);
const ARROWS = lit('ARROWS', /const ARROWS = (\[[\s\S]*?\]);/);

const ext = {
  'MY.x': MY.x, 'MY.y': MY.y, 'MY.w': MY.w, 'MY.h': MY.h,
  'MY.textX': MY.textX, 'MY.textY': MY.textY,
  'ALLY.x': ALLY.x, 'ALLY.w': ALLY.w, 'ALLY.h': ALLY.h,
  'ALLY.nameX': ALLY.nameX, 'ALLY.deadX': ALLY.deadX,
  'SLOT': SLOT
};

/* ---------- comparaison ---------- */
let bad = 0;
console.log('\nConstantes du HUD');
for (const k of Object.keys(game)) {
  const g = game[k], e = ext[k];
  const ok = g != null && g === e;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${k.padEnd(12)} jeu ${String(g).padStart(5)}   extension ${String(e).padStart(5)}`);
}

console.log('\nSites de flèche (marge, bornes verticales)');
const key = a => `${a.M}/${a.dTop}/${a.dBot}`;
const extKeys = ARROWS.map(key);
for (const a of gameArrows) {
  const ok = extKeys.includes(key(a));
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'MANQUE'} M=${String(a.M).padStart(3)}  +${a.dTop} / -${a.dBot}   ${a.file}`);
}
for (const a of ARROWS) {
  if (!gameArrows.some(g => key(g) === key(a))) {
    bad++;
    console.log(`  EN TROP M=${String(a.M).padStart(3)}  +${a.dTop} / -${a.dBot}   (plus dans le jeu)`);
  }
}

/* ================= tables dupliquées par stats-mod.js =================
 * Le panneau des passifs reconstitue des valeurs que le jeu ne dessine pas : il
 * duplique donc la table des améliorations de boutique et celle des cartes de
 * niveau. Si l'auteur rééquilibre, il faut le savoir.
 */
const statsMod = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'stats-mod.js'), 'utf8');
const upgrades = read('js/data/upgrades.js');
const levelup = read('js/systems/levelup.js');

console.log('\nBoutique : plafonds et effet par niveau (js/data/upgrades.js)');
// { id: 'atk', …, max: 10, … }  et  atkMul: 1 + L('atk') * 0.04
const shopMax = {};
for (const m of upgrades.matchAll(/\{\s*id:\s*'(\w+)'[^}]*?max:\s*(\d+)/g)) shopMax[m[1]] = +m[2];
const shopPer = {};
for (const m of upgrades.matchAll(/(\w+):\s*(?:1 [-+] )?L\('(\w+)'\)\s*\*\s*([\d.]+)/g)) shopPer[m[2]] = +m[3];

for (const m of statsMod.matchAll(/^\s{4}(\w+):\s*\{\s*max:\s*(\d+),\s*per:\s*([\d.]+)/gm)) {
  const [, id, max, per] = m;
  const okMax = shopMax[id] === +max, okPer = shopPer[id] === +per;
  if (!okMax || !okPer) bad++;
  console.log(`  ${okMax && okPer ? 'ok  ' : 'DIFF'} ${id.padEnd(7)} max ${String(shopMax[id]).padStart(3)}/${max}   par niveau ${String(shopPer[id]).padStart(5)}/${per}`);
}

console.log('\nCartes de niveau : plafonds de prises (js/systems/levelup.js)');
// { id: 'atk', …, apply: …, max: 40 }
const runMax = {};
for (const m of levelup.matchAll(/\{\s*id:\s*'(\w+)',\s*icon:[\s\S]*?apply:[^}]*?(?:,\s*max:\s*(\d+))?\s*\}/g)) {
  runMax[m[1]] = m[2] ? +m[2] : 0;
}
// `max: N` peut être suivi d'autres champs (ex. `capAt`) : on ne s'arrête donc
// pas à l'accolade.
for (const m of statsMod.matchAll(/\{\s*id:\s*'(\w+)',\s*label:[\s\S]*?max:\s*(\d+)/g)) {
  const [, id, max] = m;
  const ok = runMax[id] === +max;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${id.padEnd(7)} jeu ${String(runMax[id]).padStart(3)}   extension ${String(max).padStart(3)}`);
}

console.log('\nCartes de niveau : effet de chaque prise');
const EFFETS = [
  ['atk', /pl\.atkMul \*= ([\d.]+)/, '1.10'],
  ['spd', /pl\.spdMul \*= ([\d.]+)/, '1.07'],
  ['cd', /pl\.cdMul \*= ([\d.]+)/, '0.92'],
  ['def', /pl\.dmgReduce \+ ([\d.]+)/, '0.06'],
  ['rgn', /pl\.regenFlat \+= ([\d.]+)/, '0.9'],
  ['mag', /pl\.magnet \*= ([\d.]+)/, '1.30'],
  ['xp', /pl\.xpMul \*= ([\d.]+)/, '1.12'],
  ['hp', /pl\.addMaxHp\((\d+)\)/, '20'],
  ['def-cap', /Math\.min\(([\d.]+), pl\.dmgReduce/, '0.7']
];
for (const [id, re, attendu] of EFFETS) {
  const m = re.exec(levelup);
  const got = m ? m[1] : null;
  const ok = got !== null && parseFloat(got) === parseFloat(attendu);
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${id.padEnd(8)} jeu ${String(got).padStart(5)}   attendu par l’extension ${attendu.padStart(5)}`);
}

if (missing.length) bad += missing.length;
if (bad === 0) {
  console.log('\nTout concorde : l’extension est à jour.\n');
  process.exit(0);
}
console.log(`\n${bad} écart(s). À corriger dans l’extension :`);
console.log('  - src/ui/hud-mod.js : constantes MY / ALLY / SLOT (section « signatures »)');
console.log('  - src/ui/hud-mod.js : tableau ARROWS pour les flèches');
console.log('  - src/ui/stats-mod.js : tables SHOP / RUN pour les passifs');
console.log('Puis : node test/hud-mod.test.js, et relance une partie pour vérifier à l’œil.\n');
process.exit(1);
