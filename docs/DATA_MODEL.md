# Data and backup contract

## CURRENT STATE

### Storage keys

| Key | Value |
|---|---|
| `ironlog.v1` | JSON root state |
| `ironlog.draft` | JSON `{cycleIndex, dayId, entries}`; entries map exercise IDs to arrays of raw `{weight, reps}` input strings |
| `ironlog.unit` | Display preference, normally `kg` or `lbs` |
| `ironlog.hint.dismissed` | Installation hint dismissal |
| `ironlog.onboarding` | Today onboarding dismissal |
| `ironlog.progress.hint.dismissed` | Progress hint dismissal |

The `ironlog` prefix is an existing compatibility identifier; the UI brand is SeannyLog.

### Root schema

| Entity | Fields |
|---|---|
| Root | `schemaVersion: 1`, `cycleIndex`, `days[]`, `exercises{}`, `logs[]`, `restLog[]` |
| Day | `id`, `label`, ordered `exerciseIds[]` |
| Exercise, keyed by ID | `id`, `name`, `muscle`, `sets`, `repMin`, `repMax`, `increment`, `custom` |
| Workout | `id`, `dayId`, ISO `date`, `entries{exerciseId: [{weight, reps}]}` |
| Rest entry | Local `YYYY-MM-DD` date string |

IDs are generated using a prefix and a short `Math.random()` string. Days share exercise definitions; workout entries reference those same IDs. Day labels/exercise configuration are not historical snapshots.

### Units and dates

- Persisted weights/increments are kilograms. `KG_TO_LBS = 2.20462`; input conversion rounds kg to two decimals. Display rounds pounds to quarter-pound increments and kg to two decimals.
- Draft strings represent the selected display unit, with no unit field in the draft. Unit switching converts existing draft weights before changing the preference.
- Workout timestamps use `toISOString()`. Heatmap dates use local calendar days. Backup filenames use the UTC date from `todayISO()`.

### Lifecycle and deletion

- Startup accepts parsed state if `days` and `exercises` are truthy, backfills `restLog`, and otherwise seeds defaults. No complete schema validation/migration exists.
- Saves rewrite the entire root JSON. Persistence errors show a toast; draft errors are silently caught.
- Draft restore requires matching cycle index and day ID. It only fills existing rows and ignores blank strings; dynamic row counts are not restored. Finishing a workout/rest clears the draft.
- Removing an exercise from one day preserves its definition/history. Deleting the exercise globally removes assignments and historical entries, then removes empty workout logs.
- Deleting/replacing days preserves workout logs with old day IDs; history labels fall back to `Session`. Renaming surviving days changes displayed historical labels.
- Reset replaces root state with seeded defaults; separate draft, unit, and hint keys remain.

### Backup and trust boundary

Export serializes root state only. It excludes draft/unit/hint keys. Import replaces rather than merges current state, without a separate overwrite confirmation. Its only initial shape checks are truthy `days` and `exercises`; `restLog` is backfilled.

Import assigns and saves the object before rendering. A later exception can report an invalid backup after overwriting storage. Missing arrays, invalid indexes, bad references, unsupported schema versions, or malformed numbers are not comprehensively rejected. Some fields, including muscle values and IDs, enter HTML unescaped: a crafted import can inject markup. Plain JSON backups and localStorage are not encrypted; any script executing in the origin can access them.

There is no automatic recovery backup, storage quota management, cross-tab reconciliation, or cloud copy. Local data loss requires a previously exported backup for recovery.

## PROPOSED/FUTURE STATE

Not implemented or authorized by this document: validate an entire backup before replacement, define versioned migrations, make saves report failure, and specify complete draft/reset semantics. Preserve old keys/IDs and backup compatibility when such work is explicitly scoped. See [PRD.md](PRD.md) for product decisions.
