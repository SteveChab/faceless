/* treads.exe: tank. arrows turn and drive. the turret aims itself at the nearest enemy it can see and fires every 0.4 s. */
(() => {
  'use strict';
  const DG = window.DG, { GR, PN, INK, MU, C, K } = DG.col;
  const WW = 720, R = 17, TAU = Math.PI * 2;
  const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const toward = (a, b, m) => { const d = wrap(b - a); return Math.abs(d) <= m ? b : a + Math.sign(d) * m; };

  function drawTank(x, X, Y, ang, tur, me, t, u, walk) {
    x.save(); x.translate(X, Y); x.rotate(ang); const w = 42, h = 30, tw = 8;
    for (const sy of [-h / 2 - tw / 2 + 2, h / 2 + tw / 2 - 2]) {
      const rx = -w / 2 - 3, ry = sy - tw / 2; x.fillStyle = me ? INK : PN; x.fillRect(rx, ry, w + 6, tw); x.lineWidth = 2 * u; x.strokeStyle = me ? INK : MU; x.strokeRect(rx, ry, w + 6, tw);
      x.fillStyle = me ? GR : MU; const off = (walk * 1.2) % 8; for (let k = rx + off; k < rx + w + 6; k += 8) x.fillRect(Math.max(rx, k), ry, 2, tw);
    }
    if (me) { x.fillStyle = C; x.fillRect(-w / 2, -h / 2, w, h); x.lineWidth = 1.5 * u; x.strokeStyle = K; x.strokeRect(-w / 2, -h / 2, w, h); }
    else { x.fillStyle = GR; x.fillRect(-w / 2, -h / 2, w, h); x.save(); x.beginPath(); x.rect(-w / 2, -h / 2, w, h); x.clip(); DG.hatch(x, -w / 2, -h / 2, w, h, 7, u, MU); x.restore(); x.lineWidth = 2 * u; x.strokeStyle = INK; x.strokeRect(-w / 2, -h / 2, w, h); }
    x.rotate(tur - ang); x.beginPath(); x.arc(0, 0, 9, 0, 7); x.fillStyle = me ? K : GR; x.fill(); if (!me) { x.lineWidth = 2 * u; x.strokeStyle = INK; x.stroke(); }
    x.fillStyle = me ? K : INK; x.fillRect(6, -2.5, 22, 5); x.restore();
  }

  DG.games.treads = {
    meta: {
      title: 'treads', cap: 'tank', rules: 'left and right turn, up and down drive. the turret aims and fires on its own.', axes: 'xy',
      hint: 'press and drag anywhere to drive and turn', keytxt: 'turn · drive', keys: '← → ↑ ↓', note: 'always firing; the turret aims itself. pauses when the window loses focus.',
      over: 'hull breached.', best: (e) => 'wave ' + e.wave, show: (e) => 'wave ' + e.wave + ' · ' + DG.fmtN(e.pts)
    },
    create(env, seed) {
      const g = {
        env, v: null, H: 420, t: 0, over: false, wave: 0, pts: 0, hull: 5, inv: 0, wait: 0, blocks: [], en: [], shots: [], fx: [], walk: 0, trT: 0,
        p: { x: WW / 2, y: 200, ang: -Math.PI / 2, tur: -Math.PI / 2, cd: 0 }, botT: 0, botTurn: 0,
        resize(w, h, top) { this.v = { w, h, top }; this.H = (h - top) / (w / WW); if (!this.wave) { this.p.y = this.H / 2; this.next(); } },
        A() { return { x: 12, y: 4, w: WW - 24, h: this.H - 12 }; },
        rect(b) { return b; },
        /* a wave: fresh cover, enemies spawned far from you */
        next() {
          this.wave++; const r = DG.rng(seed + this.wave * 97), A = this.A(); this.blocks = []; this.shots = [];
          const n = 6 + Math.min(4, this.wave);
          for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
            const w = (1 + Math.floor(r() * 3)) * 30, h = (1 + Math.floor(r() * 2)) * 30, x = A.x + 40 + r() * (A.w - 80 - w), y = A.y + 40 + r() * (A.h - 80 - h);
            if (Math.hypot(x + w / 2 - this.p.x, y + h / 2 - this.p.y) < 110) continue;
            if (this.blocks.some((b) => x < b.x + b.w + 30 && x + w > b.x - 30 && y < b.y + b.h + 30 && y + h > b.y - 30)) continue;
            this.blocks.push({ x, y, w, h, hp: 5 }); i++;
          }
          this.en = []; const cnt = Math.min(7, 2 + this.wave);
          for (let i = 0, tries = 0; i < cnt && tries < 200; tries++) {
            const x = A.x + 30 + r() * (A.w - 60), y = A.y + 30 + r() * (A.h - 60);
            if (Math.hypot(x - this.p.x, y - this.p.y) < 240 || this.hitBlock(x, y, 24)) continue;
            this.en.push({ x, y, ang: r() * TAU, tur: 0, hp: 2, cd: 1 + r() * 1.5, tx: x, ty: y, mt: 0, walk: 0 }); i++;
          }
          this.wait = 1;
        },
        hitBlock(x, y, rad) { return this.blocks.some((b) => b.hp > 0 && x > b.x - rad && x < b.x + b.w + rad && y > b.y - rad && y < b.y + b.h + rad); },
        blocked(x, y, self) {
          const A = this.A(); if (x < A.x + R || x > A.x + A.w - R || y < A.y + R || y > A.y + A.h - R) return true;
          if (this.hitBlock(x, y, R)) return true;
          if (self !== this.p && Math.hypot(x - this.p.x, y - this.p.y) < R * 2) return true;
          return this.en.some((e) => e !== self && Math.hypot(x - e.x, y - e.y) < R * 2);
        },
        los(a, b) {
          for (const k of this.blocks) {
            if (k.hp <= 0) continue; const n = 12;
            for (let i = 1; i < n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h) return false; }
          }
          return true;
        },
        boom(x, y) { this.fx.push({ x, y, t: 0 }); },
        hurt() { if (this.inv > 0) return; this.hull--; this.inv = .5; this.env.sfx('hit'); if (this.hull <= 0) { this.over = true; this.env.sfx('boom'); this.boom(this.p.x, this.p.y); } },
        step(dt, inp) {
          this.t += dt; const p = this.p; this.fx.forEach((f) => { f.t += dt; }); this.fx = this.fx.filter((f) => f.t < .45);
          if (this.over) return;
          if (this.inv > 0) this.inv -= dt;
          if (this.wait > 0) this.wait -= dt;
          /* you: left and right turn, up and down drive */
          p.ang = wrap(p.ang + (inp.r - inp.l) * 2.4 * dt);
          const sp = (inp.u - inp.d) * (inp.u ? 125 : 80) * dt;
          if (sp) {
            const nx = p.x + Math.cos(p.ang) * sp, ny = p.y + Math.sin(p.ang) * sp;
            if (!this.blocked(nx, p.y, p)) p.x = nx; if (!this.blocked(p.x, ny, p)) p.y = ny;
            this.walk += sp; this.trT -= dt; if (this.trT <= 0) { this.trT = .3; this.env.sfx('tread'); }
          }
          /* the turret picks the nearest enemy in line of sight and fires about every 0.4 s */
          let tg = null, bd = 1e9; this.en.forEach((e) => { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd && this.los(p, e)) { bd = d; tg = e; } });
          const want = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.ang; p.tur = toward(p.tur, want, 9 * dt);
          p.cd -= dt;
          if (tg && p.cd <= 0 && Math.abs(wrap(want - p.tur)) < .12) { p.cd = .4; this.shots.push({ x: p.x + Math.cos(p.tur) * 26, y: p.y + Math.sin(p.tur) * 26, vx: Math.cos(p.tur) * 380, vy: Math.sin(p.tur) * 380, own: 1, life: 2 }); this.env.sfx('shoot'); }
          /* enemies: wander toward the player's side, aim, fire hollow squares (a little more on loud moments) */
          const loud = this.env.loud();
          this.en.forEach((e) => {
            e.mt -= dt;
            if (e.mt <= 0 || Math.hypot(e.tx - e.x, e.ty - e.y) < 12) {
              e.mt = 1.5 + Math.random() * 2; const a = Math.random() * TAU, d = 120 + Math.random() * 160; e.tx = p.x + Math.cos(a) * d; e.ty = p.y + Math.sin(a) * d;
            }
            const a = Math.atan2(e.ty - e.y, e.tx - e.x); e.ang = toward(e.ang, a, 2 * dt);
            if (Math.abs(wrap(a - e.ang)) < .6 && this.wait <= 0) {
              const s = (52 + this.wave * 3) * dt, nx = e.x + Math.cos(e.ang) * s, ny = e.y + Math.sin(e.ang) * s;
              if (!this.blocked(nx, e.y, e)) e.x = nx; else e.mt = 0; if (!this.blocked(e.x, ny, e)) e.y = ny; else e.mt = 0; e.walk += s;
            }
            const see = this.los(e, p), aim = Math.atan2(p.y - e.y, p.x - e.x); e.tur = toward(e.tur, aim, 3 * dt);
            e.cd -= dt * (1 + loud * .5);
            if (e.cd <= 0 && see && this.wait <= 0 && Math.abs(wrap(aim - e.tur)) < .2) { e.cd = (1.7 + Math.random() * 1.2) * Math.max(.6, 1 - this.wave * .04); this.shots.push({ x: e.x + Math.cos(e.tur) * 26, y: e.y + Math.sin(e.tur) * 26, vx: Math.cos(e.tur) * 185, vy: Math.sin(e.tur) * 185, own: 0, life: 4 }); }
          });
          /* shots */
          const A = this.A();
          for (const s of this.shots) {
            s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
            if (s.x < A.x || s.x > A.x + A.w || s.y < A.y || s.y > A.y + A.h || s.life <= 0) { s.dead = 1; continue; }
            const b = this.blocks.find((k) => k.hp > 0 && s.x > k.x && s.x < k.x + k.w && s.y > k.y && s.y < k.y + k.h);
            if (b) { b.hp--; s.dead = 1; this.env.sfx('hit'); continue; }
            if (s.own) { const e = this.en.find((q) => Math.hypot(q.x - s.x, q.y - s.y) < R + 4); if (e) { s.dead = 1; e.hp--; if (e.hp <= 0) { e.dead = 1; this.pts += 100 + this.wave * 20; this.boom(e.x, e.y); this.env.sfx('boom'); } else this.env.sfx('hit'); } }
            else if (Math.hypot(p.x - s.x, p.y - s.y) < R + 3) { s.dead = 1; this.hurt(); }
          }
          this.shots = this.shots.filter((s) => !s.dead); this.en = this.en.filter((e) => !e.dead);
          if (!this.en.length && this.wait <= 0) { this.pts += 200 * this.wave; this.hull = Math.min(5, this.hull + 1); this.env.sfx('wipe'); this.next(); }
        },
        draw(x, v) {
          x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = GR; x.fillRect(0, 0, x.canvas.width, x.canvas.height);
          const { s, H } = DG.world(x, v, WW), u = 1 / s, A = this.A(); this.H = H;
          x.lineWidth = 2 * u; x.strokeStyle = MU; x.strokeRect(A.x, A.y, A.w, A.h);
          this.blocks.forEach((b) => { if (b.hp > 0) DG.dither(x, Math.round(b.x), Math.round(b.y), b.w, b.h, .8 * b.hp / 5, 3, MU); });
          this.en.forEach((e) => drawTank(x, e.x, e.y, e.ang, e.tur, false, this.t, u, e.walk));
          this.shots.forEach((q) => { if (q.own) { x.fillStyle = INK; x.fillRect(q.x - 3.5, q.y - 3.5, 7, 7); } else { x.lineWidth = 2 * u; x.strokeStyle = INK; x.strokeRect(q.x - 4, q.y - 4, 8, 8); } });
          if (!this.over && (this.inv <= 0 || Math.floor(this.t * 14) % 2)) drawTank(x, this.p.x, this.p.y, this.p.ang, this.p.tur, true, this.t, u, this.walk);
          this.fx.forEach((f) => { const k = f.t / .45, rr = 8 + k * 46; x.save(); x.beginPath(); x.arc(f.x, f.y, rr, 0, 7); x.clip(); DG.dither(x, f.x - rr, f.y - rr, rr * 2, rr * 2, 1 - k, 3, INK); x.restore(); });
        },
        /* attract mode: drive on, steer away from walls and cover, turn now and then */
        bot(dt, inp) {
          const p = this.p; this.botT -= dt; if (this.botT <= 0) { this.botT = .8 + Math.random() * 1.4; this.botTurn = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]; }
          const ax = p.x + Math.cos(p.ang) * 60, ay = p.y + Math.sin(p.ang) * 60, bad = this.blocked(ax, ay, p);
          inp.u = 1; inp.d = 0; inp.l = inp.r = 0;
          if (bad) { inp.r = 1; inp.u = 0; } else if (this.botTurn < 0) inp.l = 1; else if (this.botTurn > 0) inp.r = 1;
        },
        hud() { return ['hull ' + '■'.repeat(Math.max(0, this.hull)) + '□'.repeat(5 - Math.max(0, this.hull)) + '   wave ' + this.wave, 'enemies ' + this.en.length + ' · ' + DG.fmtN(this.pts)]; },
        result() { return 'wave ' + this.wave + ' · ' + DG.fmtN(this.pts); },
        entry() { return this.pts > 0 ? { tag: '', date: '', score: this.wave * 1e6 + this.pts, wave: this.wave, pts: this.pts } : null; }
      };
      return g;
    }
  };
})();
