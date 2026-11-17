/* badsector.exe: maze chase. eat the bits, dodge the bad sectors, eat a checksum to make them readable.
   the maze is tile based; on a tall screen it is drawn on its side (the rules stay the same, only the drawing is transposed). */
(() => {
  'use strict';
  const DG = window.DG, { GR, PN, INK, MU, C, K } = DG.col;
  const MAP = [
    '#####################',
    '#o........#........o#',
    '#.###.###.#.###.###.#',
    '#...................#',
    '#.###.#.#####.#.###.#',
    '#.....#...#...#.....#',
    '###.#.###.#.###.#.###',
    '#...#...........#...#',
    '#.###.#.##_##.#.###.#',
    '#.....#.#   #.#.....#',
    '#.###.#.#####.#.###.#',
    '#o.................o#',
    '#####################'];
  const MW = 21, MH = MAP.length;
  const cell = (x, y) => (MAP[y] || '')[x] || '#';
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];                 /* right, down, left, up */
  const SCREEN = { l: 2, r: 0, u: 3, d: 1 };                       /* screen arrow -> maze direction */
  const SCREEN_PORT = { l: 3, r: 1, u: 2, d: 0 };                  /* on its side: screen right is maze down, screen down is maze right */
  const HOME = [10, 9], DOOR = [10, 8], OUT = [10, 7];
  const CHASE = [.7, .5, .4, .55];
  /* walking distance back to the sectors' home, for ones that were caught */
  const HDIST = {}; (() => { const q = [[10, 9]]; HDIST['10,9'] = 0; while (q.length) { const [x, y] = q.shift(); DIRS.forEach(([dx, dy]) => { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (cell(nx, ny) !== '#' && HDIST[k] === undefined) { HDIST[k] = HDIST[x + ',' + y] + 1; q.push([nx, ny]); } }); } })();
  const hd = (x, y) => { const v = HDIST[x + ',' + y]; return v === undefined ? 999 : v; };

  /* the maze for a ghost: home cells and the door only while it is leaving, going home or sitting there */
  const open = (x, y, ghost, inside) => { const c = cell(x, y); if (c === '#') return false; if (c === ' ' || c === '_') return !!ghost && inside; return true; };

  DG.games.badsector = {
    meta: {
      title: 'badsector', cap: 'maze chase', rules: 'eat the bits. avoid the bad sectors. checksums make them readable.', axes: 'xy',
      hint: 'press and drag anywhere to move', keytxt: 'move · eat bits as you go', keys: '← → ↑ ↓', note: 'eats as it moves. pauses when the window loses focus.',
      over: 'game over.', best: (e) => DG.fmtN(e.score), show: (e) => DG.fmtN(e.score)
    },
    create(env, seed) {
      const rnd = DG.rng(seed);
      const g = {
        env, v: null, t: 0, over: false, score: 0, lives: 3, round: 1, power: 0, combo: 0, freeze: 1.2, port: false, cs: 20, ox: 0, oy: 0, bits: 0,
        dots: [], p: null, gh: [], botT: 0, flash: 0,
        resize(w, h, top) {
          this.v = { w, h, top }; this.port = (h - top) > w * 1.1;
          const SWc = this.port ? MH : MW, SHc = this.port ? MW : MH;
          this.cs = Math.max(6, Math.floor(Math.min((w - 16) / SWc, (h - top - 10) / SHc)));
          this.ox = Math.floor((w - this.cs * SWc) / 2); this.oy = Math.floor((h - top - this.cs * SHc) / 2);
          if (!this.p) this.fresh();
        },
        fresh() { this.dots = MAP.map((row) => [...row].map((c) => (c === '.' ? 1 : c === 'o' ? 2 : 0))); this.bits = this.dots.flat().filter(Boolean).length; this.place(); },
        place() {
          this.p = { x: 10, y: 11, nx: 10, ny: 11, t: 0, dir: 0, want: -1, moving: false };
          this.gh = [[9, 9], [10, 9], [11, 9], [10, 9]].map(([x, y], i) => ({ x, y, nx: x, ny: y, t: 0, dir: 0, st: 'home', timer: 1 + i * 3 + (this.round > 1 ? 0 : 0), moving: false, i }));
          this.power = 0; this.combo = 0; this.freeze = 1.2;
        },
        mazeDir(sd) { return (this.port ? SCREEN_PORT : SCREEN)[sd]; },
        press(sd) { const d = this.mazeDir(sd); if (d !== undefined) this.want = d; },
        spd() { return Math.min(1.5, 1 + .07 * (this.round - 1)); },
        /* choose the entity's next step from the tile it is on */
        nextFor(e, kind) {
          const opts = [];
          for (let d = 0; d < 4; d++) { const nx = e.x + DIRS[d][0], ny = e.y + DIRS[d][1]; const inside = kind === 'me' ? false : (e.st === 'leave' || e.st === 'back' || e.st === 'home' || (cell(e.x, e.y) === ' ' || cell(e.x, e.y) === '_')); if (open(nx, ny, kind !== 'me', inside)) opts.push(d); }
          return opts;
        },
        stepMe(dt) {
          const p = this.p, sp = 5.3 * this.spd();
          if (p.moving && p.want >= 0 && p.want === (p.dir + 2) % 4) { /* turning straight back is allowed mid-tile */
            [p.x, p.nx] = [p.nx, p.x]; [p.y, p.ny] = [p.ny, p.y]; p.t = 1 - p.t; p.dir = p.want;
          }
          if (!p.moving) this.chooseMe();
          if (p.moving) {
            p.t += sp * dt;
            while (p.t >= 1) { p.x = p.nx; p.y = p.ny; p.t -= 1; this.eat(); if (this.p !== p) return; this.chooseMe(); if (!p.moving) { p.t = 0; break; } }
          }
        },
        chooseMe() {
          const p = this.p, ok = (d) => d >= 0 && open(p.x + DIRS[d][0], p.y + DIRS[d][1], false, false);
          if (ok(p.want)) p.dir = p.want;
          else if (!ok(p.dir) || (!p.moving && p.want < 0)) { p.moving = false; return; }
          p.nx = p.x + DIRS[p.dir][0]; p.ny = p.y + DIRS[p.dir][1]; p.moving = true;
        },
        eat() {
          const p = this.p, c = this.dots[p.y][p.x]; if (!c) return; this.dots[p.y][p.x] = 0; this.bits--;
          if (c === 1) { this.score += 10; this.env.sfx('bit'); }
          else { this.score += 50; this.env.sfx('checksum'); this.power = 6; this.combo = 0; this.gh.forEach((q) => { if (q.st === 'chase' || q.st === 'leave') q.st = q.st === 'leave' ? 'leave' : 'read'; }); }
          if (this.bits <= 0) { this.round++; this.score += 500; this.env.sfx('wipe'); this.fresh(); }
        },
        stepGhost(q, dt) {
          const base = q.st === 'read' ? 2.8 : q.st === 'back' ? 9 : q.st === 'leave' ? 3.4 : q.st === 'home' ? 1.6 : 4.3;
          const sp = base * (q.st === 'back' ? 1 : this.spd());
          if (q.st === 'home') q.timer -= dt;
          if (!q.moving) this.chooseGhost(q);
          if (q.moving) {
            q.t += sp * dt;
            while (q.t >= 1) {
              q.x = q.nx; q.y = q.ny; q.t -= 1;
              if (q.st === 'leave' && q.y <= OUT[1]) q.st = this.power > 0 ? 'read' : 'chase';
              if (q.st === 'back' && q.x === HOME[0] && q.y === HOME[1]) { q.st = 'home'; q.timer = 1.4; }
              if (q.st === 'home' && q.timer <= 0) q.st = 'leave';
              this.chooseGhost(q); if (!q.moving) { q.t = 0; break; }
            }
          }
        },
        chooseGhost(q) {
          let opts = this.nextFor(q, 'ghost'); if (!opts.length) { q.moving = false; return; }
          const back = (q.dir + 2) % 4, f = opts.filter((d) => d !== back); if (f.length) opts = f;
          const pp = this.p, tx = pp.x + (pp.moving ? DIRS[pp.dir][0] * (q.i === 1 ? 3 : 0) : 0), ty = pp.y + (pp.moving ? DIRS[pp.dir][1] * (q.i === 1 ? 3 : 0) : 0);
          const dist = (d, X, Y) => Math.hypot(q.x + DIRS[d][0] - X, q.y + DIRS[d][1] - Y);
          let pick;
          if (q.st === 'home') { const h = opts.filter((d) => d === 0 || d === 2); pick = h.length ? h[Math.floor(rnd() * h.length)] : opts[0]; if (q.timer <= 0) q.st = 'leave'; }
          else if (q.st === 'leave') { const tg = q.x !== OUT[0] ? [OUT[0], q.y] : [OUT[0], OUT[1]]; pick = opts.slice().sort((a, b) => dist(a, tg[0], tg[1]) - dist(b, tg[0], tg[1]))[0]; }
          else if (q.st === 'back') { pick = opts.slice().sort((a, b) => hd(q.x + DIRS[a][0], q.y + DIRS[a][1]) - hd(q.x + DIRS[b][0], q.y + DIRS[b][1]))[0]; }
          else if (q.st === 'read') pick = rnd() < .7 ? opts.slice().sort((a, b) => dist(b, pp.x, pp.y) - dist(a, pp.x, pp.y))[0] : opts[Math.floor(rnd() * opts.length)];
          else pick = rnd() < CHASE[q.i] ? opts.slice().sort((a, b) => dist(a, tx, ty) - dist(b, tx, ty))[0] : opts[Math.floor(rnd() * opts.length)];
          q.dir = pick; q.nx = q.x + DIRS[pick][0]; q.ny = q.y + DIRS[pick][1]; q.moving = true;
        },
        pos(e) { return [e.x + (e.nx - e.x) * e.t, e.y + (e.ny - e.y) * e.t]; },
        step(dt, inp) {
          this.t += dt; if (this.over) return;
          if (this.freeze > 0) { this.freeze -= dt; return; }
          if (this.power > 0) { this.power -= dt; if (this.power <= 0) this.gh.forEach((q) => { if (q.st === 'read') q.st = 'chase'; }); }
          this.stepMe(dt); this.gh.forEach((q) => this.stepGhost(q, dt));
          const [mx, my] = this.pos(this.p);
          for (const q of this.gh) {
            if (q.st === 'home' || q.st === 'back') continue;
            const [qx, qy] = this.pos(q); if (Math.hypot(qx - mx, qy - my) > .62) continue;
            if (q.st === 'read') { q.st = 'back'; this.combo++; this.score += 100 * Math.pow(2, Math.min(4, this.combo)); this.env.sfx('read'); }
            else { this.lose(); break; }
          }
        },
        lose() { this.lives--; this.env.sfx('caught'); if (this.lives <= 0) { this.over = true; return; } this.place(); this.freeze = 1.5; },
        draw(x, v) {
          x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = GR; x.fillRect(0, 0, x.canvas.width, x.canvas.height);
          const cs = this.cs, port = this.port, u = 1 / cs, SWc = port ? MH : MW, SHc = port ? MW : MH;
          x.setTransform(v.dpr * cs, 0, 0, v.dpr * cs, v.dpr * this.ox, v.dpr * (v.top + this.oy));
          const sc = (X, Y) => (port ? cell(Y, X) : cell(X, Y)), toS = (mx, my) => (port ? [my, mx] : [mx, my]);
          x.fillStyle = PN; for (let Y = 0; Y < SHc; Y++) for (let X = 0; X < SWc; X++) if (sc(X, Y) === '#') x.fillRect(X, Y, 1, 1);
          x.strokeStyle = MU; x.lineWidth = 2 * u; x.beginPath();
          for (let Y = 0; Y < SHc; Y++) for (let X = 0; X < SWc; X++) {
            if (sc(X, Y) !== '#') continue;
            if (Y > 0 && sc(X, Y - 1) !== '#') { x.moveTo(X, Y + u); x.lineTo(X + 1, Y + u); }
            if (Y < SHc - 1 && sc(X, Y + 1) !== '#') { x.moveTo(X, Y + 1 - u); x.lineTo(X + 1, Y + 1 - u); }
            if (X > 0 && sc(X - 1, Y) !== '#') { x.moveTo(X + u, Y); x.lineTo(X + u, Y + 1); }
            if (X < SWc - 1 && sc(X + 1, Y) !== '#') { x.moveTo(X + 1 - u, Y); x.lineTo(X + 1 - u, Y + 1); }
          }
          x.stroke();
          const [dX, dY] = toS(DOOR[0], DOOR[1]); x.fillStyle = MU; if (port) x.fillRect(dX + .45, dY + .1, 2 * u, .8); else x.fillRect(dX + .1, dY + .45, .8, 2 * u);
          const loud = this.env.loud();
          for (let Y = 0; Y < MH; Y++) for (let X = 0; X < MW; X++) {
            const d = this.dots[Y] && this.dots[Y][X]; if (!d) continue; const [sx, sy] = toS(X, Y), cx = sx + .5, cy = sy + .5;
            if (d === 2) { const s = .42 + loud * .15; x.lineWidth = 2 * u; x.strokeStyle = INK; x.strokeRect(cx - s / 2, cy - s / 2, s, s); }
            else { const s = Math.max(2 * u, .12); x.fillStyle = INK; x.fillRect(cx - s / 2, cy - s / 2, s, s); }
          }
          /* bad sectors: ink glitch sprites; readable ones are muted outlines with half their pixels */
          this.gh.forEach((q, j) => {
            const [qx, qy] = this.pos(q), [sx, sy] = toS(qx, qy), p = 1 / 9, X = sx + .5 - 3.5 * p, Y = sy + .5 - 3 * p, g = DG.sprite(j * 13 + 5 + (Math.floor(this.t * 3) % 2) * 500);
            if (q.st === 'back') { x.lineWidth = 1.5 * u; x.strokeStyle = MU; x.strokeRect(X - p, Y - p, 9 * p, 8 * p); return; }
            if (q.st === 'read') {
              x.lineWidth = 1.5 * u; x.strokeStyle = MU; x.strokeRect(X - p, Y - p, 9 * p, 8 * p);
              g.forEach((row, yy) => row.forEach((on, xx) => { if (on && (xx + yy) % 2) { x.fillStyle = MU; x.fillRect(X + xx * p, Y + yy * p, p, p); } }));
            } else DG.px(x, g, X, Y, p, INK);
          });
          /* you: a chartreuse square with two black eyes on the side you face */
          const [mx, my] = this.pos(this.p), [sx, sy] = toS(mx, my), s = .66, cx = sx + .5, cy = sy + .5;
          x.fillStyle = C; x.fillRect(cx - s / 2, cy - s / 2, s, s); x.lineWidth = 1.5 * u; x.strokeStyle = K; x.strokeRect(cx - s / 2, cy - s / 2, s, s);
          let [dx, dy] = DIRS[this.p.dir] || [1, 0]; if (port) [dx, dy] = [dy, dx];
          const e = Math.max(2 * u, s * .18); x.fillStyle = K;
          for (const k of [-1, 1]) x.fillRect(cx + dx * s * .2 - dy * k * s * .2 - e / 2, cy + dy * s * .2 + dx * k * s * .2 - e / 2, e, e);
        },
        /* attract mode: steer away from a close chaser, otherwise wander the corridors */
        bot(dt, inp) {
          this.botT -= dt; if (this.botT > 0) return; this.botT = .12;
          const p = this.p, near = this.gh.filter((q) => q.st === 'chase' || q.st === 'leave').map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) })).sort((a, b) => a.d - b.d)[0];
          const opts = []; for (let d = 0; d < 4; d++) if (open(p.x + DIRS[d][0], p.y + DIRS[d][1], false, false)) opts.push(d);
          if (!opts.length) return;
          let pick;
          if (near && near.d < 4.5) pick = opts.slice().sort((a, b) => Math.hypot(p.x + DIRS[b][0] - near.q.x, p.y + DIRS[b][1] - near.q.y) - Math.hypot(p.x + DIRS[a][0] - near.q.x, p.y + DIRS[a][1] - near.q.y))[0];
          else if (p.want < 0 || Math.random() < .35) pick = opts[Math.floor(Math.random() * opts.length)];
          else return;
          this.want = pick; this.p.want = pick;
        },
        hud() { return [DG.fmtN(this.score) + ' · bits left ' + this.bits, this.power > 0 ? 'checksum: sectors readable.' : 'lives ' + '■'.repeat(Math.max(0, this.lives))]; },
        result() { return DG.fmtN(this.score) + ' · round ' + this.round; },
        entry() { return this.score > 0 ? { tag: '', date: '', score: this.score } : null; }
      };
      /* the runner calls press(); keep the want on the player */
      const press = g.press; g.press = function (sd) { press.call(this, sd); if (this.p) this.p.want = this.want; };
      return g;
    }
  };
})();
