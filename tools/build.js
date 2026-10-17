/* ============ build.js — fabrique le zip de l'extension ============
 *
 *   node tools/build.js
 *
 * Produit dist/pokesurvivor-hud-mod-<version>.zip : le dossier à dézipper puis
 * à charger dans chrome://extensions (« Charger l'extension non empaquetée »).
 *
 * Rien n'est minifié ni transformé : ce qu'on publie est lisible, et c'est la
 * moindre des choses pour du code qu'on installe dans son navigateur.
 *
 * Le zip n'est pas versionné dans le dépôt — il est fabriqué à la demande et
 * attaché aux releases. Cloner le dépôt suffit d'ailleurs à charger
 * l'extension : le manifeste est à la racine.
 *
 * On refuse de produire un paquet dont les tests échouent.
 *
 * Aucune dépendance : rien à installer, pas de npm, pas de package.json. Seuls
 * fs / path / child_process, natifs à Node. Le binaire système `zip` est la
 * seule exigence hors Node, et uniquement pour publier.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const NAME = 'pokesurvivor-hud-mod';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const cs = manifest.content_scripts[0];

/* ---------- l'invariant critique ----------
 * Ce mod remplace des méthodes de CanvasRenderingContext2D.prototype. Un monde
 * isolé possède ses PROPRES copies des prototypes natifs : hors du monde de la
 * page, les crochets ne toucheraient pas ceux du jeu et le mod ne ferait rien,
 * sans lever la moindre erreur. C'est la panne qui a coûté le plus cher à
 * diagnostiquer — on la verrouille ici.
 */
if (cs.world !== 'MAIN') {
  console.error('ARRÊT : manifest.json doit déclarer "world": "MAIN". Sans ça le mod ne fait rien.');
  process.exit(1);
}
if (cs.run_at !== 'document_start') {
  console.error('ARRÊT : manifest.json doit déclarer "run_at": "document_start".');
  process.exit(1);
}

/* ---------- contrôles ---------- */
console.log('Contrôles…');
const TESTS = ['test/hud-mod.test.js', 'test/stats-mod.test.js', 'test/package.test.js'];
for (const f of [...cs.js, 'tools/verif-signatures.js', ...TESTS]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, f)]);
}
for (const t of TESTS) {
  try {
    execFileSync(process.execPath, [path.join(ROOT, t)], { stdio: 'pipe' });
    console.log('  ok   ' + t);
  } catch (e) {
    console.error('  ÉCHEC ' + t + ' — on ne publie pas un paquet dont les tests échouent.');
    console.error(String(e.stdout || '').split('\n').filter(l => /ÉCHEC/.test(l)).join('\n'));
    process.exit(1);
  }
}

/* ---------- le zip ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const zipName = `${NAME}-${version}.zip`;
try {
  execFileSync('zip', ['-r', '-q', path.join(DIST, zipName),
    'manifest.json', 'src', 'README.md', 'TECHNIQUE.md', 'LICENSE', 'LICENSE-NONCOMMERCIAL.md'],
    { cwd: ROOT });
} catch (e) {
  // Seule dépendance hors Node de tout le projet, et elle ne sert qu'à publier.
  console.error('\nLe binaire `zip` est introuvable (il est fourni avec macOS et Linux).');
  console.error('Rien d’autre ne le remplace ici, mais il n’est utile que pour PUBLIER :');
  console.error('pour utiliser le mod, il suffit de charger ce dossier dans chrome://extensions.');
  process.exit(1);
}
const ko = (fs.statSync(path.join(DIST, zipName)).size / 1024).toFixed(0);
console.log(`\ndist/${zipName}  (${ko} Ko)`);

/* ---------- on vérifie le zip qu'on vient de produire ---------- */
try {
  execFileSync(process.execPath, [path.join(ROOT, 'test', 'package.test.js')], { stdio: 'pipe' });
  console.log('ok   test/package.test.js (paquet vérifié)');
} catch (e) {
  console.error('ÉCHEC test/package.test.js sur le zip produit');
  console.error(String(e.stdout || '').split('\n').filter(l => /ÉCHEC/.test(l)).join('\n'));
  process.exit(1);
}

console.log(`\nVersion ${version}. Pour publier :`);
console.log(`  git tag v${version} && git push origin main --tags`);
console.log(`  gh release create v${version} dist/*.zip --title "v${version}" --notes "…"`);
