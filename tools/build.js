/* ============ build.js — fabrique les deux formats de distribution ============
 *
 *   node tools/build.js
 *
 * Produit dans dist/ :
 *   pokesurvivor-hud-mod-<version>.zip   l'extension, à dézipper et charger
 *                                        dans chrome://extensions
 *   pokesurvivor-hud-mod.user.js         le même code en userscript, pour
 *                                        Tampermonkey / Violentmonkey :
 *                                        installation en un clic et mises à
 *                                        jour automatiques
 *
 * Le userscript est la simple concaténation des deux modules, dans l'ordre du
 * manifeste, précédée du bloc de métadonnées. C'est possible parce que les deux
 * sont des IIFE sans dépendance, conçues pour le monde de la page : `@grant
 * none` les y place, ce qui est exactement ce dont elles ont besoin.
 *
 * Rien n'est minifié ni transformé : ce qu'on publie est lisible, et c'est
 * voulu pour un mod qu'on installe dans son navigateur.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const NAME = 'pokesurvivor-hud-mod';
const REPO = process.env.PSX_REPO || 'RaavenBZH/pokesurvivor-hud-mod';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const files = manifest.content_scripts[0].js;
const matches = manifest.content_scripts[0].matches.filter(m => !/localhost/.test(m));

/* ---------- contrôles avant de publier quoi que ce soit ---------- */
console.log('Contrôles…');
for (const f of [...files, 'tools/verif-signatures.js', 'test/hud-mod.test.js',
                 'test/stats-mod.test.js', 'test/dist.test.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, f)]);
}
for (const t of ['test/hud-mod.test.js', 'test/stats-mod.test.js']) {
  try {
    execFileSync(process.execPath, [path.join(ROOT, t)], { stdio: 'pipe' });
    console.log('  ok   ' + t);
  } catch (e) {
    console.error('  ÉCHEC ' + t + ' — on ne publie pas un paquet dont les tests échouent.');
    console.error(String(e.stdout || '').split('\n').filter(l => /ÉCHEC/.test(l)).join('\n'));
    process.exit(1);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

/* ---------- 1. le zip de l'extension ---------- */
const zipName = `${NAME}-${version}.zip`;
execFileSync('zip', ['-r', '-q', path.join(DIST, zipName),
  'manifest.json', 'src', 'README.md', 'TECHNIQUE.md', 'LICENSE', 'LICENSE-NONCOMMERCIAL.md'],
  { cwd: ROOT });
console.log(`\ndist/${zipName}  (${(fs.statSync(path.join(DIST, zipName)).size / 1024).toFixed(0)} Ko)`);

/* ---------- 2. le userscript ---------- */
const raw = `https://raw.githubusercontent.com/${REPO}/main/dist/${NAME}.user.js`;
const header = [
  '// ==UserScript==',
  '// @name         PokéSurvivor HUD mod',
  `// @namespace    https://github.com/${REPO}`,
  `// @version      ${version}`,
  '// @description  Barres de vie en bas au centre, dégradé vert→rouge, alerte de vie basse, flèches de repérage autour du joueur et panneau des passifs. Mod non officiel.',
  '// @author       RaavenBZH',
  `// @homepageURL  https://github.com/${REPO}`,
  `// @supportURL   https://github.com/${REPO}/issues`,
  ...matches.map(m => `// @match        ${m}`),
  '// @run-at       document-start',
  '// @grant        none',
  '// @license      PolyForm-Noncommercial-1.0.0',
  `// @downloadURL  ${raw}`,
  `// @updateURL    ${raw}`,
  '// ==/UserScript==',
  '',
  '/* Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)',
  ' *',
  ' * Œuvre dérivée de PokéSurvivor, sous PolyForm Noncommercial License 1.0.0',
  ' * (https://polyformproject.org/licenses/noncommercial/1.0.0). Usage non',
  ' * commercial uniquement. Mod NON officiel, sans affiliation avec l’auteur du',
  ` * jeu ni avec Nintendo. Détail : https://github.com/${REPO}/blob/main/LICENSE`,
  ' */',
  ''
].join('\n');

const body = files.map(f =>
  `/* ======== ${f} ======== */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')
).join('\n');

const userjs = header + '\n' + body;
fs.writeFileSync(path.join(DIST, `${NAME}.user.js`), userjs);
execFileSync(process.execPath, ['--check', path.join(DIST, `${NAME}.user.js`)]);
console.log(`dist/${NAME}.user.js  (${(userjs.length / 1024).toFixed(0)} Ko, syntaxe vérifiée)`);

/* ---------- 3. on teste ce qu'on vient de produire ---------- */
try {
  execFileSync(process.execPath, [path.join(ROOT, 'test', 'dist.test.js')], { stdio: 'pipe' });
  console.log('ok   test/dist.test.js (artéfact vérifié)');
} catch (e) {
  console.error('ÉCHEC test/dist.test.js');
  console.error(String(e.stdout || '').split('\n').filter(l => /ÉCHEC/.test(l)).join('\n'));
  process.exit(1);
}

console.log(`\nVersion ${version}. Pour publier :`);
console.log(`  git tag v${version} && git push origin main --tags`);
console.log(`  gh release create v${version} dist/* --title "v${version}" --notes "…"`);
