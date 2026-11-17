/* volley.exe: rally. up and down only. the net is the playing track's waveform. first to 11. it serves itself. */
(() => {
  'use strict';
  const DG = window.DG, { GR, INK, MU, LN, C, K } = DG.col;

  DG.games.volley = {
    meta: {
      cap: 'rally', rules: 'first to 11. it serves itself. w and s hand the right paddle to a friend.', axes: 'y',
      hint: 'drag up or down · it serves itself', keytxt: 'move', keys: '↑ ↓', p2: true, note: 'serves itself after each point. pauses when the window loses focus.',
      over: 'match over.', best: (e) => e.my + '–' + e.opp, show: (e) => e.my + '–' + e.opp
    },
    create(env, seed) {
      const g = {
        env, WW: 640, H: 400, t: 0, over: false, my: 0, opp: 0, two: false, noScore: false, returns: 0,
        by: 0, bx: 0, vx: 0, vy: 0, sv: 1, dirTo: 1, ly: 0, ry: 0, aiErr: 0, trail: [], trT: 0, lh: new Array(26).fill(0), lhT: 0, botT: 0,
        resize(w, h, top) { this.WW = (h - top) / w > 1.05 ? 420 : 640; this.H = (h - top) / (w / this.WW); this.ph = Math.round(this.WW * .115); this.pw = 12; this.bs = 12; if (!this.ly) this.reset(1); },
        reset(to) { this.bx = this.WW / 2 - this.bs / 2; this.by = this.H / 2 - this.bs / 2; this.vx = this.vy = 0; this.sv = 1; this.dirTo = to; this.trail = []; this.returns = 0; this.ly = this.ly || this.H / 2 - this.ph / 2; this.ry = this.ry || this.H / 2 - this.ph / 2; },
        sp0() { return this.WW * .47; },
        launch() { const a = (Math.random() - .5) * .7, sp = this.sp0(); this.vx = Math.cos(a) * sp * this.dirTo; this.vy = Math.sin(a) * sp; this.env.sfx('serve'); },
        step(dt, inp) {
          this.t += dt; if (this.over) return;
          const WW = this.WW, H = this.H, ph = this.ph, pw = this.pw, bs = this.bs, ps = WW * .6;
          const yMin = 6, yMax = H - 6 - ph;
          /* the net takes the loudness a little at a time, newest at the top */
          this.lhT -= dt; if (this.lhT <= 0) { this.lhT = .05; this.lh.unshift(this.env.loud()); this.lh.length = 26; }
          if (inp.w || inp.s) { this.two = true; this.noScore = true; }
          this.ly = Math.max(yMin, Math.min(yMax, this.ly + (inp.d - inp.u) * ps * dt));
          if (this.two) this.ry = Math.max(yMin, Math.min(yMax, this.ry + (inp.s - inp.w) * ps * dt));
          else {
            /* the computer: follows the ball with a little error, drifts to the middle while the ball is going away */
            const tgt = this.vx > 0 ? this.by + bs / 2 - ph / 2 + this.aiErr : H / 2 - ph / 2, d = tgt - this.ry, m = ps * .74 * dt;
            this.ry = Math.max(yMin, Math.min(yMax, this.ry + Math.max(-m, Math.min(m, d))));
          }
          if (this.sv > 0) { this.sv -= dt; if (this.sv <= 0) this.launch(); return; }
          this.bx += this.vx * dt; this.by += this.vy * dt;
          if (this.by < 4) { this.by = 4; this.vy = Math.abs(this.vy); this.env.sfx('wall'); }
          if (this.by > H - 4 - bs) { this.by = H - 4 - bs; this.vy = -Math.abs(this.vy); this.env.sfx('wall'); }
          const L = 26, R = WW - 26 - pw;
          const hit = (px, py, dir) => {
            if (this.bx + bs > px && this.bx < px + pw && this.by + bs > py && this.by < py + ph && Math.sign(this.vx) === -dir) {
              const rel = Math.max(-1, Math.min(1, (this.by + bs / 2 - (py + ph / 2)) / (ph / 2)));
              const sp = Math.min(this.sp0() * 1.9, Math.hypot(this.vx, this.vy) * 1.045), a = rel * .85;
              this.vx = Math.cos(a) * sp * dir; this.vy = Math.sin(a) * sp; this.bx = dir > 0 ? px + pw : px - bs; this.returns++; this.env.sfx('bounce');
              this.aiErr = (Math.random() - .5) * ph * .9; return true;
            }
            return false;
          };
          if (!hit(L, this.ly, 1)) hit(R, this.ry, -1);
          /* positions for the four fading outlines, taken from the real path */
          this.trT -= dt; if (this.trT <= 0) { this.trT = .045; this.trail.unshift([this.bx, this.by]); this.trail.length = Math.min(this.trail.length, 4); }
          if (this.bx < -bs * 2) { this.opp++; this.point(-1); }
          else if (this.bx > WW + bs) { this.my++; this.point(1); }
        },
        point(who) {
          this.env.sfx('score');
          if (this.my >= 11 || this.opp >= 11) { this.over = true; return; }
          this.reset(who > 0 ? 1 : -1);
        },
        draw(x, v) {
          x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = GR; x.fillRect(0, 0, x.canvas.width, x.canvas.height);
          const { s, H } = DG.world(x, v, this.WW), u = 1 / s, WW = this.WW, ph = this.ph, pw = this.pw, bs = this.bs, cx = WW / 2;
          x.fillStyle = MU; x.fillRect(0, 0, WW, 2 * u * 1.5); x.fillRect(0, H - 3 * u, WW, 3 * u);
          x.fillStyle = LN; for (let y = 8, j = 0; y < H - 8; y += 8, j++) { const w = 2 + (this.lh[Math.min(25, j)] || 0) * 70 * (WW / 640); x.fillRect(cx - w / 2, y, w, 3); }
          const fs = Math.min(120, Math.round(H * .2)); x.font = '600 ' + fs + 'px Barlow,sans-serif'; x.textBaseline = 'top'; x.fillStyle = INK; x.textAlign = 'center';
          x.fillText(String(this.my).padStart(2, '0'), WW * .27, 12); x.fillText(String(this.opp).padStart(2, '0'), WW * .73, 12); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
          const L = 26, R = WW - 26 - pw;
          this.trail.forEach((p, k) => { x.lineWidth = 1.5 * u; x.strokeStyle = DG.mix(LN, MU, 1 - (k + 1) / 5); x.strokeRect(p[0] + u, p[1] + u, bs - 2 * u, bs - 2 * u); });
          x.fillStyle = INK; x.fillRect(this.bx, this.by, bs, bs);
          x.fillStyle = C; x.fillRect(L, this.ly, pw, ph); x.lineWidth = 1.5 * u; x.strokeStyle = K; x.strokeRect(L, this.ly, pw, ph);
          x.lineWidth = 2 * u; x.strokeStyle = INK; x.strokeRect(R + u, this.ry + u, pw - 2 * u, ph - 2 * u);
        },
        /* attract mode: the left paddle chases the ball */
        bot(dt, inp) {
          inp.u = inp.d = 0; const tgt = (this.vx < 0 ? this.by + this.bs / 2 : this.H / 2) - this.ph / 2, d = tgt - this.ly;
          if (d > 5) inp.d = 1; else if (d < -5) inp.u = 1;
        },
        hud() { return ['first to 11', this.two ? 'two players' : 'rally ' + this.returns]; },
        result() { return (this.my > this.opp ? 'you win ' : 'they win ') + this.my + '–' + this.opp; },
        entry() { return this.noScore || this.opp > this.my ? null : { tag: '', date: '', score: (this.my - this.opp) * 1000 + this.my, my: this.my, opp: this.opp }; }
      };
      return g;
    }
  };
})();
