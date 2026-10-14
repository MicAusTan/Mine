// Pure game logic. No DOM, no shapes: it only knows cells and their neighbours.
import { seededRng } from './rng.js';
import { isSolvable } from './solver.js';

export const NG_ATTEMPTS = 1500; // how many boards No-guess mode will try before giving up

export const Status = { READY: 'ready', PLAYING: 'playing', WON: 'won', LOST: 'lost' };

export class Game {
  constructor(layout, mineCount, seed, opts = {}) {
    this.nbrs = layout.neighbors;
    this.n = layout.cells.length;
    this.mineCount = Math.max(1, Math.min(mineCount, this.n - 1));
    this.seed = seed;
    this.noGuess = !!opts.noGuess;
    this.ngFailed = false;
    this.ngAttempts = 0;
    this.status = Status.READY;
    this.mine = new Uint8Array(this.n);
    this.adj = new Uint8Array(this.n);
    this.open = new Uint8Array(this.n);
    this.flag = new Uint8Array(this.n);
    this.flags = 0;
    this.opened = 0;
    this.hit = -1;
    this.undoStack = [];
    this._group = null;

    this.order = this._shuffled(''); // classic mine order (seeded)
  }

  _shuffled(tag) {
    const rng = seededRng(this.seed + tag);
    const o = Array.from({ length: this.n }, (_, i) => i);
    for (let i = this.n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    return o;
  }

  get over() { return this.status === Status.WON || this.status === Status.LOST; }

  _fill(order, safe) {
    this.mine.fill(0);
    let placed = 0;
    for (const i of order) {
      if (placed >= this.mineCount) break;
      if (safe.has(i)) continue;
      this.mine[i] = 1; placed++;
    }
    for (let i = 0; i < this.n; i++) {
      let c = 0;
      for (const k of this.nbrs[i]) c += this.mine[k];
      this.adj[i] = c;
    }
  }

  _place(first) {
    let safe = new Set([first, ...this.nbrs[first]]);
    if (this.n - safe.size < this.mineCount) safe = new Set([first]);
    if (!this.noGuess) return this._fill(this.order, safe);
    // No-guess: try deterministic variations of the seed until the solver can finish the board.
    for (let a = 0; a < NG_ATTEMPTS; a++) {
      this._fill(this._shuffled('#' + a), safe);
      if (isSolvable(this.nbrs, this.mine, this.adj, first)) { this.ngAttempts = a + 1; return; }
    }
    this.ngFailed = true; // gave up: fall back to a normal board
    this._fill(this.order, safe);
  }

  _open(start, changed) {
    const st = [start];
    while (st.length) {
      const k = st.pop();
      if (this.open[k] || this.flag[k]) continue;
      this.open[k] = 1; this.opened++; changed.push(k);
      if (this.adj[k] === 0) for (const n of this.nbrs[k]) if (!this.open[n] && !this.flag[n]) st.push(n);
    }
  }

  _all(changed) { for (let i = 0; i < this.n; i++) changed.push(i); }

  _lose(i, changed) {
    this.status = Status.LOST; this.hit = i;
    for (let k = 0; k < this.n; k++) if (this.mine[k] && !this.flag[k]) this.open[k] = 1;
    this._all(changed);
  }

  _checkWin(changed) {
    if (this.opened !== this.n - this.mineCount) return;
    this.status = Status.WON;
    for (let k = 0; k < this.n; k++) if (this.mine[k] && !this.flag[k]) { this.flag[k] = 1; this.flags++; }
    this._all(changed);
  }

  // Left-click. On an already-open number this chords.
  reveal(i) {
    if (this.over) return [];
    if (this.open[i]) return this.chord(i);
    if (this.flag[i]) return [];
    const changed = [];
    if (this.status === Status.READY) { this._place(i); this.status = Status.PLAYING; }
    if (this.mine[i]) { this._lose(i, changed); return changed; }
    this._open(i, changed);
    this._checkWin(changed);
    return changed;
  }

  chord(i) {
    if (this.over || !this.open[i] || !this.adj[i]) return [];
    const ns = this.nbrs[i];
    let f = 0;
    for (const n of ns) f += this.flag[n];
    if (f !== this.adj[i]) return [];
    const changed = [];
    let hit = -1;
    for (const n of ns) {
      if (this.flag[n] || this.open[n]) continue;
      if (this.mine[n]) hit = n; else this._open(n, changed);
    }
    if (hit >= 0) this._lose(hit, changed); else this._checkWin(changed);
    return changed;
  }

  toggleFlag(i) {
    if (this.over || this.open[i]) return [];
    this.flag[i] ^= 1;
    this.flags += this.flag[i] ? 1 : -1;
    if (this._group) this._group.push(i); else this._push([i]);
    return [i];
  }

  // Flag changes made between begin/end count as ONE undo step (a shift-sweep).
  beginGroup() { this._group = []; }
  endGroup() { if (this._group && this._group.length) this._push(this._group); this._group = null; }
  _push(g) { this.undoStack.push(g); if (this.undoStack.length > 100) this.undoStack.shift(); }

  undo() {
    if (this.over) return [];
    const g = this.undoStack.pop();
    if (!g) return [];
    const changed = [];
    for (const i of g) {
      if (this.open[i]) continue;
      this.flag[i] ^= 1;
      this.flags += this.flag[i] ? 1 : -1;
      changed.push(i);
    }
    return changed;
  }
}
