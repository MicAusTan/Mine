import { Game, Status } from './engine.js';
import { SHAPES, buildLayout, gridSizeFor } from './shapes.js';
import { buildTiledLayout } from './tilings.js';
import { Renderer } from './render.js';
import { randomSeed } from './rng.js';
import { initThemes } from './themeui.js';
import { recordWin, getStats, exportJSON, importJSON, resetStats } from './stats.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Presets: classic 9x9/10, 16x16/40, 30x16/99. Other shapes aim for the same cell counts.
const RECT = { easy: [9, 9], medium: [16, 16], hard: [30, 16] };
const RINGS = { easy: 3, medium: 4, hard: 5 }; // hyperbolic heptagon boards: 85 / 232 / ~630 tiles
const TARGET = { easy: 81, medium: 256, hard: 480 };
const DENSITY = { easy: 10 / 81, medium: 40 / 256, hard: 99 / 480 };

const board = $('board'), face = $('face');
const renderer = new Renderer(board);
let game, cfg, timerId = null, seconds = 0;
let ranked = false, finished = false, startedAt = 0;
let shiftHeld = false, touched = new Set(), hover = -1;

// ---------- setup / config ----------
for (const [k, v] of Object.entries(SHAPES)) $('shape').add(new Option(v.label, k));

// Width x height boards: rectangles, and every shape-tile board except the heptagon disk.
const usesWH = (shape, tiled) => shape === 'rect' || (tiled && shape !== 'heptagon');
const isTiled = shape => $('tiles').value === 'shape' && shape !== 'rect';

function readConfig() {
  const shape = $('shape').value, diff = $('diff').value, tiled = isTiled(shape);
  let w, h, mines = null;
  if (diff === 'custom') {
    if (usesWH(shape, tiled)) { w = clamp(+$('cw').value || 9, 5, 60); h = clamp(+$('ch').value || 9, 5, 40); }
    else if (tiled) { w = h = clamp(+$('cw').value || 3, 1, 5); }
    else { w = h = clamp(+$('cw').value || 15, 7, 45); }
    mines = +$('cm').value || null;
  } else if (usesWH(shape, tiled)) { [w, h] = RECT[diff]; }
  else if (tiled) { w = h = RINGS[diff]; }
  else { w = h = gridSizeFor(shape, TARGET[diff]); }
  return { shape, tiled, diff, w, h, mines, noGuess: $('mode').value === 'ng' };
}

function syncUI() {
  const shape = $('shape').value, tiled = isTiled(shape), wh = usesWH(shape, tiled);
  $('tiles').disabled = shape === 'rect';
  $('custom').hidden = $('diff').value !== 'custom';
  $('chwrap').hidden = !wh;
  $('cwlabel').textContent = wh ? 'Width' : tiled ? 'Rings' : 'Size';
}

function startGame(c, seed) {
  // Only brand-new random boards on a preset difficulty count towards records.
  const fresh = seed === undefined;
  seed ??= randomSeed();
  ranked = fresh && c.diff !== 'custom';
  finished = false; startedAt = 0;
  $('msg').textContent = '';
  stopTimer(); seconds = 0;
  const layout = c.tiled ? buildTiledLayout(c.shape, c.w, c.h) : buildLayout(c.shape, c.w, c.h);
  const dens = DENSITY[c.diff] ?? DENSITY.medium;
  const mines = clamp(c.mines ?? Math.round(layout.cells.length * dens), 1, layout.cells.length - 1);
  cfg = { ...c, mines };
  game = new Game(layout, mines, seed, { noGuess: c.noGuess });
  if (shiftHeld) { game.beginGroup(); touched = new Set(); }
  renderer.build(layout);
  setFace(); hud();
  $('code').value = `${cfg.shape}${cfg.tiled ? '~t' : ''}:${cfg.w}x${cfg.h}:${mines}:${seed}${cfg.noGuess ? ':ng' : ''}`;
}

// ---------- HUD / timer ----------
function pad(n) {
  return n < 0 ? '-' + String(Math.min(99, -n)).padStart(2, '0') : String(Math.min(999, n)).padStart(3, '0');
}
function hud() { $('mines').textContent = pad(game.mineCount - game.flags); $('time').textContent = pad(seconds); }
function setFace() { face.textContent = { [Status.WON]: '😎', [Status.LOST]: '😵' }[game.status] || '😊'; }
function startTimer() {
  seconds = 1; hud();
  const t0 = startedAt;
  timerId = setInterval(() => { seconds = Math.min(999, 1 + Math.floor((Date.now() - t0) / 1000)); hud(); }, 200);
}
function stopTimer() { clearInterval(timerId); timerId = null; }

