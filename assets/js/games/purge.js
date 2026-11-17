/* purge.exe: shooter. rows of glitches drift and descend; you slide left and right and it fires on its own. */
(() => {
  'use strict';
  const DG = window.DG, { GR, INK, MU, LN, C } = DG.col;
  const W = 480, P = 3, SW = 7 * P, SH = 6 * P;
  const SHIP = ['...#...', '..###..', '.#####.', '##.#.##', '#.....#'];
  const COLS = 7, GX = 40, GY = 30;

  DG.games.purge = {
    meta: {
      cap: 'shooter', rules: 'slide left and right. it fires on its own. purge the glitches.', axes: 'x',
      hint: 'drag left or right · always firing', keytxt: 'move', keys: '← →', note: 'always firing. pauses when the window loses focus.',
      over: 'process ended.', best: (e) => DG.fmtN(e.score), show: (e) => DG.fmtN(e.score)
    },
    create(env, seed) {
      const rnd = DG.rng(seed);
      const stars = Array.from({ length: 26 }, () => [rnd() * W, rnd(), 10 + rnd() * 30]);
      const g = {
        H: 360, env, score: 0, lives: 3, wave: 0, over: false, t: 0, px: W / 2, inv: 0, fireT: 0, eT: 1, wait: 0,
        en: [], shots: [], eshots: [], fx: 0, fy: 0, fdir: 1, sp: 24, botT: 0, botDir: 0,
        resize(w, h, top) { this.H = (h - top) / (w / W); },
        spawn() {
          this.wave++; const rows = Math.min(5, 2 + Math.ceil(this.wave / 2)); this.en = [];
          for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) this.en.push({ c, r, hp: r === 0 ? 2 : 1, seed: r * 31 + 7, rows });
          this.fx = (W - COLS * GX) / 2 + 6; this.fy = 12; this.fdir = 1; this.sp = 22 + this.wave * 5; this.eshots = []; this.shots = [];
        },
        ex(e) { return this.fx + e.c * GX; }, ey(e) { return this.fy + e.r * GY; },
        hurt() {
          this.lives--; this.inv = 1.8; this.eshots = []; this.env.sfx(this.lives > 0 ? 'lost' : 'boom');
          if (this.lives <= 0) this.over = true;
        },
        step(dt, inp) {
          this.t += dt; const H = this.H, py = H - 30;
          if (this.over) return;
          if (!this.en.length && this.wait <= 0) { if (this.wave) { this.score += 300 * this.wave; this.env.sfx('wipe'); this.wait = 1.1; } this.spawn(); }
          if (this.wait > 0) this.wait -= dt;
          this.px = Math.max(14, Math.min(W - 14, this.px + (inp.r - inp.l) * 230 * dt));
          if (this.inv > 0) this.inv -= dt;
          /* the player fires on its own */
          this.fireT -= dt; if (this.fireT <= 0) { this.fireT = .22; this.shots.push({ x: this.px, y: py - 4 }); this.env.sfx('laser'); }
          this.shots.forEach((s) => { s.y -= 520 * dt; }); this.shots = this.shots.filter((s) => s.y > -10);
          /* the formation drifts, bounces off the edges and steps down */
          if (this.en.length) {
            const speed = this.sp * (1 + (COLS * 3 - this.en.length) * .012);
            this.fx += this.fdir * speed * dt;
            let lo = 1e9, hi = -1e9, low = 0;
            this.en.forEach((e) => { const X = this.ex(e); lo = Math.min(lo, X); hi = Math.max(hi, X + SW); low = Math.max(low, this.ey(e) + SH); });
            if (hi > W - 10 && this.fdir > 0) { this.fdir = -1; this.fy += 12; } else if (lo < 10 && this.fdir < 0) { this.fdir = 1; this.fy += 12; }
            if (low >= py - 4) { this.fy -= 80; this.hurt(); }
          }
          /* their shots */
          this.eT -= dt;
          if (this.eT <= 0 && this.en.length && this.wait <= 0) {
            this.eT = Math.max(.35, 1.25 - this.wave * .1) * (.6 + Math.random() * .8);
            const bot = {}; this.en.forEach((e) => { if (!bot[e.c] || e.r > bot[e.c].r) bot[e.c] = e; });
            const list = Object.values(bot), e = list[Math.floor(Math.random() * list.length)];
            this.eshots.push({ x: this.ex(e) + SW / 2, y: this.ey(e) + SH, vy: 130 + this.wave * 12 });
          }
          this.eshots.forEach((s) => { s.y += s.vy * dt; });
          this.eshots = this.eshots.filter((s) => s.y < H + 10);
          if (this.inv <= 0) for (const s of this.eshots) if (Math.abs(s.x - this.px) < 12 && Math.abs(s.y - (py + 7)) < 12) { this.hurt(); break; }
          /* hits */
          for (const s of this.shots) {
            for (const e of this.en) {
              const X = this.ex(e), Y = this.ey(e);
              if (s.x > X - 2 && s.x < X + SW + 2 && s.y > Y - 2 && s.y < Y + SH + 2) {
                s.y = -99; e.hp--;
                if (e.hp <= 0) { e.dead = 1; this.score += 100 + (e.rows - e.r) * 30; this.env.sfx('pop'); } else this.env.sfx('hit');
                break;
              }
            }
          }
          this.en = this.en.filter((e) => !e.dead);
        },
        draw(x, v) {
          x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = GR; x.fillRect(0, 0, x.canvas.width, x.canvas.height);
          const { s, H } = DG.world(x, v, W); this.H = H; const u = 1 / s, py = H - 30, hot = this.env.loud() > .55 && v.live;
          x.fillStyle = LN; stars.forEach((q) => { x.fillRect(q[0], (q[1] * H + this.t * q[2]) % H, u, u); });
          this.en.forEach((e) => {
            let X = this.ex(e), Y = this.ey(e); if (hot && (e.c * 7 + e.r * 3 + Math.floor(this.t * 8)) % 5 === 0) X += ((e.c + e.r) % 2 ? 2 : -2) * 2;
            DG.px(x, DG.sprite(e.seed + (Math.floor(this.t * 2) % 2) * 1000), X, Y, P, INK);
            if (e.hp > 1) { x.lineWidth = 2 * u; x.strokeStyle = INK; x.strokeRect(X - 3, Y - 3, SW + 6, SH + 6); }
          });
          this.eshots.forEach((q) => { const d = 5; x.beginPath(); x.moveTo(q.x, q.y - d); x.lineTo(q.x + d, q.y); x.lineTo(q.x, q.y + d); x.lineTo(q.x - d, q.y); x.closePath(); x.lineWidth = 2 * u; x.strokeStyle = INK; x.stroke(); });
          x.fillStyle = INK; this.shots.forEach((q) => { x.fillRect(q.x - 1, q.y - 4, 3, 9); });
          if (!this.over && (this.inv <= 0 || Math.floor(this.t * 12) % 2)) DG.px(x, SHIP, this.px - 3.5 * P, py, P, C);
        },
        /* attract mode: slide under the nearest glitch, step out of the way of shots */
        bot(dt, inp) {
          this.botT -= dt; inp.l = inp.r = 0;
          const danger = this.eshots.find((s) => Math.abs(s.x - this.px) < 16 && s.y > this.H - 140);
          if (danger) { if (danger.x < this.px) inp.r = 1; else inp.l = 1; if (this.px < 40) { inp.l = 0; inp.r = 1; } if (this.px > W - 40) { inp.r = 0; inp.l = 1; } return; }
          let best = null; this.en.forEach((e) => { const X = this.ex(e) + SW / 2; if (!best || Math.abs(X - this.px) < Math.abs(best - this.px)) best = X; });
          if (best !== null) { const dx = best - this.px; if (dx > 5) inp.r = 1; else if (dx < -5) inp.l = 1; }
        },
        hud() { return ['purged ' + DG.fmtN(this.score), 'lives ' + '▲'.repeat(Math.max(0, this.lives))]; },
        result() { return 'purged ' + DG.fmtN(this.score); },
        entry() { return this.score > 0 ? { tag: '', date: '', score: this.score } : null; }
      };
      return g;
    }
  };
})();
