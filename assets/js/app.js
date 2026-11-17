/* dithereal: d:\ drive. no framework. reads /tracks.json; playback is a youtube embed only. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mq = window.matchMedia('(max-width: 899.98px)');
  const mobile = () => mq.matches;

  const ERRORS = [
    { head: 'cannot open recycle.', sub: '0x3F · path is longer than the drive.' },
    { head: 'recycle is empty.', sub: '0 files. 3 files expected.' },
    { head: 'access denied.', sub: 'recycle is in use by another file.' },
    { head: 'cannot open recycle.', sub: 'someone else opened this before us.' },
    { head: 'file not found.', sub: 'recycle was never here.' },
    { head: 'restore failed.', sub: 'nothing was deleted. yet.' }
  ];
  const LABELS = { ex: 'media player', gm: 'd:\\games', gx: 'd:\\games', pt: 'paint', wc: 'webcam', rd: 'readme.txt' };
  const SHORT = { ex: 'player', gm: 'games', gx: 'game', pt: 'paint', wc: 'webcam', rd: 'readme', sy: 'err' };
  const WK = ['ex', 'gm', 'gx', 'pt', 'wc', 'rd'];      /* every window but the dialog */
  const SLOT = ['ex', 'gm', 'gx', 'pt', 'wc'];           /* windows that share the media player's grid slot */
  const FIXM = ['gx', 'pt', 'wc'];                       /* phone: these open maximized over the page, one at a time */
  const ICOOF = { gx: 'gm' };                            /* a game has no icon: focus goes back to the games icon */
  const ICON_PLAY = 'M3 1l10 6-10 6z';
  const ICON_PAUSE = 'M3 1h3v12H3zM8 1h3v12H8z';
  const MAX_D = 'M1.5 1.5h7v7h-7z';
  const RESTORE_D = 'M3.5 1.5h5v5M1.5 3.5h5v5h-5z';

  /* release dates unlock at 12:00 UTC on the date (morning in the americas, matches a studio publish time) */
  const unlockAt = (t) => (t.release ? Date.parse(t.release + (t.release.length === 10 ? 'T12:00:00Z' : '')) : Infinity);
  const isLocked = (t) => !t.youtube || Date.now() < unlockAt(t);
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const slugify = (n, fb = 'file') => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fb;

  const S = {
    tracks: [], links: {}, contact: null,
    sel: 0, playing: false, pos: 0, dur: 0, q: '', shuf: false,
    hist: [], bag: [], corrupt: new Set(),
    started: false, wins: { ex: { o: true, m: false }, gm: { o: false, m: false }, gx: { o: false, m: false }, pt: { o: false, m: false }, wc: { o: false, m: false }, rd: { o: false, m: false } },
    order: ['rd', 'ex'], max: null, mv: {}, saver: false, idle: Date.now(), swallow: 0,
    dlg: null, lastErr: -1, opener: null,
    yt: null, ytLoading: false, poll: 0, loading: false
  };

  /* ---------- data ---------- */
  function load() {
    const inline = document.getElementById('tracks-data');
    const src = inline && inline.textContent.trim()
      ? Promise.resolve(JSON.parse(inline.textContent))
      : fetch('/tracks.json', { cache: 'no-cache' }).then((r) => r.json());
    return src.then((d) => {
      const seen = {};
      /* albums newest first (by their latest release), tracks keep their listed order within an album */
      const raw = d.tracks || [], al = {}, first = {};
      raw.forEach((t, i) => { const r = unlockAt(t); if (!(t.album in first)) first[t.album] = i; al[t.album] = Math.max(al[t.album] || 0, r === Infinity ? 1e15 : r); });
      const sorted = raw.map((t, i) => [t, i]).sort((a, b) => (al[b[0].album] - al[a[0].album]) || (first[a[0].album] - first[b[0].album]) || (a[1] - b[1])).map((x) => x[0]);
      S.tracks = sorted.map((t) => {
        let s = slugify(t.name);
        if (seen[s]) { seen[s] += 1; s = s + '-' + seen[s]; } else seen[s] = 1;
        return { ...t, slug: s };
      });
      S.links = d.links || {};
      S.contact = d.contact || null;
    });
  }
  const unlocked = () => S.tracks.map((t, i) => i).filter((i) => !isLocked(S.tracks[i]));
  const matches = (i) => { const q = S.q.trim().toLowerCase(); const t = S.tracks[i]; return !q || (t.name + ' ' + (isLocked(t) ? 'locked' : t.album)).toLowerCase().includes(q); };
  const pool = () => { const u = unlocked(); const f = u.filter(matches); return f.length ? f : u; };
  function latest() {
    let best = null;
    unlocked().forEach((i) => { if (best === null || unlockAt(S.tracks[i]) >= unlockAt(S.tracks[best])) best = i; });
    return best;
  }

  /* ---------- window manager ---------- */
  const front = (k) => S.order.filter((x) => x !== k).concat(k);
  function activeKey() {
    for (let i = S.order.length - 1; i >= 0; i--) {
      const k = S.order[i]; if (k !== 'sy' && S.wins[k].o && !S.wins[k].m) return k;
    }
    return null;
  }
  const topOpen = () => { for (let i = S.order.length - 1; i >= 0; i--) { const k = S.order[i]; if (k === 'sy' ? S.dlg : S.wins[k].o) return k; } return null; };
  /* the window showing in the shared slot (phone: the active one) */
  function slotTop() {
    for (let i = S.order.length - 1; i >= 0; i--) { const k = S.order[i]; if (SLOT.includes(k) && S.wins[k].o && !S.wins[k].m) return k; }
    return null;
  }
  const isTop = (k) => (mobile() ? activeKey() === k : slotTop() === k);
  function openWin(k) {
    const w = S.wins[k];
    if (!w.o || w.m) delete S.mv[k];
    S.wins[k] = { o: true, m: false };
    S.order = front(k);
    render();
  }
  function minWin(k) {
    S.wins[k] = { ...S.wins[k], m: true };
    if (S.max === k) S.max = null;
    if (k === 'wc' && window.WC) window.WC.suspend(); /* the camera stops when the window is minimized */
    render();
    const tb = $('.tkb[data-k="' + k + '"]'); if (tb) tb.focus(); /* focus follows the window to its taskbar button */
  }
  function maxWin(k) { S.max = S.max === k ? null : k; S.order = front(k); render(); }
  function closeWin(k) {
    const had = $('#w-' + k).contains(document.activeElement);
    S.wins[k] = { o: false, m: false };
    if (S.max === k) S.max = null;
    if (k === 'ex') reset(); /* closing the window ends playback; reopening shows the same file, idle */
    if (k === 'gx' && window.DG) window.DG.unmount();
    if (k === 'wc' && window.WC) window.WC.suspend();
    render();
    if (had || document.activeElement === document.body) $('.dn .ico[data-k="' + (ICOOF[k] || k) + '"]').focus(); /* back to where it opens from */
  }
  function focusWin(k) { if (activeKey() !== k) { S.order = front(k); render(); } }
  /* keyboard focus follows the window that was just opened or raised */
  function focusInto(k) {
    const el = $('#w-' + k);
    if (el && !el.hidden) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
  }
  function taskClick(k) {
    if (k === 'sy') { focusDialog(); return; }
    const w = S.wins[k];
    if (w.m) openWin(k);
    else if (activeKey() === k) minWin(k);
    else openWin(k);
  }
  /* apps load their code the first time they open */
  const ABASE = new URL(document.body.dataset.base || '', location.href).href; /* resolved once, before pushState changes the URL */
  const jsLoaded = {};
  function loadJS(path) {
    return jsLoaded[path] || (jsLoaded[path] = new Promise((ok, no) => {
      const el = document.createElement('script');
      el.src = ABASE + 'assets/js/' + path + '?v=' + (document.body.dataset.v || '');
      el.onload = ok; el.onerror = () => { delete jsLoaded[path]; no(); };
      document.head.appendChild(el);
    }));
  }
  const GAMES = ['badsector', 'treads', 'purge', 'volley'];
  function loadGames() { return loadJS('dg.js').then(() => Promise.all(GAMES.map((g) => loadJS('games/' + g + '.js')))).then(syncGames); }
  function appOpened(k) {
    if (k === 'gm') loadGames().catch(() => {});
    if (k === 'pt') loadJS('paint.js').then(() => window.PAINT && window.PAINT.init()).catch(() => {});
    if (k === 'wc') loadJS('webcam.js').then(() => window.WC && window.WC.init()).catch(() => {});
  }
  function openGame(name) {
    loadGames().then(() => {
      const t = 'd:\\games\\' + name + '.exe';
      LABELS.gx = t; $('#gxtt').textContent = t; $('#w-gx').setAttribute('aria-label', name);
      window.DG.mount(name);
      openWin('gx'); focusInto('gx');
    }).catch(() => showDlg({ head: 'cannot open ' + name + '.exe.', sub: '0x00 · file could not be read.', src: 'system' }));
  }

  /* ---------- dialog ---------- */
  function showDlg(d) {
    if (!S.dlg) {
      S.opener = document.activeElement;
      const r = S.opener && S.opener.closest && S.opener.closest('#rows tr[data-i]');
      S.openerRow = r ? r.dataset.i : null; /* rows get rebuilt while the dialog is up */
    }
    S.dlg = d; delete S.mv.sy;
    S.order = front('sy');
    render();
    focusDialog();
  }
  const focusDialog = () => {
    const sy = $('#w-sy'); const b = $('.btn.def', sy);
    sy.scrollIntoView({ block: 'nearest' });
    if (b) b.focus({ preventScroll: true });
  };
  function dismiss() {
    S.dlg = null;
    S.order = S.order.filter((k) => k !== 'sy');
    render();
    let o = S.opener; S.opener = null;
    if ((!o || !document.contains(o)) && S.openerRow !== null) o = $('#rows tr[data-i="' + S.openerRow + '"] .rowbtn');
    if (!o || !document.contains(o) || o.offsetParent === null) o = $('#w-ex:not([hidden])') || $('.dn .ico');
    o.focus();
  }
  function recycle() {
    let i; do { i = Math.floor(Math.random() * ERRORS.length); } while (i === S.lastErr && ERRORS.length > 1);
    S.lastErr = i;
    showDlg({ ...ERRORS[i], src: 'recycle' });
  }

  /* ---------- playback (youtube iframe api, loaded on first play) ---------- */
  function ensureYT(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    (S.ytq = S.ytq || []).push(cb);
    if (S.ytLoading) return;
    S.ytLoading = true;
    window.onYouTubeIframeAPIReady = () => { const q = S.ytq; S.ytq = []; q.forEach((f) => f()); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
  function startPoll() {
    clearInterval(S.poll);
    S.poll = setInterval(() => {
      if (!S.yt || !S.yt.getCurrentTime) return;
      S.pos = S.yt.getCurrentTime() || 0;
      const d = S.yt.getDuration && S.yt.getDuration();
      if (d) S.dur = d;
      renderProgress();
    }, 1000);
  }
  /* spinner on the art from the press until the video actually plays; gives up after 10s so a blocked autoplay never spins forever */
  function setLoading(on) {
    S.loading = on; clearTimeout(S.loadT);
    if (on) S.loadT = setTimeout(() => { S.loading = false; renderPlayer(); }, 10000);
  }
  /* the video is a tiny, mostly hidden embed: ask for the lowest quality (YouTube treats this as a hint and may ignore it) */
  function lowQ(p) { try { p.setPlaybackQuality('tiny'); } catch (_) {} }
  function onState(e) {
    const YS = window.YT.PlayerState;
    if (e.data === YS.PLAYING || e.data === YS.BUFFERING) lowQ(e.target);
    if (e.data === YS.PLAYING) { S.playing = true; setLoading(false); startPoll(); }
    else if (e.data === YS.BUFFERING) { if (S.playing) setLoading(true); }
    else if (e.data === YS.PAUSED) { S.playing = false; setLoading(false); clearInterval(S.poll); }
    else if (e.data === YS.ENDED) { S.playing = false; setLoading(false); clearInterval(S.poll); step(1, false); return; }
    renderPlayer(); renderRows(); renderTasks();
  }
  function onErr() {
    S.corrupt.add(S.sel);
    S.playing = false; setLoading(false); clearInterval(S.poll);
    renderPlayer(); renderRows();
  }
  function stop() {
    S.playing = false; setLoading(false); clearInterval(S.poll);
    if (S.yt && S.yt.stopVideo) S.yt.stopVideo();
  }
  /* destroy() removes the player's div; make sure one exists for the next embed */
  function ytHost() { if (!$('#yt')) { const d = document.createElement('div'); d.id = 'yt'; $('#ythost').prepend(d); } }
  /* back to idle: stop, drop the embed; the selection stays */
  function reset() {
    stop();
    if (S.yt && S.yt.destroy) S.yt.destroy();
    S.yt = null; S.started = false; S.pos = 0;
    $('#pane').classList.remove('started');
    ytHost(); placeYT();
  }
  function setUrl() {
    const t = S.tracks[S.sel]; if (!t) return;
    const path = '/f/' + t.slug + '/';
    if (location.protocol !== 'file:' && location.pathname !== path) history.replaceState(null, '', path);
    document.title = t.name + ' · dithereal';
  }
  function play(i, fromHistory) {
    const t = S.tracks[i]; if (!t || isLocked(t)) return;
    if (!fromHistory && S.sel !== i) S.hist.push(S.sel);
    S.sel = i; S.pos = 0; S.dur = t.secs || 0;
    setUrl();
    S.started = true; $('#pane').classList.add('started');
    if (S.corrupt.has(i)) { S.playing = false; render(); return; }
    S.playing = true; setLoading(true);
    if (S.yt && S.yt.loadVideoById) {
      S.yt.loadVideoById(t.youtube);
    } else {
      ensureYT(() => {
        if (S.yt) { S.yt.loadVideoById(S.tracks[S.sel].youtube); return; }
        ytHost();
        S.yt = new window.YT.Player('yt', {
          host: 'https://www.youtube-nocookie.com',
          videoId: S.tracks[S.sel].youtube,
          /* privacy-enhanced host, nothing loads before the first press; rel 0 keeps any suggestions to the same channel,
             fs 0 and controls 0 keep visitors in this player, iv_load_policy 3 drops annotations */
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, cc_load_policy: 0, origin: location.protocol === 'file:' ? undefined : location.origin },
          events: { onReady: (e) => { lowQ(e.target); e.target.playVideo(); }, onStateChange: onState, onError: onErr }
        });
      });
    }
    render();
  }
  function toggle() {
    if (S.corrupt.has(S.sel)) return;
    if (!S.yt) { play(S.sel, true); return; }
    if (S.playing) { S.yt.pauseVideo(); S.playing = false; setLoading(false); }
    else { S.yt.playVideo(); S.playing = true; }
    render();
  }
  function seek(t) {
    S.pos = Math.max(0, Math.min(S.dur, t));
    if (S.yt && S.yt.seekTo) S.yt.seekTo(S.pos, true);
    renderProgress();
  }
  function pickShuffle(p) {
    S.bag = S.bag.filter((i) => p.includes(i) && i !== S.sel);
    if (!S.bag.length) S.bag = p.filter((i) => i !== S.sel);
    if (!S.bag.length) return S.sel;
    const j = Math.floor(Math.random() * S.bag.length);
    return S.bag.splice(j, 1)[0];
  }
  function step(dir, restart) {
    if (restart && S.pos > 3) { seek(0); return; }
    const p = pool(); if (!p.length) return;
    let to;
    if (S.shuf) {
      if (dir < 0 && S.hist.length) { to = S.hist.pop(); play(to, true); return; }
      to = pickShuffle(p);
    } else {
      const at = p.indexOf(S.sel);
      to = at < 0 ? (dir > 0 ? p[0] : p[p.length - 1]) : p[(at + dir + p.length) % p.length];
    }
    play(to);
  }

  /* ---------- rendering ---------- */
  function renderRows() {
    const tb = $('#rows');
    const fr = document.activeElement && document.activeElement.closest && document.activeElement.closest('#rows tr[data-i]');
    const keep = fr ? fr.dataset.i : null;
    const shown = S.tracks.map((t, i) => i).filter(matches);
    tb.textContent = '';
    shown.forEach((i) => {
      const t = S.tracks[i]; const lk = isLocked(t);
      const tr = document.createElement('tr');
      tr.dataset.i = i;
      tr.className = i === S.sel ? 'sel' : (lk ? 'lk' : '');
      const td1 = document.createElement('td'); td1.className = 'f';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rowbtn';
      if (i === S.sel && S.playing) {
        const mk = document.createElement('span'); mk.setAttribute('aria-hidden', 'true'); mk.textContent = '> ';
        const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = ', playing';
        b.append(mk, t.name, sr);
      } else b.textContent = t.name;
      if (i === S.sel) b.setAttribute('aria-current', 'true');
      if (lk) b.setAttribute('aria-label', t.name + ', locked');
      td1.appendChild(b);
      const td2 = document.createElement('td'); td2.className = 'm'; td2.textContent = lk ? '—' : fmt(t.secs);
      const td3 = document.createElement('td'); td3.className = 'm'; td3.textContent = lk ? 'locked' : t.album;
      tr.append(td1, td2, td3);
      tb.appendChild(tr);
    });
    if (!shown.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td');
      td.colSpan = 3; td.className = 'm none'; td.textContent = 'nothing found.';
      tr.appendChild(td); tb.appendChild(tr);
    }
    const total = S.tracks.length;
    $('#count').textContent = S.q.trim() ? shown.length + ' of ' + total + ' objects' : total + ' objects';
    $('#locks').textContent = shown.filter((i) => isLocked(S.tracks[i])).length + ' locked';
    if (keep !== null) { const b = $('#rows tr[data-i="' + keep + '"] .rowbtn'); if (b) b.focus({ preventScroll: true }); }
  }
  function renderProgress() {
    const pct = S.dur ? Math.min(100, (S.pos / S.dur) * 100) : 0;
    $('#segfill').style.width = pct + '%';
    $$('.js-fill').forEach((e) => { e.style.width = pct + '%'; });
    $('#pos').textContent = fmt(S.pos); $('#dur').textContent = fmt(S.dur);
    $$('.js-pos').forEach((e) => { e.textContent = fmt(S.pos); }); $$('.js-dur').forEach((e) => { e.textContent = fmt(S.dur); });
    if (S.saver) renderSaverText();
    const seg = $('#seg');
    seg.setAttribute('aria-valuemax', Math.floor(S.dur));
    seg.setAttribute('aria-valuenow', Math.floor(S.pos));
    seg.setAttribute('aria-valuetext', fmt(S.pos) + ' of ' + fmt(S.dur));
  }
  /* 24px glyphs for the readme rows and the tray */
  const ICONS = {
    youtube: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6z',
    bandcamp: 'M0 18.75l7.437-13.5H24l-7.438 13.5H0z',
    tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z'
  };
  const icon = (k, s) => {
    const NS = 'http://www.w3.org/2000/svg', v = document.createElementNS(NS, 'svg');
    v.setAttribute('viewBox', '0 0 24 24'); v.setAttribute('width', s); v.setAttribute('height', s); v.setAttribute('aria-hidden', 'true'); v.setAttribute('fill', 'currentColor');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[k]); v.appendChild(p);
    return v;
  };
  function linkRow(cls, label, right, href) {
    const el = document.createElement(href ? 'a' : 'span');
    el.className = cls + (href ? '' : ' na');
    if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; }
    const a = document.createElement('span'); a.textContent = label;
    if (href) { const nt = document.createElement('span'); nt.className = 'sr'; nt.textContent = ' (opens in a new tab)'; a.appendChild(nt); }
    const b = document.createElement('span'); b.className = 'mono'; b.textContent = href ? (right ? right + ' →' : '→') : '—';
    el.append(a, b);
    return el;
  }
  function renderPlayer() {
    const t = S.tracks[S.sel] || { name: '' };
    $('#now').textContent = t.name; $('#now-album').textContent = t.album || '';
    $$('.js-now').forEach((e) => { e.textContent = t.name; }); $$('.js-album').forEach((e) => { e.textContent = t.album || ''; });
    $('#vname').textContent = t.name;
    $('#vstat').textContent = S.started ? (S.corrupt.has(S.sel) ? 'video: unreadable.' : t.name) : 'video: not loaded.';
    renderArt(t); renderWave();
    const sp = $('#aspin'); if (sp) sp.hidden = !(S.loading && S.playing);
    const msg = S.started ? (S.playing ? 'playing ' + t.name : 'paused') : '';
    if (msg !== S.said) { S.said = msg; $('#live').textContent = msg; }
    $$('[data-act=toggle]').forEach((b) => { b.setAttribute('aria-label', S.playing ? 'pause' : 'play'); $('.ip', b).setAttribute('d', S.playing ? ICON_PAUSE : ICON_PLAY); });
    $$('[data-act=shuffle]').forEach((sh) => { sh.setAttribute('aria-pressed', S.shuf); sh.classList.toggle('on', S.shuf); });
    const bad = S.corrupt.has(S.sel);
    $('#corrupt').hidden = !bad;
    placeYT();
    if (bad) $('#corrupt-link').href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(t.youtube);
    const pl = $('#plinks'); pl.textContent = '';
    pl.append(
      linkRow('', 'buy / download', 'bandcamp', t.bandcamp || S.links.bandcamp || null),
      linkRow('', 'watch', 'youtube', t.youtube ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(t.youtube) : null)
    );
    renderProgress();
  }
  /* the pane art is the album's animated svg, inlined in a shadow root so its styles stay scoped; paused unless playing */
  const WPDIR = new URL(document.body.dataset.wdir, location.href).href, WPV = document.body.dataset.wv || '', svgCache = {};  /* resolved once, before pushState changes the URL */
  function paintArt(host, album) {
    const slug = slugify(album, 'dash');
    if (host.dataset.slug === slug) return;
    host.dataset.slug = slug;
    (svgCache[slug] = svgCache[slug] || fetch(WPDIR + slug + '.svg?v=' + WPV).then((r) => r.ok ? r.text() : Promise.reject())).then((txt) => {
      if (host.dataset.slug !== slug) return;
      (host.shadowRoot || host.attachShadow({ mode: 'open' })).innerHTML =
        '<style>:host{display:block}svg{display:block;width:100%;height:100%}:host(.paused) *{animation-play-state:paused!important}</style>'
        + txt.replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ');
    }).catch(() => {});
  }
  function renderArt(t) {
    if (!t.album) return;
    $('#artsvg').classList.toggle('paused', !S.playing);
    paintArt($('#artsvg'), t.album);
  }
  /* rows scroll-margin-top follows the pinned block's height */
  if (window.ResizeObserver) new ResizeObserver(([e]) => document.documentElement.style.setProperty('--pin', e.target.offsetHeight + 'px')).observe($('#pane'));
  /* jittery waveform over the art, scaled by the track's recorded loudness (peaks.json, tools/peaks.py); runs only while playing */
  const WN = 96, still = matchMedia('(prefers-reduced-motion: reduce)');
  const wavePath = (svg) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); $(svg).append(p); return p; };
  const wave = wavePath('#wave'), wave2 = wavePath('#wavebg'), wave3 = wavePath('#wavesv');
  const jit = (i, f) => { const x = Math.sin(i * 12.9898 + f * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  function drawWave(env, frame) {
    let d = '';
    for (let i = 0; i < WN; i++) d += (i ? 'L' : 'M') + (i * 120 / (WN - 1)).toFixed(1) + ' ' + (50 + jit(i, frame) * env * 45).toFixed(1);
    wave.setAttribute('d', d);
    wave2.setAttribute('d', S.playing ? d : ''); /* the desktop shows the wave only while music plays */
    wave3.setAttribute('d', S.saver && S.playing ? d : '');
  }
  /* the playing track's loudness (0..1) and position right now, from peaks.json; null when nothing plays or there is no data */
  function level() {
    const t = S.tracks[S.sel], e = t && S.env && S.env[t.name.toLowerCase()];
    if (!S.playing || !S.yt || !e) return null;
    const sec = S.yt.getCurrentTime ? S.yt.getCurrentTime() : S.pos;
    return { env: (e.charCodeAt(Math.min(e.length - 1, Math.floor(sec * 20))) || 0) / 255, sec };
  }
  const loud = () => { const l = level(); return l ? l.env : 0; }; /* the games take a small nudge from it */
  function waveLoop() {
    S.wraf = 0;
    const l = level();
    if (!l || still.matches) { drawWave(0, 0); return; }
    const fr = Math.floor(l.sec * 30), key = l.env + ':' + fr;
    if (key !== S.wkey) { S.wkey = key; drawWave(l.env, fr); }
    S.wraf = requestAnimationFrame(waveLoop);
  }
  function renderWave() {
    if (!S.env) {
      S.env = {};
      fetch('/peaks.json').then((r) => r.json()).then((o) => { for (const k in o) S.env[k] = atob(o[k]); }).catch(() => {});
    }
    if (S.playing && !S.wraf) S.wraf = requestAnimationFrame(waveLoop);
    else if (!S.playing) drawWave(0, 0);
  }
  function renderReadme() {
    const box = $('#rdlinks'); box.textContent = '';
    ['youtube', 'bandcamp', 'tiktok'].forEach((k) => {
      const row = linkRow('lnk', k, '', S.links[k] || null);
      row.firstChild.prepend(icon(k, 20));
      box.appendChild(row);
    });
    const tray = $('#tray'); tray.textContent = '';
    ['youtube', 'bandcamp', 'tiktok'].forEach((k) => {
      if (!S.links[k]) return;
      const a = document.createElement('a'); a.href = S.links[k]; a.target = '_blank'; a.rel = 'noopener'; a.title = k; a.setAttribute('aria-label', k + ' (opens in a new tab)');
      a.appendChild(icon(k, 18)); tray.appendChild(a);
    });
    /* the address is stored encoded and only assembled on click, so scrapers never see it in the page */
    const c = $('#contact'); c.hidden = !S.contact; c.textContent = '';
    if (S.contact) {
      const n = document.createElement('div'); n.textContent = 'booking, interviews, press: write in.';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lnk rdmail'; b.textContent = 'show email address';
      b.addEventListener('click', () => { const m = atob(S.contact); location.href = 'mailto:' + m; b.textContent = m.replace('@', ' at ').replace(/\./g, ' dot '); });
      c.append(n, b);
    }
  }
  function renderWindows() {
    const mob = mobile(); const act = activeKey();
    WK.forEach((k) => {
      const el = $('#w-' + k); const w = S.wins[k];
      el.hidden = !(w.o && !w.m) || (mob && FIXM.includes(k) && act !== k);
      el.classList.toggle('off', !mob && act !== k);
      el.classList.toggle('max', !mob && S.max === k);
      const m = S.mv[k];
      el.style.transform = !mob && m && S.max !== k ? 'translate(' + m.x + 'px,' + m.y + 'px)' : '';
      el.style.zIndex = mob ? '' : String(10 + S.order.indexOf(k));
      el.style.order = mob ? String(S.order.length - S.order.indexOf(k)) : '';
      const mx = $('.mx', el);
      $('.mn', el).setAttribute('aria-label', 'minimize ' + LABELS[k]); $('.x', el).setAttribute('aria-label', 'close ' + LABELS[k]);
      mx.setAttribute('aria-label', (S.max === k ? 'restore ' : 'maximize ') + LABELS[k]);
      $('path', mx).setAttribute('d', S.max === k ? RESTORE_D : MAX_D);
    });
    const sy = $('#w-sy');
    sy.hidden = !S.dlg;
    if (S.dlg) {
      const title = S.dlg.src === 'recycle' ? 'recycle err' : 'system';
      $('#dlgtitle').textContent = title;
      $('#dlghead').textContent = S.dlg.head; $('#dlgsub').textContent = S.dlg.sub;
      const yes = $('#dlgyes'); yes.hidden = !S.dlg.yes; yes.textContent = S.dlg.yes ? S.dlg.yes.label : '';
      $('.btn.def', sy).textContent = S.dlg.yes ? 'cancel' : 'dismiss';
      const m = S.mv.sy;
      sy.style.transform = !mob && m ? 'translate(' + m.x + 'px,' + m.y + 'px)' : '';
      sy.style.zIndex = mob ? '' : '60';
      sy.style.order = mob ? String(S.order.length - S.order.indexOf('sy')) : '';
    }
  }
  function renderIcons() {
    const act = activeKey();
    $$('.dn .ico').forEach((b) => {
      const k = b.dataset.k;
      if (k === 'rc') { const on = !!(S.dlg && S.dlg.src === 'recycle'); b.className = 'ico' + (on ? ' on' : ''); return; }
      const w = S.wins[k];
      const on = w.o && !w.m && act === k;
      b.className = 'ico' + (w.o ? (on ? ' on' : ' mn') : '');
      $('.st', b).textContent = !w.o ? '' : (w.m ? ', minimized' : ', open');
    });
  }
  function renderTasks() {
    const mob = mobile(); const act = activeKey();
    const box = $('#tasks');
    const ft = document.activeElement && document.activeElement.closest && document.activeElement.closest('#tasks .tkb');
    const keepK = ft ? ft.dataset.k : null;
    box.textContent = '';
    const keys = WK.filter((k) => S.wins[k].o).concat(S.dlg ? ['sy'] : []);
    const span = keys.length <= 2 ? 3 : (keys.length <= 4 ? 2 : 1);
    keys.forEach((k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tkb'; b.dataset.k = k;
      const on = k === 'sy' || (act === k && !S.wins[k].m);
      if (on) b.classList.add('on');
      b.setAttribute('aria-pressed', String(on));
      if (!mob) b.style.gridColumn = 'span ' + span;
      const long = document.createElement('span'); long.className = 'long';
      long.textContent = k === 'sy' ? (S.dlg.src === 'recycle' ? 'recycle err' : 'system') : LABELS[k];
      const short = document.createElement('span'); short.className = 'short'; short.textContent = SHORT[k];
      b.append(long, short);
      const hiddenPlayer = k === 'ex' && S.playing && S.wins.ex.m;
      if (hiddenPlayer) {
        const pm = document.createElement('span'); pm.className = 'pm'; pm.setAttribute('aria-hidden', 'true'); pm.textContent = '>'; b.prepend(pm);
        const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = ', playing'; b.append(sr);
      }
      box.appendChild(b);
    });
    if (keepK) {
      const nb = $('.tkb[data-k="' + keepK + '"]', box);
      if (nb) nb.focus({ preventScroll: true });
      else if (keepK !== 'sy') $('.dn .ico[data-k="' + keepK + '"]').focus({ preventScroll: true });
    }
  }
  function renderStatus() { const i = latest(); $('#status').textContent = i === null ? 'sealed' : S.tracks[i].album; }
  function render() { renderWindows(); renderIcons(); renderTasks(); renderRows(); renderPlayer(); syncApps(); }
  const syncGames = () => { if (window.DG) window.DG.sync(); };
  function syncApps() { syncGames(); if (window.WC) window.WC.kick(); placeYT(); }

  /* ---------- the one youtube player ----------
     The iframe never moves (moving it reloads it and stops the music). #ythost is fixed and laid over whichever video box is showing:
     the media player's band, or the game's side pane. It is parked off-screen when neither is showing or something covers the box. */
  let placeRaf = 0;
  const schedPlace = () => { if (!placeRaf) placeRaf = requestAnimationFrame(() => { placeRaf = 0; placeYT(); }); };
  function clipRect(el) {
    const r = el.getBoundingClientRect(); let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); l = Math.max(l, q.left); t = Math.max(t, q.top); rt = Math.min(rt, q.right); b = Math.min(b, q.bottom); }
    }
    return { r, c: { l, t, rt, b } };
  }
  function placeYT() {
    const h = $('#ythost'); if (!h) return;
    h.hidden = !S.started;
    if (!S.started) return;
    h.style.pointerEvents = 'none'; /* so elementFromPoint sees what is under it */
    let hit = null;
    for (let i = S.order.length - 1; i >= 0 && !hit; i--) {
      const k = S.order[i]; if ((k !== 'ex' && k !== 'gx') || !S.wins[k].o || S.wins[k].m) continue;
      const slot = $(k === 'ex' ? '#scr' : '#gscr'); if (!slot || !slot.getClientRects().length) continue;
      const q = clipRect(slot), c = q.c;
      if (c.rt - c.l < 8 || c.b - c.t < 8) continue;
      const e = document.elementFromPoint((c.l + c.rt) / 2, (c.t + c.b) / 2);
      if (e && (e === slot || slot.contains(e))) hit = q;
    }
    h.style.pointerEvents = '';
    if (!hit) { h.style.left = '-9999px'; h.style.clipPath = ''; return; }
    const { r, c } = hit;
    h.style.left = r.left + 'px'; h.style.top = r.top + 'px'; h.style.width = r.width + 'px'; h.style.height = r.height + 'px';
    h.style.clipPath = 'inset(' + (c.t - r.top) + 'px ' + (r.right - c.rt) + 'px ' + (r.bottom - c.b) + 'px ' + (c.l - r.left) + 'px)';
  }

  /* ---------- screensaver: the album art, after 60 s with no input ---------- */
  function saverAlbum() { const i = S.started ? S.sel : latest(); return i === null || !S.tracks[i] ? null : S.tracks[i].album; }
  function renderSaverText() {
    const t = S.tracks[S.sel]; if (!t) return;
    $('#svname').textContent = S.started ? t.name : '';
    $('#svsub').textContent = S.started ? t.album + ' · ' + fmt(S.pos) + ' / ' + fmt(S.dur) : '';
    $('#svclk').textContent = $('#clock').textContent;
    $('.svtxt .cap', $('#saver')).hidden = !S.started;
  }
  function showSaver() {
    const album = saverAlbum(); const host = $('#svart'); if (!host) return;
    S.saver = true; S.saverAt = Date.now();
    $('#saver').hidden = false;
    host.classList.toggle('paused', still.matches);
    if (album) paintArt(host, album);
    renderSaverText(); renderWave(); placeYT();
  }
  function hideSaver() {
    S.saver = false; S.idle = Date.now(); S.swallow = Date.now() + 450;
    $('#saver').hidden = true; drawWave(0, 0); renderWave(); placeYT();
  }
  function wireSaver() {
    const swallow = ['pointerup', 'mouseup', 'click', 'touchend', 'keyup', 'dblclick', 'contextmenu'];
    const dismiss = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'wheel', 'pointermove', 'scroll'];
    dismiss.forEach((ev) => window.addEventListener(ev, (e) => {
      if (S.saver) {
        if ((ev === 'pointermove' || ev === 'scroll') && Date.now() - S.saverAt < 700) return; /* the hand that settled the mouse */
        if (e.cancelable) e.preventDefault();
        e.stopPropagation(); hideSaver();
      } else if (Date.now() < S.swallow && ev !== 'pointermove' && ev !== 'scroll') {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      } else S.idle = Date.now();
    }, { capture: true, passive: false }));
    swallow.forEach((ev) => window.addEventListener(ev, (e) => { if (Date.now() < S.swallow || S.saver) { if (e.cancelable) e.preventDefault(); e.stopPropagation(); } }, true));
    setInterval(() => {
      if (S.saver) { renderSaverText(); return; }
      if (window.DG && window.DG.playing()) { S.idle = Date.now(); return; } /* a game being played counts as activity */
      if (!document.hidden && Date.now() - S.idle >= 60000) showSaver();
    }, 1000);
  }

  /* ---------- chrome: title bars, drag, clock ---------- */
  function svgBtn(cls, label, d) {
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('aria-label', label);
    b.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="' + d + '" fill="none" stroke-width="2"/></svg>';
    return b;
  }
  function buildBars() {
    WK.forEach((k) => {
      const bar = $('#w-' + k + ' .bar');
      const ctl = document.createElement('div'); ctl.className = 'ctl';
      const mn = svgBtn('mn', 'minimize ' + LABELS[k], 'M1 8h8'); mn.addEventListener('click', () => minWin(k));
      const mx = svgBtn('mx', 'maximize ' + LABELS[k], MAX_D); mx.addEventListener('click', () => maxWin(k));
      const x = svgBtn('x', 'close ' + LABELS[k], 'M1 1l8 8M9 1l-8 8'); x.addEventListener('click', () => closeWin(k));
      ctl.append(mn, mx, x);
      bar.append(ctl);
    });
    WK.concat('sy').forEach((k) => {
      const el = $('#w-' + k);
      drag(k, $('.bar', el), el);
      if (k !== 'sy') el.addEventListener('pointerdown', () => focusWin(k));
      if (k !== 'sy') el.addEventListener('focusin', () => focusWin(k));
    });
  }
  function drag(k, bar, el) {
    let d = null;
    bar.addEventListener('pointerdown', (e) => {
      if (e.button || mobile() || S.max === k) return;
      if (e.target.closest('button')) return;
      const cur = S.mv[k] || { x: 0, y: 0 };
      d = { sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, rect: el.getBoundingClientRect() };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', (e) => {
      if (!d) return;
      let dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      dx = Math.max(96 - d.rect.right, Math.min(window.innerWidth - 96 - d.rect.left, dx)); /* keep 96px of bar on-screen */
      dy = Math.max(-d.rect.top, Math.min(window.innerHeight - 82 - d.rect.top, dy));
      S.mv[k] = { x: d.ox + dx, y: d.oy + dy };
      el.style.transform = 'translate(' + S.mv[k].x + 'px,' + S.mv[k].y + 'px)';
      schedPlace();
    });
    const up = () => {
      if (!d) return; d = null;
      const c = S.mv[k];
      if (c && Math.abs(c.x) < 16 && Math.abs(c.y) < 16) { delete S.mv[k]; el.style.transform = ''; schedPlace(); } /* near home: snap back to the grid */
    };
    bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  }
  function tick() {
    const n = new Date(); const p = (x) => String(x).padStart(2, '0');
    const c = p(n.getHours()) + ':' + p(n.getMinutes());
    const el = $('#clock'); if (el.textContent !== c) el.textContent = c;
    if (S.saver) $('#svclk').textContent = c;
  }

  /* ---------- events ---------- */
  function wire() {
    $('#rows').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const i = Number(tr.dataset.i); const t = S.tracks[i];
      if (isLocked(t)) { showDlg({ head: 'file is locked.', sub: '0x3F · unlocks on its release date.', src: 'system' }); return; }
      play(i);
    });
    $('#q').addEventListener('input', (e) => { S.q = e.target.value; renderRows(); });
    $$('.dn .ico').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === 'rc') { recycle(); return; }
      if (!S.wins[k].o || S.wins[k].m) openWin(k); else focusWin(k);
      appOpened(k);
      focusInto(k);
    }));
    $('#tiles').addEventListener('click', (e) => { const b = e.target.closest('[data-game]'); if (b) openGame(b.dataset.game); });
    $('#clrscores').addEventListener('click', () => showDlg({ head: 'clear best scores?', sub: '0x3F · the best scores for every game on this device are removed.', src: 'system', yes: { label: 'clear', fn: () => { if (window.DG) window.DG.clearScores(); } } }));
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'toggle') toggle();
      else if (act === 'prev') step(-1, true);
      else if (act === 'next') step(1, false);
      else if (act === 'shuffle') { S.shuf = !S.shuf; S.bag = []; renderPlayer(); }
      else if (act === 'dismiss') dismiss();
      else if (act === 'yes') { const f = S.dlg && S.dlg.yes && S.dlg.yes.fn; dismiss(); if (f) f(); }
      else if (act === 'sfx') { if (window.DG) window.DG.toggleSfx(); }
    });
    $('#w-sy').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); dismiss(); } });
    const seg = $('#seg');
    seg.addEventListener('click', (e) => { const r = seg.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * S.dur); });
    seg.addEventListener('keydown', (e) => {
      const m = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
      if (m) { e.preventDefault(); seek(S.pos + m); }
      if (e.key === 'Home') { e.preventDefault(); seek(0); }
      if (e.key === 'End') { e.preventDefault(); seek(S.dur - 1); }
    });
    $('#tasks').addEventListener('click', (e) => {
      const b = e.target.closest('.tkb'); if (!b) return;
      const k = b.dataset.k; taskClick(k);
      if (k !== 'sy' && S.wins[k].o && !S.wins[k].m) { appOpened(k); focusInto(k); }
    });
    /* space plays and pauses from anywhere except text fields (the youtube iframe keeps its own keys) */
    const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    window.addEventListener('keydown', (e) => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) toggle();
    }, true);
    window.addEventListener('keyup', (e) => { if (e.key === ' ' && !typing(e.target)) e.preventDefault(); }, true);
    const orb = $('#orb');
    orb.addEventListener('click', () => { orb.classList.remove('spin'); void orb.offsetWidth; orb.classList.add('spin'); });
    mq.addEventListener('change', () => { if (mobile()) S.max = null; render(); });
    window.addEventListener('resize', schedPlace);
    document.addEventListener('scroll', schedPlace, { capture: true, passive: true });
    if (window.ResizeObserver) { const ro = new ResizeObserver(schedPlace); ['#scr', '#gscr'].forEach((q) => ro.observe($(q))); }
    document.addEventListener('visibilitychange', syncGames);
    window.addEventListener('blur', syncGames);
    window.addEventListener('focus', syncGames);
  }

  /* what the games and apps may ask of the shell; BAYER and rng are shared by the games, paint and webcam */
  window.DS = {
    BAYER: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
    rng: (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; },
    loud, base: ABASE, still: () => still.matches, mobile,
    visible: isTop,
    /* a game takes arrow keys only while its window is the focused one */
    focused: () => isTop('gx') && !S.dlg && !S.saver && !document.hidden && (mobile() || (document.hasFocus() && $('#w-gx').contains(document.activeElement))),
    confirm: (d) => showDlg({ ...d, src: 'system' }),
    store: {
      get(k, d) { try { const v = localStorage.getItem('dithereal.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
      set(k, v) { try { localStorage.setItem('dithereal.' + k, JSON.stringify(v)); } catch (_) {} },
      del(k) { try { localStorage.removeItem('dithereal.' + k); } catch (_) {} }
    }
  };

  function init() {
    document.getElementById('desk').hidden = false;
    document.getElementById('nojs').hidden = true; /* the plain listing stays up only if this script never runs */
    buildBars();
    wireSaver();
    wire();
    load().then(() => {
      const want = document.body.dataset.track;
      const hit = S.tracks.findIndex((t) => t.slug === want && !isLocked(t));
      const l = unlocked()[0];
      S.sel = hit >= 0 ? hit : (l === undefined ? 0 : l);
      const t = S.tracks[S.sel];
      S.dur = t ? t.secs || 0 : 0;
      renderStatus(); renderReadme(); render();
      const w = S.tracks.find((t) => t.slug === want);
      if (w && isLocked(w)) showDlg({ head: 'file is locked.', sub: '0x3F · unlocks on its release date.', src: 'system' });
      else if (document.body.dataset.missing) showDlg({ head: 'file not found.', sub: '0x00 · that path is not on this drive.', src: 'system' });
    }).catch(() => {
      showDlg({ head: 'drive not responding.', sub: '0x00 · index could not be read.', src: 'system' });
    });
    tick(); setInterval(tick, 1000);
    setInterval(() => { renderStatus(); renderRows(); }, 60000); /* locks lift on their date without a reload */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
