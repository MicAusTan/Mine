// Draws a layout + game state. Square grids use plain DOM cells; "shape tiles" boards
// use SVG polygons (with a bevel computed per tile so every theme still works).
import { Status } from './engine.js';
import { bevel } from './geom.js';

const NS = 'http://www.w3.org/2000/svg';
const f = n => n.toFixed(3);
const segs = list => list.map(s => `M${f(s[0])} ${f(s[1])}L${f(s[2])} ${f(s[3])}`).join('');

export class Renderer {
  constructor(container) {
    this.el = container; this.els = []; this.labels = []; this.hl = []; this.sh = [];
    this.layout = null; this.poly = false;
    this.symbols = { flag: '🚩', mine: '💣' };
    this.bevelUnits = 3 / 24; // bevel thickness in tile units
  }

  setTheme(t) {
    this.symbols = { flag: t.flag, mine: t.mine };
    this.bevelUnits = t.bevel / t.cell;
    if (this.poly) this.restyle();
  }

  build(layout) {
    this.el.innerHTML = '';
    this.layout = layout;
    this.poly = layout.kind === 'poly';
    this.els = []; this.labels = []; this.hl = []; this.sh = [];
    if (this.poly) this.buildPoly(layout); else this.buildGrid(layout);
  }

  buildGrid(layout) {
    this.el.style.display = 'grid';
    this.el.style.gridTemplateColumns = `repeat(${layout.cols}, var(--tile))`;
    this.el.style.gridTemplateRows = `repeat(${layout.rows}, var(--tile))`;
    this.els = layout.cells.map((c, i) => {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      d.style.gridColumn = c.x + 1;
      d.style.gridRow = c.y + 1;
      this.el.appendChild(d);
      return d;
    });
    this.labels = this.els;
  }

  buildPoly(layout) {
    this.el.style.display = 'block';
    this.el.style.gridTemplateColumns = this.el.style.gridTemplateRows = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${f(layout.width)} ${f(layout.height)}`);
    svg.style.width = `calc(var(--tile) * ${f(layout.width)})`;
    svg.style.height = `calc(var(--tile) * ${f(layout.height)})`;
    svg.style.display = 'block';
    if (layout.circle) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', f(layout.circle.cx)); c.setAttribute('cy', f(layout.circle.cy)); c.setAttribute('r', f(layout.circle.r));
      c.setAttribute('class', 'rim');
      svg.appendChild(c);
    }
    layout.cells.forEach((c, i) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'tile'); g.dataset.i = i;
      const p = document.createElementNS(NS, 'polygon');
      p.setAttribute('points', c.outline.map(q => f(q[0]) + ',' + f(q[1])).join(' '));
      const hl = document.createElementNS(NS, 'path'), sh = document.createElementNS(NS, 'path');
      hl.setAttribute('class', 'hl'); sh.setAttribute('class', 'sh');
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', f(c.cx)); t.setAttribute('y', f(c.cy)); t.setAttribute('dy', '.35em');
      t.setAttribute('font-size', f(Math.min(1.3 * c.inr, 0.9)));
      g.append(p, hl, sh, t);
      svg.appendChild(g);
      this.els.push(g); this.labels.push(t); this.hl.push(hl); this.sh.push(sh);
    });
    this.el.appendChild(svg);
    this.restyle();
  }

  restyle() { // recompute bevel lines (depends on the theme's bevel thickness)
    this.layout.cells.forEach((c, i) => {
      const w = Math.min(this.bevelUnits, 0.3 * c.inr);
      const b = bevel(c.outline, w / 2);
      this.hl[i].setAttribute('d', segs(b.light)); this.hl[i].setAttribute('stroke-width', f(w));
      this.sh[i].setAttribute('d', segs(b.dark)); this.sh[i].setAttribute('stroke-width', f(w));
    });
  }

  update(game, list) {
    const base = this.poly ? 'tile' : 'cell';
    for (const i of list) {
      let cls = base, txt = '';
      if (game.open[i]) {
        cls += ' open';
        if (game.mine[i]) { txt = this.symbols.mine; if (i === game.hit) cls += ' hit'; }
        else if (game.adj[i]) { txt = game.adj[i]; cls += ' n' + game.adj[i]; }
      } else if (game.flag[i]) {
        txt = (game.status === Status.LOST && !game.mine[i]) ? '❌' : this.symbols.flag;
      }
      this.els[i].setAttribute('class', cls);
      this.labels[i].textContent = txt;
    }
  }
}
