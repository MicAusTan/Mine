// Draws a layout + game state into the page. Swap this out later for SVG tiles / themes.
import { Status } from './engine.js';

export class Renderer {
  constructor(container) { this.el = container; this.els = []; }

  build(layout) {
    this.el.innerHTML = '';
    this.el.style.gridTemplateColumns = `repeat(${layout.cols}, var(--cell))`;
    this.el.style.gridTemplateRows = `repeat(${layout.rows}, var(--cell))`;
    this.els = layout.cells.map((c, i) => {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      d.style.gridColumn = c.x + 1;
      d.style.gridRow = c.y + 1;
      this.el.appendChild(d);
      return d;
    });
  }

  update(game, list) {
    for (const i of list) {
      let cls = 'cell', txt = '';
      if (game.open[i]) {
        cls += ' open';
        if (game.mine[i]) { txt = '💣'; if (i === game.hit) cls += ' hit'; }
        else if (game.adj[i]) { txt = game.adj[i]; cls += ' n' + game.adj[i]; }
      } else if (game.flag[i]) {
        txt = (game.status === Status.LOST && !game.mine[i]) ? '❌' : '🚩';
      }
      const el = this.els[i];
      el.className = cls;
      el.textContent = txt;
    }
  }
}
