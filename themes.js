// Themes = colours + a few numbers + flag/mine symbols. Built-ins live here,
// custom ones are saved in localStorage. Anything imported gets sanitised.
export const FIELDS = [
  ['desk', 'Page background'], ['face', 'Panels & buttons'],
  ['light', 'Bevel highlight'], ['dark', 'Bevel shadow'],
  ['closed', 'Unrevealed tile'], ['open', 'Revealed tile'],
  ['grid', 'Revealed tile lines'], ['text', 'Text'],
  ['title1', 'Title bar (left)'], ['title2', 'Title bar (right)'],
  ['titletext', 'Title bar text'], ['ledbg', 'Counter background'],
  ['ledfg', 'Counter digits'], ['hit', 'Mine you hit'],
  ['n1', 'Number 1'], ['n2', 'Number 2'], ['n3', 'Number 3'], ['n4', 'Number 4'],
  ['n5', 'Number 5'], ['n6', 'Number 6'], ['n7', 'Number 7'], ['n8', 'Number 8'],
];

const mk = (name, vars, extra = {}) => ({ name, vars, bevel: 3, cell: 24, radius: 0, flag: '🚩', mine: '💣', ...extra });

export const BUILTIN = {
  classic: mk('Classic', {
    desk: '#008080', face: '#c0c0c0', light: '#ffffff', dark: '#808080', closed: '#c0c0c0', open: '#c0c0c0',
    grid: '#808080', text: '#000000', title1: '#000080', title2: '#1084d0', titletext: '#ffffff',
    ledbg: '#000000', ledfg: '#ff0000', hit: '#ff0000',
    n1: '#0000ff', n2: '#008000', n3: '#ff0000', n4: '#000080', n5: '#800000', n6: '#008080', n7: '#000000', n8: '#808080',
  }),
  dark: mk('Dark', {
    desk: '#12141a', face: '#2b2f3a', light: '#4a5163', dark: '#14161c', closed: '#3a4050', open: '#1e2129',
    grid: '#2b2f3a', text: '#e6e9f0', title1: '#1f2430', title2: '#3b4256', titletext: '#e6e9f0',
    ledbg: '#0b0c10', ledfg: '#ff5555', hit: '#a12b2b',
    n1: '#6ea8ff', n2: '#5fd38d', n3: '#ff6b6b', n4: '#b08cff', n5: '#ff9f5a', n6: '#4fd1c5', n7: '#e6e9f0', n8: '#9aa3b5',
  }, { bevel: 2 }),
  neon: mk('Neon', {
    desk: '#0d0221', face: '#1a0b3b', light: '#ff2ec4', dark: '#3a0ca3', closed: '#241052', open: '#0d0221',
    grid: '#3a0ca3', text: '#f5e9ff', title1: '#ff2ec4', title2: '#7b2ff7', titletext: '#ffffff',
    ledbg: '#000000', ledfg: '#00ffd5', hit: '#ff2ec4',
    n1: '#00e5ff', n2: '#39ff14', n3: '#ff2ec4', n4: '#b388ff', n5: '#ffb300', n6: '#00ffd5', n7: '#ffffff', n8: '#9e9e9e',
  }, { bevel: 2, radius: 2 }),
  flat: mk('Flat Light', {
    desk: '#e8ecf1', face: '#ffffff', light: '#d5dbe3', dark: '#d5dbe3', closed: '#cfd8e3', open: '#f6f8fb',
    grid: '#e1e6ed', text: '#222b36', title1: '#3b82f6', title2: '#3b82f6', titletext: '#ffffff',
    ledbg: '#222b36', ledfg: '#ff6b6b', hit: '#ffb3b3',
    n1: '#2563eb', n2: '#16a34a', n3: '#dc2626', n4: '#7c3aed', n5: '#b45309', n6: '#0891b2', n7: '#111827', n8: '#6b7280',
  }, { bevel: 1, radius: 4 }),
  terminal: mk('Terminal', {
    desk: '#000000', face: '#031a07', light: '#1e8a35', dark: '#0a3d14', closed: '#07300f', open: '#010a03',
    grid: '#0a3d14', text: '#33ff66', title1: '#0a3d14', title2: '#0a3d14', titletext: '#33ff66',
    ledbg: '#000000', ledfg: '#33ff66', hit: '#b31b1b',
    n1: '#33ff66', n2: '#7dff3a', n3: '#d6ff33', n4: '#ffe933', n5: '#ffb833', n6: '#ff8a33', n7: '#ff5c33', n8: '#ff3366',
  }, { bevel: 1, flag: '⚑', mine: '✹' }),
};

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, a, b, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const sym = (v, d) => { const a = [...String(v ?? '')]; return a.length && a.length <= 2 ? a.join('') : d; };

export function cleanTheme(t) {
  if (!t || typeof t !== 'object') throw new Error('bad theme');
  const base = BUILTIN.classic;
  const out = {
    name: String(t.name || 'Untitled').slice(0, 30), vars: {},
    bevel: num(t.bevel, 1, 4, 3), cell: num(t.cell, 18, 40, 24), radius: num(t.radius, 0, 12, 0),
    flag: sym(t.flag, '🚩'), mine: sym(t.mine, '💣'),
  };
  for (const [k] of FIELDS) {
    const v = t.vars?.[k];
    out.vars[k] = HEX.test(v) ? v.toLowerCase() : base.vars[k];
  }
  return out;
}

const KEY = 'minesweeper-themes-v1';
export function loadState() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    const custom = {};
    for (const [id, t] of Object.entries(d?.custom ?? {})) {
      if (/^custom-\d+$/.test(id)) { try { custom[id] = cleanTheme(t); } catch {} }
    }
    return { selected: typeof d?.selected === 'string' ? d.selected : 'classic', custom };
  } catch {}
  return { selected: 'classic', custom: {} };
}
export function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
export const allThemes = s => ({ ...BUILTIN, ...s.custom });
export const currentTheme = s => allThemes(s)[s.selected] ?? BUILTIN.classic;

export function applyTheme(t) {
  const r = document.documentElement.style;
  for (const [k, v] of Object.entries(t.vars)) r.setProperty('--' + k, v);
  r.setProperty('--bw', t.bevel + 'px');
  r.setProperty('--cell', t.cell + 'px');
  r.setProperty('--radius', t.radius + 'px');
}
