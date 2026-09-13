# Static hosting and offline delivery

## CURRENT STATE

Production is hosted on GitHub Pages at [https://seannyboyyy.github.io/SeannyLog/](https://seannyboyyy.github.io/SeannyLog/), as confirmed by the owner. Preserve the case-sensitive `/SeannyLog/` deployment path. The live deployment has not been browser-tested as part of this documentation work.

No build output or backend is required. Serve repository files while preserving relative paths: `index.html`, `css/`, `js/`, `manifest.json`, `sw.js`, and the icons. No environment variables, secrets, or checked-in CI/hosting configuration exist. The actual Pages publishing branch/source settings remain unverified.

### Local and hosted setup

- Local: `python -m http.server 8080 --bind 127.0.0.1`, then `http://localhost:8080`.
- GitHub Pages setup guidance from the original README: repository Settings → Pages → deploy from branch → `main` → root. Hosting is confirmed; these specific publishing settings are not independently verified.
- Relative manifest `id`, `scope`, and `start_url` support hosting under a repository subpath. Preserve their relationship to the app files.
- Service-worker use requires a secure context such as HTTPS or localhost. Direct `file://` opening is not a validated development path.
- Installation uses browser Add to Home Screen/install controls where supported. The manifest requests standalone display and portrait-primary orientation.

### Cache and update behavior

`sw.js` currently uses `seannylog-v3.10`; Settings displays `APP_VERSION = '3.10'` from `js/state.js`.

- Installation precaches root/index, manifest, stylesheet, all eight scripts (including `js/render-muscle-map.js`), and three icons using `cache.addAll()`. Any failed required fetch can fail installation.
- `skipWaiting()` and `clients.claim()` activate the worker immediately.
- Same-origin GET requests use cached responses when available while fetching and caching successful network responses in the background. Cross-origin fonts bypass this worker.
- Offline core use depends on successful initial asset caching. Google Fonts are not precached; fallback fonts may appear offline.
- Activation deletes every cache name other than the current one, without filtering by application prefix. Other applications sharing the origin can be affected.
- Existing controlled pages receive an update toast with a manual Refresh button after controller change. It does not force a mid-workout reload. Registration errors are swallowed.
- Asset background refresh can mix file versions; there is no atomic deployment/update mechanism.

### Runtime release checklist

1. Complete relevant [TESTING.md](TESTING.md) checks using disposable data.
2. Keep local runtime asset paths in `ASSETS` accurate. Documentation is not part of the precache list.
3. For runtime releases, bump `APP_VERSION` and `CACHE_NAME` together; there is no automatic synchronization. Documentation-only changes need neither bump.
4. Publish the complete runtime file set with its existing directory structure.
5. Check online startup and Settings version, worker registration/control, and successful asset caching.
6. Check offline reload after initial caching, installation on target devices, and an update from an already controlled page with a draft.
7. Confirm the refreshed version and report unsupported/unverified device behavior.

Do not clear a user's storage to troubleshoot cache delivery. Cache Storage and localStorage are separate, but browser “clear site data” can remove both. Export valuable data before any destructive recovery operation.

## PROPOSED/FUTURE STATE

Scoped cache cleanup, coordinated asset updates, and automated release checks are potential reliability work, not current capabilities or approved changes. A supported-browser matrix and the Pages publishing branch/source settings still need confirmation.
