/* ===== OrbitOS — Full Desktop Environment Script ===== */

(function () {
  'use strict';

  // ---------- State ----------
  let windows = [];
  let zIndexCounter = 100;
  let activeWindowId = null;
  let wallpaperIndex = 0;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let dragWindow = null;
  let isResizing = false;
  let resizeWindow = null;

  // ---------- Boot Sequence ----------
  const bootMessages = [
    'Loading core modules...',
    'Initializing window manager...',
    'Mounting virtual filesystem...',
    'Starting audio subsystem...',
    'Loading game engines...',
    'Configuring network stack...',
    'Preparing desktop environment...',
    'Welcome to OrbitOS'
  ];

  function boot() {
    const bar = document.getElementById('boot-bar');
    const status = document.getElementById('boot-status');
    let progress = 0;
    let msgIndex = 0;

    const interval = setInterval(() => {
      progress += Math.random() * 18 + 8;
      if (progress > 100) progress = 100;
      bar.style.width = progress + '%';

      if (msgIndex < bootMessages.length - 1 && progress > (msgIndex + 1) * 12) {
        msgIndex++;
        status.textContent = bootMessages[msgIndex];
      }

      if (progress >= 100) {
        clearInterval(interval);
        status.textContent = bootMessages[bootMessages.length - 1];
        setTimeout(() => {
          document.getElementById('boot-screen').classList.add('fade-out');
          document.getElementById('desktop').classList.remove('hidden');
          setTimeout(() => {
            document.getElementById('boot-screen').classList.add('hidden');
          }, 600);
          updateClock();
          setInterval(updateClock, 1000);
          showToast('Welcome to OrbitOS 🚀');
        }, 400);
      }
    }, 180);
  }

  // ---------- Clock ----------
  function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    document.getElementById('clock').textContent = `${time}  ${date}`;
  }

  // ---------- Toast ----------
  function showToast(msg, duration = 2800) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
  }

  // ---------- Window Manager ----------
  function createWindow(appId, title, icon, contentHTML, width = 640, height = 480) {
    const existing = windows.find(w => w.appId === appId && !w.closed);
    if (existing) {
      focusWindow(existing.id);
      if (existing.minimized) {
        existing.minimized = false;
        existing.el.classList.remove('minimized');
        updateTaskbar();
      }
      return existing;
    }

    const id = 'win-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const el = document.createElement('div');
    el.className = 'window';
    el.id = id;
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.style.left = Math.max(40, (window.innerWidth - width) / 2 + (windows.length % 5) * 30) + 'px';
    el.style.top = Math.max(20, 60 + (windows.length % 5) * 30) + 'px';
    el.style.zIndex = ++zIndexCounter;

    el.innerHTML = `
      <div class="window-titlebar" data-win="${id}">
        <span class="window-icon">${icon}</span>
        <span class="window-title">${title}</span>
        <div class="window-controls">
          <button class="win-btn minimize" data-action="minimize" title="Minimize">─</button>
          <button class="win-btn maximize" data-action="maximize" title="Maximize">☐</button>
          <button class="win-btn close" data-action="close" title="Close">✕</button>
        </div>
      </div>
      <div class="window-content">${contentHTML}</div>
      <div class="window-resize" data-win="${id}"></div>
    `;

    document.getElementById('windows-container').appendChild(el);

    const win = {
      id, appId, title, icon, el,
      minimized: false, maximized: false,
      prevRect: null, closed: false
    };
    windows.push(win);
    activeWindowId = id;
    updateTaskbar();
    bindWindowEvents(win);
    return win;
  }

  function bindWindowEvents(win) {
    const titlebar = win.el.querySelector('.window-titlebar');
    const resizeHandle = win.el.querySelector('.window-resize');

    // Controls
    win.el.querySelectorAll('.win-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'close') closeWindow(win.id);
        else if (action === 'minimize') minimizeWindow(win.id);
        else if (action === 'maximize') toggleMaximize(win.id);
      });
    });

    // Focus on click
    win.el.addEventListener('mousedown', () => focusWindow(win.id));

    // Drag
    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.win-btn') || win.maximized) return;
      isDragging = true;
      dragWindow = win;
      const rect = win.el.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      focusWindow(win.id);
    });

    // Resize
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (win.maximized) return;
      isResizing = true;
      resizeWindow = win;
      focusWindow(win.id);
    });
  }

  function focusWindow(id) {
    const win = windows.find(w => w.id === id);
    if (!win || win.closed) return;
    win.el.style.zIndex = ++zIndexCounter;
    activeWindowId = id;
    updateTaskbar();
  }

  function closeWindow(id) {
    const win = windows.find(w => w.id === id);
    if (!win) return;
    win.closed = true;
    win.el.remove();
    windows = windows.filter(w => w.id !== id);
    if (activeWindowId === id) activeWindowId = null;
    updateTaskbar();
  }

  function minimizeWindow(id) {
    const win = windows.find(w => w.id === id);
    if (!win) return;
    win.minimized = true;
    win.el.classList.add('minimized');
    updateTaskbar();
  }

  function toggleMaximize(id) {
    const win = windows.find(w => w.id === id);
    if (!win) return;
    if (win.maximized) {
      win.maximized = false;
      win.el.classList.remove('maximized');
      if (win.prevRect) {
        win.el.style.left = win.prevRect.left;
        win.el.style.top = win.prevRect.top;
        win.el.style.width = win.prevRect.width;
        win.el.style.height = win.prevRect.height;
      }
    } else {
      win.prevRect = {
        left: win.el.style.left,
        top: win.el.style.top,
        width: win.el.style.width,
        height: win.el.style.height
      };
      win.maximized = true;
      win.el.classList.add('maximized');
    }
  }

  function updateTaskbar() {
    const container = document.getElementById('taskbar-apps');
    container.innerHTML = '';
    windows.filter(w => !w.closed).forEach(win => {
      const btn = document.createElement('button');
      btn.className = 'taskbar-item' + (win.id === activeWindowId && !win.minimized ? ' active' : '');
      btn.innerHTML = `<span class="icon">${win.icon}</span> ${win.title}`;
      btn.addEventListener('click', () => {
        if (win.minimized) {
          win.minimized = false;
          win.el.classList.remove('minimized');
        }
        focusWindow(win.id);
      });
      container.appendChild(btn);
    });
  }

  // Global mouse move / up for drag & resize
  document.addEventListener('mousemove', (e) => {
    if (isDragging && dragWindow) {
      const x = e.clientX - dragOffset.x;
      const y = Math.max(0, e.clientY - dragOffset.y);
      dragWindow.el.style.left = Math.max(-dragWindow.el.offsetWidth + 100, Math.min(x, window.innerWidth - 100)) + 'px';
      dragWindow.el.style.top = Math.min(y, window.innerHeight - 80) + 'px';
    }
    if (isResizing && resizeWindow) {
      const rect = resizeWindow.el.getBoundingClientRect();
      const newW = Math.max(320, e.clientX - rect.left);
      const newH = Math.max(200, e.clientY - rect.top);
      resizeWindow.el.style.width = newW + 'px';
      resizeWindow.el.style.height = newH + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    dragWindow = null;
    isResizing = false;
    resizeWindow = null;
  });

  // ---------- Apps ----------
  const apps = {
    browser: {
      title: 'Proxy Browser',
      icon: '🌐',
      width: 800,
      height: 560,
      content: () => `
        <div style="display:flex;flex-direction:column;height:100%">
          <div class="browser-toolbar">
            <button id="br-back" title="Back">←</button>
            <button id="br-fwd" title="Forward">→</button>
            <button id="br-reload" title="Reload">↻</button>
            <input class="browser-url" id="br-url" type="text" placeholder="Enter URL or search..." value="https://example.com">
            <button id="br-go" title="Go">Go</button>
          </div>
          <div class="browser-frame-wrap" id="br-frame-wrap">
            <div class="browser-notice" id="br-notice">
              <h3>🌐 Orbit Proxy Browser</h3>
              <p>Due to browser security (CORS / X-Frame-Options), many sites cannot be embedded. Use the quick links below or try sites that allow framing.</p>
              <p style="font-size:0.8rem;opacity:0.7">Tip: For full browsing, the URL will open in a new tab as fallback.</p>
              <div class="quick-links">
                <button data-url="https://example.com">Example.com</button>
                <button data-url="https://en.wikipedia.org/wiki/Main_Page">Wikipedia</button>
                <button data-url="https://archive.org">Internet Archive</button>
                <button data-url="https://news.ycombinator.com">Hacker News</button>
                <button data-url="https://www.wikipedia.org">Wikipedia.org</button>
              </div>
            </div>
            <iframe id="br-iframe" style="display:none" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
          </div>
        </div>
      `,
      init: (win) => {
        const urlInput = win.el.querySelector('#br-url');
        const iframe = win.el.querySelector('#br-iframe');
        const notice = win.el.querySelector('#br-notice');
        const go = () => {
          let url = urlInput.value.trim();
          if (!url) return;
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          urlInput.value = url;
          // Try embedding; many will fail silently due to XFO
          notice.style.display = 'none';
          iframe.style.display = 'block';
          iframe.src = url;
          // Also offer open in new tab
          showToast('Loading... (some sites block embedding)');
        };
        win.el.querySelector('#br-go').addEventListener('click', go);
        urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        win.el.querySelector('#br-reload').addEventListener('click', () => {
          if (iframe.src) iframe.src = iframe.src;
        });
        win.el.querySelectorAll('.quick-links button').forEach(btn => {
          btn.addEventListener('click', () => {
            urlInput.value = btn.dataset.url;
            go();
          });
        });
        // Fallback: double-click URL or special open
        win.el.querySelector('#br-back').addEventListener('click', () => history.back());
        win.el.querySelector('#br-fwd').addEventListener('click', () => history.forward());
      }
    },

    music: {
      title: 'Music Player',
      icon: '🎵',
      width: 420,
      height: 580,
      content: () => `
        <div class="music-player">
          <div class="music-art" id="music-art">🎵</div>
          <div class="music-info">
            <h3 id="music-title">Select a track</h3>
            <p id="music-artist">OrbitOS Radio</p>
          </div>
          <div class="music-progress-wrap">
            <span id="music-cur">0:00</span>
            <div class="music-progress" id="music-progress">
              <div class="music-progress-bar" id="music-bar"></div>
            </div>
            <span id="music-dur">0:00</span>
          </div>
          <div class="music-controls">
            <button id="music-prev" title="Previous">⏮</button>
            <button class="play-btn" id="music-play" title="Play/Pause">▶</button>
            <button id="music-next" title="Next">⏭</button>
          </div>
          <div class="music-playlist" id="music-playlist"></div>
        </div>
      `,
      init: (win) => {
        // Free / public domain friendly tracks (Internet Archive / open sources)
        // Using short demo tones + real free tracks where possible
        const tracks = [
          { title: 'Ambient Horizon', artist: 'OrbitOS Ambient', duration: '2:30', src: null, emoji: '🌌' },
          { title: 'Digital Pulse', artist: 'Synth Wave', duration: '1:45', src: null, emoji: '💫' },
          { title: 'Cosmic Drift', artist: 'Space Lounge', duration: '3:10', src: null, emoji: '🪐' },
          { title: 'Neon Nights', artist: 'Retrowave', duration: '2:15', src: null, emoji: '🌆' },
          { title: 'Quantum Beat', artist: 'Electronica', duration: '1:55', src: null, emoji: '⚛️' },
          { title: 'Starlight', artist: 'Chillhop', duration: '2:40', src: null, emoji: '✨' }
        ];

        // Web Audio generated tones as fallback (no external deps)
        let audioCtx = null;
        let currentOsc = null;
        let currentGain = null;
        let isPlaying = false;
        let currentIndex = -1;
        let animFrame = null;
        let startTime = 0;
        let trackDuration = 120; // default seconds for generated

        const playlistEl = win.el.querySelector('#music-playlist');
        tracks.forEach((t, i) => {
          const item = document.createElement('div');
          item.className = 'playlist-item';
          item.innerHTML = `<span class="num">${i + 1}</span><span class="track-name">${t.emoji} ${t.title}</span><span class="track-dur">${t.duration}</span>`;
          item.addEventListener('click', () => playTrack(i));
          playlistEl.appendChild(item);
        });

        function formatTime(s) {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        }

        function stopAudio() {
          if (currentOsc) {
            try { currentOsc.stop(); } catch (_) {}
            currentOsc = null;
          }
          if (currentGain) {
            try { currentGain.disconnect(); } catch (_) {}
            currentGain = null;
          }
          if (animFrame) cancelAnimationFrame(animFrame);
          isPlaying = false;
          win.el.querySelector('#music-play').textContent = '▶';
        }

        function playGenerated(index) {
          stopAudio();
          if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const freqs = [220, 277, 330, 370, 440, 554]; // different notes per track
          const baseFreq = freqs[index % freqs.length];
          trackDuration = 90 + (index * 15);

          currentGain = audioCtx.createGain();
          currentGain.gain.value = 0.08;
          currentGain.connect(audioCtx.destination);

          // Simple pleasant arpeggio / ambient pad
          currentOsc = audioCtx.createOscillator();
          currentOsc.type = index % 2 === 0 ? 'sine' : 'triangle';
          currentOsc.frequency.value = baseFreq;
          currentOsc.connect(currentGain);
          currentOsc.start();

          // LFO for movement
          const lfo = audioCtx.createOscillator();
          const lfoGain = audioCtx.createGain();
          lfo.frequency.value = 0.15 + index * 0.05;
          lfoGain.gain.value = 30;
          lfo.connect(lfoGain);
          lfoGain.connect(currentOsc.frequency);
          lfo.start();

          startTime = audioCtx.currentTime;
          isPlaying = true;
          win.el.querySelector('#music-play').textContent = '⏸';
          win.el.querySelector('#music-title').textContent = tracks[index].title;
          win.el.querySelector('#music-artist').textContent = tracks[index].artist;
          win.el.querySelector('#music-art').textContent = tracks[index].emoji;
          win.el.querySelector('#music-dur').textContent = formatTime(trackDuration);

          playlistEl.querySelectorAll('.playlist-item').forEach((el, i) => {
            el.classList.toggle('active', i === index);
          });

          function updateProgress() {
            if (!isPlaying) return;
            const elapsed = audioCtx.currentTime - startTime;
            if (elapsed >= trackDuration) {
              playTrack((index + 1) % tracks.length);
              return;
            }
            const pct = (elapsed / trackDuration) * 100;
            win.el.querySelector('#music-bar').style.width = pct + '%';
            win.el.querySelector('#music-cur').textContent = formatTime(elapsed);
            animFrame = requestAnimationFrame(updateProgress);
          }
          updateProgress();
        }

        function playTrack(index) {
          currentIndex = index;
          playGenerated(index);
        }

        win.el.querySelector('#music-play').addEventListener('click', () => {
          if (currentIndex < 0) {
            playTrack(0);
            return;
          }
          if (isPlaying) {
            stopAudio();
          } else {
            playTrack(currentIndex);
          }
        });

        win.el.querySelector('#music-prev').addEventListener('click', () => {
          if (currentIndex < 0) return;
          playTrack((currentIndex - 1 + tracks.length) % tracks.length);
        });
        win.el.querySelector('#music-next').addEventListener('click', () => {
          if (currentIndex < 0) playTrack(0);
          else playTrack((currentIndex + 1) % tracks.length);
        });

        win.el.querySelector('#music-progress').addEventListener('click', (e) => {
          // Seeking not fully supported for generated, but visual
        });
      }
    },

    games: {
      title: 'Games Arcade',
      icon: '🎮',
      width: 520,
      height: 420,
      content: () => `
        <div class="games-grid">
          <div class="game-card" data-game="snake">
            <div class="game-emoji">🐍</div>
            <h4>Snake</h4>
            <p>Classic snake game</p>
          </div>
          <div class="game-card" data-game="ttt">
            <div class="game-emoji">❌</div>
            <h4>Tic-Tac-Toe</h4>
            <p>Play vs AI or friend</p>
          </div>
          <div class="game-card" data-game="2048">
            <div class="game-emoji">🔢</div>
            <h4>2048</h4>
            <p>Merge the tiles</p>
          </div>
          <div class="game-card" data-game="memory">
            <div class="game-emoji">🧠</div>
            <h4>Memory</h4>
            <p>Match the pairs</p>
          </div>
        </div>
      `,
      init: (win) => {
        win.el.querySelectorAll('.game-card').forEach(card => {
          card.addEventListener('click', () => {
            const game = card.dataset.game;
            if (game === 'snake') openSnake();
            else if (game === 'ttt') openTTT();
            else if (game === '2048') open2048();
            else if (game === 'memory') openMemory();
          });
        });
      }
    },

    terminal: {
      title: 'Terminal',
      icon: '💻',
      width: 640,
      height: 420,
      content: () => `
        <div class="terminal-body" id="term-body">
          <div class="terminal-output" id="term-output">OrbitOS Terminal v1.0
Type "help" for available commands.

</div>
          <div class="terminal-input-line">
            <span class="terminal-prompt">orbit@github:~$</span>
            <input class="terminal-input" id="term-input" type="text" autofocus autocomplete="off" spellcheck="false">
          </div>
        </div>
      `,
      init: (win) => {
        const output = win.el.querySelector('#term-output');
        const input = win.el.querySelector('#term-input');
        const body = win.el.querySelector('#term-body');
        const history = [];
        let histIndex = -1;

        const commands = {
          help: () => `Available commands:
  help      - Show this help
  clear     - Clear the terminal
  date      - Show current date/time
  echo      - Echo text
  whoami    - Display user
  neofetch  - System info
  ls        - List virtual files
  cat       - Read a file
  uname     - System name
  fortune   - Random fortune
  matrix    - Enter the matrix...
  games     - Open Games Arcade
  about     - About OrbitOS`,
          clear: () => { output.textContent = ''; return null; },
          date: () => new Date().toString(),
          echo: (args) => args.join(' '),
          whoami: () => 'orbit-user',
          uname: () => 'OrbitOS 1.0.0 GitHub-Pages x86_64',
          neofetch: () => `
        .--.      orbit@github
       |o_o |     -----------
       |:_/ |     OS: OrbitOS 1.0
      //   \\ \\    Host: GitHub Pages
     (|     | )   Kernel: WebKit/Browser
    /'\\_   _/\`\\   Uptime: ${Math.floor(performance.now()/1000)}s
    \\___)=(___/   Shell: orbit-sh
                  Theme: Cyan Nebula
                  CPU: JavaScript V8
                  Memory: ∞ (virtual)`,
          ls: () => `Desktop/
Documents/
Games/
Music/
README.md
secret.txt`,
          cat: (args) => {
            if (args[0] === 'README.md') return 'Welcome to OrbitOS!\nA full desktop experience running in your browser.\nDeployed on GitHub Pages.';
            if (args[0] === 'secret.txt') return 'The cake is a lie. 🎂';
            return `cat: ${args[0] || ''}: No such file`;
          },
          fortune: () => {
            const fortunes = [
              ' cod is just a tool. Like a hammer.',
              'The best way to predict the future is to invent it.',
              'Stay hungry, stay foolish.',
              'There is no place like 127.0.0.1',
              'In space, no one can hear you scream... but they can read your commits.',
              'It works on my machine. 🤷'
            ];
            return fortunes[Math.floor(Math.random() * fortunes.length)];
          },
          matrix: () => {
            showToast('Wake up, Neo...');
            return 'Follow the white rabbit. 🐇';
          },
          games: () => { openApp('games'); return 'Opening Games Arcade...'; },
          about: () => { openApp('about'); return 'Opening About...'; }
        };

        function runCommand(line) {
          const parts = line.trim().split(/\s+/);
          const cmd = parts[0]?.toLowerCase();
          const args = parts.slice(1);
          if (!cmd) return;
          history.push(line);
          histIndex = history.length;
          let result;
          if (commands[cmd]) {
            result = commands[cmd](args);
          } else {
            result = `Command not found: ${cmd}. Type "help".`;
          }
          output.textContent += `orbit@github:~$ ${line}\n`;
          if (result !== null && result !== undefined) {
            output.textContent += result + '\n\n';
          }
          body.scrollTop = body.scrollHeight;
        }

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            runCommand(input.value);
            input.value = '';
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (histIndex > 0) {
              histIndex--;
              input.value = history[histIndex] || '';
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (histIndex < history.length - 1) {
              histIndex++;
              input.value = history[histIndex] || '';
            } else {
              histIndex = history.length;
              input.value = '';
            }
          }
        });

        // Focus input when clicking terminal
        body.addEventListener('click', () => input.focus());
      }
    },

    notepad: {
      title: 'Notepad',
      icon: '📝',
      width: 560,
      height: 420,
      content: () => `
        <div class="notepad-toolbar">
          <button id="np-new">New</button>
          <button id="np-save">Save</button>
          <button id="np-load">Load</button>
          <span style="flex:1"></span>
          <span id="np-status" style="font-size:0.75rem;color:var(--text-dim)"></span>
        </div>
        <textarea class="notepad-area" id="np-area" placeholder="Start typing..."></textarea>
      `,
      init: (win) => {
        const area = win.el.querySelector('#np-area');
        const status = win.el.querySelector('#np-status');
        // Load saved
        const saved = localStorage.getItem('orbitos-notepad');
        if (saved) area.value = saved;

        win.el.querySelector('#np-new').addEventListener('click', () => {
          if (area.value && !confirm('Clear current note?')) return;
          area.value = '';
          status.textContent = 'New document';
        });
        win.el.querySelector('#np-save').addEventListener('click', () => {
          localStorage.setItem('orbitos-notepad', area.value);
          status.textContent = 'Saved ✓';
          showToast('Note saved to localStorage');
        });
        win.el.querySelector('#np-load').addEventListener('click', () => {
          const data = localStorage.getItem('orbitos-notepad');
          if (data) {
            area.value = data;
            status.textContent = 'Loaded';
          } else {
            status.textContent = 'No saved note';
          }
        });
      }
    },

    calculator: {
      title: 'Calculator',
      icon: '🧮',
      width: 320,
      height: 460,
      content: () => `
        <div class="calc-body">
          <div class="calc-display" id="calc-display">0</div>
          <div class="calc-buttons">
            <button class="calc-btn clear" data-val="C">C</button>
            <button class="calc-btn op" data-val="±">±</button>
            <button class="calc-btn op" data-val="%">%</button>
            <button class="calc-btn op" data-val="/">÷</button>
            <button class="calc-btn" data-val="7">7</button>
            <button class="calc-btn" data-val="8">8</button>
            <button class="calc-btn" data-val="9">9</button>
            <button class="calc-btn op" data-val="*">×</button>
            <button class="calc-btn" data-val="4">4</button>
            <button class="calc-btn" data-val="5">5</button>
            <button class="calc-btn" data-val="6">6</button>
            <button class="calc-btn op" data-val="-">−</button>
            <button class="calc-btn" data-val="1">1</button>
            <button class="calc-btn" data-val="2">2</button>
            <button class="calc-btn" data-val="3">3</button>
            <button class="calc-btn op" data-val="+">+</button>
            <button class="calc-btn" data-val="0">0</button>
            <button class="calc-btn" data-val=".">.</button>
            <button class="calc-btn eq" data-val="=">=</button>
          </div>
        </div>
      `,
      init: (win) => {
        const display = win.el.querySelector('#calc-display');
        let current = '0';
        let previous = null;
        let operator = null;
        let resetNext = false;

        function update() {
          display.textContent = current;
        }

        win.el.querySelectorAll('.calc-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const val = btn.dataset.val;
            if (val >= '0' && val <= '9' || val === '.') {
              if (resetNext) { current = '0'; resetNext = false; }
              if (val === '.' && current.includes('.')) return;
              current = current === '0' && val !== '.' ? val : current + val;
            } else if (val === 'C') {
              current = '0'; previous = null; operator = null;
            } else if (val === '±') {
              current = String(-parseFloat(current));
            } else if (val === '%') {
              current = String(parseFloat(current) / 100);
            } else if (['+', '-', '*', '/'].includes(val)) {
              if (operator && previous !== null) {
                current = String(compute(previous, current, operator));
              }
              previous = current;
              operator = val;
              resetNext = true;
            } else if (val === '=') {
              if (operator && previous !== null) {
                current = String(compute(previous, current, operator));
                previous = null;
                operator = null;
                resetNext = true;
              }
            }
            update();
          });
        });

        function compute(a, b, op) {
          a = parseFloat(a); b = parseFloat(b);
          if (op === '+') return a + b;
          if (op === '-') return a - b;
          if (op === '*') return a * b;
          if (op === '/') return b !== 0 ? a / b : 'Error';
          return b;
        }
      }
    },

    paint: {
      title: 'Paint',
      icon: '🎨',
      width: 700,
      height: 500,
      content: () => `
        <div class="paint-toolbar">
          <button data-tool="brush" class="active">Brush</button>
          <button data-tool="eraser">Eraser</button>
          <label>Color <input type="color" id="paint-color" value="#00d4ff"></label>
          <label>Size <input type="range" id="paint-size" min="1" max="40" value="4"></label>
          <button id="paint-clear">Clear</button>
          <button id="paint-save">Save PNG</button>
        </div>
        <canvas id="paint-canvas"></canvas>
      `,
      init: (win) => {
        const canvas = win.el.querySelector('#paint-canvas');
        const ctx = canvas.getContext('2d');
        let drawing = false;
        let tool = 'brush';
        let color = '#00d4ff';
        let size = 4;

        function resizeCanvas() {
          const content = win.el.querySelector('.window-content');
          const toolbar = win.el.querySelector('.paint-toolbar');
          canvas.width = content.clientWidth;
          canvas.height = content.clientHeight - toolbar.offsetHeight;
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        resizeCanvas();

        win.el.querySelectorAll('[data-tool]').forEach(btn => {
          btn.addEventListener('click', () => {
            tool = btn.dataset.tool;
            win.el.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          });
        });
        win.el.querySelector('#paint-color').addEventListener('input', e => color = e.target.value);
        win.el.querySelector('#paint-size').addEventListener('input', e => size = +e.target.value);
        win.el.querySelector('#paint-clear').addEventListener('click', () => {
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        });
        win.el.querySelector('#paint-save').addEventListener('click', () => {
          const link = document.createElement('a');
          link.download = 'orbitos-paint.png';
          link.href = canvas.toDataURL();
          link.click();
          showToast('Image saved!');
        });

        function getPos(e) {
          const rect = canvas.getBoundingClientRect();
          return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        canvas.addEventListener('mousedown', (e) => {
          drawing = true;
          const pos = getPos(e);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
        });
        canvas.addEventListener('mousemove', (e) => {
          if (!drawing) return;
          const pos = getPos(e);
          ctx.lineWidth = size;
          ctx.lineCap = 'round';
          ctx.strokeStyle = tool === 'eraser' ? '#1a1a2e' : color;
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
        });
        canvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
        canvas.addEventListener('mouseleave', () => { drawing = false; });
      }
    },

    files: {
      title: 'File Explorer',
      icon: '📁',
      width: 600,
      height: 420,
      content: () => `
        <div class="files-body">
          <div class="files-sidebar">
            <div class="files-sidebar-item active" data-folder="desktop">🖥️ Desktop</div>
            <div class="files-sidebar-item" data-folder="documents">📄 Documents</div>
            <div class="files-sidebar-item" data-folder="games">🎮 Games</div>
            <div class="files-sidebar-item" data-folder="music">🎵 Music</div>
            <div class="files-sidebar-item" data-folder="system">⚙️ System</div>
          </div>
          <div class="files-main">
            <div class="files-grid" id="files-grid"></div>
          </div>
        </div>
      `,
      init: (win) => {
        const folders = {
          desktop: [
            { name: 'Browser', icon: '🌐', type: 'app', app: 'browser' },
            { name: 'Music', icon: '🎵', type: 'app', app: 'music' },
            { name: 'Games', icon: '🎮', type: 'app', app: 'games' },
            { name: 'Terminal', icon: '💻', type: 'app', app: 'terminal' },
            { name: 'README.md', icon: '📄', type: 'file' }
          ],
          documents: [
            { name: 'notes.txt', icon: '📝', type: 'file' },
            { name: 'todo.md', icon: '📋', type: 'file' },
            { name: 'ideas.doc', icon: '📄', type: 'file' }
          ],
          games: [
            { name: 'Snake.exe', icon: '🐍', type: 'game', game: 'snake' },
            { name: 'TicTacToe.exe', icon: '❌', type: 'game', game: 'ttt' },
            { name: '2048.exe', icon: '🔢', type: 'game', game: '2048' },
            { name: 'Memory.exe', icon: '🧠', type: 'game', game: 'memory' }
          ],
          music: [
            { name: 'Ambient Horizon', icon: '🌌', type: 'music' },
            { name: 'Digital Pulse', icon: '💫', type: 'music' },
            { name: 'Cosmic Drift', icon: '🪐', type: 'music' }
          ],
          system: [
            { name: 'settings.json', icon: '⚙️', type: 'file' },
            { name: 'boot.log', icon: '📜', type: 'file' },
            { name: 'kernel.js', icon: '💚', type: 'file' }
          ]
        };

        const grid = win.el.querySelector('#files-grid');
        function showFolder(name) {
          grid.innerHTML = '';
          (folders[name] || []).forEach(f => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `<div class="file-icon">${f.icon}</div><div class="file-name">${f.name}</div>`;
            item.addEventListener('dblclick', () => {
              if (f.type === 'app') openApp(f.app);
              else if (f.type === 'game') {
                if (f.game === 'snake') openSnake();
                else if (f.game === 'ttt') openTTT();
                else if (f.game === '2048') open2048();
                else if (f.game === 'memory') openMemory();
              } else if (f.type === 'music') openApp('music');
              else showToast(`Opened ${f.name}`);
            });
            grid.appendChild(item);
          });
        }
        showFolder('desktop');

        win.el.querySelectorAll('.files-sidebar-item').forEach(item => {
          item.addEventListener('click', () => {
            win.el.querySelectorAll('.files-sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            showFolder(item.dataset.folder);
          });
        });
      }
    },

    settings: {
      title: 'Settings',
      icon: '⚙️',
      width: 480,
      height: 400,
      content: () => `
        <div class="settings-body">
          <div class="settings-section">
            <h3>Appearance</h3>
            <div class="settings-row">
              <span>Wallpaper</span>
              <div class="wallpaper-presets">
                <div class="wp-preset p0 active" data-wp="0"></div>
                <div class="wp-preset p1" data-wp="1"></div>
                <div class="wp-preset p2" data-wp="2"></div>
                <div class="wp-preset p3" data-wp="3"></div>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>System</h3>
            <div class="settings-row">
              <span>Version</span>
              <span style="color:var(--text-dim)">OrbitOS 1.0.0</span>
            </div>
            <div class="settings-row">
              <span>Platform</span>
              <span style="color:var(--text-dim)">GitHub Pages</span>
            </div>
            <div class="settings-row">
              <span>Clear local data</span>
              <button id="settings-clear" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:rgba(255,68,102,0.15);color:var(--danger);cursor:pointer;font-size:0.8rem">Clear</button>
            </div>
          </div>
          <div class="settings-section">
            <h3>About</h3>
            <p style="color:var(--text-dim);font-size:0.85rem;line-height:1.5">OrbitOS is a fully client-side desktop environment designed for GitHub Pages. All data stays in your browser.</p>
          </div>
        </div>
      `,
      init: (win) => {
        win.el.querySelectorAll('.wp-preset').forEach(p => {
          p.addEventListener('click', () => {
            wallpaperIndex = +p.dataset.wp;
            applyWallpaper();
            win.el.querySelectorAll('.wp-preset').forEach(x => x.classList.remove('active'));
            p.classList.add('active');
            showToast('Wallpaper changed');
          });
        });
        win.el.querySelector('#settings-clear').addEventListener('click', () => {
          if (confirm('Clear all saved OrbitOS data (notepad, etc)?')) {
            localStorage.removeItem('orbitos-notepad');
            showToast('Local data cleared');
          }
        });
      }
    },

    about: {
      title: 'About OrbitOS',
      icon: 'ℹ️',
      width: 440,
      height: 420,
      content: () => `
        <div class="about-body">
          <div class="about-logo">🚀</div>
          <h2>OrbitOS</h2>
          <p class="version">Version 1.0.0 — GitHub Pages Edition</p>
          <p>A complete desktop operating system experience running entirely in your browser. Built with pure HTML, CSS & JavaScript.</p>
          <p>Features a window manager, games, music player, terminal, proxy browser, paint, calculator and more.</p>
          <div class="about-features">
            <span>🪟 Window Manager</span>
            <span>🎮 Games</span>
            <span>🎵 Music</span>
            <span>🌐 Browser</span>
            <span>💻 Terminal</span>
            <span>🎨 Paint</span>
          </div>
          <p style="margin-top:24px;font-size:0.8rem;opacity:0.6">Made for GitHub Pages • No backend required</p>
        </div>
      `,
      init: () => {}
    }
  };

  // ---------- Open App ----------
  function openApp(appId) {
    const app = apps[appId];
    if (!app) return;
    const win = createWindow(appId, app.title, app.icon, app.content(), app.width, app.height);
    if (app.init) {
      // Delay init slightly so DOM is ready
      setTimeout(() => app.init(win), 50);
    }
  }

  // ---------- Games ----------
  function openSnake() {
    const win = createWindow('snake-game', 'Snake', '🐍', `
      <div class="snake-container">
        <div class="snake-hud">
          <span>Score: <strong id="snake-score">0</strong></span>
          <span>Best: <strong id="snake-best">0</strong></span>
        </div>
        <canvas id="snake-canvas" width="400" height="400"></canvas>
        <div class="snake-controls">
          <button id="snake-start">Start / Restart</button>
          <span style="font-size:0.8rem;color:var(--text-dim)">Arrow keys / WASD</span>
        </div>
      </div>
    `, 460, 520);

    setTimeout(() => {
      const canvas = win.el.querySelector('#snake-canvas');
      const ctx = canvas.getContext('2d');
      const gridSize = 20;
      const tileCount = 20;
      let snake, food, dx, dy, score, best, gameLoop, running;

      best = parseInt(localStorage.getItem('orbitos-snake-best') || '0');
      win.el.querySelector('#snake-best').textContent = best;

      function reset() {
        snake = [{ x: 10, y: 10 }];
        food = { x: 15, y: 15 };
        dx = 0; dy = 0;
        score = 0;
        running = false;
        win.el.querySelector('#snake-score').textContent = '0';
        draw();
      }

      function draw() {
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // grid
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < tileCount; i++) {
          ctx.beginPath();
          ctx.moveTo(i * gridSize, 0);
          ctx.lineTo(i * gridSize, canvas.height);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i * gridSize);
          ctx.lineTo(canvas.width, i * gridSize);
          ctx.stroke();
        }
        // food
        ctx.fillStyle = '#ff4466';
        ctx.shadowColor = '#ff4466';
        ctx.shadowBlur = 10;
        ctx.fillRect(food.x * gridSize + 2, food.y * gridSize + 2, gridSize - 4, gridSize - 4);
        ctx.shadowBlur = 0;
        // snake
        snake.forEach((seg, i) => {
          ctx.fillStyle = i === 0 ? '#00d4ff' : '#00aacc';
          ctx.fillRect(seg.x * gridSize + 1, seg.y * gridSize + 1, gridSize - 2, gridSize - 2);
        });
      }

      function update() {
        if (!running) return;
        const head = { x: snake[0].x + dx, y: snake[0].y + dy };
        if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
          gameOver(); return;
        }
        if (snake.some(s => s.x === head.x && s.y === head.y)) {
          gameOver(); return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score++;
          win.el.querySelector('#snake-score').textContent = score;
          if (score > best) {
            best = score;
            localStorage.setItem('orbitos-snake-best', best);
            win.el.querySelector('#snake-best').textContent = best;
          }
          food = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
          };
        } else {
          snake.pop();
        }
        draw();
      }

      function gameOver() {
        running = false;
        clearInterval(gameLoop);
        showToast(`Game Over! Score: ${score}`);
      }

      function start() {
        reset();
        running = true;
        dx = 1; dy = 0;
        clearInterval(gameLoop);
        gameLoop = setInterval(update, 100);
      }

      win.el.querySelector('#snake-start').addEventListener('click', start);

      const keyHandler = (e) => {
        if (win.closed) {
          document.removeEventListener('keydown', keyHandler);
          return;
        }
        if (['ArrowUp', 'w', 'W'].includes(e.key) && dy === 0) { dx = 0; dy = -1; }
        else if (['ArrowDown', 's', 'S'].includes(e.key) && dy === 0) { dx = 0; dy = 1; }
        else if (['ArrowLeft', 'a', 'A'].includes(e.key) && dx === 0) { dx = -1; dy = 0; }
        else if (['ArrowRight', 'd', 'D'].includes(e.key) && dx === 0) { dx = 1; dy = 0; }
      };
      document.addEventListener('keydown', keyHandler);
      reset();
    }, 50);
  }

  function openTTT() {
    const win = createWindow('ttt-game', 'Tic-Tac-Toe', '❌', `
      <div class="ttt-container">
        <div class="ttt-status" id="ttt-status">X's turn</div>
        <div class="ttt-board" id="ttt-board"></div>
        <button class="snake-controls" id="ttt-reset" style="padding:8px 20px;border:1px solid var(--border);border-radius:8px;background:rgba(0,212,255,0.1);color:var(--accent);cursor:pointer">Reset</button>
      </div>
    `, 360, 420);

    setTimeout(() => {
      const boardEl = win.el.querySelector('#ttt-board');
      const status = win.el.querySelector('#ttt-status');
      let board, current, over;

      function init() {
        board = Array(9).fill('');
        current = 'X';
        over = false;
        status.textContent = "X's turn";
        boardEl.innerHTML = '';
        for (let i = 0; i < 9; i++) {
          const cell = document.createElement('div');
          cell.className = 'ttt-cell';
          cell.dataset.i = i;
          cell.addEventListener('click', () => move(i, cell));
          boardEl.appendChild(cell);
        }
      }

      function move(i, cell) {
        if (board[i] || over) return;
        board[i] = current;
        cell.textContent = current;
        cell.classList.add(current.toLowerCase());
        if (checkWin(current)) {
          status.textContent = `${current} wins! 🎉`;
          over = true;
          return;
        }
        if (board.every(c => c)) {
          status.textContent = "It's a draw!";
          over = true;
          return;
        }
        current = current === 'X' ? 'O' : 'X';
        status.textContent = `${current}'s turn`;
      }

      function checkWin(p) {
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        return wins.some(([a,b,c]) => board[a] === p && board[b] === p && board[c] === p);
      }

      win.el.querySelector('#ttt-reset').addEventListener('click', init);
      init();
    }, 50);
  }

  function open2048() {
    const win = createWindow('g2048-game', '2048', '🔢', `
      <div class="g2048-container">
        <div class="g2048-hud">
          <div class="g2048-score">Score: <strong id="g2048-score">0</strong></div>
          <button id="g2048-new" style="padding:6px 14px;border:1px solid var(--border);border-radius:8px;background:rgba(0,212,255,0.1);color:var(--accent);cursor:pointer;font-size:0.85rem">New Game</button>
        </div>
        <div id="g2048-board"></div>
        <p style="font-size:0.75rem;color:var(--text-dim);margin-top:8px">Use arrow keys to play</p>
      </div>
    `, 360, 440);

    setTimeout(() => {
      const boardEl = win.el.querySelector('#g2048-board');
      let grid, score;

      function emptyGrid() {
        return Array.from({ length: 4 }, () => Array(4).fill(0));
      }

      function addRandom() {
        const empty = [];
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 4; c++)
            if (grid[r][c] === 0) empty.push({ r, c });
        if (empty.length === 0) return;
        const { r, c } = empty[Math.floor(Math.random() * empty.length)];
        grid[r][c] = Math.random() < 0.9 ? 2 : 4;
      }

      function render() {
        boardEl.innerHTML = '';
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const cell = document.createElement('div');
            cell.className = 'g2048-cell' + (grid[r][c] ? ' t' + grid[r][c] : '');
            cell.textContent = grid[r][c] || '';
            boardEl.appendChild(cell);
          }
        }
        win.el.querySelector('#g2048-score').textContent = score;
      }

      function slide(row) {
        let arr = row.filter(x => x);
        for (let i = 0; i < arr.length - 1; i++) {
          if (arr[i] === arr[i + 1]) {
            arr[i] *= 2;
            score += arr[i];
            arr[i + 1] = 0;
          }
        }
        arr = arr.filter(x => x);
        while (arr.length < 4) arr.push(0);
        return arr;
      }

      function move(dir) {
        const prev = JSON.stringify(grid);
        if (dir === 'left') {
          for (let r = 0; r < 4; r++) grid[r] = slide(grid[r]);
        } else if (dir === 'right') {
          for (let r = 0; r < 4; r++) grid[r] = slide(grid[r].reverse()).reverse();
        } else if (dir === 'up') {
          for (let c = 0; c < 4; c++) {
            let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
            col = slide(col);
            for (let r = 0; r < 4; r++) grid[r][c] = col[r];
          }
        } else if (dir === 'down') {
          for (let c = 0; c < 4; c++) {
            let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]].reverse();
            col = slide(col).reverse();
            for (let r = 0; r < 4; r++) grid[r][c] = col[r];
          }
        }
        if (JSON.stringify(grid) !== prev) {
          addRandom();
          render();
        }
      }

      function init() {
        grid = emptyGrid();
        score = 0;
        addRandom();
        addRandom();
        render();
      }

      win.el.querySelector('#g2048-new').addEventListener('click', init);

      const keyHandler = (e) => {
        if (win.closed) {
          document.removeEventListener('keydown', keyHandler);
          return;
        }
        if (e.key === 'ArrowLeft') move('left');
        else if (e.key === 'ArrowRight') move('right');
        else if (e.key === 'ArrowUp') move('up');
        else if (e.key === 'ArrowDown') move('down');
      };
      document.addEventListener('keydown', keyHandler);
      init();
    }, 50);
  }

  function openMemory() {
    const win = createWindow('memory-game', 'Memory', '🧠', `
      <div class="memory-container">
        <div class="snake-hud" style="width:100%;max-width:320px">
          <span>Moves: <strong id="mem-moves">0</strong></span>
          <span>Pairs: <strong id="mem-pairs">0</strong>/8</span>
        </div>
        <div class="memory-grid" id="mem-grid"></div>
        <button id="mem-reset" style="padding:8px 20px;border:1px solid var(--border);border-radius:8px;background:rgba(0,212,255,0.1);color:var(--accent);cursor:pointer;margin-top:8px">New Game</button>
      </div>
    `, 360, 420);

    setTimeout(() => {
      const emojis = ['🚀', '🌟', '🎮', '🎵', '💻', '🎨', '🪐', '⚡'];
      let cards, flipped, matched, moves, lock;

      function init() {
        const pairs = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
        cards = pairs;
        flipped = [];
        matched = 0;
        moves = 0;
        lock = false;
        win.el.querySelector('#mem-moves').textContent = '0';
        win.el.querySelector('#mem-pairs').textContent = '0';
        const grid = win.el.querySelector('#mem-grid');
        grid.innerHTML = '';
        pairs.forEach((emoji, i) => {
          const card = document.createElement('div');
          card.className = 'memory-card';
          card.dataset.index = i;
          card.innerHTML = `<span style="display:none">${emoji}</span>`;
          card.addEventListener('click', () => flip(card, i, emoji));
          grid.appendChild(card);
        });
      }

      function flip(card, index, emoji) {
        if (lock || card.classList.contains('flipped') || card.classList.contains('matched')) return;
        card.classList.add('flipped');
        card.querySelector('span').style.display = 'block';
        flipped.push({ card, index, emoji });
        if (flipped.length === 2) {
          moves++;
          win.el.querySelector('#mem-moves').textContent = moves;
          lock = true;
          if (flipped[0].emoji === flipped[1].emoji) {
            flipped.forEach(f => f.card.classList.add('matched'));
            matched++;
            win.el.querySelector('#mem-pairs').textContent = matched;
            flipped = [];
            lock = false;
            if (matched === 8) showToast('You won! 🎉');
          } else {
            setTimeout(() => {
              flipped.forEach(f => {
                f.card.classList.remove('flipped');
                f.card.querySelector('span').style.display = 'none';
              });
              flipped = [];
              lock = false;
            }, 700);
          }
        }
      }

      win.el.querySelector('#mem-reset').addEventListener('click', init);
      init();
    }, 50);
  }

  // ---------- Wallpaper ----------
  function applyWallpaper() {
    const wp = document.getElementById('wallpaper');
    wp.className = '';
    if (wallpaperIndex > 0) wp.classList.add('wp-' + wallpaperIndex);
  }

  // ---------- Start Menu & Desktop ----------
  function setupUI() {
    // Desktop icons
    document.querySelectorAll('.desktop-icon').forEach(icon => {
      icon.addEventListener('dblclick', () => openApp(icon.dataset.app));
      icon.addEventListener('click', (e) => {
        document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
        icon.classList.add('selected');
      });
    });

    // Start menu apps
    document.querySelectorAll('.start-app').forEach(item => {
      item.addEventListener('click', () => {
        openApp(item.dataset.app);
        closeStartMenu();
      });
    });

    // Start button
    const startBtn = document.getElementById('start-btn');
    const startMenu = document.getElementById('start-menu');
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startMenu.classList.toggle('hidden');
      startBtn.classList.toggle('active');
    });

    document.getElementById('power-btn').addEventListener('click', () => {
      closeStartMenu();
      if (confirm('Restart OrbitOS?')) location.reload();
    });

    // Close start menu on outside click
    document.addEventListener('click', (e) => {
      if (!startMenu.contains(e.target) && e.target !== startBtn && !startBtn.contains(e.target)) {
        closeStartMenu();
      }
    });

    function closeStartMenu() {
      startMenu.classList.add('hidden');
      startBtn.classList.remove('active');
    }

    // Context menu
    const ctx = document.getElementById('context-menu');
    document.getElementById('desktop').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.window') || e.target.closest('#taskbar') || e.target.closest('#start-menu')) return;
      e.preventDefault();
      ctx.style.left = e.clientX + 'px';
      ctx.style.top = e.clientY + 'px';
      ctx.classList.remove('hidden');
    });
    document.addEventListener('click', () => ctx.classList.add('hidden'));

    ctx.querySelectorAll('.ctx-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        if (action === 'refresh') showToast('Desktop refreshed');
        else if (action === 'wallpaper') {
          wallpaperIndex = (wallpaperIndex + 1) % 4;
          applyWallpaper();
          showToast('Wallpaper changed');
        } else if (action === 'about') openApp('about');
        ctx.classList.add('hidden');
      });
    });

    // Clock click
    document.getElementById('clock').addEventListener('click', () => {
      showToast(new Date().toLocaleString());
    });
  }

  // ---------- Init ----------
  boot();
  setupUI();
})();
