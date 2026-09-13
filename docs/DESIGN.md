# UI baseline

## CURRENT STATE

`css/style.css` owns shared styling; render scripts also contain inline styles and SVG colors. There is no component framework or external design-system package.

| Concern | Existing implementation |
|---|---|
| Layout | Centered column, maximum 480px, sticky header, fixed bottom navigation; desktop retains mobile layout |
| Surfaces | Iron background, lighter dark cards, subtle borders, generally 14px card radius |
| Color tokens | `--iron #1C1B1A`, `--iron-soft #262422`, `--iron-soft-2 #312E2A`, `--chalk #EDEAE3`, `--chalk-dim #A39E94`, `--rust #C1572A`, `--rust-dim #8F4520`, `--steel #6E8B98`, `--danger #C0392B`, `--danger-dim #8F2A1F` |
| Typography | Oswald: headings/buttons; Inter: body; IBM Plex Mono: measurements/metadata. Google-hosted with generic fallbacks |
| Scale | Main titles 34px; exercise titles 17px; much metadata 10–12px; set inputs 15px |
| Spacing | Mostly 8–18px local gaps/padding; no formal spacing token scale |
| Components | Exercise/day/progress cards, primary/ghost/outline/danger buttons, set rows, steppers, chips, segmented controls, sheets, toasts |
| Responsive behavior | Fluid width, wrapping chip/config controls, horizontally scrolling heatmap and muscle filters; no viewport-width breakpoints |
| Sheets | Shared bottom-aligned container, 84vh maximum height, scrollable content, backdrop dismissal; decorative handle, no drag behavior |
| Safe areas | Bottom nav/sheets include bottom inset; main content reserves space for navigation |
| Motion | Badge/sheet entry animations guarded by reduced-motion preference; other small transitions remain |

Interactions use taps/clicks, inline edits, expand/collapse, and native confirmation dialogs. Removing an exercise assignment offers a four-second undo toast. Reset uses a custom sheet emphasizing Cancel. Charts are handwritten SVG: sparkline shows per-session maximum weight; heatmap uses rust intensity and steel for rest.

### Muscle progress view

Progress adds Overview/Muscles and Front/Back controls using the existing segmented buttons with `aria-pressed` and separate data attributes. The centered body silhouette uses original handwritten inline SVG and scoped `.muscle-map-*` styles, with a responsive maximum width of 280px inside the 480px app shell. Bilateral paths are grouped into one named keyboard target per muscle; Enter/Space opens the same details as the six touch buttons below each side. Buttons are at least 48px tall and wrap in two columns.

Front anatomy includes paired pectorals, rounded deltoids/biceps, separate abdominal segments and obliques, contoured quads, patella cues, and narrow lateral calf regions beside the shins. The rear uses different shoulder/calf geometry, paired back/lat shapes with scapular and spine cues, rounded glutes and hamstrings. Front face/jaw/clavicle cues differ from the rear head/neck. All back subdivisions still select Back; Shoulders/Calves still share data across sides. This is a fitness muscle-group illustration, not a medical anatomy chart.

The legend describes three fixed states: dim neutral fill with a muted visible boundary for no exercise definitions, neutral outline for definitions without history, and rust fill for logged history. Calves and glutes retain boundaries in every state. Color never encodes percentage or recency. Empty regions remain interactive; steel outlines mark the selected group and visible keyboard focus. Interior contours use a lighter neutral line or a dark line over rust, separate from selection borders. See [PRD.md](PRD.md) for the metric and limited-history copy.

Each SVG target contains a hidden hit layer, a painted layer and decorative contours. Padding extends at most two SVG units, reduced to one at chest/shoulder junctions to avoid overlapping adjacent targets. Hidden midline paths connect the chest, abs and back within their existing group so their center lines remain selectable. Contours never intercept input, and child layers add no keyboard stops. Visual comparisons and the geometry/touch validation record are linked from [TESTING.md](TESTING.md).

Muscle details reuse the shared sheet with a named dialog, explicit Close button, initial title focus, Tab containment, Escape/backdrop dismissal and focus return. The surrounding app is inert only during this flow; replacing the sheet restores it. Long exercise names and weight summaries wrap. The muscle view adds no motion or external visual assets.

### Existing inconsistencies and accessibility gaps

- Many field labels lack `for` associations; workout inputs rely on placeholders/context.
- Clickable card headers, history cells, and SVG cells lack equivalent keyboard interaction and semantic controls.
- Sheets other than muscle details lack dialog semantics, managed focus, Escape handling, and background inertness. Toasts lack live-region announcements.
- Some icon controls have labels and global `:focus-visible` exists, but coverage is incomplete.
- Small reorder/delete targets, low-opacity text, and rust text require visual/contrast checks. No measured accessibility conformance is claimed.
- Inline styles and hardcoded chart colors duplicate CSS tokens. Several controls use smaller sizing than primary workout actions.

## PROPOSED/FUTURE STATE

Keep the existing visual identity for scoped changes. Improvements to semantic controls, labeling, focus, contrast, and touch targets are candidates, not completed work. Browser rendering, narrow-screen/zoom behavior, font fallback, and assistive-technology behavior require validation; see [TESTING.md](TESTING.md).
