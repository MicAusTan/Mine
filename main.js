import { Game, Status } from './engine.js';
import { SHAPES, buildLayout, gridSizeFor } from './shapes.js';
import { Renderer } from './render.js';
import { randomSeed } from './rng.js';
import { recordWin, getStats, exportJSON, importJSON, resetStats } from './stats.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Presets: classic 9x9/10, 16x16/40, 30x16/99. Other shapes aim for the same cell counts.
const RECT = { easy: [9, 9], medium: [16, 16], hard: [30, 16] };
const TARGET = { easy: 81, medium: 256, hard: 480 };
const DENSITY = { easy: 10 / 81, medium: 40 / 256, hard: 99 / 480 };

const board = $('board'), face = $('face');
const renderer = new Renderer(board);
let game, cfg, timerId = null, seconds = 0;
let ranked = false, finished = false, startedAt = 0;
let shiftHeld = false, touched = new Set(), hover = -1;

// ---------- setup / config ----------
for (const [k, v] of Object.entries(SHAPES)) $('shape').add(new Option(v.label, k));

function readConfig() {
  const shape = $('shape').value, diff = $('diff').value;
  let w, h, mines = null;
  if (diff === 'custom') {
    if (shape === 'rect') { w = clamp(+$('cw').value || 9, 5, 60); h = clamp(+$('ch').value || 9, 5, 40); }
    else { w = h = clamp(+$('cw').value || 15, 7, 45); }
    mines = +$('cm').value || null;
  } else if (shape === 'rect') { [w, h] = RECT[diff]; }
  else { w = h = gridSizeFor(shape, TARGET[diff]); }
  return { shape, diff, w, h, mines };
}

function syncUI() {
  const custom = $('diff').value === 'custom', rect = $('shape').value === 'rect';
  $('custom').hidden = !custom;
  $('chwrap').hidden = !rect;
  $('cwlabel').textContent = rect ? 'Width' : 'Size';
}

function startGame(c, seed) {
  // Only brand-new random boards on a preset difficulty count towards records.
  const fresh = seed === undefined;
  seed ??= randomSeed();
  ranked = fresh && c.diff !== 'custom';
  finished = false; startedAt = 0;
  $('msg').textContent = '';
  stopTimer(); seconds = 0;
  const layout = buildLayout(c.shape, c.w, c.h);
  const dens = DENSITY[c.diff] ?? DENSITY.medium;
  const mines = clamp(c.mines ?? Math.round(layout.cells.length * dens), 1, layout.cells.length - 1);
  cfg = { ...c, mines };
  game = new Game(layout, mines, seed);
  if (shiftHeld) { game.beginGroup(); touched = new Set(); }
  renderer.build(layout);
  setFace(); hud();
  $('code').value = `${cfg.shape}:${cfg.w}x${cfg.h}:${mines}:${seed}`;
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
  if (ranked) {
    const r = recordWin(`${cfg.shape}:${cfg.diff}`, ms);
    text += r.isBest ? ' - new best!' : ` - best: ${fmt(r.best)}`;
  } else text += ' (practice board, not recorded)';
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
const idxOf = t => { const el = t.closest?.('.cell'); return el ? +el.dataset.i : -1; };

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
  if (e.button === 0) afterAction(game.reveal(i));
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
  if (p.length === 4 && SHAPES[p[0]]) {
    const m = /^(\d+)x(\d+)$/.exec(p[1]), mines = +p[2];
    if (m && mines > 0 && p[3]) {
      $('shape').value = p[0]; $('diff').value = 'custom';
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
      const [s, df] = k.split(':');
      return `<tr><td>${SHAPES[s]?.label ?? s} · ${df}</td><td>${fmt(r.best)}</td><td>${fmt(r.last)}</td><td>${r.wins}</td></tr>`;
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

syncUI();
startGame(readConfig());
