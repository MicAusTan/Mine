// Logic-only solver used for No-guess mode. It plays a generated board the way a
// perfect, guess-free player would: simple counting, then exhaustive reasoning over
// each "frontier" group of cells. It never uses the global mine counter, so any
// board it can finish really is solvable by logic alone.
const NODE_CAP = 30000; // per-group search limit; beyond it we fall back to subset rules
export const solverStats = { faults: 0 }; // should stay 0 (sanity counter for tests)

function enumerate(V, cons, varCons) {
  const val = new Int8Array(V);
  const cm = new Int16Array(cons.length);
  const cu = Int16Array.from(cons, c => c.vi.length);
  const sawM = new Uint8Array(V), sawS = new Uint8Array(V);
  let undet = V, nodes = 0;
  const rec = k => {
    if (++nodes > NODE_CAP) throw 'cap';
    if (k === V) {
      for (let i = 0; i < V; i++) {
        if (val[i]) { if (!sawM[i]) { sawM[i] = 1; if (sawS[i]) undet--; } }
        else if (!sawS[i]) { sawS[i] = 1; if (sawM[i]) undet--; }
      }
      if (undet === 0) throw 'none'; // every cell can still go either way: nothing certain here
      return;
    }
    const vc = varCons[k];
    for (let v = 0; v < 2; v++) {
      let ok = true;
      for (let t = 0; t < vc.length; t++) {
        const ci = vc[t];
        cu[ci]--; cm[ci] += v;
        if (cm[ci] > cons[ci].r || cm[ci] + cu[ci] < cons[ci].r) ok = false;
      }
      if (ok) { val[k] = v; rec(k + 1); }
      for (let t = 0; t < vc.length; t++) { const ci = vc[t]; cu[ci]++; cm[ci] -= v; }
    }
  };
  rec(0);
  const mines = [], safe = [];
  for (let i = 0; i < V; i++) {
    if (sawM[i] && !sawS[i]) mines.push(i);
    else if (sawS[i] && !sawM[i]) safe.push(i);
  }
  return { mines, safe };
}

function subsetRules(lc) {
  const mines = [], safe = [];
  const sets = lc.map(c => new Set(c.vi));
  for (let a = 0; a < lc.length; a++) for (let b = 0; b < lc.length; b++) {
    if (a === b || lc[a].vi.length >= lc[b].vi.length) continue;
    if (!lc[a].vi.every(v => sets[b].has(v))) continue;
    const diff = lc[b].vi.filter(v => !sets[a].has(v)), dr = lc[b].r - lc[a].r;
    if (dr === 0) safe.push(...diff);
    else if (dr === diff.length) mines.push(...diff);
  }
  return { mines, safe };
}

export function isSolvable(nbrs, mine, adj, first) {
  const n = nbrs.length;
  let mineTotal = 0;
  for (let i = 0; i < n; i++) mineTotal += mine[i];
  const safeTotal = n - mineTotal;
  const st = new Uint8Array(n); // 0 unknown, 1 open, 2 known mine
  let opened = 0, bad = false;

  const openFrom = s => {
    if (mine[s]) { bad = true; return; }
    const stack = [s];
    while (stack.length) {
      const k = stack.pop();
      if (st[k] !== 0) continue;
      st[k] = 1; opened++;
      if (adj[k] === 0) for (const m of nbrs[k]) if (st[m] === 0) stack.push(m);
    }
  };
  const markMine = k => { if (!mine[k]) bad = true; st[k] = 2; };

  openFrom(first);
  while (opened < safeTotal) {
    if (bad) { solverStats.faults++; return false; }
    const cons = [];
    for (let i = 0; i < n; i++) {
      if (st[i] !== 1 || adj[i] === 0) continue;
      let r = adj[i]; const u = [];
      for (const k of nbrs[i]) { if (st[k] === 0) u.push(k); else if (st[k] === 2) r--; }
      if (u.length) cons.push({ u, r });
    }
    if (!cons.length) return false;

    // 1) simple counting
    let progress = false;
    for (const c of cons) {
      if (c.r === 0) { for (const k of c.u) if (st[k] === 0) { openFrom(k); progress = true; } }
      else if (c.r === c.u.length) { for (const k of c.u) if (st[k] === 0) { markMine(k); progress = true; } }
    }
    if (progress) continue;

    // 2) exhaustive reasoning per connected group of constraints
    const byCell = new Map();
    cons.forEach((c, ci) => { for (const k of c.u) { let a = byCell.get(k); if (!a) byCell.set(k, a = []); a.push(ci); } });
    const seen = new Uint8Array(cons.length);
    for (let s = 0; s < cons.length; s++) {
      if (seen[s]) continue;
      const comp = [s], vars = [], local = new Map();
      seen[s] = 1;
      for (let h = 0; h < comp.length; h++) for (const k of cons[comp[h]].u) {
        if (local.has(k)) continue;
        local.set(k, vars.length); vars.push(k);
        for (const cj of byCell.get(k)) if (!seen[cj]) { seen[cj] = 1; comp.push(cj); }
      }
      const lc = comp.map(ci => ({ vi: cons[ci].u.map(k => local.get(k)), r: cons[ci].r }));
      const varCons = vars.map(() => []);
      lc.forEach((c, i) => c.vi.forEach(v => varCons[v].push(i)));
      let res = null;
      try { res = enumerate(vars.length, lc, varCons); }
      catch (e) { if (e === 'cap') res = subsetRules(lc); else if (e !== 'none') throw e; }
      if (!res) continue;
      for (const v of res.safe) if (st[vars[v]] === 0) { openFrom(vars[v]); progress = true; }
      for (const v of res.mines) if (st[vars[v]] === 0) { markMine(vars[v]); progress = true; }
    }
    if (!progress) return false; // stuck: would need a guess
  }
  if (bad) { solverStats.faults++; return false; }
  return true;
}
