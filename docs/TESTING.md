# Validation

## CURRENT STATE

`tests/muscle-map.test.cjs` uses Node's built-in test runner and isolated VM state for muscle calculations and rendering guards. It needs no packages or test framework installation. There is no package manifest, lint configuration, or CI workflow; existing flows also require the relevant browser checks below.

## Required checks for future changes

Run from repository root using already available tools. Do not install tools merely to run these commands.

```powershell
# Parse every application script and the service worker.
Get-ChildItem js/*.js, sw.js | ForEach-Object {
  node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($_.Name)" }
}

# Check muscle calculations and limited-history rendering in disposable memory.
node --test tests/muscle-map.test.cjs
if ($LASTEXITCODE -ne 0) { throw "Muscle regression checks failed" }

# Parse manifest and verify referenced icons.
$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$manifest.icons | ForEach-Object {
  if (-not (Test-Path -LiteralPath $_.src)) { throw "Missing icon: $($_.src)" }
}

git diff --check
git diff --stat
git status --short
```

Serve for browser checks with `python -m http.server 8080 --bind 127.0.0.1`; open `http://localhost:8080`. Use an isolated browser profile/origin and disposable logs/backups. Stop the server after validation. If Node/Python is unavailable, report the limitation or use an already installed equivalent.

### Manual regression matrix

Select flows affected by the change; use the full matrix for a runtime release. The observed baseline is documented, not an endorsement of known defects.

| Area | Check |
|---|---|
| Startup/navigation | Fresh storage seeds eight days and 15 exercises; Today/Progress/Split/settings open without console errors. |
| Progression | Two qualifying same-first-weight sessions trigger readiness; below-target sets do not. Also check current edge cases: latest miss can retain one dot; mixed qualifying weights can trigger. See PRD. |
| Workout completion | Empty workout blocked; partial rows require confirmation; fully valid rows finish directly; >300kg warns; cycle/history update. |
| Drafts | Type, switch tabs, reload, add/remove rows, blank a prefilled value, switch units, reorder exercises. Record known row/blank/dirty restoration limitations. |
| Program edits | Add/rename/reorder/delete days, assign/remove/reorder exercises, load presets, create custom exercise with immediate/deferred assignment. Repeat relevant changes with an active draft. |
| History/rest | Edit values without date change; deleting a row removes the whole workout; deleting an exercise cleans its history; rest contributes to consistency without training count. |
| Muscle progress | Both segment controls, all ten muscles, shared Shoulders/Calves data, fixed legend states, empty and one-session details, unassigned exercises, kg/lbs reopening, rerender state, and Overview edit/delete recalculation. Use the metric in PRD as the expected result. |
| Units/data | kg/lbs display and increment conversion; export and restore into disposable storage; verify backup exclusions and reset boundaries. Malformed import checks must never use valuable data. |
| Recovery | Undo after workout, rest, manual cycle selection, and day restructuring; check actual resulting day. |
| UI/accessibility | Narrow/desktop layouts, zoom, keyboard focus and controls, sheet behavior, reduced motion, font fallback, screen-reader labels; report gaps. |
| PWA | Online first load, controlled reload, offline reload, local assets, update refresh, installed mode; use DEPLOYMENT checklist. |

For documentation-only changes, review source accuracy, relative links, and diff scope. No new automated tests or runtime version bumps are required.

### Muscle view validation — 2026-09-10

