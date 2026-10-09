/* ===== OrbitOS v1.1 ===== */
(function () {
  'use strict';
  const STORE_KEY = 'orbitos-v11';
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; } }
  function saveStore(patch) { const s = Object.assign(loadStore(), patch); localStorage.setItem(STORE_KEY, JSON.stringify(s)); return s; }
  let store = loadStore();
  let windows = [], zIndexCounter = 100, activeWindowId = null;
  let wallpaperIndex = store.wallpaper != null ? store.wallpaper : 0;
  let muted = !!store.muted;
  let currentTheme = store.theme || 'cyan';
  let cmdIndex = 0;
  let cmdList = [];

  let isDragging = false, dragOffset = { x: 0, y: 0 }, dragWindow = null;
  let isResizing = false, resizeWindow = null, snapZone = null;
  let altTabOpen = false, altTabIndex = 0;
  let calMonth = new Date();
  let musicStopFn = null;
  let audioCtx = null;
  let idleTimer = null;
  let ssAnim = null;
  const IDLE_MS = 90000;


  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      const ctx = ensureAudio();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq; g.gain.value = vol || 0.04;
      o.connect(g); g.connect(ctx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.08));
      o.stop(ctx.currentTime + (dur || 0.08) + 0.02);
    } catch (e) {}
  }
  function sfx(n) {
    if (n === 'click') beep(800, 0.04, 'sine', 0.03);
    else if (n === 'open') beep(440, 0.06, 'triangle', 0.04);
    else if (n === 'close') beep(220, 0.08, 'sine', 0.035);
    else if (n === 'error') beep(120, 0.12, 'sawtooth', 0.03);
    else if (n === 'success') { beep(523, 0.06); setTimeout(function () { beep(784, 0.08); }, 70); }
  }
  const notifHistory = [];
  function showToast(msg, duration) {
    const toast = document.getElementById('toast');
    toast.textContent = msg; toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.add('hidden'); }, duration || 2800);
    notifHistory.unshift({ msg: msg, at: new Date() });
    if (notifHistory.length > 30) notifHistory.pop();
    renderNotifs();
  }
  function renderNotifs() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!notifHistory.length) { list.innerHTML = '<div class="notif-empty">No notifications</div>'; return; }
    list.innerHTML = notifHistory.map(function (n) {
      return '<div class="notif-item">' + n.msg + '<time>' + n.at.toLocaleTimeString() + '</time></div>';
    }).join('');
  }
  function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent =
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '  ' +
      now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function applyWallpaper() {
    var wp = document.getElementById('wallpaper');
    if (store.customWallpaper) {
      wp.className = '';
      wp.style.background = "linear-gradient(160deg, rgba(10,10,26,0.45), rgba(10,20,40,0.55)), url('" + store.customWallpaper.replace(/'/g, '') + "') center/cover";
    } else {
      wp.style.background = '';
      wp.className = 'wp-' + wallpaperIndex;
    }
    saveStore({ wallpaper: wallpaperIndex });
  }
  function applyTheme(name) {
    currentTheme = name || 'cyan';
    document.documentElement.setAttribute('data-theme', currentTheme);
    saveStore({ theme: currentTheme });
  }
  function updateDesktopClock() {
    var now = new Date();
    var t = document.getElementById('dc-time');
    var d = document.getElementById('dc-date');
    if (t) t.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d) d.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    var lt = document.getElementById('lock-time');
    var ld = document.getElementById('lock-date');
    if (lt && !document.getElementById('lock-screen').classList.contains('hidden')) {
      lt.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (ld) ld.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
  }
  function logActivity(msg) {
    /* feeds notification history via showToast only when useful */
  }
  function saveSession() {
    var open = windows.filter(function (w) { return !w.closed; }).map(function (w) {
      return { appId: w.appId, left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height, minimized: w.minimized, maximized: w.maximized };
    });
    saveStore({ session: open });
  }
  function restoreSession() {
    var sess = store.session;
    if (!sess || !sess.length) return;
    sess.forEach(function (s, i) {
      setTimeout(function () {
        if (!apps[s.appId]) return;
        var win = openApp(s.appId);
        if (!win) return;
        if (s.width) win.el.style.width = s.width;
        if (s.height) win.el.style.height = s.height;
        if (s.left) win.el.style.left = s.left;
        if (s.top) win.el.style.top = s.top;
        if (s.maximized) { win.maximized = true; win.el.classList.add('maximized'); }
        if (s.minimized) { win.minimized = true; win.el.classList.add('minimized'); }
        updateTaskbar();
      }, 200 + i * 120);
    });
  }

  function updateVolumeUI() {
    const el = document.getElementById('volume-icon');
    el.textContent = muted ? '🔇' : '🔊';
    el.classList.toggle('muted', muted);
  }
  function toggleMute() {
    muted = !muted; saveStore({ muted: muted }); updateVolumeUI();
    if (muted && musicStopFn) musicStopFn();
    showToast(muted ? 'Muted' : 'Unmuted');
    if (!muted) sfx('click');
  }

  function boot() {
    const bar = document.getElementById('boot-bar');
    const status = document.getElementById('boot-status');
    const checks = document.querySelectorAll('#boot-checklist li');
    const messages = ['Loading core modules...','Initializing window manager...','Starting audio subsystem...','Loading game engines...','Preparing desktop shell...','Welcome to OrbitOS'];
    let progress = 0, msgIndex = 0, step = 0;
    const interval = setInterval(function () {
      progress = Math.min(100, progress + Math.random() * 16 + 10);
      bar.style.width = progress + '%';
      const newStep = Math.min(4, Math.floor(progress / 20));
      if (newStep > step) {
        if (checks[step]) { checks[step].classList.remove('active'); checks[step].classList.add('done'); }
        step = newStep;
        if (checks[step]) checks[step].classList.add('active');
      }
      if (msgIndex < messages.length - 1 && progress > (msgIndex + 1) * 15) { msgIndex++; status.textContent = messages[msgIndex]; }
      if (progress >= 100) {
        clearInterval(interval);
        checks.forEach(function (c) { c.classList.add('done'); c.classList.remove('active'); });
        status.textContent = messages[messages.length - 1];
        setTimeout(function () {
          document.getElementById('boot-screen').classList.add('fade-out');
          document.getElementById('desktop').classList.remove('hidden');
          setTimeout(function () { document.getElementById('boot-screen').classList.add('hidden'); }, 600);
          updateClock(); setInterval(updateClock, 1000);
          updateDesktopClock(); setInterval(updateDesktopClock, 1000);
          applyTheme(currentTheme); applyWallpaper(); updateVolumeUI();
          showToast('Welcome to OrbitOS');
          if (!store.tipsSeen) setTimeout(function () { document.getElementById('tips-overlay').classList.remove('hidden'); }, 500);
          setTimeout(restoreSession, 800);
          setInterval(saveSession, 5000);
          if (store.reduceMotion) document.body.classList.add('reduce-motion');
          setTimeout(restoreFloatStickies, 400);
          /* icon drag disabled */
        }, 350);
      }
    }, 160);
  }

  function createWindow(appId, title, icon, contentHTML, width, height) {
    const existing = windows.find(function (w) { return w.appId === appId && !w.closed; });
    if (existing) {
      focusWindow(existing.id);
      if (existing.minimized) { existing.minimized = false; existing.el.classList.remove('minimized'); updateTaskbar(); }
      return existing;
    }
    sfx('open');
    const id = 'win-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const el = document.createElement('div');
    el.className = 'window focused'; el.id = id;
    const w = width || 640, h = height || 480;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    el.style.left = Math.max(20, (window.innerWidth - w) / 2 + (windows.length % 5) * 28) + 'px';
    el.style.top = Math.max(16, 48 + (windows.length % 5) * 28) + 'px';
    el.style.zIndex = ++zIndexCounter;
    el.innerHTML = '<div class="window-titlebar"><span class="window-icon">' + icon + '</span><span class="window-title">' + title +
      '</span><div class="window-controls"><button class="win-btn minimize" data-action="minimize" title="Minimize">─</button>' +
      '<button class="win-btn maximize" data-action="maximize" title="Maximize">☐</button>' +
      '<button class="win-btn close" data-action="close" title="Close">✕</button></div></div>' +
      '<div class="window-content">' + contentHTML + '</div><div class="window-resize"></div>';
    document.getElementById('windows-container').appendChild(el);
    windows.forEach(function (w2) { w2.el.classList.remove('focused'); });
    const win = { id: id, appId: appId, title: title, icon: icon, el: el, minimized: false, maximized: false, prevRect: null, closed: false };
    windows.push(win); activeWindowId = id; updateTaskbar(); bindWindowEvents(win); return win;
  }
  function bindWindowEvents(win) {
    const titlebar = win.el.querySelector('.window-titlebar');
    const resizeHandle = win.el.querySelector('.window-resize');
    win.el.querySelectorAll('.win-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const a = btn.dataset.action;
        if (a === 'close') closeWindow(win.id);
        else if (a === 'minimize') minimizeWindow(win.id);
        else if (a === 'maximize') toggleMaximize(win.id);
      });
    });
    win.el.addEventListener('mousedown', function () { focusWindow(win.id); });
    titlebar.addEventListener('mousedown', function (e) {
      if (e.target.closest('.win-btn') || win.maximized) return;
      isDragging = true; dragWindow = win;
      const rect = win.el.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left; dragOffset.y = e.clientY - rect.top;
      focusWindow(win.id);
    });
    resizeHandle.addEventListener('mousedown', function (e) {
      e.stopPropagation(); if (win.maximized) return; isResizing = true; resizeWindow = win; focusWindow(win.id);
    });
  }
  function focusWindow(id) {
    const win = windows.find(function (w) { return w.id === id; });
    if (!win || win.closed) return;
    windows.forEach(function (w) { w.el.classList.remove('focused'); });
    win.el.classList.add('focused'); win.el.style.zIndex = ++zIndexCounter; activeWindowId = id; updateTaskbar();
  }
  function closeWindow(id) {
    const win = windows.find(function (w) { return w.id === id; }); if (!win) return;
    sfx('close'); win.closed = true; win.el.remove();
    windows = windows.filter(function (w) { return w.id !== id; });
    if (activeWindowId === id) activeWindowId = null; updateTaskbar();
    saveSession();
  }
  function minimizeWindow(id) {
    const win = windows.find(function (w) { return w.id === id; }); if (!win) return;
    sfx('click'); win.minimized = true; win.el.classList.add('minimized'); win.el.classList.remove('focused');
    if (activeWindowId === id) activeWindowId = null; updateTaskbar();
  }
  function toggleMaximize(id) {
    const win = windows.find(function (w) { return w.id === id; }); if (!win) return;
    sfx('click');
    if (win.maximized) {
      win.maximized = false; win.el.classList.remove('maximized');
      if (win.prevRect) { win.el.style.left = win.prevRect.left; win.el.style.top = win.prevRect.top; win.el.style.width = win.prevRect.width; win.el.style.height = win.prevRect.height; }
    } else {
      win.prevRect = { left: win.el.style.left, top: win.el.style.top, width: win.el.style.width, height: win.el.style.height };
      win.maximized = true; win.el.classList.add('maximized');
    }
  }
  function snapWindow(win, zone) {
    win.prevRect = { left: win.el.style.left, top: win.el.style.top, width: win.el.style.width, height: win.el.style.height };
    win.maximized = false; win.el.classList.remove('maximized');
    if (zone === 'left') { win.el.style.left = '0'; win.el.style.top = '0'; win.el.style.width = '50%'; win.el.style.height = 'calc(100% - 48px)'; }
    else if (zone === 'right') { win.el.style.left = '50%'; win.el.style.top = '0'; win.el.style.width = '50%'; win.el.style.height = 'calc(100% - 48px)'; }
    else if (zone === 'top') { win.maximized = true; win.el.classList.add('maximized'); }
    sfx('success');
  }
  function updateTaskbar() {
    const container = document.getElementById('taskbar-apps'); container.innerHTML = '';
    windows.filter(function (w) { return !w.closed; }).forEach(function (win) {
      const btn = document.createElement('button');
      btn.className = 'taskbar-item' + (win.id === activeWindowId && !win.minimized ? ' active' : '');
      btn.innerHTML = '<span class="icon">' + win.icon + '</span><span class="label-text"> ' + win.title + '</span>';
      btn.addEventListener('click', function () {
        if (win.minimized) { win.minimized = false; win.el.classList.remove('minimized'); }
        focusWindow(win.id); sfx('click');
      });
      container.appendChild(btn);
    });
  }

  setTimeout(function () {
    const desk = document.getElementById('desktop');
    if (desk && !document.getElementById('snap-preview')) {
      const sp = document.createElement('div'); sp.id = 'snap-preview'; desk.appendChild(sp);
    }
  }, 0);

  document.addEventListener('mousemove', function (e) {
    if (isDragging && dragWindow) {
      const x = e.clientX - dragOffset.x, y = Math.max(0, e.clientY - dragOffset.y);
      dragWindow.el.style.left = Math.max(-dragWindow.el.offsetWidth + 100, Math.min(x, window.innerWidth - 100)) + 'px';
      dragWindow.el.style.top = Math.min(y, window.innerHeight - 80) + 'px';
      const edge = 24; let zone = null;
      if (e.clientX < edge) zone = 'left';
      else if (e.clientX > window.innerWidth - edge) zone = 'right';
      else if (e.clientY < edge) zone = 'top';
      snapZone = zone;
      const sp = document.getElementById('snap-preview');
      if (sp) {
        if (zone === 'left') { sp.style.display = 'block'; sp.style.left = '0'; sp.style.top = '0'; sp.style.width = '50%'; sp.style.height = 'calc(100% - 48px)'; }
        else if (zone === 'right') { sp.style.display = 'block'; sp.style.left = '50%'; sp.style.top = '0'; sp.style.width = '50%'; sp.style.height = 'calc(100% - 48px)'; }
        else if (zone === 'top') { sp.style.display = 'block'; sp.style.left = '0'; sp.style.top = '0'; sp.style.width = '100%'; sp.style.height = 'calc(100% - 48px)'; }
        else sp.style.display = 'none';
      }
    }
    if (isResizing && resizeWindow) {
      const rect = resizeWindow.el.getBoundingClientRect();
      resizeWindow.el.style.width = Math.max(280, e.clientX - rect.left) + 'px';
      resizeWindow.el.style.height = Math.max(180, e.clientY - rect.top) + 'px';
    }
  });
  document.addEventListener('mouseup', function () {
    if (isDragging && dragWindow && snapZone) snapWindow(dragWindow, snapZone);
    const sp = document.getElementById('snap-preview'); if (sp) sp.style.display = 'none';
    isDragging = false; dragWindow = null; snapZone = null; isResizing = false; resizeWindow = null;
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.getElementById('start-menu').classList.add('hidden');
      document.getElementById('start-btn').classList.remove('active');
      document.getElementById('context-menu').classList.add('hidden');
      document.getElementById('calendar-popup').classList.add('hidden');
      document.getElementById('alt-tab').classList.add('hidden');
      closeCommandPalette();
      closeRunDialog();
      altTabOpen = false; return;
    }
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W') && activeWindowId && !e.target.matches('input, textarea')) {
      e.preventDefault(); closeWindow(activeWindowId);
    }
    if (e.ctrlKey && (e.key === 'm' || e.key === 'M') && activeWindowId && !e.target.matches('input, textarea')) {
      e.preventDefault(); minimizeWindow(activeWindowId);
    }
    if (e.ctrlKey && (e.key === 'r' || e.key === 'R') && !e.target.matches('input, textarea')) {
      e.preventDefault(); openRunDialog();
    }
    if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); openCommandPalette();
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L') && !e.target.matches('input, textarea')) {
      e.preventDefault(); lockScreen();
    }
    if (e.key === 'F11') {
      /* browser handles; also our button */
    }
    if (e.altKey && e.key === 'Tab') {
      e.preventDefault();
      const open = windows.filter(function (w) { return !w.closed; });
      if (!open.length) return;
      if (!altTabOpen) { altTabOpen = true; altTabIndex = 0; showAltTab(open); }
      else { altTabIndex = (altTabIndex + 1) % open.length; showAltTab(open); }
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Alt' && altTabOpen) {
      const open = windows.filter(function (w) { return !w.closed; });
      if (open[altTabIndex]) {
        const win = open[altTabIndex];
        if (win.minimized) { win.minimized = false; win.el.classList.remove('minimized'); }
        focusWindow(win.id);
      }
      document.getElementById('alt-tab').classList.add('hidden'); altTabOpen = false;
    }
  });
  function showAltTab(open) {
    const list = document.getElementById('alt-tab-list'); list.innerHTML = '';
    open.forEach(function (w, i) {
      const d = document.createElement('div');
      d.className = 'alt-tab-item' + (i === altTabIndex ? ' active' : '');
      d.innerHTML = '<span class="ico">' + w.icon + '</span><span class="lbl">' + w.title + '</span>';
      list.appendChild(d);
    });
    document.getElementById('alt-tab').classList.remove('hidden');
  }
  function renderCalendar() {
    const title = document.getElementById('cal-title');
    const grid = document.getElementById('cal-grid');
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    title.textContent = calMonth.toLocaleString([], { month: 'long', year: 'numeric' });
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const today = new Date();
    grid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const cell = document.createElement('div'); cell.className = 'cal-day';
      let dayNum, other = false;
      if (i < first) { dayNum = prevDays - first + i + 1; other = true; }
      else if (i - first + 1 > days) { dayNum = i - first + 1 - days; other = true; }
      else dayNum = i - first + 1;
      if (other) cell.classList.add('other');
      if (!other && dayNum === today.getDate() && m === today.getMonth() && y === today.getFullYear()) cell.classList.add('today');
      cell.textContent = dayNum; grid.appendChild(cell);
    }
  }
  function shutdown() {
    document.getElementById('desktop').classList.add('hidden');
    document.getElementById('shutdown-screen').classList.remove('hidden');
    if (musicStopFn) musicStopFn();
  }

  const fileContents = {
    'README.md': '# OrbitOS\n\nA full desktop OS in the browser for GitHub Pages.\n\n## Features\n\n- Window manager with snap\n- Browser, music, games, terminal\n- File explorer with README viewer\n- Keyboard shortcuts, calendar, mute\n- Paint tools, mobile layout\n\n## Deploy\n\nUpload index.html, styles.css, script.js → GitHub Pages\n\n## Controls\n\nCtrl+W close · Ctrl+M minimize · Alt+Tab switch · Esc dismiss\nDrag to edges to snap · Clock for calendar · Speaker to mute\n\n## License\n\nMIT',
    'notes.txt': 'OrbitOS notes\n\n- Double-click README.md in Files\n- Terminal: help, neofetch, cat README.md\n- Settings persist in localStorage\n',
    'todo.md': '# Todo\n\n- [x] Snap + shortcuts\n- [x] Calendar + mute\n- [x] Paint tools\n- [x] Mobile layout\n',
    'settings.json': '{\n  "version": "1.1.0",\n  "platform": "GitHub Pages"\n}\n',
    'boot.log': '[boot] OrbitOS 1.1.0\n[boot] Desktop ready\n',
    'kernel.js': 'export const version = "1.1.0";\n'
  };

  const apps = {
    browser: {
      title: 'Proxy Browser', icon: '🌐', width: 820, height: 560,
      content: function () {
        return '<div style="display:flex;flex-direction:column;height:100%"><div class="browser-toolbar">' +
          '<button type="button" id="br-reload">↻</button>' +
          '<input class="browser-url" id="br-url" type="text" value="https://example.com">' +
          '<button type="button" id="br-go">Go</button>' +
          '<button type="button" id="br-newtab" title="Open in new tab">↗</button></div>' +
          '<div class="browser-bookmarks" id="br-bookmarks"></div>' +
          '<div class="browser-frame-wrap"><div class="browser-notice" id="br-notice">' +
          '<h3>🌐 Orbit Proxy Browser</h3><p>Many sites block embedding. Use bookmarks or Open in new tab (↗).</p></div>' +
          '<iframe id="br-iframe" style="display:none" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div></div>';
      },
      init: function (win) {
        const bookmarks = [
          { name: 'Example', url: 'https://example.com' },
          { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
          { name: 'Archive.org', url: 'https://archive.org' },
          { name: 'HN', url: 'https://news.ycombinator.com' },
          { name: 'MDN', url: 'https://developer.mozilla.org' }
        ];
        const bm = win.el.querySelector('#br-bookmarks');
        const urlInput = win.el.querySelector('#br-url');
        const iframe = win.el.querySelector('#br-iframe');
        const notice = win.el.querySelector('#br-notice');
        bookmarks.forEach(function (b) {
          const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = b.name;
          btn.addEventListener('click', function () { urlInput.value = b.url; go(); });
          bm.appendChild(btn);
        });
        function go() {
          var url = urlInput.value.trim(); if (!url) return;
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          urlInput.value = url; notice.style.display = 'none'; iframe.style.display = 'block'; iframe.src = url;
          sfx('click'); showToast('Loading (some sites block embedding)');
        }
        win.el.querySelector('#br-go').addEventListener('click', go);
        urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        win.el.querySelector('#br-reload').addEventListener('click', function () { if (iframe.src) iframe.src = iframe.src; });
        win.el.querySelector('#br-newtab').addEventListener('click', function () {
          var url = urlInput.value.trim(); if (!url) return;
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          window.open(url, '_blank', 'noopener'); sfx('click');
        });
      }
    },
    music: {
      title: 'Music Player', icon: '🎵', width: 420, height: 560,
      content: function () {
        return '<div class="music-player"><div class="music-art" id="music-art">🎵</div>' +
          '<div class="music-info"><h3 id="music-title">Select a track</h3><p id="music-artist">OrbitOS Radio</p></div>' +
          '<div class="music-progress-wrap"><span id="music-cur">0:00</span><div class="music-progress"><div class="music-progress-bar" id="music-bar"></div></div><span id="music-dur">0:00</span></div>' +
          '<div class="music-controls"><button type="button" id="music-prev">⏮</button><button type="button" class="play-btn" id="music-play">▶</button><button type="button" id="music-next">⏭</button></div>' +
          '<div class="music-playlist" id="music-playlist"></div></div>';
      },
      init: function (win) {
        const tracks = [
          { title: 'Ambient Horizon', artist: 'OrbitOS Ambient', emoji: '🌌' },
          { title: 'Digital Pulse', artist: 'Synth Wave', emoji: '💫' },
          { title: 'Cosmic Drift', artist: 'Space Lounge', emoji: '🪐' },
          { title: 'Neon Nights', artist: 'Retrowave', emoji: '🌆' },
          { title: 'Quantum Beat', artist: 'Electronica', emoji: '⚛️' },
          { title: 'Starlight', artist: 'Chillhop', emoji: '✨' }
        ];
        let currentOsc = null, currentGain = null, isPlaying = false, currentIndex = -1, animFrame = null, startTime = 0, trackDuration = 90;
        const playlistEl = win.el.querySelector('#music-playlist');
        tracks.forEach(function (t, i) {
          const item = document.createElement('div'); item.className = 'playlist-item';
          item.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="track-name">' + t.emoji + ' ' + t.title + '</span><span class="track-dur">1:30</span>';
          item.addEventListener('click', function () { playTrack(i); });
          playlistEl.appendChild(item);
        });
        function fmt(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
        function stopAudio() {
          if (currentOsc) { try { currentOsc.stop(); } catch (e) {} currentOsc = null; }
          if (currentGain) { try { currentGain.disconnect(); } catch (e) {} currentGain = null; }
          if (animFrame) cancelAnimationFrame(animFrame);
          isPlaying = false; win.el.querySelector('#music-play').textContent = '▶';
        }
        musicStopFn = stopAudio;
        function playTrack(index) {
          if (muted) { showToast('Unmute to play music'); return; }
          stopAudio();
          const ctx = ensureAudio();
          const freqs = [220, 277, 330, 370, 440, 554];
          trackDuration = 90 + index * 10;
          currentGain = ctx.createGain(); currentGain.gain.value = 0.07; currentGain.connect(ctx.destination);
          currentOsc = ctx.createOscillator();
          currentOsc.type = index % 2 === 0 ? 'sine' : 'triangle';
          currentOsc.frequency.value = freqs[index % freqs.length];
          currentOsc.connect(currentGain); currentOsc.start();
          const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
          lfo.frequency.value = 0.15 + index * 0.04; lfoG.gain.value = 28;
          lfo.connect(lfoG); lfoG.connect(currentOsc.frequency); lfo.start();
          startTime = ctx.currentTime; isPlaying = true; currentIndex = index;
          win.el.querySelector('#music-play').textContent = '⏸';
          win.el.querySelector('#music-title').textContent = tracks[index].title;
          win.el.querySelector('#music-artist').textContent = tracks[index].artist;
          win.el.querySelector('#music-art').textContent = tracks[index].emoji;
          win.el.querySelector('#music-dur').textContent = fmt(trackDuration);
          playlistEl.querySelectorAll('.playlist-item').forEach(function (el, i) { el.classList.toggle('active', i === index); });
          function tick() {
            if (!isPlaying) return;
            const elapsed = ctx.currentTime - startTime;
            if (elapsed >= trackDuration) { playTrack((index + 1) % tracks.length); return; }
            win.el.querySelector('#music-bar').style.width = (elapsed / trackDuration * 100) + '%';
            win.el.querySelector('#music-cur').textContent = fmt(elapsed);
            animFrame = requestAnimationFrame(tick);
          }
          tick();
        }
        win.el.querySelector('#music-play').addEventListener('click', function () {
          if (currentIndex < 0) playTrack(0); else if (isPlaying) stopAudio(); else playTrack(currentIndex);
        });
        win.el.querySelector('#music-prev').addEventListener('click', function () {
          if (currentIndex < 0) return; playTrack((currentIndex - 1 + tracks.length) % tracks.length);
        });
        win.el.querySelector('#music-next').addEventListener('click', function () {
          playTrack(currentIndex < 0 ? 0 : (currentIndex + 1) % tracks.length);
        });
      }
    },
    games: {
      title: 'Games Arcade', icon: '🎮', width: 500, height: 400,
      content: function () {
        return '<div class="games-grid">' +
          '<div class="game-card" data-game="snake"><div class="game-emoji">🐍</div><h4>Snake</h4><p>Classic + D-pad</p></div>' +
          '<div class="game-card" data-game="ttt"><div class="game-emoji">❌</div><h4>Tic-Tac-Toe</h4><p>Local play</p></div>' +
          '<div class="game-card" data-game="2048"><div class="game-emoji">🔢</div><h4>2048</h4><p>Swipe or arrows</p></div>' +
          '<div class="game-card" data-game="memory"><div class="game-emoji">🧠</div><h4>Memory</h4><p>Match pairs</p></div>' +
          '<div class="game-card" data-game="mines"><div class="game-emoji">💣</div><h4>Minesweeper</h4><p>Clear the field</p></div>' +
          '<div class="game-card" data-game="pong"><div class="game-emoji">🏓</div><h4>Pong</h4><p>Vs CPU</p></div>' +
          '<div class="game-card" data-game="c4"><div class="game-emoji">🔴</div><h4>Connect Four</h4><p>2 players</p></div>' +
          '<div class="game-card" data-game="solitaire"><div class="game-emoji">🃏</div><h4>Solitaire</h4><p>Klondike</p></div></div>';
      },
      init: function (win) {
        win.el.querySelectorAll('.game-card').forEach(function (card) {
          card.addEventListener('click', function () {
            var g = card.dataset.game;
            if (g === 'snake') openSnake(); else if (g === 'ttt') openTTT();
            else if (g === '2048') open2048(); else if (g === 'memory') openMemory();
            else if (g === 'mines') openMines(); else if (g === 'pong') openPong();
            else if (g === 'c4') openConnectFour();
            else if (g === 'solitaire') openSolitaire();
          });
        });
      }
    },

    terminal: {
      title: 'Terminal', icon: '💻', width: 640, height: 420,
      content: function () {
        return '<div class="terminal-body" id="term-body"><div class="terminal-output" id="term-output">OrbitOS Terminal v1.1\nType "help" for commands.\n\n</div>' +
          '<div class="terminal-input-line"><span class="terminal-prompt" id="term-prompt">orbit@github:~$</span>' +
          '<input class="terminal-input" id="term-input" type="text" autofocus autocomplete="off" spellcheck="false"></div></div>';
      },
      init: function (win) {
        const output = win.el.querySelector('#term-output');
        const input = win.el.querySelector('#term-input');
        const body = win.el.querySelector('#term-body');
        const promptEl = win.el.querySelector('#term-prompt');
        let cwd = '~';
        const history = []; let histIndex = -1;
        const commands = {
          help: function () { return 'help clear date echo whoami neofetch ls cat pwd cd uname fortune history matrix games about mute unmute'; },
          clear: function () { output.textContent = ''; return null; },
          date: function () { return new Date().toString(); },
          echo: function (a) { return a.join(' '); },
          whoami: function () { return 'orbit-user'; },
          uname: function () { return 'OrbitOS 1.1.0 GitHub-Pages'; },
          pwd: function () { return cwd === '~' ? '/home/orbit' : cwd; },
          cd: function (a) {
            if (!a[0] || a[0] === '~' || a[0] === '/' || a[0] === '..') cwd = '~';
            else cwd = '~/' + a[0].replace(/^\//, '');
            promptEl.textContent = 'orbit@github:' + cwd + '$'; return null;
          },
          ls: function () { return 'Desktop/ Documents/ Games/ Music/ README.md secret.txt'; },
          cat: function (a) {
            if (a[0] === 'README.md') return 'OrbitOS — desktop in the browser. Open Files for full README.';
            if (a[0] === 'secret.txt') return 'The cake is a lie.';
            return 'cat: ' + (a[0] || '') + ': No such file';
          },
          neofetch: function () { return 'orbit@github\nOS: OrbitOS 1.1\nUptime: ' + Math.floor(performance.now() / 1000) + 's\nTheme: Cyan Nebula'; },
          fortune: function () { var f = ['127.0.0.1 is home', 'It works on my machine', 'Stay curious']; return f[Math.floor(Math.random() * f.length)]; },
          history: function () { return history.map(function (h, i) { return '  ' + (i + 1) + '  ' + h; }).join('\n') || '(empty)'; },
          matrix: function () { showToast('Wake up, Neo...'); return 'Follow the white rabbit.'; },
          games: function () { openApp('games'); return 'Opening Games...'; },
          about: function () { openApp('about'); return 'Opening About...'; },
          mute: function () { if (!muted) toggleMute(); return 'Muted.'; },
          unmute: function () { if (muted) toggleMute(); return 'Unmuted.'; }
        };
        function run(line) {
          const parts = line.trim().split(/\s+/);
          const cmd = (parts[0] || '').toLowerCase(); const args = parts.slice(1);
          if (!cmd) return;
          history.push(line); histIndex = history.length;
          var result = commands[cmd] ? commands[cmd](args) : (sfx('error'), 'Command not found: ' + cmd);
          output.textContent += 'orbit@github:' + cwd + '$ ' + line + '\n';
          if (result !== null && result !== undefined) output.textContent += result + '\n\n';
          body.scrollTop = body.scrollHeight;
        }
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { run(input.value); input.value = ''; }
          else if (e.key === 'ArrowUp') { e.preventDefault(); if (histIndex > 0) { histIndex--; input.value = history[histIndex] || ''; } }
          else if (e.key === 'ArrowDown') { e.preventDefault(); if (histIndex < history.length - 1) { histIndex++; input.value = history[histIndex] || ''; } else { histIndex = history.length; input.value = ''; } }
        });
        body.addEventListener('click', function () { input.focus(); });
      }
    },
    notepad: {
      title: 'Notepad', icon: '📝', width: 560, height: 420,
      content: function () {
        return '<div class="notepad-toolbar"><button type="button" id="np-new">New</button><button type="button" id="np-save">Save</button>' +
          '<button type="button" id="np-load">Load</button><span style="flex:1"></span><span id="np-status" style="font-size:0.75rem;color:var(--text-dim)"></span></div>' +
          '<textarea class="notepad-area" id="np-area" placeholder="Start typing..."></textarea>';
      },
      init: function (win) {
        const area = win.el.querySelector('#np-area'); const status = win.el.querySelector('#np-status');
        if (store.notepad) area.value = store.notepad;
        win.el.querySelector('#np-new').addEventListener('click', function () {
          if (area.value && !confirm('Clear current note?')) return; area.value = ''; status.textContent = 'New document';
        });
        win.el.querySelector('#np-save').addEventListener('click', function () {
          saveStore({ notepad: area.value }); store = loadStore(); status.textContent = 'Saved'; sfx('success'); showToast('Note saved');
        });
        win.el.querySelector('#np-load').addEventListener('click', function () {
          store = loadStore();
          if (store.notepad) { area.value = store.notepad; status.textContent = 'Loaded'; } else status.textContent = 'No saved note';
        });
      }
    },
    calculator: {
      title: 'Calculator', icon: '🧮', width: 320, height: 460,
      content: function () {
        return '<div class="calc-body"><div class="calc-display" id="calc-display">0</div><div class="calc-buttons">' +
          '<button class="calc-btn clear" data-val="C">C</button><button class="calc-btn op" data-val="±">±</button><button class="calc-btn op" data-val="%">%</button><button class="calc-btn op" data-val="/">÷</button>' +
          '<button class="calc-btn" data-val="7">7</button><button class="calc-btn" data-val="8">8</button><button class="calc-btn" data-val="9">9</button><button class="calc-btn op" data-val="*">×</button>' +
          '<button class="calc-btn" data-val="4">4</button><button class="calc-btn" data-val="5">5</button><button class="calc-btn" data-val="6">6</button><button class="calc-btn op" data-val="-">−</button>' +
          '<button class="calc-btn" data-val="1">1</button><button class="calc-btn" data-val="2">2</button><button class="calc-btn" data-val="3">3</button><button class="calc-btn op" data-val="+">+</button>' +
          '<button class="calc-btn" data-val="0">0</button><button class="calc-btn" data-val=".">.</button><button class="calc-btn eq" data-val="=">=</button></div></div>';
      },
      init: function (win) {
        const display = win.el.querySelector('#calc-display');
        let current = '0', previous = null, operator = null, resetNext = false;
        function compute(a, b, op) {
          a = parseFloat(a); b = parseFloat(b);
          if (op === '+') return a + b; if (op === '-') return a - b; if (op === '*') return a * b;
          if (op === '/') return b !== 0 ? a / b : 'Error'; return b;
        }
        win.el.querySelectorAll('.calc-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const val = btn.dataset.val;
            if ((val >= '0' && val <= '9') || val === '.') {
              if (resetNext) { current = '0'; resetNext = false; }
              if (val === '.' && current.indexOf('.') >= 0) return;
              current = current === '0' && val !== '.' ? val : current + val;
            } else if (val === 'C') { current = '0'; previous = null; operator = null; }
            else if (val === '±') current = String(-parseFloat(current));
            else if (val === '%') current = String(parseFloat(current) / 100);
            else if (['+', '-', '*', '/'].indexOf(val) >= 0) {
              if (operator && previous !== null) current = String(compute(previous, current, operator));
              previous = current; operator = val; resetNext = true;
            } else if (val === '=') {
              if (operator && previous !== null) { current = String(compute(previous, current, operator)); previous = null; operator = null; resetNext = true; }
            }
            display.textContent = current; sfx('click');
          });
        });
      }
    },

    paint: {
      title: 'Paint', icon: '🎨', width: 720, height: 520,
      content: function () {
        return '<div class="paint-toolbar">' +
          '<button type="button" data-tool="brush" class="active">Brush</button>' +
          '<button type="button" data-tool="eraser">Eraser</button>' +
          '<button type="button" data-tool="fill">Fill</button>' +
          '<button type="button" data-tool="line">Line</button>' +
          '<button type="button" data-tool="rect">Rect</button>' +
          '<label>Color <input type="color" id="paint-color" value="#00d4ff"></label>' +
          '<label>Size <input type="range" id="paint-size" min="1" max="40" value="4"></label>' +
          '<button type="button" id="paint-undo">Undo</button>' +
          '<button type="button" id="paint-clear">Clear</button>' +
          '<button type="button" id="paint-save">Save PNG</button></div><canvas id="paint-canvas"></canvas>';
      },
      init: function (win) {
        const canvas = win.el.querySelector('#paint-canvas');
        const ctx = canvas.getContext('2d');
        let drawing = false, tool = 'brush', color = '#00d4ff', size = 4, startX = 0, startY = 0, snapshot = null;
        const undoStack = [];
        function resizeCanvas() {
          const content = win.el.querySelector('.window-content');
          const toolbar = win.el.querySelector('.paint-toolbar');
          canvas.width = content.clientWidth;
          canvas.height = Math.max(200, content.clientHeight - toolbar.offsetHeight);
          ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        resizeCanvas();
        function pushUndo() { try { undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height)); if (undoStack.length > 30) undoStack.shift(); } catch (e) {} }
        function pos(e) {
          const r = canvas.getBoundingClientRect();
          const src = e.touches ? e.touches[0] : e;
          return { x: src.clientX - r.left, y: src.clientY - r.top };
        }
        function hexToRgb(hex) {
          const n = parseInt(hex.slice(1), 16);
          return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }
        function floodFill(x, y, fillColor) {
          const w = canvas.width, h = canvas.height, image = ctx.getImageData(0, 0, w, h), data = image.data;
          const i = (Math.floor(y) * w + Math.floor(x)) * 4;
          const tr = data[i], tg = data[i + 1], tb = data[i + 2], ta = data[i + 3];
          const fc = hexToRgb(fillColor);
          if (tr === fc.r && tg === fc.g && tb === fc.b) return;
          const stack = [[Math.floor(x), Math.floor(y)]];
          while (stack.length) {
            const p = stack.pop(); const cx = p[0], cy = p[1];
            if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
            const idx = (cy * w + cx) * 4;
            if (data[idx] !== tr || data[idx + 1] !== tg || data[idx + 2] !== tb || data[idx + 3] !== ta) continue;
            data[idx] = fc.r; data[idx + 1] = fc.g; data[idx + 2] = fc.b; data[idx + 3] = 255;
            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
          }
          ctx.putImageData(image, 0, 0);
        }
        win.el.querySelectorAll('[data-tool]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            tool = btn.dataset.tool;
            win.el.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
          });
        });
        win.el.querySelector('#paint-color').addEventListener('input', function (e) { color = e.target.value; });
        win.el.querySelector('#paint-size').addEventListener('input', function (e) { size = +e.target.value; });
        win.el.querySelector('#paint-clear').addEventListener('click', function () {
          pushUndo(); ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        });
        win.el.querySelector('#paint-undo').addEventListener('click', function () {
          if (undoStack.length) ctx.putImageData(undoStack.pop(), 0, 0);
        });
        win.el.querySelector('#paint-save').addEventListener('click', function () {
          const a = document.createElement('a'); a.download = 'orbitos-paint.png'; a.href = canvas.toDataURL(); a.click();
          showToast('Image saved'); sfx('success');
        });
        function onDown(e) {
          e.preventDefault(); const p = pos(e); drawing = true; startX = p.x; startY = p.y;
          if (tool === 'fill') { pushUndo(); floodFill(p.x, p.y, color); drawing = false; return; }
          pushUndo(); snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
        }
        function onMove(e) {
          if (!drawing) return; e.preventDefault(); const p = pos(e);
          if (tool === 'brush' || tool === 'eraser') {
            ctx.lineWidth = size; ctx.lineCap = 'round';
            ctx.strokeStyle = tool === 'eraser' ? '#1a1a2e' : color;
            ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y);
          } else if (tool === 'line' || tool === 'rect') {
            ctx.putImageData(snapshot, 0, 0); ctx.strokeStyle = color; ctx.lineWidth = size;
            if (tool === 'line') { ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(p.x, p.y); ctx.stroke(); }
            else ctx.strokeRect(startX, startY, p.x - startX, p.y - startY);
          }
        }
        function onUp() { drawing = false; ctx.beginPath(); }
        canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseup', onUp); canvas.addEventListener('mouseleave', onUp);
        canvas.addEventListener('touchstart', onDown, { passive: false });
        canvas.addEventListener('touchmove', onMove, { passive: false });
        canvas.addEventListener('touchend', onUp);
      }
    },
    files: {
      title: 'File Explorer', icon: '📁', width: 700, height: 480,
      content: function () {
        return '<div class="files-body"><div class="files-sidebar">' +
          '<div class="files-sidebar-item active" data-folder="desktop">🖥️ Desktop</div>' +
          '<div class="files-sidebar-item" data-folder="documents">📄 Documents</div>' +
          '<div class="files-sidebar-item" data-folder="games">🎮 Games</div>' +
          '<div class="files-sidebar-item" data-folder="music">🎵 Music</div>' +
          '<div class="files-sidebar-item" data-folder="system">⚙️ System</div>' +
          '</div><div class="files-main" id="files-main"></div></div>';
      },
      init: function (win) {
        const folders = {
          desktop: [
            { name: 'Browser', icon: '🌐', type: 'app', app: 'browser' },
            { name: 'Music', icon: '🎵', type: 'app', app: 'music' },
            { name: 'Games', icon: '🎮', type: 'app', app: 'games' },
            { name: 'Terminal', icon: '💻', type: 'app', app: 'terminal' },
            { name: 'README.md', icon: '📄', type: 'file', contentKey: 'README.md' }
          ],
          documents: [
            { name: 'notes.txt', icon: '📝', type: 'file', contentKey: 'notes.txt' },
            { name: 'todo.md', icon: '📋', type: 'file', contentKey: 'todo.md' },
            { name: 'README.md', icon: '📄', type: 'file', contentKey: 'README.md' }
          ],
          games: [
            { name: 'Snake.exe', icon: '🐍', type: 'game', game: 'snake' },
            { name: 'TicTacToe.exe', icon: '❌', type: 'game', game: 'ttt' },
            { name: '2048.exe', icon: '🔢', type: 'game', game: '2048' },
            { name: 'Memory.exe', icon: '🧠', type: 'game', game: 'memory' }
          ],
          music: [
            { name: 'Ambient Horizon', icon: '🌌', type: 'music' },
            { name: 'Digital Pulse', icon: '💫', type: 'music' }
          ],
          system: [
            { name: 'settings.json', icon: '⚙️', type: 'file', contentKey: 'settings.json' },
            { name: 'boot.log', icon: '📜', type: 'file', contentKey: 'boot.log' },
            { name: 'kernel.js', icon: '💚', type: 'file', contentKey: 'kernel.js' },
            { name: 'README.md', icon: '📄', type: 'file', contentKey: 'README.md' }
          ]
        };
        const labels = { desktop: 'Desktop', documents: 'Documents', games: 'Games', music: 'Music', system: 'System' };
        const main = win.el.querySelector('#files-main');
        let currentFolder = 'desktop';
        function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
        function renderMd(text) {
          return text.split('\n').map(function (line) {
            var l = esc(line);
            if (l.indexOf('# ') === 0) return '<span class="md-h1">' + l.slice(2) + '</span>';
            if (l.indexOf('## ') === 0) return '<span class="md-h2">' + l.slice(3) + '</span>';
            return l;
          }).join('\n');
        }
        function openViewer(name, content) {
          main.innerHTML = '<div class="file-viewer"><div class="file-viewer-toolbar">' +
            '<button type="button" id="files-back">← Back</button><span class="file-viewer-title">' + esc(name) + '</span>' +
            '<button type="button" id="files-notepad">Open in Notepad</button></div>' +
            '<div class="file-viewer-body">' + renderMd(content) + '</div></div>';
          main.querySelector('#files-back').addEventListener('click', function () { showFolder(currentFolder); });
          main.querySelector('#files-notepad').addEventListener('click', function () {
            openApp('notepad');
            setTimeout(function () {
              var np = windows.find(function (w) { return w.appId === 'notepad' && !w.closed; });
              if (np) { var area = np.el.querySelector('#np-area'); if (area) area.value = content; }
            }, 80);
          });
        }
        function activate(f) {
          if (f.type === 'app') openApp(f.app);
          else if (f.type === 'game') {
            if (f.game === 'snake') openSnake(); else if (f.game === 'ttt') openTTT();
            else if (f.game === '2048') open2048(); else if (f.game === 'memory') openMemory();
          } else if (f.type === 'music') openApp('music');
          else if (f.type === 'file' && f.contentKey && fileContents[f.contentKey]) openViewer(f.name, fileContents[f.contentKey]);
          else showToast('Opened ' + f.name);
          sfx('click');
        }
        function showFolder(name) {
          currentFolder = name;
          main.innerHTML = '<div class="files-breadcrumb">OrbitOS / <strong>' + (labels[name] || name) + '</strong></div><div class="files-grid" id="files-grid"></div>';
          const grid = main.querySelector('#files-grid');
          (folders[name] || []).forEach(function (f) {
            const item = document.createElement('div'); item.className = 'file-item';
            item.innerHTML = '<div class="file-icon">' + f.icon + '</div><div class="file-name">' + f.name + '</div>';
            item.addEventListener('click', function () {
              grid.querySelectorAll('.file-item').forEach(function (el) { el.classList.remove('selected'); });
              item.classList.add('selected');
              if (f.type === 'file') activate(f);
            });
            item.addEventListener('dblclick', function () { activate(f); });
            grid.appendChild(item);
          });
        }
        showFolder('desktop');
        win.el.querySelectorAll('.files-sidebar-item').forEach(function (item) {
          item.addEventListener('click', function () {
            win.el.querySelectorAll('.files-sidebar-item').forEach(function (i) { i.classList.remove('active'); });
            item.classList.add('active'); showFolder(item.dataset.folder);
          });
        });
      }
    },
    settings: {
      title: 'Settings', icon: '⚙️', width: 520, height: 520,
      content: function () {
        return '<div class="settings-body"><div class="settings-section"><h3>Appearance</h3>' +
          '<div class="settings-row"><span>Theme</span><div class="theme-swatches">' +
          '<div class="theme-swatch" data-theme="cyan" title="Cyan"></div>' +
          '<div class="theme-swatch" data-theme="purple" title="Purple"></div>' +
          '<div class="theme-swatch" data-theme="green" title="Green"></div>' +
          '<div class="theme-swatch" data-theme="orange" title="Orange"></div>' +
          '<div class="theme-swatch" data-theme="rose" title="Rose"></div></div></div>' +
          '<div class="settings-row"><span>Wallpaper</span><div class="wallpaper-presets">' +
          '<div class="wp-preset p0" data-wp="0"></div><div class="wp-preset p1" data-wp="1"></div>' +
          '<div class="wp-preset p2" data-wp="2"></div><div class="wp-preset p3" data-wp="3"></div><div class="wp-preset p4" data-wp="4"></div></div></div>' +
          '<div class="settings-row"><span>Custom URL</span><input id="wallpaper-url" placeholder="https://...image.jpg"></div>' +
          '<div class="settings-row"><span></span><button type="button" id="wallpaper-apply" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:rgba(0,212,255,0.15);color:var(--accent);cursor:pointer;font-size:0.8rem">Apply URL</button></div></div>' +
          '<div class="settings-section"><h3>Sound</h3><div class="settings-row"><span>Mute UI & music</span><button type="button" id="settings-mute">Toggle Mute</button></div>' +
          '<div class="settings-row vol-row"><span>Volume</span><input type="range" id="settings-vol" min="0" max="100" value="70"></div></div>' +
          '<div class="settings-section"><h3>Accessibility</h3><div class="settings-row"><span>Reduced motion</span><button type="button" id="settings-motion">Toggle</button></div></div>' +
          '<div class="settings-section"><h3>Desktop</h3><div class="settings-row"><span>Floating sticky</span><button type="button" id="settings-sticky">Add sticky</button></div></div>' +
          '<div class="settings-section"><h3>System</h3><div class="settings-row"><span>Version</span><span style="color:var(--text-dim)">OrbitOS 1.4.1</span></div>' +
          '<div class="settings-row"><span>Restore session on boot</span><span style="color:var(--text-dim)">On</span></div>' +
          '<div class="settings-row"><span>Clear local data</span><button type="button" id="settings-clear">Clear</button></div></div></div>';
      },
      init: function (win) {
        win.el.querySelectorAll('.theme-swatch').forEach(function (s) {
          if (s.dataset.theme === currentTheme) s.classList.add('active');
          s.addEventListener('click', function () {
            applyTheme(s.dataset.theme);
            win.el.querySelectorAll('.theme-swatch').forEach(function (x) { x.classList.remove('active'); });
            s.classList.add('active');
            showToast('Theme: ' + s.dataset.theme); sfx('click');
          });
        });
        win.el.querySelectorAll('.wp-preset').forEach(function (pr) {
          if (+pr.dataset.wp === wallpaperIndex && !store.customWallpaper) pr.classList.add('active');
          pr.addEventListener('click', function () {
            wallpaperIndex = +pr.dataset.wp;
            store.customWallpaper = null; saveStore({ customWallpaper: null }); store = loadStore();
            applyWallpaper();
            win.el.querySelectorAll('.wp-preset').forEach(function (x) { x.classList.remove('active'); });
            pr.classList.add('active');
            showToast('Wallpaper changed'); sfx('click');
          });
        });
        var urlInput = win.el.querySelector('#wallpaper-url');
        if (store.customWallpaper) urlInput.value = store.customWallpaper;
        win.el.querySelector('#wallpaper-apply').addEventListener('click', function () {
          var u = urlInput.value.trim();
          if (!u) { showToast('Enter an image URL'); return; }
          if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
          saveStore({ customWallpaper: u }); store = loadStore();
          applyWallpaper(); showToast('Custom wallpaper set'); sfx('success');
        });
        win.el.querySelector('#settings-mute').addEventListener('click', toggleMute);
        var vol = win.el.querySelector('#settings-vol');
        if (vol) {
          vol.value = store.volume != null ? store.volume : 70;
          vol.addEventListener('input', function () {
            saveStore({ volume: +vol.value }); store = loadStore();
            if (muted && +vol.value > 0) { muted = false; saveStore({ muted: false }); updateVolumeUI(); }
          });
        }
        var motionBtn = win.el.querySelector('#settings-motion');
        if (motionBtn) motionBtn.addEventListener('click', function () {
          document.body.classList.toggle('reduce-motion');
          var on = document.body.classList.contains('reduce-motion');
          saveStore({ reduceMotion: on }); store = loadStore();
          showToast(on ? 'Reduced motion on' : 'Reduced motion off');
        });
        var stickyBtn = win.el.querySelector('#settings-sticky');
        if (stickyBtn) stickyBtn.addEventListener('click', function () { addFloatSticky(); sfx('open'); });
        win.el.querySelector('#settings-clear').addEventListener('click', function () {
          if (confirm('Clear all OrbitOS saved data?')) {
            localStorage.removeItem(STORE_KEY); localStorage.removeItem('orbitos-snake-best'); store = {}; showToast('Local data cleared');
          }
        });
      }
    },


    stickies: {
      title: 'Sticky Notes', icon: '📌', width: 380, height: 420,
      content: function () {
        return '<div class="stickies-body"><div class="stickies-toolbar">' +
          '<button type="button" id="sticky-add">+ Note</button>' +
          '<button type="button" data-color="yellow">Yellow</button>' +
          '<button type="button" data-color="pink">Pink</button>' +
          '<button type="button" data-color="blue">Blue</button>' +
          '<button type="button" data-color="green">Green</button></div>' +
          '<div class="stickies-list" id="stickies-list"></div></div>';
      },
      init: function (win) {
        var color = 'yellow';
        var notes = store.stickies || [{ id: 1, text: 'Welcome to Stickies!', color: 'yellow' }];
        function save() { saveStore({ stickies: notes }); store = loadStore(); }
        function render() {
          var list = win.el.querySelector('#stickies-list'); list.innerHTML = '';
          notes.forEach(function (n) {
            var div = document.createElement('div');
            div.className = 'sticky-note' + (n.color !== 'yellow' ? ' ' + n.color : '');
            div.innerHTML = '<button type="button" class="sticky-del" data-id="' + n.id + '">✕</button>' +
              '<textarea data-id="' + n.id + '">' + (n.text || '') + '</textarea>';
            list.appendChild(div);
          });
          list.querySelectorAll('textarea').forEach(function (ta) {
            ta.addEventListener('input', function () {
              var id = +ta.dataset.id;
              var note = notes.find(function (x) { return x.id === id; });
              if (note) { note.text = ta.value; save(); }
            });
          });
          list.querySelectorAll('.sticky-del').forEach(function (btn) {
            btn.addEventListener('click', function () {
              notes = notes.filter(function (x) { return x.id !== +btn.dataset.id; });
              save(); render();
            });
          });
        }
        win.el.querySelector('#sticky-add').addEventListener('click', function () {
          notes.unshift({ id: Date.now(), text: '', color: color }); save(); render(); sfx('click');
        });
        win.el.querySelectorAll('[data-color]').forEach(function (b) {
          b.addEventListener('click', function () { color = b.dataset.color; showToast('New notes: ' + color); });
        });
        render();
      }
    },
    taskmgr: {
      title: 'Task Manager', icon: '📊', width: 480, height: 360,
      content: function () {
        return '<div class="taskmgr-body"><div style="font-size:0.8rem;color:var(--text-dim)">Open windows</div>' +
          '<table class="taskmgr-table"><thead><tr><th>App</th><th>Status</th><th></th></tr></thead>' +
          '<tbody id="taskmgr-body"></tbody></table>' +
          '<button type="button" id="taskmgr-refresh" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:rgba(0,212,255,0.1);color:var(--accent);cursor:pointer;font-size:0.8rem">Refresh</button></div>';
      },
      init: function (win) {
        function refresh() {
          var body = win.el.querySelector('#taskmgr-body'); body.innerHTML = '';
          var open = windows.filter(function (w) { return !w.closed; });
          if (!open.length) {
            body.innerHTML = '<tr><td colspan="3" style="color:var(--text-dim)">No open windows</td></tr>';
            return;
          }
          open.forEach(function (w) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + w.icon + ' ' + w.title + '</td><td>' +
              (w.minimized ? 'Minimized' : 'Running') + '</td><td><button type="button" data-id="' + w.id + '">End task</button></td>';
            body.appendChild(tr);
          });
          body.querySelectorAll('button').forEach(function (btn) {
            btn.addEventListener('click', function () { closeWindow(btn.dataset.id); refresh(); sfx('close'); });
          });
        }
        win.el.querySelector('#taskmgr-refresh').addEventListener('click', refresh);
        refresh();
        win._taskmgrInterval = setInterval(function () {
          if (win.closed) { clearInterval(win._taskmgrInterval); return; }
          refresh();
        }, 1500);
      }
    },
    weather: {
      title: 'Weather', icon: '🌤️', width: 340, height: 320,
      content: function () {
        var conditions = [
          { icon: '☀️', name: 'Sunny', temp: 72 },
          { icon: '⛅', name: 'Partly Cloudy', temp: 68 },
          { icon: '🌧️', name: 'Rain Showers', temp: 59 },
          { icon: '🌤️', name: 'Clear Skies', temp: 75 },
          { icon: '❄️', name: 'Light Snow', temp: 34 }
        ];
        var c = conditions[Math.floor(Math.random() * conditions.length)];
        return '<div class="weather-body"><div style="font-size:3rem">' + c.icon + '</div>' +
          '<div class="weather-temp">' + c.temp + '°F</div>' +
          '<div class="weather-desc">' + c.name + ' · Simulated local</div>' +
          '<p style="font-size:0.78rem;color:var(--text-dim)">Orbit City (demo data — no network weather API)</p>' +
          '<div class="weather-row"><div>Humidity<strong>' + (40 + Math.floor(Math.random() * 40)) + '%</strong></div>' +
          '<div>Wind<strong>' + (3 + Math.floor(Math.random() * 12)) + ' mph</strong></div>' +
          '<div>UV<strong>' + (1 + Math.floor(Math.random() * 8)) + '</strong></div></div></div>';
      },
      init: function () {}
    },

    video: {
      title: 'Video Player', icon: '📽️', width: 640, height: 440,
      content: function () {
        return '<div class="video-body"><video id="local-video" controls playsinline></video>' +
          '<div class="video-toolbar"><input type="file" id="video-file" accept="video/*">' +
          '<button type="button" id="video-clear">Clear</button></div>' +
          '<p style="font-size:0.75rem;color:var(--text-dim)">Plays files from your device only — never uploaded</p></div>';
      },
      init: function (win) {
        var vid = win.el.querySelector('#local-video');
        var input = win.el.querySelector('#video-file');
        var url = null;
        input.addEventListener('change', function () {
          var f = input.files && input.files[0];
          if (!f) return;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(f);
          vid.src = url; vid.play(); showToast('Playing: ' + f.name); sfx('success');
        });
        win.el.querySelector('#video-clear').addEventListener('click', function () {
          vid.pause(); vid.removeAttribute('src'); vid.load();
          if (url) { URL.revokeObjectURL(url); url = null; }
          input.value = '';
        });
      }
    },
    todo: {
      title: 'To-Do Board', icon: '📋', width: 700, height: 420,
      content: function () {
        return '<div class="todo-body" id="todo-board"></div>';
      },
      init: function (win) {
        var data = store.todo || {
          todo: ['Try Pong vs CPU', 'Write a sticky note'],
          doing: ['Polish the desktop'],
          done: ['Install nothing (browser only)']
        };
        var cols = [
          { key: 'todo', title: 'To Do' },
          { key: 'doing', title: 'Doing' },
          { key: 'done', title: 'Done' }
        ];
        function save() { saveStore({ todo: data }); store = loadStore(); }
        function render() {
          var board = win.el.querySelector('#todo-board'); board.innerHTML = '';
          cols.forEach(function (col) {
            var c = document.createElement('div'); c.className = 'todo-col';
            c.innerHTML = '<div class="todo-col-header"><span>' + col.title + '</span><span style="color:var(--text-dim);font-weight:400">' + (data[col.key] || []).length + '</span></div>' +
              '<div class="todo-cards" data-col="' + col.key + '"></div>' +
              '<button type="button" class="todo-add" data-col="' + col.key + '">+ Add</button>';
            board.appendChild(c);
            var cards = c.querySelector('.todo-cards');
            (data[col.key] || []).forEach(function (text, idx) {
              var card = document.createElement('div');
              card.className = 'todo-card'; card.draggable = true; card.textContent = text;
              card.dataset.col = col.key; card.dataset.idx = idx;
              card.addEventListener('dragstart', function (e) {
                e.dataTransfer.setData('text/plain', col.key + '|' + idx);
              });
              card.addEventListener('dblclick', function () {
                if (!confirm('Delete this card?')) return;
                data[col.key].splice(idx, 1); save(); render();
              });
              cards.appendChild(card);
            });
            cards.addEventListener('dragover', function (e) { e.preventDefault(); });
            cards.addEventListener('drop', function (e) {
              e.preventDefault();
              var parts = e.dataTransfer.getData('text/plain').split('|');
              var from = parts[0], fi = +parts[1];
              if (!data[from] || data[from][fi] == null) return;
              var item = data[from].splice(fi, 1)[0];
              data[col.key].push(item); save(); render(); sfx('click');
            });
            c.querySelector('.todo-add').addEventListener('click', function () {
              var t = prompt('New card:');
              if (!t) return;
              data[col.key].push(t); save(); render(); sfx('success');
            });
          });
        }
        render();
      }
    },
    markdown: {
      title: 'Markdown', icon: '📄', width: 720, height: 480,
      content: function () {
        return '<div class="md-body"><div class="md-pane"><label>Markdown</label>' +
          '<textarea id="md-input" spellcheck="false"></textarea></div>' +
          '<div class="md-pane"><label>Preview</label><div class="md-preview" id="md-preview"></div></div></div>';
      },
      init: function (win) {
        var input = win.el.querySelector('#md-input');
        var preview = win.el.querySelector('#md-preview');
        var def = '# Hello OrbitOS\n\nWrite **markdown** on the left.\n\n- Lists\n- `code`\n- [links](https://example.com)';
        input.value = store.markdown || def;
        function esc(s) {
          return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }
        function inline(t) {
          t = esc(t);
          t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
          t = t.replace(/`(.+?)`/g, '<code>$1</code>');
          t = t.replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
          return t;
        }
        function renderMd(src) {
          var lines = String(src).split('\n');
          var html = '', inCode = false;
          lines.forEach(function (line) {
            if (line.indexOf('```') === 0) {
              if (inCode) { html += '</code></pre>'; inCode = false; }
              else { html += '<pre><code>'; inCode = true; }
              return;
            }
            if (inCode) { html += esc(line) + '\n'; return; }
            if (/^### /.test(line)) html += '<h3>' + esc(line.slice(4)) + '</h3>';
            else if (/^## /.test(line)) html += '<h2>' + esc(line.slice(3)) + '</h2>';
            else if (/^# /.test(line)) html += '<h1>' + esc(line.slice(2)) + '</h1>';
            else if (/^[-*] /.test(line)) html += '<li>' + inline(line.slice(2)) + '</li>';
            else if (!line.trim()) html += '<br>';
            else html += '<p>' + inline(line) + '</p>';
          });
          if (inCode) html += '</code></pre>';
          preview.innerHTML = html;
        }
        function sync() {
          renderMd(input.value);
          saveStore({ markdown: input.value }); store = loadStore();
        }
        input.addEventListener('input', sync); sync();
      }
    },
    about: {
      title: 'About OrbitOS', icon: 'ℹ️', width: 460, height: 480,
      content: function () {
        return '<div class="about-body"><div class="about-logo">🚀</div><h2>OrbitOS</h2>' +
          '<p class="version">Version 1.4.1 — Studio Pack</p>' +
          '<p>A complete desktop OS in pure HTML, CSS & JavaScript for GitHub Pages.</p>' +
          '<div class="about-features"><span>🪟 Windows</span><span>🎮 Games</span><span>🎵 Music</span><span>🌐 Browser</span><span>💻 Terminal</span><span>🎨 Paint</span></div>' +
          '<div class="changelog"><h4>Changelog</h4><ul>' +
          '<li><strong>1.4.1</strong> — Removed Movies (embed errors); smarter Pong AI; icons locked; version sync</li><li><strong>1.4.0</strong> — Video, To-Do, Markdown, Solitaire, stickies, volume, clipboard, reduced motion</li><li><strong>1.3.0</strong> — Themes, command palette, lock, session restore, desktop clock, Connect Four</li><li><strong>1.2.0</strong> — Stickies, Task Manager, Weather, Minesweeper, Pong, Run, search, screensaver</li><li><strong>1.1.0</strong> — Snap, shortcuts, calendar, mute, tips, paint tools, mobile, wallpapers</li>' +
          '<li><strong>1.0.0</strong> — Initial desktop, apps, games</li></ul></div>' +
          '<p style="margin-top:16px;font-size:0.78rem;opacity:0.6">Made for GitHub Pages</p></div>';
      },
      init: function () {}
    }
  };

  function openApp(appId) {
    const app = apps[appId]; if (!app) return null;
    const win = createWindow(appId, app.title, app.icon, app.content(), app.width, app.height);
    if (app.init) setTimeout(function () { app.init(win); }, 40);
    return win;
  }

  function openSnake() {
    const win = createWindow('snake-game', 'Snake', '🐍',
      '<div class="snake-container"><div class="snake-hud"><span>Score: <strong id="snake-score">0</strong></span><span>Best: <strong id="snake-best">0</strong></span></div>' +
      '<canvas id="snake-canvas" width="360" height="360"></canvas><div class="game-btn-row">' +
      '<button type="button" id="snake-start">Start</button><button type="button" id="snake-pause">Pause</button></div>' +
      '<div class="dpad"><button type="button" class="up" data-dir="up">▲</button><button type="button" class="left" data-dir="left">◀</button>' +
      '<button type="button" class="right" data-dir="right">▶</button><button type="button" class="down" data-dir="down">▼</button></div></div>', 400, 560);
    setTimeout(function () {
      const canvas = win.el.querySelector('#snake-canvas'); const ctx = canvas.getContext('2d');
      const GS = 18, TC = 20;
      let snake, food, dx, dy, score, best, loop, running, paused;
      best = parseInt(localStorage.getItem('orbitos-snake-best') || store.snakeBest || '0', 10);
      win.el.querySelector('#snake-best').textContent = best;
      function reset() {
        snake = [{ x: 10, y: 10 }]; food = { x: 15, y: 15 }; dx = 0; dy = 0; score = 0; running = false; paused = false;
        win.el.querySelector('#snake-score').textContent = '0'; draw();
      }
      function draw() {
        ctx.fillStyle = '#0d0d1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff4466'; ctx.fillRect(food.x * GS + 2, food.y * GS + 2, GS - 4, GS - 4);
        snake.forEach(function (s, i) { ctx.fillStyle = i === 0 ? '#00d4ff' : '#00aacc'; ctx.fillRect(s.x * GS + 1, s.y * GS + 1, GS - 2, GS - 2); });
      }
      function tick() {
        if (!running || paused) return;
        const head = { x: snake[0].x + dx, y: snake[0].y + dy };
        if (head.x < 0 || head.x >= TC || head.y < 0 || head.y >= TC || snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
          running = false; clearInterval(loop); showToast('Game Over! Score: ' + score); sfx('error'); return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score++; win.el.querySelector('#snake-score').textContent = score;
          if (score > best) { best = score; localStorage.setItem('orbitos-snake-best', best); saveStore({ snakeBest: best }); win.el.querySelector('#snake-best').textContent = best; }
          food = { x: Math.floor(Math.random() * TC), y: Math.floor(Math.random() * TC) };
        } else snake.pop();
        draw();
      }
      function setDir(ndx, ndy) { if (ndx === -dx && ndy === -dy) return; dx = ndx; dy = ndy; }
      win.el.querySelector('#snake-start').addEventListener('click', function () {
        reset(); running = true; dx = 1; dy = 0; clearInterval(loop); loop = setInterval(tick, 110);
      });
      win.el.querySelector('#snake-pause').addEventListener('click', function () {
        if (!running) return; paused = !paused; win.el.querySelector('#snake-pause').textContent = paused ? 'Resume' : 'Pause';
      });
      win.el.querySelectorAll('.dpad button').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = b.dataset.dir;
          if (d === 'up') setDir(0, -1); if (d === 'down') setDir(0, 1); if (d === 'left') setDir(-1, 0); if (d === 'right') setDir(1, 0);
        });
      });
      function kh(e) {
        if (win.closed) { document.removeEventListener('keydown', kh); return; }
        if (['ArrowUp', 'w', 'W'].indexOf(e.key) >= 0) setDir(0, -1);
        if (['ArrowDown', 's', 'S'].indexOf(e.key) >= 0) setDir(0, 1);
        if (['ArrowLeft', 'a', 'A'].indexOf(e.key) >= 0) setDir(-1, 0);
        if (['ArrowRight', 'd', 'D'].indexOf(e.key) >= 0) setDir(1, 0);
        if (e.key === ' ') paused = !paused;
      }
      document.addEventListener('keydown', kh); reset();
    }, 50);
  }

  function openTTT() {
    const win = createWindow('ttt-game', 'Tic-Tac-Toe', '❌',
      '<div class="ttt-container"><div class="ttt-status" id="ttt-status">X\'s turn</div><div class="ttt-board" id="ttt-board"></div>' +
      '<div class="game-btn-row"><button type="button" id="ttt-reset">Reset</button></div></div>', 340, 400);
    setTimeout(function () {
      const boardEl = win.el.querySelector('#ttt-board'); const status = win.el.querySelector('#ttt-status');
      let board, current, over;
      function init() {
        board = Array(9).fill(''); current = 'X'; over = false; status.textContent = "X's turn"; boardEl.innerHTML = '';
        for (let i = 0; i < 9; i++) {
          (function (i) {
            const cell = document.createElement('div'); cell.className = 'ttt-cell';
            cell.addEventListener('click', function () {
              if (board[i] || over) return;
              board[i] = current; cell.textContent = current; cell.classList.add(current.toLowerCase());
              var wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
              if (wins.some(function (w) { return board[w[0]] === current && board[w[1]] === current && board[w[2]] === current; })) {
                status.textContent = current + ' wins!'; over = true; sfx('success'); return;
              }
              if (board.every(function (c) { return c; })) { status.textContent = 'Draw!'; over = true; return; }
              current = current === 'X' ? 'O' : 'X'; status.textContent = current + "'s turn";
            });
            boardEl.appendChild(cell);
          })(i);
        }
      }
      win.el.querySelector('#ttt-reset').addEventListener('click', init); init();
    }, 50);
  }

  function open2048() {
    const win = createWindow('g2048-game', '2048', '🔢',
      '<div class="g2048-container"><div class="g2048-hud"><div class="g2048-score">Score: <strong id="g2048-score">0</strong></div>' +
      '<button type="button" id="g2048-new" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:rgba(0,212,255,0.1);color:var(--accent);cursor:pointer;font-size:0.8rem">New</button>' +
      '<button type="button" id="g2048-pause" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:rgba(0,212,255,0.1);color:var(--accent);cursor:pointer;font-size:0.8rem">Pause</button></div>' +
      '<div id="g2048-board"></div><div class="dpad">' +
      '<button type="button" class="up" data-dir="up">▲</button><button type="button" class="left" data-dir="left">◀</button>' +
      '<button type="button" class="right" data-dir="right">▶</button><button type="button" class="down" data-dir="down">▼</button></div></div>', 360, 480);
    setTimeout(function () {
      const boardEl = win.el.querySelector('#g2048-board');
      let grid, score, paused = false;
      function empty() { return Array.from({ length: 4 }, function () { return Array(4).fill(0); }); }
      function add() {
        var emptyCells = [];
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (!grid[r][c]) emptyCells.push({ r: r, c: c });
        if (!emptyCells.length) return;
        var cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        grid[cell.r][cell.c] = Math.random() < 0.9 ? 2 : 4;
      }
      function render() {
        boardEl.innerHTML = '';
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
          var cell = document.createElement('div');
          cell.className = 'g2048-cell' + (grid[r][c] ? ' t' + grid[r][c] : '');
          cell.textContent = grid[r][c] || ''; boardEl.appendChild(cell);
        }
        win.el.querySelector('#g2048-score').textContent = score;
      }
      function slide(row) {
        var arr = row.filter(function (x) { return x; });
        for (var i = 0; i < arr.length - 1; i++) {
          if (arr[i] === arr[i + 1]) { arr[i] *= 2; score += arr[i]; arr[i + 1] = 0; }
        }
        arr = arr.filter(function (x) { return x; });
        while (arr.length < 4) arr.push(0);
        return arr;
      }
      function move(dir) {
        if (paused) return;
        var prev = JSON.stringify(grid);
        if (dir === 'left') for (var r = 0; r < 4; r++) grid[r] = slide(grid[r]);
        else if (dir === 'right') for (var r = 0; r < 4; r++) grid[r] = slide(grid[r].slice().reverse()).reverse();
        else if (dir === 'up') {
          for (var c = 0; c < 4; c++) {
            var col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]]; col = slide(col);
            for (var r = 0; r < 4; r++) grid[r][c] = col[r];
          }
        } else if (dir === 'down') {
          for (var c = 0; c < 4; c++) {
            var col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]].reverse(); col = slide(col).reverse();
            for (var r = 0; r < 4; r++) grid[r][c] = col[r];
          }
        }
        if (JSON.stringify(grid) !== prev) { add(); render(); }
      }
      function init() { grid = empty(); score = 0; paused = false; add(); add(); render(); }
      win.el.querySelector('#g2048-new').addEventListener('click', init);
      win.el.querySelector('#g2048-pause').addEventListener('click', function () {
        paused = !paused; win.el.querySelector('#g2048-pause').textContent = paused ? 'Resume' : 'Pause';
      });
      win.el.querySelectorAll('.dpad button').forEach(function (b) { b.addEventListener('click', function () { move(b.dataset.dir); }); });
      function kh(e) {
        if (win.closed) { document.removeEventListener('keydown', kh); return; }
        if (e.key === 'ArrowLeft') move('left'); if (e.key === 'ArrowRight') move('right');
        if (e.key === 'ArrowUp') move('up'); if (e.key === 'ArrowDown') move('down');
      }
      document.addEventListener('keydown', kh);
      var sx = 0, sy = 0;
      boardEl.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      boardEl.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) move(dx > 0 ? 'right' : 'left');
        else if (Math.abs(dy) > 30) move(dy > 0 ? 'down' : 'up');
      }, { passive: true });
      init();
    }, 50);
  }

  function openMemory() {
    const win = createWindow('memory-game', 'Memory', '🧠',
      '<div class="memory-container"><div class="snake-hud" style="width:100%;max-width:300px">' +
      '<span>Moves: <strong id="mem-moves">0</strong></span><span>Pairs: <strong id="mem-pairs">0</strong>/8</span></div>' +
      '<div class="memory-grid" id="mem-grid"></div><div class="game-btn-row"><button type="button" id="mem-reset">New Game</button></div></div>', 360, 420);
    setTimeout(function () {
      const emojis = ['🚀', '🌟', '🎮', '🎵', '💻', '🎨', '🪐', '⚡'];
      let flipped, matched, moves, lock;
      function init() {
        const pairs = emojis.concat(emojis).sort(function () { return Math.random() - 0.5; });
        flipped = []; matched = 0; moves = 0; lock = false;
        win.el.querySelector('#mem-moves').textContent = '0'; win.el.querySelector('#mem-pairs').textContent = '0';
        const grid = win.el.querySelector('#mem-grid'); grid.innerHTML = '';
        pairs.forEach(function (emoji) {
          const card = document.createElement('div'); card.className = 'memory-card';
          card.innerHTML = '<span style="display:none">' + emoji + '</span>';
          card.addEventListener('click', function () {
            if (lock || card.classList.contains('flipped') || card.classList.contains('matched')) return;
            card.classList.add('flipped'); card.querySelector('span').style.display = 'block';
            flipped.push({ card: card, emoji: emoji });
            if (flipped.length === 2) {
              moves++; win.el.querySelector('#mem-moves').textContent = moves; lock = true;
              if (flipped[0].emoji === flipped[1].emoji) {
                flipped.forEach(function (f) { f.card.classList.add('matched'); });
                matched++; win.el.querySelector('#mem-pairs').textContent = matched; flipped = []; lock = false;
                if (matched === 8) { showToast('You won!'); sfx('success'); }
              } else {
                setTimeout(function () {
                  flipped.forEach(function (f) { f.card.classList.remove('flipped'); f.card.querySelector('span').style.display = 'none'; });
                  flipped = []; lock = false;
                }, 650);
              }
            }
          });
          grid.appendChild(card);
        });
      }
      win.el.querySelector('#mem-reset').addEventListener('click', init); init();
    }, 50);
  }


  function openMines() {
    const win = createWindow('mines-game', 'Minesweeper', '💣',
      '<div class="mine-body"><div class="mine-hud"><span>💣 <strong id="mine-left">10</strong></span>' +
      '<span id="mine-status">Ready</span>' +
      '<button type="button" id="mine-reset" style="padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:rgba(0,212,255,0.1);color:var(--accent);cursor:pointer;font-size:0.8rem">New</button></div>' +
      '<div class="mine-grid" id="mine-grid" style="grid-template-columns:repeat(9,28px)"></div>' +
      '<p style="font-size:0.75rem;color:var(--text-dim)">Left-click open · Right-click flag</p></div>', 360, 420);
    setTimeout(function () {
      var ROWS = 9, COLS = 9, MINES = 10;
      var board, opened, flagged, dead, won;
      function init() {
        board = []; opened = {}; flagged = {}; dead = false; won = false;
        win.el.querySelector('#mine-status').textContent = 'Ready';
        win.el.querySelector('#mine-left').textContent = MINES;
        for (var r = 0; r < ROWS; r++) {
          board[r] = [];
          for (var c = 0; c < COLS; c++) board[r][c] = { mine: false, n: 0 };
        }
        var placed = 0;
        while (placed < MINES) {
          var r = Math.floor(Math.random() * ROWS), c = Math.floor(Math.random() * COLS);
          if (!board[r][c].mine) { board[r][c].mine = true; placed++; }
        }
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          if (board[r][c].mine) continue;
          var n = 0;
          for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
            var rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc].mine) n++;
          }
          board[r][c].n = n;
        }
        render();
      }
      function key(r, c) { return r + ',' + c; }
      function render() {
        var grid = win.el.querySelector('#mine-grid'); grid.innerHTML = '';
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          (function (r, c) {
            var btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'mine-cell';
            var k = key(r, c);
            if (flagged[k]) { btn.classList.add('flag'); btn.textContent = '🚩'; }
            else if (opened[k]) {
              btn.classList.add('open');
              if (board[r][c].mine) { btn.classList.add('boom'); btn.textContent = '💣'; }
              else if (board[r][c].n) btn.textContent = board[r][c].n;
            }
            btn.addEventListener('click', function () { openCell(r, c); });
            btn.addEventListener('contextmenu', function (e) {
              e.preventDefault();
              if (dead || won || opened[k]) return;
              if (flagged[k]) delete flagged[k]; else flagged[k] = true;
              win.el.querySelector('#mine-left').textContent = Math.max(0, MINES - Object.keys(flagged).length);
              render();
            });
            grid.appendChild(btn);
          })(r, c);
        }
      }
      function openCell(r, c) {
        if (dead || won) return;
        var k = key(r, c);
        if (flagged[k] || opened[k]) return;
        opened[k] = true;
        if (board[r][c].mine) {
          dead = true;
          for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) if (board[rr][cc].mine) opened[key(rr, cc)] = true;
          win.el.querySelector('#mine-status').textContent = 'Boom!';
          sfx('error'); showToast('Minesweeper: Game over');
          render(); return;
        }
        if (board[r][c].n === 0) {
          for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
            var rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && !opened[key(rr, cc)]) openCell(rr, cc);
          }
        }
        var safe = ROWS * COLS - MINES;
        if (Object.keys(opened).length >= safe) {
          won = true; win.el.querySelector('#mine-status').textContent = 'Cleared!';
          sfx('success'); showToast('Minesweeper: You win!');
        }
        render();
      }
      win.el.querySelector('#mine-reset').addEventListener('click', init);
      init();
    }, 50);
  }

  function openPong() {
    const win = createWindow('pong-game', 'Pong', '🏓',
      '<div class="pong-wrap"><canvas id="pong-canvas" width="480" height="280"></canvas>' +
      '<div class="game-btn-row"><button type="button" id="pong-start">Start / Restart</button>' +
      '<span style="font-size:0.8rem;color:var(--text-dim)" id="pong-score">0 — 0</span></div>' +
      '<p style="font-size:0.75rem;color:var(--text-dim)">W/S or ↑/↓ · touch drag on canvas</p></div>', 520, 400);
    setTimeout(function () {
      var canvas = win.el.querySelector('#pong-canvas');
      var ctx = canvas.getContext('2d');
      var py = 120, cy = 120, ball = { x: 240, y: 140, vx: 3.5, vy: 2 }, ps = 0, cs = 0, running = false, loop = null;
      function draw() {
        ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, 480, 280);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(240, 0); ctx.lineTo(240, 280); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#00d4ff'; ctx.fillRect(16, py, 10, 50);
        ctx.fillStyle = '#a855f7'; ctx.fillRect(454, cy, 10, 50);
        ctx.beginPath(); ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      }
      function tick() {
        if (!running || win.closed) { clearInterval(loop); return; }
        ball.x += ball.vx; ball.y += ball.vy;
        if (ball.y < 7 || ball.y > 273) ball.vy *= -1;
        if (ball.x < 30 && ball.y > py && ball.y < py + 50) { ball.vx = Math.abs(ball.vx) * 1.05; ball.x = 30; }
        if (ball.x > 450 && ball.y > cy && ball.y < cy + 50) { ball.vx = -Math.abs(ball.vx) * 1.05; ball.x = 450; }
        // AI — smart but imperfect (reaction lag, max speed, aim offset, rare mistakes)
        if (typeof win._aiLag === 'undefined') win._aiLag = 0;
        if (typeof win._aiOffset === 'undefined') win._aiOffset = 0;
        if (typeof win._aiMiss === 'undefined') win._aiMiss = 0;
        win._aiLag++;
        // Only recalculate aim every few frames (reaction delay)
        if (win._aiLag >= 4) {
          win._aiLag = 0;
          // Occasional aim offset so it doesn't lock perfectly on the ball
          if (Math.random() < 0.08) win._aiOffset = (Math.random() - 0.5) * 36;
          // Rare "mistake" — aim elsewhere briefly
          if (Math.random() < 0.03) win._aiMiss = 12;
        }
        if (win._aiMiss > 0) {
          win._aiMiss--;
          var target = 140 + win._aiOffset; // drift toward center when missing
        } else {
          var target = ball.y - 25 + win._aiOffset;
        }
        // Only chase hard when ball is moving toward AI
        var speed = ball.vx > 0 ? 4.2 : 2.4;
        var diff = target - cy;
        cy += Math.max(-speed, Math.min(speed, diff * 0.22));
        cy = Math.max(0, Math.min(230, cy));
        if (ball.x < 0) { cs++; resetBall(-1); }
        if (ball.x > 480) { ps++; resetBall(1); }
        win.el.querySelector('#pong-score').textContent = ps + ' — ' + cs;
        draw();
      }
      function resetBall(dir) {
        ball = { x: 240, y: 140, vx: 3.5 * dir, vy: (Math.random() * 3 + 1) * (Math.random() < 0.5 ? 1 : -1) };
      }
      function start() {
        ps = 0; cs = 0; running = true; resetBall(1);
        clearInterval(loop); loop = setInterval(tick, 16);
      }
      win.el.querySelector('#pong-start').addEventListener('click', start);
      function kh(e) {
        if (win.closed) { document.removeEventListener('keydown', kh); return; }
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') py = Math.max(0, py - 18);
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') py = Math.min(230, py + 18);
      }
      document.addEventListener('keydown', kh);
      canvas.addEventListener('mousemove', function (e) {
        var r = canvas.getBoundingClientRect();
        py = Math.max(0, Math.min(230, (e.clientY - r.top) * (280 / r.height) - 25));
      });
      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        var r = canvas.getBoundingClientRect();
        py = Math.max(0, Math.min(230, (e.touches[0].clientY - r.top) * (280 / r.height) - 25));
      }, { passive: false });
      draw();
    }, 50);
  }

  function openRunDialog() {
    document.getElementById('run-dialog').classList.remove('hidden');
    var input = document.getElementById('run-input');
    input.value = '';
    setTimeout(function () { input.focus(); }, 50);
  }
  function closeRunDialog() {
    document.getElementById('run-dialog').classList.add('hidden');
  }
  function executeRun(cmd) {
    cmd = (cmd || '').trim().toLowerCase();
    closeRunDialog();
    if (!cmd) return;
    var map = {
      browser: 'browser', proxy: 'browser', music: 'music', games: 'games', game: 'games',
      terminal: 'terminal', shell: 'terminal', notepad: 'notepad', calc: 'calculator', calculator: 'calculator',
      paint: 'paint', files: 'files', explorer: 'files', settings: 'settings', about: 'about',
      stickies: 'stickies', sticky: 'stickies', notes: 'stickies', tasks: 'taskmgr', taskmgr: 'taskmgr',
      task: 'taskmgr', weather: 'weather', video: 'video', todo: 'todo', markdown: 'markdown', snake: 'games', pong: 'games', mines: 'games', c4: 'games', connect: 'games'
    };
    if (map[cmd]) {
      openApp(map[cmd]);
      if (cmd === 'snake') setTimeout(openSnake, 100);
      if (cmd === 'pong') setTimeout(openPong, 100);
      if (cmd === 'mines' || cmd === 'minesweeper') setTimeout(openMines, 100);
      if (cmd === 'c4' || cmd === 'connect') setTimeout(openConnectFour, 100);
      sfx('open');
    } else {
      showToast('Unknown: ' + cmd); sfx('error');
    }
  }

  function startScreensaver() {
    var ss = document.getElementById('screensaver');
    var canvas = document.getElementById('ss-canvas');
    ss.classList.remove('hidden');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');
    var stars = [];
    for (var i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * 2 + 0.5,
        a: Math.random()
      });
    }
    var t = 0;
    function frame() {
      if (ss.classList.contains('hidden')) { ssAnim = null; return; }
      t += 0.01;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      stars.forEach(function (s) {
        s.y += s.z;
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.z, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,212,255,' + (0.3 + s.a * 0.7) + ')';
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(168,85,247,0.8)';
      ctx.font = '600 28px Inter, sans-serif';
      ctx.textAlign = 'center';
      var now = new Date();
      ctx.fillStyle = '#00d4ff';
      ctx.fillText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), canvas.width / 2, canvas.height / 2 - 10);
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('OrbitOS', canvas.width / 2, canvas.height / 2 + 24);
      ssAnim = requestAnimationFrame(frame);
    }
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    frame();
  }
  function stopScreensaver() {
    document.getElementById('screensaver').classList.add('hidden');
    if (ssAnim) cancelAnimationFrame(ssAnim);
    ssAnim = null;
    resetIdle();
  }
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startScreensaver, IDLE_MS);
  }


  function openConnectFour() {
    const win = createWindow('c4-game', 'Connect Four', '🔴',
      '<div class="c4-body"><div class="c4-status" id="c4-status">Red\'s turn</div>' +
      '<div class="c4-board" id="c4-board"></div>' +
      '<div class="game-btn-row"><button type="button" id="c4-reset">New Game</button></div></div>', 360, 420);
    setTimeout(function () {
      var ROWS = 6, COLS = 7, board, turn, over;
      function init() {
        board = Array.from({ length: ROWS }, function () { return Array(COLS).fill(0); });
        turn = 1; over = false;
        win.el.querySelector('#c4-status').textContent = "Red's turn";
        render();
      }
      function render() {
        var el = win.el.querySelector('#c4-board'); el.innerHTML = '';
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          (function (r, c) {
            var btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'c4-cell' + (board[r][c] === 1 ? ' p1' : board[r][c] === 2 ? ' p2' : '');
            btn.addEventListener('click', function () { drop(c); });
            el.appendChild(btn);
          })(r, c);
        }
      }
      function drop(c) {
        if (over) return;
        var r = -1;
        for (var i = ROWS - 1; i >= 0; i--) if (!board[i][c]) { r = i; break; }
        if (r < 0) return;
        board[r][c] = turn;
        if (checkWin(r, c, turn)) {
          over = true;
          win.el.querySelector('#c4-status').textContent = (turn === 1 ? 'Red' : 'Yellow') + ' wins!';
          sfx('success'); showToast('Connect Four: winner!');
        } else if (board.every(function (row) { return row.every(function (x) { return x; }); })) {
          over = true; win.el.querySelector('#c4-status').textContent = 'Draw!';
        } else {
          turn = turn === 1 ? 2 : 1;
          win.el.querySelector('#c4-status').textContent = (turn === 1 ? 'Red' : 'Yellow') + "'s turn";
        }
        render();
      }
      function checkWin(r, c, p) {
        function count(dr, dc) {
          var n = 0, rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc] === p) { n++; rr += dr; cc += dc; }
          return n;
        }
        return [[0,1],[1,0],[1,1],[1,-1]].some(function (d) {
          return 1 + count(d[0], d[1]) + count(-d[0], -d[1]) >= 4;
        });
      }
      win.el.querySelector('#c4-reset').addEventListener('click', init);
      init();
    }, 50);
  }

  var CMD_ITEMS = [
    { id: 'browser', icon: '🌐', label: 'Proxy Browser', type: 'app' },
    { id: 'music', icon: '🎵', label: 'Music Player', type: 'app' },
    { id: 'games', icon: '🎮', label: 'Games Arcade', type: 'app' },
    { id: 'terminal', icon: '💻', label: 'Terminal', type: 'app' },
    { id: 'notepad', icon: '📝', label: 'Notepad', type: 'app' },
    { id: 'calculator', icon: '🧮', label: 'Calculator', type: 'app' },
    { id: 'paint', icon: '🎨', label: 'Paint', type: 'app' },
    { id: 'files', icon: '📁', label: 'File Explorer', type: 'app' },
    { id: 'stickies', icon: '📌', label: 'Sticky Notes', type: 'app' },
    { id: 'taskmgr', icon: '📊', label: 'Task Manager', type: 'app' },
    { id: 'weather', icon: '🌤️', label: 'Weather', type: 'app' },
    { id: 'video', icon: '📽️', label: 'Video Player', type: 'app' },
    { id: 'todo', icon: '📋', label: 'To-Do Board', type: 'app' },
    { id: 'markdown', icon: '📄', label: 'Markdown Editor', type: 'app' },
    { id: 'settings', icon: '⚙️', label: 'Settings', type: 'app' },
    { id: 'about', icon: 'ℹ️', label: 'About OrbitOS', type: 'app' },
    { id: 'snake', icon: '🐍', label: 'Play Snake', type: 'game', fn: function () { openSnake(); } },
    { id: 'mines', icon: '💣', label: 'Play Minesweeper', type: 'game', fn: function () { openMines(); } },
    { id: 'pong', icon: '🏓', label: 'Play Pong', type: 'game', fn: function () { openPong(); } },
    { id: 'c4', icon: '🔴', label: 'Play Connect Four', type: 'game', fn: function () { openConnectFour(); } },
    { id: 'solitaire', icon: '🃏', label: 'Play Solitaire', type: 'game', fn: function () { openSolitaire(); } },
    { id: 'sticky', icon: '📌', label: 'Add desktop sticky', type: 'action', fn: function () { addFloatSticky(); } },
    { id: 'run', icon: '▷', label: 'Run dialog', type: 'action', fn: function () { openRunDialog(); } },
    { id: 'lock', icon: '🔒', label: 'Lock screen', type: 'action', fn: function () { lockScreen(); } },
    { id: 'fullscreen', icon: '⛶', label: 'Toggle fullscreen', type: 'action', fn: function () { toggleFullscreen(); } },
    { id: 'screensaver', icon: '✨', label: 'Start screensaver', type: 'action', fn: function () { startScreensaver(); } },
    { id: 'mute', icon: '🔇', label: 'Toggle mute', type: 'action', fn: function () { toggleMute(); } }
  ];

  function openCommandPalette() {
    document.getElementById('cmd-palette').classList.remove('hidden');
    var input = document.getElementById('cmd-input');
    input.value = '';
    cmdIndex = 0;
    filterCommands('');
    setTimeout(function () { input.focus(); }, 30);
  }
  function closeCommandPalette() {
    document.getElementById('cmd-palette').classList.add('hidden');
  }
  function filterCommands(q) {
    q = (q || '').toLowerCase().trim();
    cmdList = CMD_ITEMS.filter(function (c) {
      return !q || c.label.toLowerCase().indexOf(q) >= 0 || c.id.indexOf(q) >= 0;
    });
    cmdIndex = 0;
    renderCmdResults();
  }
  function renderCmdResults() {
    var box = document.getElementById('cmd-results');
    if (!cmdList.length) { box.innerHTML = '<div class="cmd-item" style="color:var(--text-dim)">No matches</div>'; return; }
    box.innerHTML = cmdList.map(function (c, i) {
      return '<div class="cmd-item' + (i === cmdIndex ? ' active' : '') + '" data-i="' + i + '">' +
        '<span class="cmd-ico">' + c.icon + '</span><span>' + c.label + '</span>' +
        '<span class="cmd-meta">' + c.type + '</span></div>';
    }).join('');
    box.querySelectorAll('.cmd-item').forEach(function (el) {
      el.addEventListener('click', function () {
        cmdIndex = +el.dataset.i; runCommand();
      });
    });
  }
  function runCommand() {
    var c = cmdList[cmdIndex];
    if (!c) return;
    closeCommandPalette();
    if (c.type === 'app') openApp(c.id);
    else if (c.fn) c.fn();
    sfx('open');
  }

  function lockScreen() {
    var ls = document.getElementById('lock-screen');
    ls.classList.remove('hidden');
    updateDesktopClock();
    sfx('click');
  }
  function unlockScreen() {
    document.getElementById('lock-screen').classList.add('hidden');
    resetIdle();
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }


  function openSolitaire() {
    const win = createWindow('solitaire-game', 'Solitaire', '🃏',
      '<div class="sol-body"><div class="game-btn-row"><button type="button" id="sol-new">New Game</button><span id="sol-msg" style="font-size:0.8rem;color:var(--text-dim)"></span></div>' +
      '<div class="sol-row" id="sol-top"></div><div class="sol-row" id="sol-tab"></div></div>', 700, 480);
    setTimeout(function () {
      var suits = ['♠','♥','♦','♣'], ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
      var deck, waste, foundations, tableau, selected = null;
      function makeDeck() {
        var d = [];
        suits.forEach(function (s) {
          ranks.forEach(function (r, i) {
            d.push({ suit: s, rank: r, val: i + 1, red: s === '♥' || s === '♦', face: false, id: s + r });
          });
        });
        for (var i = d.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = d[i]; d[i] = d[j]; d[j] = t;
        }
        return d;
      }
      function deal() {
        deck = makeDeck(); waste = []; foundations = [[], [], [], []]; tableau = [[], [], [], [], [], [], []];
        selected = null;
        for (var c = 0; c < 7; c++) {
          for (var n = 0; n <= c; n++) {
            var card = deck.pop();
            card.face = n === c;
            tableau[c].push(card);
          }
        }
        win.el.querySelector('#sol-msg').textContent = 'Click stock · stack red/black · K on empty';
        render();
      }
      function cardEl(card, face) {
        var d = document.createElement('div');
        d.className = 'sol-card' + (card.red ? ' red' : '') + (!face ? ' face-down' : '');
        d.dataset.id = card.id;
        if (face) d.innerHTML = '<span>' + card.rank + card.suit + '</span><span style="align-self:flex-end">' + card.suit + '</span>';
        return d;
      }
      function render() {
        var top = win.el.querySelector('#sol-top'); top.innerHTML = '';
        var stock = document.createElement('div'); stock.className = 'sol-pile';
        if (deck.length) {
          var back = document.createElement('div'); back.className = 'sol-card face-down';
          back.addEventListener('click', function () {
            if (!deck.length) {
              deck = waste.reverse().map(function (c) { c.face = false; return c; });
              waste = [];
            } else {
              var c = deck.pop(); c.face = true; waste.push(c);
            }
            selected = null; render();
          });
          stock.appendChild(back);
        } else {
          stock.style.borderStyle = 'dashed';
          stock.addEventListener('click', function () {
            deck = waste.reverse().map(function (c) { c.face = false; return c; });
            waste = []; selected = null; render();
          });
        }
        top.appendChild(stock);
        var wastePile = document.createElement('div'); wastePile.className = 'sol-pile';
        if (waste.length) {
          var w = cardEl(waste[waste.length - 1], true);
          w.addEventListener('click', function () { pick('waste', waste.length - 1); });
          wastePile.appendChild(w);
        }
        top.appendChild(wastePile);
        for (var f = 0; f < 4; f++) {
          (function (f) {
            var pile = document.createElement('div'); pile.className = 'sol-pile';
            if (foundations[f].length) pile.appendChild(cardEl(foundations[f][foundations[f].length - 1], true));
            pile.addEventListener('click', function () { dropFoundation(f); });
            top.appendChild(pile);
          })(f);
        }
        var tab = win.el.querySelector('#sol-tab'); tab.innerHTML = '';
        tableau.forEach(function (col, ci) {
          var pile = document.createElement('div');
          pile.className = 'sol-pile sol-tableau';
          pile.style.height = (100 + Math.max(0, col.length - 1) * 22) + 'px';
          if (!col.length) {
            pile.addEventListener('click', function () { dropTableau(ci); });
          }
          col.forEach(function (card, ri) {
            var el = cardEl(card, card.face);
            el.style.top = (ri * 22) + 'px';
            el.style.zIndex = ri;
            if (card.face) {
              el.addEventListener('click', function (e) {
                e.stopPropagation();
                if (selected && selected.kind === 'tab' && selected.ci === ci) {
                  selected = null; render(); return;
                }
                pick('tab', ri, ci);
              });
            }
            pile.appendChild(el);
          });
          pile.addEventListener('click', function () { if (col.length) dropTableau(ci); });
          tab.appendChild(pile);
        });
        checkWin();
      }
      function pick(kind, idx, ci) {
        if (kind === 'waste') selected = { kind: 'waste' };
        else selected = { kind: 'tab', ci: ci, ri: idx };
        sfx('click');
      }
      function takeSelected() {
        if (!selected) return null;
        if (selected.kind === 'waste') {
          if (!waste.length) return null;
          return [waste[waste.length - 1]];
        }
        return tableau[selected.ci].slice(selected.ri);
      }
      function removeSelected() {
        if (!selected) return;
        if (selected.kind === 'waste') waste.pop();
        else {
          tableau[selected.ci] = tableau[selected.ci].slice(0, selected.ri);
          var col = tableau[selected.ci];
          if (col.length && !col[col.length - 1].face) col[col.length - 1].face = true;
        }
        selected = null;
      }
      function canStack(moving, target) {
        if (!target) return moving[0].val === 13;
        return moving[0].red !== target.red && moving[0].val === target.val - 1;
      }
      function dropTableau(ci) {
        var mov = takeSelected();
        if (!mov) return;
        var target = tableau[ci].length ? tableau[ci][tableau[ci].length - 1] : null;
        if (!canStack(mov, target)) return;
        removeSelected();
        tableau[ci] = tableau[ci].concat(mov);
        render();
      }
      function dropFoundation(f) {
        var mov = takeSelected();
        if (!mov || mov.length !== 1) return;
        var card = mov[0];
        var pile = foundations[f];
        if (!pile.length) {
          if (card.val !== 1) return;
        } else {
          var top = pile[pile.length - 1];
          if (top.suit !== card.suit || card.val !== top.val + 1) return;
        }
        removeSelected();
        foundations[f].push(card);
        render(); sfx('success');
      }
      function checkWin() {
        if (foundations.every(function (p) { return p.length === 13; })) {
          win.el.querySelector('#sol-msg').textContent = 'You win!';
          showToast('Solitaire: You win!'); sfx('success');
        }
      }
      win.el.querySelector('#sol-new').addEventListener('click', deal);
      deal();
    }, 50);
  }

  var clipHistory = [];
  function pushClip(text) {
    if (!text || !String(text).trim()) return;
    text = String(text).slice(0, 500);
    clipHistory = clipHistory.filter(function (c) { return c !== text; });
    clipHistory.unshift(text);
    if (clipHistory.length > 20) clipHistory.pop();
    renderClip();
  }
  function renderClip() {
    var list = document.getElementById('clip-list');
    if (!list) return;
    if (!clipHistory.length) { list.innerHTML = '<div class="clip-empty">Copy text in Notepad or elsewhere — history stays in this session</div>'; return; }
    list.innerHTML = clipHistory.map(function (t, i) {
      return '<div class="clip-item" data-i="' + i + '">' + t.replace(/</g, '&lt;').slice(0, 120) + (t.length > 120 ? '…' : '') + '</div>';
    }).join('');
    list.querySelectorAll('.clip-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var t = clipHistory[+el.dataset.i];
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
        showToast('Copied to clipboard'); sfx('click');
      });
    });
  }

  function addFloatSticky(opts) {
    opts = opts || {};
    var notes = store.floatStickies || [];
    var note = {
      id: opts.id || Date.now(),
      text: opts.text || '',
      color: opts.color || 'yellow',
      left: opts.left != null ? opts.left : (80 + Math.random() * 200),
      top: opts.top != null ? opts.top : (80 + Math.random() * 150)
    };
    if (!opts.id) { notes.push(note); saveStore({ floatStickies: notes }); store = loadStore(); }
    var el = document.createElement('div');
    el.className = 'float-sticky' + (note.color !== 'yellow' ? ' ' + note.color : '');
    el.style.left = note.left + 'px'; el.style.top = note.top + 'px';
    el.dataset.id = note.id;
    el.innerHTML = '<button type="button" class="fs-close">✕</button><textarea placeholder="Sticky…">' + (note.text || '') + '</textarea>';
    document.getElementById('float-stickies').appendChild(el);
    var ta = el.querySelector('textarea');
    ta.addEventListener('input', function () {
      var all = store.floatStickies || [];
      var n = all.find(function (x) { return x.id === note.id; });
      if (n) { n.text = ta.value; saveStore({ floatStickies: all }); store = loadStore(); }
    });
    el.querySelector('.fs-close').addEventListener('click', function () {
      el.remove();
      var all = (store.floatStickies || []).filter(function (x) { return x.id !== note.id; });
      saveStore({ floatStickies: all }); store = loadStore();
    });
    // drag
    var dragging = false, ox = 0, oy = 0;
    el.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
      dragging = true; ox = e.clientX - el.offsetLeft; oy = e.clientY - el.offsetTop; e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      el.style.left = (e.clientX - ox) + 'px'; el.style.top = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      var all = store.floatStickies || [];
      var n = all.find(function (x) { return x.id === note.id; });
      if (n) {
        n.left = parseInt(el.style.left, 10) || 0;
        n.top = parseInt(el.style.top, 10) || 0;
        saveStore({ floatStickies: all }); store = loadStore();
      }
    });
  }
  function restoreFloatStickies() {
    (store.floatStickies || []).forEach(function (n) { addFloatSticky(n); });
  }

    function setupIconDrag() {
    /* Desktop icons are fixed — drag disabled */
  }

  function setupUI() {
    document.querySelectorAll('.desktop-icon').forEach(function (icon) {
      icon.addEventListener('dblclick', function () { openApp(icon.dataset.app); });
      icon.addEventListener('click', function () {
        document.querySelectorAll('.desktop-icon').forEach(function (i) { i.classList.remove('selected'); });
        icon.classList.add('selected');
      });
    });
    document.querySelectorAll('.start-app').forEach(function (item) {
      item.addEventListener('click', function () { openApp(item.dataset.app); closeStartMenu(); sfx('click'); });
    });
    const startBtn = document.getElementById('start-btn');
    const startMenu = document.getElementById('start-menu');
    startBtn.addEventListener('click', function (e) {
      e.stopPropagation(); startMenu.classList.toggle('hidden'); startBtn.classList.toggle('active'); sfx('click');
    });
    document.getElementById('power-btn').addEventListener('click', function () { closeStartMenu(); shutdown(); });
    document.getElementById('reboot-btn').addEventListener('click', function () { location.reload(); });
    function closeStartMenu() { startMenu.classList.add('hidden'); startBtn.classList.remove('active'); }
    document.addEventListener('click', function (e) {
      if (!startMenu.contains(e.target) && e.target !== startBtn && !startBtn.contains(e.target)) closeStartMenu();
      if (!document.getElementById('calendar-popup').contains(e.target) && e.target !== document.getElementById('clock')) {
        document.getElementById('calendar-popup').classList.add('hidden');
      }
    });
    const ctx = document.getElementById('context-menu');
    document.getElementById('desktop').addEventListener('contextmenu', function (e) {
      if (e.target.closest('.window') || e.target.closest('#taskbar') || e.target.closest('#start-menu') || e.target.closest('#tips-overlay')) return;
      e.preventDefault();
      ctx.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      ctx.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
      ctx.classList.remove('hidden');
    });
    document.addEventListener('click', function () { ctx.classList.add('hidden'); });
    ctx.querySelectorAll('.ctx-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var a = item.dataset.action;
        if (a === 'refresh') showToast('Desktop refreshed');
        else if (a === 'wallpaper') { wallpaperIndex = (wallpaperIndex + 1) % 5; applyWallpaper(); showToast('Wallpaper changed'); }
        else if (a === 'tips') document.getElementById('tips-overlay').classList.remove('hidden');
        else if (a === 'about') openApp('about');
        ctx.classList.add('hidden'); sfx('click');
      });
    });
    document.getElementById('tips-dismiss').addEventListener('click', function () {
      document.getElementById('tips-overlay').classList.add('hidden');
      saveStore({ tipsSeen: true }); store = loadStore(); sfx('click');
    });
    document.getElementById('volume-icon').addEventListener('click', toggleMute);
    document.getElementById('clock').addEventListener('click', function (e) {
      e.stopPropagation();
      var pop = document.getElementById('calendar-popup');
      pop.classList.toggle('hidden');
      if (!pop.classList.contains('hidden')) renderCalendar();
      sfx('click');
    });
    document.getElementById('cal-prev').addEventListener('click', function (e) {
      e.stopPropagation(); calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', function (e) {
      e.stopPropagation(); calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar();
    });

    // Start search
    var searchInput = document.getElementById('start-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var q = searchInput.value.toLowerCase().trim();
        document.querySelectorAll('#start-apps .start-app').forEach(function (app) {
          var name = (app.dataset.name || app.textContent).toLowerCase();
          app.style.display = !q || name.indexOf(q) >= 0 ? '' : 'none';
        });
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var visible = Array.prototype.slice.call(document.querySelectorAll('#start-apps .start-app')).filter(function (a) {
            return a.style.display !== 'none';
          });
          if (visible[0]) { openApp(visible[0].dataset.app); closeStartMenu(); searchInput.value = ''; }
        }
      });
    }

    // Run dialog
    var runBtn = document.getElementById('run-btn');
    if (runBtn) runBtn.addEventListener('click', function () { closeStartMenu(); openRunDialog(); });
    document.getElementById('run-ok').addEventListener('click', function () {
      executeRun(document.getElementById('run-input').value);
    });
    document.getElementById('run-cancel').addEventListener('click', closeRunDialog);
    document.getElementById('run-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') executeRun(e.target.value);
      if (e.key === 'Escape') closeRunDialog();
    });
    document.getElementById('run-dialog').addEventListener('click', function (e) {
      if (e.target.id === 'run-dialog') closeRunDialog();
    });

    // Notifications
    document.getElementById('notif-icon').addEventListener('click', function (e) {
      e.stopPropagation();
      var panel = document.getElementById('notif-panel');
      panel.classList.toggle('hidden');
      document.getElementById('calendar-popup').classList.add('hidden');
      renderNotifs(); sfx('click');
    });
    document.getElementById('notif-clear').addEventListener('click', function (e) {
      e.stopPropagation(); notifHistory.length = 0; renderNotifs();
    });
    document.addEventListener('click', function (e) {
      var panel = document.getElementById('notif-panel');
      if (panel && !panel.contains(e.target) && e.target.id !== 'notif-icon') panel.classList.add('hidden');
    });

    // Context: run + screensaver
    // (handled via existing ctx items if data-action present)
    document.getElementById('context-menu').addEventListener('click', function (e) {
      var item = e.target.closest('.ctx-item');
      if (!item) return;
      var a = item.dataset.action;
      if (a === 'run') openRunDialog();
      if (a === 'screensaver') startScreensaver();
    });

    // Screensaver idle + dismiss
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (!document.getElementById('screensaver').classList.contains('hidden')) {
          if (ev !== 'mousemove' || true) stopScreensaver();
        } else {
          resetIdle();
        }
      }, { passive: true });
    });
    // Avoid instant dismiss on the mousemove that doesn't matter - use separate dismiss
    document.getElementById('screensaver').addEventListener('click', stopScreensaver);
    document.getElementById('screensaver').addEventListener('keydown', stopScreensaver);
    resetIdle();

    // Command palette
    document.getElementById('cmd-input').addEventListener('input', function (e) { filterCommands(e.target.value); });
    document.getElementById('cmd-input').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdIndex = Math.min(cmdList.length - 1, cmdIndex + 1); renderCmdResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdIndex = Math.max(0, cmdIndex - 1); renderCmdResults(); }
      else if (e.key === 'Enter') { e.preventDefault(); runCommand(); }
      else if (e.key === 'Escape') closeCommandPalette();
    });
    document.getElementById('cmd-palette').addEventListener('click', function (e) {
      if (e.target.id === 'cmd-palette') closeCommandPalette();
    });

    // Lock / fullscreen
    document.getElementById('lock-icon').addEventListener('click', lockScreen);
    document.getElementById('lock-unlock').addEventListener('click', unlockScreen);
    document.getElementById('lock-screen').addEventListener('click', function (e) {
      if (e.target.id === 'lock-unlock' || e.target.closest('.lock-inner')) {
        if (e.target.id === 'lock-unlock' || e.target.tagName === 'BUTTON') return;
      }
      unlockScreen();
    });
    document.getElementById('lock-screen').addEventListener('keydown', unlockScreen);
    document.addEventListener('keydown', function (e) {
      if (!document.getElementById('lock-screen').classList.contains('hidden')) unlockScreen();
    });
    document.getElementById('fs-icon').addEventListener('click', toggleFullscreen);

    document.getElementById('context-menu').addEventListener('click', function (e) {
      var item = e.target.closest('.ctx-item');
      if (!item) return;
      if (item.dataset.action === 'lock') lockScreen();
      if (item.dataset.action === 'fullscreen') toggleFullscreen();
    });

    // Clipboard history
    document.addEventListener('copy', function () {
      setTimeout(function () {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(pushClip).catch(function () {});
        }
      }, 50);
    });
    document.addEventListener('cut', function () {
      setTimeout(function () {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(pushClip).catch(function () {});
        }
      }, 50);
    });
    // Capture from notepad/textarea selection on Ctrl+C fallback
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        var sel = window.getSelection && String(window.getSelection());
        if (sel) pushClip(sel);
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
          var t = e.target;
          if (t.selectionStart != null && t.selectionEnd > t.selectionStart) {
            pushClip(t.value.slice(t.selectionStart, t.selectionEnd));
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        document.getElementById('clip-panel').classList.toggle('hidden');
        renderClip();
      }
    });
    var clipIcon = document.getElementById('clip-icon');
    if (clipIcon) clipIcon.addEventListener('click', function (e) {
      e.stopPropagation();
      document.getElementById('clip-panel').classList.toggle('hidden');
      document.getElementById('notif-panel').classList.add('hidden');
      renderClip(); sfx('click');
    });
    var clipClear = document.getElementById('clip-clear');
    if (clipClear) clipClear.addEventListener('click', function (e) {
      e.stopPropagation(); clipHistory = []; renderClip();
    });
    document.addEventListener('click', function (e) {
      var panel = document.getElementById('clip-panel');
      if (panel && !panel.contains(e.target) && e.target.id !== 'clip-icon') panel.classList.add('hidden');
    });
  }

  boot();
  setupUI();
})();
