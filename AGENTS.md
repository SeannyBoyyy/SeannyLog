# Repository instructions

SeannyLog is a browser-only workout PWA. These instructions govern future changes; they do not authorize implementing the open issues recorded in the documentation.

## Architecture and responsibilities

- Preserve vanilla HTML/CSS/JavaScript, static hosting, and local persistence unless the task explicitly changes those constraints.
- `index.html`: application shell and ordered classic-script loading.
- `css/style.css`: shared UI styles and tokens.
- `docs/`: supporting project documentation. Keep `README.md` and repository-wide `AGENTS.md` at the root.
- `js/state.js`: shared state, storage, units, seeds, drafts, helpers.
- `js/logic.js`: progression, workout collection/completion, mutation helpers.
- `js/render-*.js`: respective Today, Progress, and Split views and interactions.
- `js/settings.js`: settings, backup transfer, reset, cycle selection.
- `js/ui.js`: navigation, sheets, toasts, initialization, service-worker registration.
- `sw.js` and `manifest.json`: offline delivery and installation metadata.
- Scripts share global scope: keep `state.js` first and `ui.js` last. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for dependencies.

## Coding and naming conventions

- Follow surrounding formatting: two-space JavaScript indentation, semicolons, single-quoted ordinary strings, template literals for markup.
- Use camelCase functions/variables, UPPER_SNAKE_CASE constants, kebab-case filenames and CSS classes. Existing generated IDs use `ex_`, `day_`, and `log_` prefixes.
- Keep changes in the owning file; do not introduce new globals without checking all scripts for collisions.
- Use `escapeHtml()` for text inserted into HTML; validate imported data and escape attribute values. Existing unsafe interpolations are debt, not a convention to copy.
- Use existing unit/date helpers. Persist weights and increments in kilograms; do not relabel display values as stored values.
- Preserve storage keys and historical IDs. Do not change schema or deletion semantics without explicit scope, compatibility handling, and validation.
- Mutation callers choose which views to refresh. Check Today draft/dirty behavior before adding rerenders; `renderAll()` can replace active inputs.

## UI constraints

- Retain the centered 480px mobile layout, Today/Progress/Split navigation, shared sheets, typography roles, and existing color tokens.
- Reuse established classes before adding inline styling. See [DESIGN.md](docs/DESIGN.md).
- New or changed controls should have accessible names, keyboard behavior, and visible focus. Do not reproduce documented accessibility gaps.
- Preserve active workout inputs when changing related UI; do not assume draft restoration is complete.

## Dependencies and prohibited practices

- No dependency installation, framework, bundler, backend, analytics, cloud storage, or external service unless explicitly included in the task.
- No opportunistic refactoring, wholesale rewrites, unrelated formatting, or speculative features.
- Do not clear real user storage or overwrite backups during validation. Use an isolated browser profile/origin and disposable data.
- Do not claim browser, offline, installation, or accessibility validation from syntax checks alone.
- Do not treat proposed work in documentation as implemented or authorized.

## Validation and definition of done

- Follow [TESTING.md](docs/TESTING.md); run syntax checks for JavaScript changes and relevant browser flows for behavior changes.
- From repository root in PowerShell: `Get-ChildItem js/*.js, sw.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($_.Name)" } }`.
- Review `git diff --check`, `git diff --stat`, and `git status --short`. Documentation-only changes require link/content review, not a new test suite.
- Runtime releases require checking the service-worker asset list and updating both version constants together; see [DEPLOYMENT.md](docs/DEPLOYMENT.md). Documentation-only edits do not require version changes.
- Done means requested scope is complete, unrelated files/dependencies are untouched, relevant checks pass or limitations are reported, and affected documentation reflects actual behavior. Report what changed, checks performed, and unresolved risks.
