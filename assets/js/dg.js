/* dithereal games: the shared runner. canvas sizing, input (arrows, WASD, phone pad), sound effects, pause, start and game-over
   screens, best scores. each game is its own file in games/ and only describes its rules, drawing and a bot for attract mode. */
(() => {
  'use strict';
  const DS = window.DS;
  const $ = (s, r = document) => r.querySelector(s);
  const GR = '#121212', PN = '#1C1C1C', INK = '#ECECE6', MU = '#A8A8A0', LN = '#3A3A36', C = '#7FFF00', K = '#000';
  const DG = window.DG = { games: {}, col: { GR, PN, INK, MU, LN, C, K } };

  /* ---------- drawing helpers shared by the games ---------- */
  DG.rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  DG.dither = (x, X, Y, w, h, d, px, col) => { x.fillStyle = col; for (let j = 0, yy = Y; yy < Y + h; yy += px, j++) for (let i = 0, xx = X; xx < X + w; xx += px, i++) if ((BAYER[(i & 3) + (j & 3) * 4] + .5) / 16 < d) x.fillRect(xx, yy, px, px); };
  DG.hatch = (x, bx, by, bw, bh, step, lw, col) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); for (let k = -bh; k < bw; k += step) { x.moveTo(bx + k, by + bh); x.lineTo(bx + k + bh, by); } x.stroke(); };
  DG.mix = (a, b, f) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',') + ')'; };
  /* the bad sectors and purge's glitches: 7×6 mirrored pixel sprites, generated from a seed */
  const SPR = {};
  DG.sprite = (seed) => {
    if (SPR[seed]) return SPR[seed];
    const r = DG.rng(seed); let g;
    do { g = []; for (let y = 0; y < 6; y++) { const h = [r() < .55, r() < .55, r() < .55, r() < .7]; g.push([h[0], h[1], h[2], h[3], h[2], h[1], h[0]]); } } while (g.flat().filter(Boolean).length < 16);
    return SPR[seed] = g;
  };
  DG.px = (x, map, X, Y, p, col) => { x.fillStyle = col; map.forEach((row, j) => [...row].forEach((v, i) => { if (v === true || v === '#') x.fillRect(X + i * p, Y + j * p, p, p); })); };
  DG.MONO = '400 12px "IBM Plex Mono",ui-monospace,monospace';
  DG.fmtN = (n) => Math.round(n).toLocaleString('en-US');
  /* world scaling: a fixed world width, height from the stage's shape; one transform, so rules never depend on pixel size */
  DG.world = (x, v, WW) => { const s = v.w / WW; x.setTransform(v.dpr * s, 0, 0, v.dpr * s, 0, v.top * v.dpr); return { s, H: (v.h - v.top) / s }; };

  /* ---------- sound effects: web audio, generated, quiet under the music, only after a gesture ---------- */
  let AC = null;
  const ac = () => { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; };
  function tone(type, f0, f1, dur, vol = .12, when = 0) {
    const a = ac(), o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + .03);
  }
  function noise(dur, f0, f1, vol = .3, type = 'lowpass') {
    const a = ac(), n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t0 = a.currentTime;
    s.buffer = b; f.type = type; f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    s.connect(f).connect(g).connect(a.destination); s.start();
  }
  const SFX = {
    bit: () => tone('square', 880, 660, .04, .05), checksum: () => [523, 659, 784, 1046].forEach((f, i) => tone('square', f, 0, .07, .05, i * .05)), read: () => tone('triangle', 200, 1200, .18, .1), caught: () => tone('sawtooth', 500, 40, .7, .08),
    tread: () => { for (let i = 0; i < 4; i++) setTimeout(() => noise(.05, 400, 200, .2), i * 55); }, shoot: () => tone('square', 1400, 180, .09, .05), hit: () => noise(.12, 1800, 100, .3, 'bandpass'), boom: () => noise(.55, 2400, 60, .45),
    laser: () => tone('square', 1800, 600, .06, .04), pop: () => { tone('square', 300, 60, .08, .06); noise(.08, 3000, 500, .15, 'bandpass'); }, wipe: () => noise(.4, 300, 6000, .25, 'highpass'), lost: () => tone('sawtooth', 400, 50, .6, .08),
    bounce: () => tone('square', 440, 0, .045, .06), wall: () => tone('square', 220, 0, .045, .06), score: () => [392, 523, 659].forEach((f, i) => tone('triangle', f, 0, .12, .1, i * .09)), serve: () => tone('square', 660, 0, .06, .05)
  };
  let sfxOn = DS.store.get('sfx', true) !== false;
  function playSfx(n) { if (!sfxOn || !SFX[n]) return; try { SFX[n](); } catch (_) {} }
  function paintSwitch() { const b = $('#sfxsw'); if (!b) return; b.textContent = sfxOn ? 'on' : 'off'; b.classList.toggle('on', sfxOn); b.setAttribute('aria-pressed', String(sfxOn)); }
  DG.toggleSfx = () => { sfxOn = !sfxOn; DS.store.set('sfx', sfxOn); paintSwitch(); if (sfxOn) playSfx('bounce'); };
  paintSwitch();

  /* ---------- best scores: five per game, on this device only ---------- */
  const NAMES = ['badsector', 'treads', 'purge', 'volley'];
  const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const okEntry = (e) => e && typeof e.tag === 'string' && typeof e.score === 'number' && isFinite(e.score);
  const scores = (n) => { const a = DS.store.get('scores.' + n, []); return (Array.isArray(a) ? a.filter(okEntry) : []).slice(0, 5); };
  const cmp = (a, b) => b.score - a.score;
  function meta(n) { return DG.games[n].meta; }
  DG.refreshTiles = () => {
    NAMES.forEach((n) => {
      const t = $('.tile[data-game="' + n + '"] [data-cap]'); const g = DG.games[n]; if (!t || !g) return;
      const best = scores(n)[0];
      t.textContent = g.meta.cap + (best ? ' · best ' + g.meta.best(best) : '');
    });
  };
  DG.clearScores = () => { NAMES.forEach((n) => DS.store.del('scores.' + n)); DG.refreshTiles(); if (run && run.st === 'start') run.showOverlay(); };

  /* ---------- input: arrows, WASD, and the phone pad all feed one small object ---------- */
  const DIRKEY = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
  const ALIAS = { KeyA: 'l', KeyD: 'r', KeyW: 'u', KeyS: 'd' };

  function buildPad(el, m, onDir) {
    el.textContent = '';
    const ax = m.axes;
    const mk = (cls, t) => { const s = document.createElement('span'); s.className = 'ar ' + cls; s.setAttribute('aria-hidden', 'true'); s.textContent = t; el.appendChild(s); };
    if (ax.includes('y')) { mk('u', '↑'); mk('d', '↓'); }
    if (ax.includes('x')) { mk('l', '←'); mk('r', '→'); }
    const ring = document.createElement('i'); ring.className = 'ring'; const knob = document.createElement('i'); knob.className = 'knob';
    const hint = document.createElement('span'); hint.className = 'hint cap'; hint.textContent = m.hint;
    el.append(ring, knob, hint);
    const base = m.hint; let o = null;
    const set = (dir) => {
      el.querySelectorAll('.ar').forEach((a) => a.classList.toggle('on', a.classList.contains(dir)));
      hint.textContent = dir ? 'moving ' + { u: 'up', d: 'down', l: 'left', r: 'right' }[dir] : base;
      onDir(dir);
    };
    /* a press away from the middle moves toward that side at once (tap or hold an arrow); a drag from anywhere steers */
    const side = (px, py, r) => {
      let dx = px - r.width / 2, dy = py - r.height / 2; if (!ax.includes('x')) dx = 0; if (!ax.includes('y')) dy = 0;
      const nx = Math.abs(dx) / (r.width / 2), ny = Math.abs(dy) / (r.height / 2); if (Math.max(nx, ny) < .35) return '';
      return nx > ny ? (dx < 0 ? 'l' : 'r') : (dy < 0 ? 'u' : 'd');
    };
    el.onpointerdown = (e) => {
      const r = el.getBoundingClientRect(); o = { x: e.clientX - r.left, y: e.clientY - r.top }; el.setPointerCapture(e.pointerId);
      ring.style.left = knob.style.left = o.x + 'px'; ring.style.top = knob.style.top = o.y + 'px'; o.tap = side(o.x, o.y, r); set(o.tap);
    };
    el.onpointermove = (e) => {
      if (!o) return; const r = el.getBoundingClientRect(); let dx = e.clientX - r.left - o.x, dy = e.clientY - r.top - o.y;
      if (!ax.includes('x')) dx = 0; if (!ax.includes('y')) dy = 0;
      const mg = Math.hypot(dx, dy), k = mg > 38 ? 38 / mg : 1; knob.style.left = (o.x + dx * k) + 'px'; knob.style.top = (o.y + dy * k) + 'px';
      el.classList.toggle('drag', mg >= 12);
      set(mg < 12 ? o.tap : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'l' : 'r') : (dy < 0 ? 'u' : 'd'));
    };
    const up = () => { o = null; el.classList.remove('drag'); set(''); };
    el.onpointerup = up; el.onpointercancel = up;
  }

  /* ---------- the runner ---------- */
  const STEP = 0.02;
  let run = null;       /* the game in the game window */
  let prevs = [];       /* the previews in the games folder */
  let raf = 0, prafT = 0;

  function sizeCanvas(cv, cssW, cssH, dpr) { const w = Math.max(10, Math.round(cssW * dpr)), h = Math.max(10, Math.round(cssH * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }

  function makeInst(name, mode, runner) {
    const g = DG.games[name];
    const env = { loud: () => (mode === 'play' && runner ? DS.loud() : 0), sfx: (n) => { if (runner && runner.st === 'play' && !runner.attract) playSfx(n); }, still: DS.still() };
    return g.create(env, (Math.random() * 1e9) | 0);
  }

  function Run(name) {
    const g = DG.games[name], m = g.meta, cv = $('#gcv'), x = cv.getContext('2d'), stage = $('#gstage'), over = $('#gover'), pad = $('#gpad');
    const r = {
      name, st: 'start', attract: true, inp: { l: 0, r: 0, u: 0, d: 0, w: 0, s: 0 }, keys: {}, padDir: '', acc: 0, t: 0, readyT: 0, lock: 0, dpr: 1, w: 0, h: 0, top: 36,
      tag: null, pend: null, botInp: { l: 0, r: 0, u: 0, d: 0, w: 0, s: 0 }, resetAt: 0, dirty: true, rep: 0
    };
    r.inst = makeInst(name, 'play', r);
    r.mapInp = () => { ['l', 'r', 'u', 'd', 'w', 's'].forEach((d) => { r.inp[d] = (r.keys[d] || (d === r.padDir)) ? 1 : 0; }); };

    r.resize = () => {
      const b = stage.getBoundingClientRect(); if (b.width < 20 || b.height < 20) return;
      r.dpr = Math.min(2, window.devicePixelRatio || 1); r.w = b.width; r.h = b.height; r.top = b.width > 440 ? 36 : 44; /* the score line; two lines on a narrow stage */
      sizeCanvas(cv, r.w, r.h, r.dpr); r.inst.resize(r.w, r.h, r.top); r.dirty = true;
    };

    /* ---- overlay screens (start, game over, tag entry) ---- */
    const table = (list, selIdx, tagEl) => {
      let h = '<table class="t"><thead><tr><th style="width:40px">#</th><th>tag</th><th style="width:130px">score</th><th style="width:100px">date</th></tr></thead><tbody>';
      for (let i = 0; i < 5; i++) {
        const e = list[i];
        if (!e) { h += '<tr><td class="m">' + (i + 1) + '</td><td class="m">—</td><td class="m">—</td><td class="m">—</td></tr>'; continue; }
        const tg = i === selIdx && tagEl ? tagEl : e.tag;
        h += '<tr' + (i === selIdx ? ' class="sel"' : '') + '><td class="m">' + (i + 1) + '</td><td>' + tg + '</td><td class="m">' + m.show(e) + '</td><td class="m">' + (i === selIdx ? 'today' : (e.date || '')) + '</td></tr>';
      }
      return h + '</tbody></table>';
    };
    const tagHtml = () => '<span class="tag">' + r.tag.l.map((c, i) => '<b' + (i === r.tag.i ? ' class="on"' : '') + '>' + c + '</b>').join('') + '</span>';
    r.showOverlay = () => {
      over.hidden = false;
      if (r.st === 'start') {
        over.innerHTML = '<span class="cap">d:\\games\\' + name + '.exe</span><div class="ovh">' + name + '</div><span class="cap">' + m.cap + ' · ' + m.rules + '</span>' + table(scores(name), -1) +
          '<div class="nowname" style="font-size:20px">press an arrow to start.</div><span class="cap">on a phone: drag, or tap an arrow</span>';
      } else if (r.st === 'tag' || r.st === 'done') {
        const rank = r.pend ? ' · new best #' + (r.pend.idx + 1) : '';
        const lst = r.pend ? r.pend.all : scores(name);
        over.innerHTML = '<div class="ovh">' + m.over + '</div><span class="cap">' + r.inst.result() + rank + '</span>' +
          table(lst, r.pend ? r.pend.idx : -1, r.st === 'tag' ? tagHtml() : null) +
          (r.st === 'tag' ? '<span class="cap">↑ ↓ letter · ← → move · → past the last letter saves</span><span class="cap">then any arrow plays again</span>' : '<span class="cap">any arrow plays again</span>');
      } else { over.hidden = true; over.textContent = ''; }
    };

    /* ---- state changes ---- */
    r.begin = () => { r.inst = makeInst(name, 'play', r); r.inst.resize(r.w, r.h, r.top); r.attract = false; r.st = 'ready'; r.readyT = 1.35; r.pend = null; r.acc = 0; r.showOverlay(); r.dirty = true; kick(); };
    r.resume = () => { r.st = 'ready'; r.readyT = 1.35; r.dirty = true; kick(); };
    r.finish = () => {
      r.lock = performance.now() + 900;
      const ent = r.inst.entry();
      r.pend = null;
      if (ent && !r.inst.noScore) {
        const all = scores(name).concat(ent).sort(cmp), idx = all.indexOf(ent);
        if (idx < 5) { r.pend = { all: all.slice(0, 5), idx, ent }; const t = String(DS.store.get('tag', 'AAA')).toUpperCase().replace(/[^A-Z]/g, 'A').padEnd(3, 'A').slice(0, 3); r.tag = { l: t.split(''), i: 0 }; r.st = 'tag'; }
      }
      if (r.st !== 'tag') r.st = 'done';
      r.showOverlay(); r.dirty = true;
    };
    r.saveTag = () => {
      const p = r.pend; const t = r.tag.l.join(''); DS.store.set('tag', t);
      p.ent.tag = t; p.ent.date = today(); const list = p.all.map((e) => ({ ...e }));
      DS.store.set('scores.' + name, list); DG.refreshTiles();
      r.lock = performance.now() + 700; r.st = 'done'; r.showOverlay(); r.dirty = true;
    };

    /* a movement input: starts, resumes, restarts, or edits the tag */
    r.onDir = (d) => {
      if (r.st === 'start') { r.begin(); if (r.inst.press) r.inst.press(d); }
      else if (r.st === 'paused') { r.resume(); if (r.inst.press) r.inst.press(d); }
      else if (r.st === 'done') { if (performance.now() > r.lock) { r.begin(); if (r.inst.press) r.inst.press(d); } }
      else if (r.st === 'tag') {
        if (performance.now() < r.lock) return;
        const t = r.tag; const A = 65;
        if (d === 'u') t.l[t.i] = String.fromCharCode((t.l[t.i].charCodeAt(0) - A + 1) % 26 + A);
        else if (d === 'd') t.l[t.i] = String.fromCharCode((t.l[t.i].charCodeAt(0) - A + 25) % 26 + A);
        else if (d === 'l') t.i = Math.max(0, t.i - 1);
        else if (d === 'r') { if (t.i === 2) { r.saveTag(); return; } t.i++; }
        r.showOverlay(); r.dirty = true;
      } else if (r.st === 'ready' || r.st === 'play') { if (r.inst.press) r.inst.press(d); }
    };
    r.key = (e, down) => {
      const code = e.code, k = DIRKEY[e.key] || (m.p2 && (code === 'KeyW' || code === 'KeyS') ? (code === 'KeyW' ? 'w' : 's') : ALIAS[code]);
      if (!k) return false;
      if (m.p2 && (code === 'KeyA' || code === 'KeyD')) return false;
      if (down) { if (!e.repeat) { r.keys[k] = 1; r.onDir(k === 'w' ? 'u' : k === 's' ? 'd' : k); } else if (r.st === 'tag' && (k === 'u' || k === 'd')) r.onDir(k); }
      else r.keys[k] = 0;
      r.mapInp(); return true;
    };
    r.pad = (dir) => { r.padDir = dir; r.mapInp(); clearInterval(r.rep); if (dir) { r.onDir(dir); if (dir === 'u' || dir === 'd') r.rep = setInterval(() => { if (r.st === 'tag') r.onDir(dir); }, 220); } };
    r.release = () => { r.keys = {}; r.padDir = ''; r.mapInp(); };

    /* ---- one frame ---- */
    r.running = () => r.st === 'start' || r.st === 'ready' || r.st === 'play';
    r.frame = (dt) => {
      const foc = DS.focused();
      if ((r.st === 'play' || r.st === 'ready') && !foc) { r.st = 'paused'; r.release(); r.dirty = true; }
      if (r.st === 'ready') { r.readyT -= dt; if (r.readyT <= 0) r.st = 'play'; r.dirty = true; }
      if (r.st === 'start' || r.st === 'play') {
        r.acc = Math.min(r.acc + dt, .2);
        const attract = r.st === 'start';
        while (r.acc >= STEP) {
          if (attract) { r.inst.bot(STEP, r.botInp); r.inst.step(STEP, r.botInp); } else r.inst.step(STEP, r.inp);
          r.acc -= STEP; r.t += STEP;
        }
        if (r.inst.over) { if (attract) { if (!r.resetAt) r.resetAt = performance.now() + 1500; else if (performance.now() > r.resetAt) { r.inst = makeInst(name, 'play', r); r.inst.resize(r.w, r.h, r.top); r.resetAt = 0; } } else { r.finish(); } }
        r.dirty = true;
      }
      if (r.dirty) { r.draw(); r.dirty = false; }
    };
    r.draw = () => {
      const v = { w: r.w, h: r.h, dpr: r.dpr, top: r.top, t: r.t, live: r.st !== 'start' };
      r.inst.draw(x, v);
      x.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      if (r.st !== 'start' && r.st !== 'tag' && r.st !== 'done') {
        const h = r.inst.hud(); x.font = DG.MONO;
        if (x.measureText(h[0]).width + x.measureText(h[1]).width + 48 < r.w) { capText(x, h[0], 16, 24, 'left'); capText(x, h[1], r.w - 16, 24, 'right'); }
        else { capText(x, h[0], 16, 18, 'left'); capText(x, h[1], 16, 35, 'left'); }
      }
      const cx = r.w / 2, cy = r.top + (r.h - r.top) * .5;
      if (r.st === 'ready') { const left = Math.max(1, Math.ceil(r.readyT / .45)); inkText(x, 'ready.  ' + '■'.repeat(left) + '□'.repeat(3 - left), cx, cy); }
      if (r.st === 'paused') inkText(x, 'paused. press an arrow.', cx, cy);
    };
    return r;
  }
  function capText(x, txt, X, Y, align) { x.font = DG.MONO; x.fillStyle = MU; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(txt, X, Y); x.textAlign = 'left'; }
  function inkText(x, txt, X, Y) {
    x.font = '500 14px "IBM Plex Mono",ui-monospace,monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = x.measureText(txt).width + 28; x.fillStyle = GR; x.fillRect(X - w / 2, Y - 18, w, 36); x.lineWidth = 2; x.strokeStyle = INK; x.strokeRect(X - w / 2 + 1, Y - 17, w - 2, 34);
    x.fillStyle = INK; x.fillText(txt, X, Y + 1); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  }

  /* ---------- loops ---------- */
  let last = 0;
  function loop(now) {
    raf = 0;
    const dt = Math.max(0, Math.min(.1, (now - last) / 1000)); last = now;
    if (run && DS.visible('gx') && !document.hidden) {
      if (run.running() || run.dirty) run.frame(dt);
      if (run.running()) raf = requestAnimationFrame(loop);
    }
  }
  function kick() { if (!raf && run && (run.running() || run.dirty) && DS.visible('gx') && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function ploop(now) {
    prafT = 0;
    if (!prevs.length || document.hidden || !DS.visible('gm')) return;
    const dt = Math.min(.1, (now - (ploop.last || now)) / 1000);
    if (dt >= .075 || !ploop.last) { ploop.last = now; prevs.forEach((p) => { p.acc += Math.max(dt, .08); let n = 0; while (p.acc >= STEP && n++ < 5) { p.inst.bot(STEP, p.inp); p.inst.step(STEP, p.inp); p.acc -= STEP; p.t += STEP; } if (p.inst.over) { if (!p.rs) p.rs = now + 1500; else if (now > p.rs) { p.inst = makeInst(p.name, 'preview'); p.inst.resize(p.w, p.h, 6); p.rs = 0; } } p.inst.draw(p.x, { w: p.w, h: p.h, dpr: p.dpr, top: 6, t: p.t, live: true }); }); }
    prafT = requestAnimationFrame(ploop);
  }
  function startPreviews() {
    if (prevs.length) { if (!prafT) prafT = requestAnimationFrame(ploop); return; }
    document.querySelectorAll('canvas[data-prev]').forEach((cv) => {
      const n = cv.dataset.prev; if (!DG.games[n]) return;
      const b = cv.getBoundingClientRect(); const dpr = 1;
      if (b.width < 20) return;
      cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
      const p = { name: n, cv, x: cv.getContext('2d'), w: b.width, h: b.height, dpr, acc: 0, t: 0, inp: { l: 0, r: 0, u: 0, d: 0, w: 0, s: 0 }, rs: 0 };
      p.inst = makeInst(n, 'preview'); p.inst.resize(p.w, p.h, 6); prevs.push(p);
    });
    DG.refreshTiles(); ploop.last = 0; prafT = prevs.length ? requestAnimationFrame(ploop) : 0;
  }
  function stopPreviews() { if (prafT) cancelAnimationFrame(prafT); prafT = 0; }

  /* ---------- public ---------- */
  DG.mount = (name) => {
    DG.unmount();
    const g = DG.games[name], m = g.meta;
    run = Run(name);
    $('#gkeytxt').textContent = m.keytxt; $('#gkeys').textContent = m.keys; $('#gnote').textContent = m.note; paintSwitch();
    buildPad($('#gpad'), m, (d) => { if (run) run.pad(d); });
    run.resize(); run.showOverlay();
    if (window.ResizeObserver) { run.ro = new ResizeObserver(() => run && run.resize()); run.ro.observe($('#gstage')); }
    kick();
  };
  DG.unmount = () => {
    if (!run) return;
    clearInterval(run.rep); if (run.ro) run.ro.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0;
    $('#gover').hidden = true; $('#gover').textContent = ''; $('#gpad').textContent = ''; run = null;
  };
  DG.state = () => (run ? run.st : null);
  DG.playing = () => !!run && run.st === 'play' && DS.focused();
  DG.sync = () => {
    if (DS.visible('gm') && !document.hidden) startPreviews(); else stopPreviews();
    if (run) { if (run.w < 20) run.resize(); run.dirty = true; kick(); if (!DS.visible('gx') || document.hidden) { if (run.st === 'play' || run.st === 'ready') { run.st = 'paused'; run.release(); } } }
    DG.refreshTiles();
  };
  /* arrows are only taken while the game window is the focused one, so the rest of the page keeps working by keyboard */
  window.addEventListener('keydown', (e) => { if (run && DS.focused() && !e.ctrlKey && !e.metaKey && !e.altKey && run.key(e, true)) { e.preventDefault(); e.stopPropagation(); kick(); } }, true);
  window.addEventListener('keyup', (e) => { if (run && run.key(e, false)) { /* keep default */ } }, true);
  window.addEventListener('blur', () => { if (run) { run.release(); } });
  DG.refreshTiles();
})();
