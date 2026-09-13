# Architecture

## CURRENT STATE

SeannyLog is a single-page, browser-only application with no server API, authentication, framework, package dependencies, or build pipeline. `index.html` owns persistent containers; classic scripts generate their contents. File boundaries organize responsibilities but do not isolate modules.

### Load order and dependencies

| Order | File | Responsibility and dependencies |
|---|---|---|
| 1 | `js/state.js` | Loads shared state; provides units, storage, seeds, drafts, helpers. Some helpers call UI functions later at runtime. |
| 2 | `js/logic.js` | Reads state/history, collects DOM inputs, mutates workouts; calls render/toast functions after initialization. |
| 3 | `js/render-today.js` | Today cards, inputs, rest completion, finish handling; uses state, logic, shared UI helpers. |
| 4 | `js/render-progress.js` | Overview/Muscles navigation; Overview charts, history, session editing/deletion. Calls muscle rendering at runtime. |
| 5 | `js/render-muscle-map.js` | DOM-independent kg summaries from the exercise library and `exerciseLogsInOrder()`; front/back SVG, detail rendering, muscle interaction and scoped sheet focus handling. Uses state, logic, units and shared sheet helpers. |
| 6 | `js/render-split.js` | Program/exercise editing, presets, assignment; uses state, logic, Today refresh helpers. |
| 7 | `js/settings.js` | Units, import/export, cycle picker, reset; uses state and render helpers. |
| 8 | `js/ui.js` | Wires navigation/settings/backdrop, registers service worker, calls `renderAll()`. |

### State and rendering flows

- Startup: `load()` reads localStorage or seeds defaults → `renderAll()` renders all three views.
- Workout entry: input events set `todayUserEdited` and serialize DOM fields into the draft key.
- Completion: collect valid sets → optional incomplete/high-weight confirmation → append log → advance cycle → clear draft → save → refresh Today/Progress.
- Rest completion: add local date to `restLog` → advance → clear draft → save → render Today.
- Program/settings edits: mutate global `state` → `save()` → explicitly refresh selected views.
- Navigation: show/hide view containers; Progress/Split rerender on entry. Today rerenders only when not dirty.
- `safeRenderToday()` skips dirty Today. Exercise reordering can instead swap existing card nodes to preserve inputs.

Progress keeps `progressSegment` in memory in `render-progress.js`; `muscleMapSide` and the selected muscle live in `render-muscle-map.js`. They survive view rerenders/navigation but reset on reload. Muscle summaries are derived afresh when rendering/opening details, include unassigned library exercises, and add no storage keys or schema fields. The metric is specified in [PRD.md](PRD.md).

There is no reactive subscription system, routing/history integration, multi-tab synchronization, or persistence transaction. Sheet content is replaced through one shared `innerHTML` container. `setSheet(html, cleanup)` optionally registers cleanup: replacement calls it with `false`, dismissal with `true`. Only the muscle flow uses this hook to restore background inertness, remove its keyboard handlers, and return focus on dismissal. Other sheet flows retain their existing behavior. Today uses delegated listeners; other views generally attach listeners after rendering.

### Browser and external boundaries

- localStorage holds user state; Cache Storage holds application responses. See [DATA_MODEL.md](DATA_MODEL.md).
- Google Fonts supplies three fonts through external requests. No workout upload or analytics code exists.
- Web Share API exports files/text to a user-selected destination; Blob downloads are the fallback. FileReader imports JSON. These are browser facilities, not dedicated WhatsApp/Notes integrations.
- Manifest/service worker provide installation and offline delivery; see [DEPLOYMENT.md](DEPLOYMENT.md).

### Architectural weaknesses

- Shared globals and explicit refresh calls couple rendering, DOM input collection, mutations, and storage.
- Dirty-view preservation can retain stale controls after program changes. Reordering days retains `cycleIndex`, not active day identity.
- `save()` catches errors without returning success/failure; completion clears drafts before persistence and may show success after save failure.
- Imported state is assigned/saved before full rendering succeeds. Weak validation plus unescaped imported fields creates data-loss and HTML-injection risks.
- History queries repeatedly filter/sort logs during rendering; performance with large histories is unmeasured.
- Source comments sometimes describe old behavior. For example, complete workouts bypass the finish sheet despite comments promising confirmation every time.

## PROPOSED/FUTURE STATE

No replacement architecture is approved. Future fixes should first preserve the current static, local-only design. Product-rule questions live in [PRD.md](PRD.md); storage recovery gaps live in [DATA_MODEL.md](DATA_MODEL.md).
