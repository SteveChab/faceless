/* webcam: a low-res picture, filtered past recognition. nothing is kept by the site and nothing is sent.
   sources: camera (asked for only when pressed), a video file from this device, or a generated test pattern. */
(() => {
  'use strict';
  const DS = window.DS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const { BAYER, rng } = DS;
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  let ready = false, setSource = () => {}, stopRec = () => {}, kick = () => {}, suspend = () => {};

  function init() {
    if (ready) { kick(); return; } ready = true;
    const cv = $('#cam'), W = 160, H = 120, x = cv.getContext('2d'), src = document.createElement('canvas'); src.width = W; src.height = H;
    const sx = src.getContext('2d', { willReadFrequently: true });
    let filt = 'dither', amt = .6, video = null, isCam = false, fileUrl = null, melt = null, rec = null, raf = 0, last = 0;
    const out = x.createImageData(W, H), tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tx = tmp.getContext('2d');
    const msg = $('#cammsg'), rb = $('#recb');
    /* a generated stand-in, shown until a source is chosen and whenever the camera is refused or missing: shapes, nothing else */
    function testSource(t) {
      const g = sx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#222'); g.addColorStop(1, '#bbb'); sx.fillStyle = g; sx.fillRect(0, 0, W, H);
      sx.fillStyle = '#eee'; sx.beginPath(); sx.arc(80 + Math.sin(t * .7) * 30, 58 + Math.cos(t * .9) * 12, 30, 0, 7); sx.fill();
      sx.fillStyle = '#555'; sx.fillRect(20 + ((t * 25) % 140), 70, 26, 40); sx.fillStyle = '#999'; sx.beginPath(); sx.moveTo(130, 10); sx.lineTo(155, 50); sx.lineTo(105, 50); sx.fill();
    }
    function frame(t) {
      if (video && video.readyState >= 2) {
        const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh); sx.save();
        if (isCam) { sx.translate(W, 0); sx.scale(-1, 1); } /* the front camera is mirrored */
        sx.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s); sx.restore();
      } else testSource(t);
      const d = sx.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
      for (let p = 0; p < W * H; p++) L[p] = (.2126 * d[p * 4] + .7152 * d[p * 4 + 1] + .0722 * d[p * 4 + 2]) / 255;
      const o = out.data, setp = (p, on) => { const c = on ? 0xEC : 0x12; o[p * 4] = c; o[p * 4 + 1] = c; o[p * 4 + 2] = on ? 0xE6 : 0x12; o[p * 4 + 3] = 255; };
      const px = Math.max(1, Math.round(1 + amt * 3)); /* coarser cells the further past recognition */
      const dith = (X, Y) => { const cx = Math.floor(X / px) * px, cy = Math.floor(Y / px) * px; return L[cy * W + cx] * (1.2 - amt * .4) > (BAYER[((cx / px) & 3) + ((cy / px) & 3) * 4] + .5) / 16; };
      if (filt === 'dither') for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) setp(Y * W + X, dith(X, Y));
      if (filt === 'tear') {
        const r = rng(Math.floor(t * 6)), off = [];
        for (let Y = 0; Y < H; Y++) if (Y % 6 === 0) off.push(r() < amt * .6 ? Math.floor((r() - .5) * amt * 80) : 0);
        for (let Y = 0; Y < H; Y++) { const s = off[Math.floor(Y / 6)]; for (let X = 0; X < W; X++) setp(Y * W + X, dith(((X + s) % W + W) % W, Y) !== (Y % 3 === 0 && amt > .5)); }
      }
      if (filt === 'melt') {
        if (!melt) melt = new Float32Array(W * H);
        for (let Y = H - 1; Y >= 0; Y--) for (let X = 0; X < W; X++) { const p = Y * W + X, up = Y > 0 ? melt[p - W] : L[p]; melt[p] = L[p] * (1 - amt * .9) + Math.max(melt[p] * .96, up) * amt * .9; }
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) setp(Y * W + X, melt[Y * W + X] > (BAYER[(X & 3) + (Y & 3) * 4] + .5) / 16);
      }
      if (filt === 'ascii') {
        x.fillStyle = '#121212'; x.fillRect(0, 0, cv.width, cv.height);
        const cw = Math.round(8 + amt * 8), ch = Math.round(cw * 1.5), R = ' .:-=+*#%@', sxs = cv.width / W;
        x.font = '500 ' + ch + 'px "IBM Plex Mono",monospace'; x.fillStyle = '#ECECE6'; x.textBaseline = 'top';
        for (let Y = 0; Y < cv.height; Y += ch) for (let X = 0; X < cv.width; X += cw) { const v = L[Math.min(H - 1, Math.floor(Y / sxs)) * W + Math.min(W - 1, Math.floor(X / sxs))]; x.fillText(R[Math.min(R.length - 1, Math.floor(v * R.length))], X, Y); }
        return;
      }
      tx.putImageData(out, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(tmp, 0, 0, cv.width, cv.height);
    }
    /* about 15 fps, only while the window is showing */
    function loop(n) {
      raf = 0; if (!DS.visible('wc') || document.hidden) return;
      if (n - last >= 66) { last = n; frame(n / 1000); }
      raf = requestAnimationFrame(loop);
    }
    kick = () => { if (!raf && DS.visible('wc') && !document.hidden) raf = requestAnimationFrame(loop); };
    kick();

    $$('[data-filt]').forEach((b) => b.addEventListener('click', () => { filt = b.dataset.filt; melt = null; $$('[data-filt]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); }));
    const r = $('#amt'); r.addEventListener('input', () => { amt = r.value / 100; });

    function dropVideo() {
      if (video && video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
      if (video) { video.pause(); video.removeAttribute('src'); video.srcObject = null; }
      if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; }
      video = null; isCam = false;
    }
    setSource = (name) => { $$('[data-src]').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.src === name))); };
    $$('[data-src]').forEach((b) => b.addEventListener('click', async () => {
      const n = b.dataset.src;
      if (n === 'camera') {
        setSource('camera'); dropVideo();
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = s; isCam = true; await video.play(); msg.textContent = 'camera on. nothing leaves this device.';
        } catch (_) { dropVideo(); setSource('test'); msg.textContent = 'no camera. showing the test source.'; }
      } else if (n === 'file') {
        const f = document.createElement('input'); f.type = 'file'; f.accept = 'video/*';
        f.addEventListener('change', () => {
          if (!f.files[0]) return; dropVideo(); setSource('file'); fileUrl = URL.createObjectURL(f.files[0]);
          video = document.createElement('video'); video.muted = true; video.loop = true; video.playsInline = true; video.src = fileUrl; video.play().catch(() => {}); msg.textContent = 'video file. it stays on this device.';
        });
        f.click();
      } else { dropVideo(); setSource('test'); msg.textContent = 'test source.'; }
    }));
    $('#shot').addEventListener('click', () => { const a = document.createElement('a'); a.download = 'dithereal-webcam.png'; a.href = cv.toDataURL('image/png'); a.click(); });

    /* record: films the filtered picture (no sound) until stop or 60 s, then saves the clip. webm where supported, mp4 on safari */
    stopRec = () => { if (rec && rec.state !== 'inactive') rec.stop(); };
    rb.addEventListener('click', () => {
      if (rec) { stopRec(); return; }
      const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if (!type) { msg.textContent = 'this browser cannot record. snapshot still works.'; return; }
      const chunks = [], t0 = Date.now(); const mr = rec = new MediaRecorder(cv.captureStream(15), { mimeType: type }); mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); rb.innerHTML = '<span class="rec"></span>stop ' + mmss(s); if (s >= 60) stopRec(); }, 250);
      mr.onstop = () => {
        clearInterval(tick); const ext = type.includes('mp4') ? 'mp4' : 'webm', a = document.createElement('a'); a.download = 'dithereal-webcam.' + ext;
        const u = URL.createObjectURL(new Blob(chunks, { type })); a.href = u; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000);
        rec = null; rb.textContent = 'record'; msg.textContent = 'clip saved to your downloads.';
      };
      mr.start(); rb.innerHTML = '<span class="rec"></span>stop 0:00'; msg.textContent = 'recording. stop saves the clip.';
    });
    /* the camera stops when the window closes or is minimized */
    suspend = () => { stopRec(); if (isCam) { dropVideo(); setSource('test'); msg.textContent = 'camera off. showing the test source.'; } };
  }
  const WC = window.WC = { init, suspend: () => suspend(), kick: () => kick() };
})();