const fmt = ms => (ms / 1000).toFixed(2) + 's';

function onWin() {
  finished = true;
  const ms = Date.now() - startedAt;
  let text = `Cleared in ${fmt(ms)}`;
  if (ranked && !game.ngFailed) {
    const r = recordWin(`${cfg.shape}${cfg.tiled ? '~t' : ''}:${cfg.diff}${cfg.noGuess ? ':ng' : ''}`, ms);
    text += r.isBest ? ' - new best!' : ` - best: ${fmt(r.best)}`;
  } else text += game.ngFailed ? ' (normal board, not recorded)' : ' (practice board, not recorded)';
  $('msg').textContent = text;
}

function afterAction(changed) {
  renderer.update(game, changed);
  if (game.status !== Status.READY && !startedAt) startedAt = Date.now();
  if (game.status === Status.PLAYING && !timerId) startTimer();
  if (game.over) stopTimer();
  if (game.status === Status.WON && !finished) onWin();
  setFace(); hud();
}

// ---------- mouse ----------
const idxOf = t => { const el = t.closest?.('[data-i]'); return el ? +el.dataset.i : -1; };

// No-guess boards are generated on the first click, which can take a moment.
let busy = false;
function reveal(i) {
  if (busy) return;
  if (game.noGuess && game.status === Status.READY && !game.flag[i]) {
    busy = true;
    $('msg').textContent = 'Finding a guess-free board…';
    const g = game;
    setTimeout(() => {
      busy = false;
      if (g !== game) return;
      afterAction(game.reveal(i));
      $('msg').textContent = game.ngFailed ? "Couldn't find a guess-free board for this seed, so this one is a normal board." : '';
    }, 30);
    return;
  }
  afterAction(game.reveal(i));
}

board.addEventListener('contextmenu', e => e.preventDefault());
board.addEventListener('mousedown', e => {
  const i = idxOf(e.target);
  if (e.button === 1) e.preventDefault();
  if (i < 0 || game.over || shiftHeld) return;
  if (e.button === 2) afterAction(game.toggleFlag(i));
  else if (e.button === 0) face.textContent = '😮';
});
board.addEventListener('mouseup', e => {
  setFace();
  const i = idxOf(e.target);
  if (i < 0 || game.over || shiftHeld) return;
  if (e.button === 0) reveal(i);
  else if (e.button === 1) afterAction(game.chord(i));
});
board.addEventListener('mouseover', e => {
  hover = idxOf(e.target);
  if (shiftHeld && hover >= 0) paint(hover);
});
board.addEventListener('mouseleave', () => { hover = -1; setFace(); });

// ---------- shift-hover flag painting ----------
// While Shift is held, hovering toggles a cell's flag once. Cells already touched
// during this hold are locked until Shift is released.
function paint(i) {
  if (touched.has(i)) return;
  touched.add(i);
  const ch = game.toggleFlag(i);
  if (ch.length) afterAction(ch);
}
function startPaint() {
  shiftHeld = true; touched = new Set();
  game.beginGroup();
  board.classList.add('painting');
  if (hover >= 0) paint(hover);
}
function endPaint() {
  if (!shiftHeld) return;
  shiftHeld = false; touched = new Set();
  game.endGroup();
  board.classList.remove('painting');
}
const typing = e => ['INPUT', 'SELECT'].includes(e.target.tagName);
addEventListener('keydown', e => {
  if (typing(e)) return;
  if (e.key === 'Shift' && !e.repeat) startPaint();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
});
addEventListener('keyup', e => { if (e.key === 'Shift') endPaint(); });
addEventListener('blur', endPaint);

function doUndo() { if (!shiftHeld) afterAction(game.undo()); }

// ---------- controls ----------
face.onclick = () => startGame(readConfig());
$('restart').onclick = () => startGame(cfg, game.seed);
$('undo').onclick = doUndo;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('code').value); $('copy').textContent = 'Copied!'; }
  catch { $('code').select(); $('copy').textContent = 'Press Ctrl+C'; }
  setTimeout(() => $('copy').textContent = 'Copy', 1200);
};

