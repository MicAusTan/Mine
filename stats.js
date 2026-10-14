// Local stats saved in the browser (localStorage). Only tracks things that go up:
// best time, last time, boards cleared. No win ratio.
const KEY = 'minesweeper-stats-v1';
const KEY_RE = /^[a-z]+(~t)?:(easy|medium|hard)(:ng)?$/;

export function getStats() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d.records === 'object' && d.records) return d;
  } catch {}
  return { v: 1, records: {} };
}
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }

export function recordWin(key, ms) {
  const d = getStats();
  const r = d.records[key] ?? (d.records[key] = { best: null, last: null, wins: 0 });
  const isBest = r.best === null || ms < r.best;
  if (isBest) r.best = ms;
  r.last = ms; r.wins++;
  save(d);
  return { isBest, best: r.best };
}

export const exportJSON = () => JSON.stringify(getStats());

export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || typeof d.records !== 'object' || !d.records) throw new Error('bad stats');
  const clean = { v: 1, records: {} };
  for (const [k, r] of Object.entries(d.records)) {
    if (!KEY_RE.test(k) || !r) continue;
    const best = Number(r.best), last = Number(r.last), wins = Math.floor(Number(r.wins));
    if (best >= 0 && last >= 0 && wins > 0) clean.records[k] = { best, last, wins };
  }
  save(clean);
}

export function resetStats() { try { localStorage.removeItem(KEY); } catch {} }
