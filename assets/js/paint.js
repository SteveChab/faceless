/* paint: 320×200, 1-bit, patterns, remembered on this device (localStorage). nothing is sent anywhere. */
(() => {
  'use strict';
  const DS = window.DS;
  const $ = (s, r = document) => r.querySelector(s);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let ready = false;

  function init() {
    if (ready) return; ready = true;
    const cv = $('#paint'), W = 320, H = 200, x = cv.getContext('2d'), buf = new Uint8Array(W * H), undo = [], redo = [];
    const PAT = {
      solid: () => 1, d75: (i, j) => BAYER[(i & 3) + (j & 3) * 4] < 12, d50: (i, j) => BAYER[(i & 3) + (j & 3) * 4] < 8, d25: (i, j) => BAYER[(i & 3) + (j & 3) * 4] < 4,
      hatch: (i, j) => (i + j) % 4 === 0, grid: (i, j) => i % 4 === 0 || j % 4 === 0, dots: (i, j) => i % 3 === 0 && j % 3 === 0, checker: (i, j) => (i + j) % 2 === 0
    };
    let tool = 'brush', pat = 'd50', size = 4, drag = null, snap = null;
    const im = x.createImageData(W, H), g = [0x12, 0x12, 0x12], k = [0xEC, 0xEC, 0xE6];
    function render() { for (let p = 0; p < W * H; p++) { const c = buf[p] ? k : g; im.data[p * 4] = c[0]; im.data[p * 4 + 1] = c[1]; im.data[p * 4 + 2] = c[2]; im.data[p * 4 + 3] = 255; } x.putImageData(im, 0, 0); }
    /* 1 bit per pixel, packed, base64: about 11 KB */
    function save() { let s = ''; for (let p = 0; p < W * H; p += 8) { let b = 0; for (let q = 0; q < 8; q++) b |= buf[p + q] << q; s += String.fromCharCode(b); } DS.store.set('paint', { w: W, h: H, bits: btoa(s) }); }
    function load() { try { const d = DS.store.get('paint', null); if (!d || d.w !== W || d.h !== H) return; const s = atob(d.bits); for (let p = 0; p < W * H; p++) buf[p] = (s.charCodeAt(p >> 3) >> (p & 7)) & 1; } catch (_) { /* blank */ } }
    const put = (i, j, v) => { if (i >= 0 && j >= 0 && i < W && j < H) buf[j * W + i] = v; };
    function stamp(i, j) {
      const s = tool === 'pencil' ? 1 : size, o = Math.floor(s / 2);
      for (let b = 0; b < s; b++) for (let a = 0; a < s; a++) { const X = i - o + a, Y = j - o + b; if (tool === 'pencil') put(X, Y, 1); else if (tool === 'erase') put(X, Y, 0); else if (PAT[pat](X, Y)) put(X, Y, 1); }
    }
    function seg(a, b, c, d, fn) { const n = Math.max(Math.abs(c - a), Math.abs(d - b), 1); for (let s = 0; s <= n; s++) fn(Math.round(a + (c - a) * s / n), Math.round(b + (d - b) * s / n)); }
    function box(a, b, c, d) { const [l, r] = [Math.min(a, c), Math.max(a, c)], [t, u] = [Math.min(b, d), Math.max(b, d)]; for (let j = t; j <= u; j++) for (let i = l; i <= r; i++) put(i, j, (i === l || i === r || j === t || j === u) ? 1 : (PAT[pat](i, j) ? 1 : 0)); }
    function fill(i, j) {
      const t = buf[j * W + i], st = [[i, j]], seen = new Uint8Array(W * H);
      while (st.length) { const [a, b] = st.pop(); if (a < 0 || b < 0 || a >= W || b >= H) continue; const p = b * W + a; if (seen[p] || buf[p] !== t) continue; seen[p] = 1; st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
      for (let p = 0; p < W * H; p++) if (seen[p]) buf[p] = PAT[pat](p % W, (p / W) | 0) ? 1 : 0;
    }
    const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)]; };
    const push = () => { undo.push(buf.slice()); if (undo.length > 30) undo.shift(); redo.length = 0; };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); const [i, j] = at(e); push(); drag = [i, j, i, j]; snap = buf.slice();
      if (tool === 'fill') { fill(Math.max(0, Math.min(W - 1, i)), Math.max(0, Math.min(H - 1, j))); drag = null; save(); }
      else if (tool === 'pencil' || tool === 'brush' || tool === 'erase') stamp(i, j);
      render();
    });
    cv.addEventListener('pointermove', (e) => {
      const [i, j] = at(e); const p = $('#pxy'); if (p) p.textContent = 'x ' + Math.max(0, Math.min(W - 1, i)) + '  y ' + Math.max(0, Math.min(H - 1, j));
      if (!drag) return;
      if (tool === 'line' || tool === 'box') { buf.set(snap); if (tool === 'line') seg(drag[0], drag[1], i, j, (a, b) => stamp(a, b)); else box(drag[0], drag[1], i, j); }
      else seg(drag[2], drag[3], i, j, stamp);
      drag[2] = i; drag[3] = j; render();
    });
    const end = () => { if (drag) { drag = null; save(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const press = (sel, key, val, fn) => document.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { fn(b.dataset[key]); document.querySelectorAll(sel).forEach((o) => o.setAttribute('aria-pressed', String(o === b))); }));
    press('[data-tool]', 'tool', 0, (v) => { tool = v; });
    press('[data-size]', 'size', 0, (v) => { size = +v; });
    document.querySelectorAll('[data-pat]').forEach((b) => {
      const c = b.querySelector('canvas'), q = c.getContext('2d'); q.fillStyle = '#121212'; q.fillRect(0, 0, 20, 20); q.fillStyle = '#ECECE6';
      for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) if (PAT[b.dataset.pat](i, j)) q.fillRect(i, j, 1, 1);
      b.addEventListener('click', () => { pat = b.dataset.pat; document.querySelectorAll('[data-pat]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); });
    });
    const act = {
      undo: () => { if (undo.length) { redo.push(buf.slice()); buf.set(undo.pop()); } },
      redo: () => { if (redo.length) { undo.push(buf.slice()); buf.set(redo.pop()); } },
      new: () => DS.confirm({ head: 'start a new drawing?', sub: '0x3F · the drawing is cleared. undo brings it back.', yes: { label: 'new', fn: () => { push(); buf.fill(0); render(); save(); } } }),
      png: () => { const a = document.createElement('a'); a.download = 'dithereal-paint.png'; a.href = cv.toDataURL('image/png'); a.click(); }
    };
    document.querySelectorAll('[data-act2]').forEach((b) => b.addEventListener('click', () => { const n = b.dataset.act2; act[n](); if (n === 'undo' || n === 'redo') { render(); save(); } }));
    load(); render();
  }
  window.PAINT = { init };
})();