function loadCode() {
  const raw = $('code').value.trim();
  if (!raw) return;
  const p = raw.split(':');
  const [base, tflag] = (p[0] ?? '').split('~');
  if ((p.length === 4 || (p.length === 5 && p[4] === 'ng')) && SHAPES[base] && (tflag === undefined || (tflag === 't' && base !== 'rect'))) {
    const m = /^(\d+)x(\d+)$/.exec(p[1]), mines = +p[2];
    if (m && mines > 0 && p[3]) {
      $('shape').value = base; $('tiles').value = tflag === 't' ? 'shape' : 'square'; $('diff').value = 'custom'; $('mode').value = p.length === 5 ? 'ng' : 'classic';
      $('cw').value = m[1]; $('ch').value = m[2]; $('cm').value = mines;
      syncUI();
      return startGame(readConfig(), p[3]);
    }
  } else if (p.length === 1) return startGame(readConfig(), raw); // plain seed
  $('code').classList.add('bad');
  setTimeout(() => $('code').classList.remove('bad'), 800);
}
$('load').onclick = loadCode;
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') loadCode(); });
$('code').addEventListener('focus', e => e.target.select());

$('mode').onchange = () => startGame(readConfig());
$('tiles').onchange = () => { syncUI(); startGame(readConfig()); };
$('shape').onchange = () => { syncUI(); startGame(readConfig()); };
$('diff').onchange = () => {
  if ($('diff').value === 'custom') { $('cw').value = cfg.w; $('ch').value = cfg.h; $('cm').value = cfg.mines; }
  syncUI(); startGame(readConfig());
};
for (const id of ['cw', 'ch', 'cm']) $(id).onchange = () => startGame(readConfig());

// ---------- stats dialog ----------
function renderStats() {
  const d = getStats();
  const rows = Object.entries(d.records).filter(([, r]) => r.wins > 0);
  const total = rows.reduce((a, [, r]) => a + r.wins, 0);
  let html = `<p>Boards cleared: <b>${total}</b></p>`;
  if (!rows.length) html += '<p>Nothing here yet. Clear a board to get started!</p>';
  else html += '<table><tr><th>Board</th><th>Best</th><th>Last</th><th>Cleared</th></tr>' +
    rows.map(([k, r]) => {
      const [sk, df, md] = k.split(':'), s = sk.replace('~t', '');
      return `<tr><td>${SHAPES[s]?.label ?? s}${sk.endsWith('~t') ? ' (shape tiles)' : ''} · ${df}${md ? ' · no-guess' : ''}</td><td>${fmt(r.best)}</td><td>${fmt(r.last)}</td><td>${r.wins}</td></tr>`;
    }).join('') + '</table>';
  $('statsBody').innerHTML = html;
}
$('statsBtn').onclick = () => { renderStats(); $('stats').showModal(); };
$('sClose').onclick = () => $('stats').close();
$('sExport').onclick = async () => {
  const t = exportJSON();
  try { await navigator.clipboard.writeText(t); alert('Stats copied to your clipboard.'); }
  catch { prompt('Copy your stats:', t); }
};
$('sImport').onclick = () => {
  const t = prompt('Paste exported stats (this replaces your current ones):');
  if (!t) return;
  try { importJSON(t); renderStats(); } catch { alert("That doesn't look like valid stats."); }
};
$('sReset').onclick = () => { if (confirm('Erase all saved stats?')) { resetStats(); renderStats(); } };

// ---------- scroll to zoom (towards the cursor) ----------
let zoom = 1;
function setZoom(z, cx, cy) {
  z = clamp(z, 0.2, 6);
  if (z === zoom) return;
  const r = board.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
  zoom = z;
  document.documentElement.style.setProperty('--zoom', z);
  const r2 = board.getBoundingClientRect(); // keep the point under the cursor in place
  $('wrap').scrollLeft += r2.left + fx * r2.width - cx;
  $('wrap').scrollTop += r2.top + fy * r2.height - cy;
}
$('wrap').addEventListener('wheel', e => {
  e.preventDefault();
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 33; else if (e.deltaMode === 2) dy *= 400;
  setZoom(zoom * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
}, { passive: false });
$('zoomReset').onclick = () => {
  const r = $('wrap').getBoundingClientRect();
  setZoom(1, r.left + r.width / 2, r.top + r.height / 2);
};

initThemes(t => {
  renderer.setTheme(t);
  if (game) renderer.update(game, Array.from({ length: game.n }, (_, i) => i));
});

syncUI();
startGame(readConfig());
