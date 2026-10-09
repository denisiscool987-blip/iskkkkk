# OrbitOS 🚀

**A full desktop operating system experience that runs entirely in your browser.**

Perfect for GitHub Pages. No build step, no backend, no dependencies.

![OrbitOS](https://img.shields.io/badge/OrbitOS-1.0.0-00d4ff?style=for-the-badge)
![Pure JS](https://img.shields.io/badge/Pure-HTML%2FCSS%2FJS-a855f7?style=for-the-badge)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Ready-00ff9d?style=for-the-badge)

## Features

- **🪟 Full Window Manager** — Drag, resize, minimize, maximize, focus windows
- **🌐 Proxy Browser** — URL bar + iframe with quick links (Wikipedia, Archive.org, etc.)
- **🎵 Music Player** — Playlist with generated ambient / synth tracks (Web Audio API)
- **🎮 Games Arcade**
  - Snake (arrow keys / WASD)
  - Tic-Tac-Toe
  - 2048
  - Memory Match
- **💻 Terminal** — Fake shell with `help`, `neofetch`, `fortune`, `ls`, `cat`, etc.
- **📝 Notepad** — Saves to `localStorage`
- **🧮 Calculator**
- **🎨 Paint** — Brush, eraser, colors, export PNG
- **📁 File Explorer** — Virtual filesystem
- **⚙️ Settings** — Change wallpapers, clear data
- **🚀 Boot sequence** + Start menu + Taskbar + Context menu + Toasts

## Deploy to GitHub Pages (2 minutes)

1. Create a new repository on GitHub (e.g. `orbitos` or `username.github.io`)
2. Upload these files to the **root** of the repo:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `README.md` (optional)
3. Go to **Settings → Pages**
4. Under **Source**, select **Deploy from a branch**
5. Choose `main` (or `master`) and `/ (root)`
6. Click Save

Your OS will be live at:
`https://<username>.github.io/<repo>/`  
or `https://<username>.github.io/` if you used the `username.github.io` repo.

## Local Preview

Just open `index.html` in any modern browser, or run a simple server:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then visit `http://localhost:8080`.

## File Structure

```
OrbitOS/
├── index.html      # Main entry (required for GitHub Pages)
├── styles.css      # All styles
├── script.js       # Window manager + all apps + games
└── README.md
```

That’s it. Three files.

## Controls

| Action              | How                          |
|---------------------|------------------------------|
| Open app            | Double-click desktop icon or Start menu |
| Move window         | Drag title bar               |
| Resize window       | Drag bottom-right corner     |
| Minimize / Maximize / Close | Title bar buttons     |
| Start menu          | Click ◉ on the taskbar       |
| Change wallpaper    | Right-click desktop → Change Wallpaper |
| Snake / 2048        | Arrow keys (or WASD for Snake) |

## Notes

- The **Proxy Browser** is limited by browser security (X-Frame-Options / CORS). Many sites refuse to be embedded. Quick links and “open in new tab” style fallbacks are provided.
- Music tracks are generated with the **Web Audio API** so there are zero external audio files or CDN dependencies.
- All data (Notepad, high scores) stays in your browser’s `localStorage`.

## License

MIT — do whatever you want with it.

---

Made for the fun of having a whole OS inside a GitHub Pages site.
