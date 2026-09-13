# SeannyLog

A no-nonsense progressive overload tracker built as a PWA. Workout data stays in your browser; core app assets work offline after successful initial caching. No account, no cloud sync, no ads.

![SeannyLog](icon-512.png)

Live app: [SeannyLog on GitHub Pages](https://seannyboyyy.github.io/SeannyLog/).

---

## What it does

SeannyLog is built around one question: **am I actually getting stronger?**

You set up your training split (Push / Pull / Legs / Rest or any pattern you want), assign exercises to each day, and log your weight and reps every session. The app checks your latest two sessions per exercise to show **Time to Ascend** and prefill a suggested increase. The exact current rules and their known edge cases are documented in [PRD.md](docs/PRD.md).

No noise. No social features. Just your lifts and whether you're progressing.

---

## Features

**Tracking**
- **Progressive overload detection** — checks rep targets and first-set weights across your latest two logged sessions
- **Time to Ascend badge** — clear visual cue when it's time to add weight, with the suggested weight pre-filled
- **Progression dots** — two dots per exercise showing status toward the trigger (see PRD for interrupted-session behavior)
- **Session history** — sparkline chart + last 6 sessions per exercise in the Progress tab
- **History editing/deletion** — edit a session's set values or delete the entire workout
- **Consistency heatmap** — 26 weeks of training/rest activity, totals, and daily streaks
- **Interactive muscle progress** — front/back body map and muscle details in Progress; logged load-change metric explained in [PRD.md](docs/PRD.md)
- **kg / lbs toggle** — full unit conversion, all logged history auto-converts

**Today tab**
- **Last session reference** — previous weight and reps shown on every exercise card
- **Dynamic sets** — add or remove sets mid-workout without changing your saved program
- **Draft autosave** — saves input values locally; recovery has limitations for dynamic set counts and blank values (see [DATA_MODEL.md](docs/DATA_MODEL.md))
- **Live exercise reorder** — reorder exercises in Split while mid-workout; Today updates without wiping your inputs

**Split management**
- **Custom split builder** — any cycle length, any pattern (PPL, Upper-Lower, Bro Split, 5-day, etc.)
- **8 preset templates** — PPL Rest × 2, PPL Rest, Upper/Lower, Push/Pull/Legs/Upper/Lower/Rest, Bro Split, Arnold Split, Full Body × 3, Push/Pull
- **Collapsible day cards** — current day expands when collapse state initializes; tap to open any day
- **Reorder Days sheet** — dedicated sheet for rearranging days in your cycle, no conflicting arrows
- **Add / delete days** — fully flexible cycle length
- **Exercise reordering** — ↑↓ arrows to reorder exercises within a day
- **Per-exercise config** — sets, rep range (min–max), weight increment (e.g. 2.5kg squat, 1kg lateral raise)
- **Custom exercise library** — create exercises and assign them to one or more days; presets replace day structure and require exercise reassignment

**Settings**
- **Export backup** — via native share sheet (WhatsApp, Notes, etc.) on mobile, file download on desktop
- **Import backup** — via file picker or paste JSON text directly
- **Weight validation** — warns before logging if a stored weight exceeds 300kg (about 661lbs)
- **Cycle sync** — manually set which day in your cycle you're on
- **Undo last workout** — removes the last workout and moves the cycle index back one position
- **Reset** — resets the program and history; separate preferences, hints, and draft storage remain

**Infrastructure**
- **PWA** — supports home-screen installation and cached offline core assets; Google Fonts are not precached
- **No account required** — all data stays on your device in localStorage

---

## Deploying to GitHub Pages

1. Fork or clone this repo
2. Go to **Settings → Pages**
3. Set source to **Deploy from branch → main → / (root)**
4. Your app will be live at `https://yourusername.github.io/seannylog/`

No build step or checked-in CI configuration. Actual production hosting settings are not recorded in this repository. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for asset layout, cache behavior, and release checks.

### Installing as a PWA

Once hosted, open the URL on your phone browser:
- **Android (Chrome):** tap the three-dot menu → "Add to Home Screen"
- **iOS (Safari):** tap the Share button → "Add to Home Screen"

After successful initial caching, core tracking works offline. Font appearance may fall back to locally available fonts.

---

## Files

```
seannylog/
├── index.html            # App shell and ordered script loading
├── css/style.css         # Shared styles and UI tokens
├── js/                   # State, logic, views, settings, initialization
├── manifest.json         # PWA manifest
├── sw.js                 # Service worker for offline support
├── icon-192.png          # PWA icon (any)
├── icon-512.png          # PWA icon (any)
└── icon-512-maskable.png # PWA icon (maskable, for Android adaptive icons)
```

Preserve this directory structure and the relative asset paths. Script responsibilities and load order are documented in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Local development

No build tools required. Serve locally for full PWA support:

```bash
# With Python 3 already installed
python -m http.server 8080 --bind 127.0.0.1
```

Then open `http://localhost:8080`.

> Use localhost or HTTPS for service-worker support. Direct `file://` opening is not a validated development path. See [TESTING.md](docs/TESTING.md) for checks that require no dependency installation.

---

## Data and privacy

Workout data is stored in your browser's `localStorage`; there is no workout upload or analytics integration. Hosting and Google Fonts still receive normal resource requests, and user-initiated export can share backup data. Use **Settings → Export backup** before clearing site data or switching devices. Import supports a file picker or pasted JSON and replaces current state. Backups exclude drafts and preferences; validation limitations are documented in [DATA_MODEL.md](docs/DATA_MODEL.md).

---

## Built with

- Vanilla HTML / CSS / JavaScript — zero package dependencies, zero build step
- Web App Manifest + Service Worker for PWA installability and offline support
- `localStorage` for persistence
- Oswald + Inter + IBM Plex Mono (Google Fonts)

---

## Repository documentation

- [AGENTS.md](AGENTS.md): durable instructions and definition of done for coding agents
- [PRD.md](docs/PRD.md): current features, exact product rules, unresolved decisions
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): file boundaries, dependencies, state/render flows
- [DATA_MODEL.md](docs/DATA_MODEL.md): persistence, units, backups, deletion and recovery limits
- [DESIGN.md](docs/DESIGN.md): existing UI patterns, tokens, accessibility gaps
- [TESTING.md](docs/TESTING.md): validation commands and manual regression matrix
- [DEPLOYMENT.md](docs/DEPLOYMENT.md): static hosting, offline caching, release procedure

These documents distinguish current behavior from proposed work. Proposed items are not implemented or automatically authorized.

## License

MIT — see [LICENSE](LICENSE).