- Nine Node tests passed: positive/negative/zero changes, chronological first/latest maxima with mixed set weights and heavier intermediate sessions, equal weighting/contributing counts, unlogged and one-session exercises, unassigned/deleted definitions, unit invariance and difference conversion before display rounding, missing/nonfinite weights/overflow, chart gaps, all ten groups/shared data, and escaped names.
- An installed headless Chromium browser was driven through its debugging protocol with a fresh disposable profile and local Python server; no dependencies were installed and external font requests were blocked. Thirty browser checks passed, including startup, muscle/side navigation, fixed states, every muscle button and SVG tapping, shared-side details, native keyboard activation/focus return, Tab containment, Escape/backdrop dismissal, sheet replacement, kg/lbs reopening, unchanged Today draft nodes, and Overview editing/deletion.
- New-view/sheet overflow checks passed at 320px and 480px, including long unbroken exercise names. Screenshots were reviewed with fallback fonts; a 1280px viewport retained the centered 480px shell. The dialog title/Close button were checked in Chromium's accessibility tree. Reduced-motion mode was exercised. No application runtime exceptions were observed.
- Local service-worker control and v3.9 precaching were checked, including the new script. A browser-network-offline reload successfully reopened muscle details from disposable persisted logs in the selected unit. Reload reset the in-memory navigation defaults. Syntax, manifest/icon paths, asset coverage and diff checks were also run.

This does not verify production hosting, installation on a device, an update from an older controlled worker, Safari/Firefox, or actual screen-reader operation. Those remain manual checks; the scoped keyboard/accessibility checks do not establish whole-app conformance. The disposable browser harness/profile were not added as runtime assets.

### Muscle anatomy/selection revision — 2026-09-12

The starting uncommitted diff and file snapshots, browser checks and before/after screenshots are retained locally under `artifacts/muscle-map-review/`, with `review.html` linking the comparisons and results. These generated artifacts are excluded from Git by `.gitignore`. The original diagrams were rendered and reviewed before editing. The final comparisons use the same disposable library at 320px, 480px and 1280px viewport widths, with additional natural-size body crops and all three history/selected/focused appearances. Captures bypass the service worker and browser cache; baseline recaptures use the saved starting files served from a separate temporary directory. Full-viewport capture preserves responsive sizing rather than expanding the viewport while cropping.

- JavaScript syntax checks and all nine existing muscle-map tests passed; calculation, membership, interaction and shared-sheet code outside the SVG renderer were preserved.
- Headless Chromium 153 passed 31 browser checks and 205 explicit SVG/button taps, covering all visible muscles, both halves, individual abdominal segments, center lines, padding, native Enter/Space, visible focus, dismissal/return, units, rerender state, Today input preservation and Overview availability.
- Geometry sampling at 320px and 480px covered 34,182 points inside painted shapes and 8,408 inside padded areas. It found no cross-muscle paint/padding overlaps or wrong targets at the sampled painted interiors/boundaries. Actual click checks also exercised padded areas; tightly spaced chest/shoulder padding was reduced during iteration.
- A separate 320×568 mobile emulation passed 24 touch taps across both halves of every region. Its accessibility tree exposed exactly one named SVG button and one fallback button per visible group. Logged Shoulders/Calves details matched across sides in lbs, retaining their +25%/−10% kg percentages. The original Today input node/value survived touch navigation.
- Screenshots were actually inspected at normal display size, including neutral/empty calf and glute borders and selected/focused contours. Visual iteration rounded the deltoids/arms and simplified scapular lines. The capture run also verified six keyboard focus states.
- v3.10 cache control, all 15 runtime assets and a network-offline reload of the revised geometry/details passed. Manifest/icon paths, matching versions, documentation links and git diff checks were reviewed. No dependencies were installed, no real user data was used, and no commit or deployment was made.

MuscleWiki's text page was accessible, but visual browser access failed first with a network restriction and then a Cloudflare block. No visual comparison with its artwork is claimed; the SVG geometry is original. Physical devices, Safari/Firefox, actual screen-reader operation, PWA installation and an upgrade from an older worker remain unverified. Browser emulation and geometry tests do not establish medical anatomical accuracy or whole-app accessibility conformance.

## PROPOSED/FUTURE STATE

A focused regression suite for progression, backup validation, and draft/cycle transitions would provide value, but no framework or suite has been selected. Do not silently turn known-bug expectations into intended product requirements.
