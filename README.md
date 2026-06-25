# SeannyLog

A no-nonsense progressive overload tracker built as a PWA — installable on your phone, works fully offline, stores everything locally. No account, no cloud, no ads.

![SeannyLog](icon-512.png)

---

## What it does

SeannyLog is built around one question: **am I actually getting stronger?**

You set up your training split (Push / Pull / Legs / Rest or any pattern you want), assign exercises to each day, and log your weight and reps every session. The app tracks a two-session streak per exercise — once you hit the top of your rep range across all sets in two sessions in a row at the same weight, it tells you it's **Time to Ascend** and pre-fills the next suggested weight automatically.

No noise. No social features. Just your lifts and whether you're progressing.

---

## Features

- **Custom split builder** — any pattern (PPL/Rest, Upper-Lower, 5-day, etc.), any number of days
- **Preset splits** — 8 popular templates (PPL, Upper/Lower, Bro Split, Arnold Split, Full Body, and more)
- **Per-exercise configuration** — sets, rep range (min–max), and your own weight increment
- **Progressive overload detection** — fires after hitting your rep target on all sets, two sessions in a row
- **Time to Ascend badge** — clear visual cue when it's time to add weight, with suggested weight pre-filled
- **Streak dots** — two dots per exercise showing your current streak toward the ascend trigger
- **Session history** — sparkline chart + last 6 sessions per exercise in the Progress tab
- **kg / lbs toggle** — full unit conversion, all history auto-converts
- **Draft autosave** — mid-workout inputs survive page reloads and alt-tab
- **Dynamic sets** — add or remove sets mid-workout without affecting your saved program
- **Exercise reordering** — ↑↓ arrows to reorder exercises within a day
- **Day management** — add, delete, reorder days in your cycle
- **Undo remove** — 4-second undo toast when removing an exercise from a day
- **Cycle sync** — jump to any day in your cycle if it gets out of sync
- **Export / Import** — full JSON backup via native share sheet or file download
- **PWA** — installs to your home screen, works completely offline
- **No account required** — all data stays on your device

---

## Deploying to GitHub Pages

1. Fork or clone this repo
2. Go to **Settings → Pages**
3. Set source to **Deploy from branch → main → / (root)**
4. Your app will be live at `https://yourusername.github.io/seannylog/`

No build step, no CI, no configuration.

### Installing as a PWA

Once hosted, open the URL on your phone browser:
- **Android (Chrome):** tap the three-dot menu → "Add to Home Screen"
- **iOS (Safari):** tap the Share button → "Add to Home Screen"

After installing, the app runs offline — no internet needed at the gym.

---

## Files

```
seannylog/
├── index.html          # Entire app — HTML, CSS, and JS in one file
├── manifest.json       # PWA manifest
├── sw.js               # Service worker for offline support
├── icon-192.png        # PWA icon (any)
├── icon-512.png        # PWA icon (any)
└── icon-512-maskable.png  # PWA icon (maskable, for Android adaptive icons)
```

All files must stay in the same directory for the PWA to install correctly.

---

## Local development

No build tools required. Serve locally for full PWA support:

```bash
# Python 3
python3 -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080`.

---

## Data and privacy

Everything is stored in your browser's `localStorage`. Nothing is sent anywhere. Use **Settings → Export backup** before clearing site data or switching devices. Import via **Settings → Import backup** to restore.

---

## Built with

- Vanilla HTML / CSS / JavaScript — zero dependencies, zero build step
- Web App Manifest + Service Worker for PWA installability and offline support
- `localStorage` for persistence
- Oswald + Inter + IBM Plex Mono (Google Fonts)

---

## License

MIT — see [LICENSE](LICENSE).
