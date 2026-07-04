# SeannyLog

A no-nonsense progressive overload tracker built as a PWA — installable on your phone, works fully offline, stores everything locally. No account, no cloud, no ads.

![SeannyLog](icon-512.png)

---

## What it does

SeannyLog is built around one question: **am I actually getting stronger?**

You set up your training split (Push / Pull / Legs / Rest or any pattern you want), assign exercises to each day, and log your weight and reps every session. The app tracks a two-session streak per exercise — once you hit the top of your rep range on any set (1 set or several — doesn't need to be every set) in each of your last two logged sessions, at the same weight, it tells you it's **Time to Ascend** and pre-fills the next suggested weight automatically.

No noise. No social features. Just your lifts and whether you're progressing.

---

## Features

**Tracking**
- **Progressive overload detection** — fires after hitting your rep target on any set, at the same weight, in each of your last two logged sessions
- **Time to Ascend badge** — clear visual cue when it's time to add weight, with the suggested weight pre-filled
- **Streak dots** — two dots per exercise showing your current streak toward the trigger (0/2, 1/2, 2/2)
- **Session history** — sparkline chart + last 6 sessions per exercise in the Progress tab
- **kg / lbs toggle** — full unit conversion, all logged history auto-converts

**Today tab**
- **Last session reference** — previous weight and reps shown on every exercise card
- **Dynamic sets** — add or remove sets mid-workout without changing your saved program
- **Draft autosave** — mid-workout inputs survive page reloads and alt-tab
- **Live exercise reorder** — reorder exercises in Split while mid-workout; Today updates without wiping your inputs

**Split management**
- **Custom split builder** — any cycle length, any pattern (PPL, Upper-Lower, Bro Split, 5-day, etc.)
- **8 preset templates** — PPL Rest × 2, PPL Rest, Upper/Lower, Push/Pull/Legs/Upper/Lower/Rest, Bro Split, Arnold Split, Full Body × 3, Push/Pull
- **Collapsible day cards** — all days collapsed by default, current day auto-expands; tap to open any day
- **Reorder Days sheet** — dedicated sheet for rearranging days in your cycle, no conflicting arrows
- **Add / delete days** — fully flexible cycle length
- **Exercise reordering** — ↑↓ arrows to reorder exercises within a day
- **Per-exercise config** — sets, rep range (min–max), weight increment (e.g. 2.5kg squat, 1kg lateral raise)

**Settings**
- **Export backup** — via native share sheet (WhatsApp, Notes, etc.) on mobile, file download on desktop
- **Import backup** — via file picker or paste JSON text directly
- **Weight validation** — warns before logging if any weight looks like a typo (over 300kg / 660lbs)
- **Cycle sync** — manually set which day in your cycle you're on
- **Undo last workout** — rolls back the most recent logged session
- **Reset** — full wipe back to default split

**Infrastructure**
- **PWA** — installs to your home screen, works completely offline
- **No account required** — all data stays on your device in localStorage

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
├── index.html            # Entire app — HTML, CSS, and JS in one file
├── manifest.json         # PWA manifest
├── sw.js                 # Service worker for offline support
├── icon-192.png          # PWA icon (any)
├── icon-512.png          # PWA icon (any)
└── icon-512-maskable.png # PWA icon (maskable, for Android adaptive icons)
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

> Service workers only register on `localhost` or HTTPS. Opening `index.html` directly via `file://` works but offline cache won't activate.

---

## Data and privacy

Everything is stored in your browser's `localStorage`. Nothing is sent anywhere. Use **Settings → Export backup** before clearing site data or switching devices. Import via **Settings → Import backup** to restore — supports file picker or pasting JSON text directly.

---

## Built with

- Vanilla HTML / CSS / JavaScript — zero dependencies, zero build step
- Web App Manifest + Service Worker for PWA installability and offline support
- `localStorage` for persistence
- Oswald + Inter + IBM Plex Mono (Google Fonts)

---

## License

MIT — see [LICENSE](LICENSE).
