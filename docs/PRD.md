# Product baseline

## CURRENT STATE

Purpose: help a single user follow a repeating training split, record lifts, and see when the application suggests increasing weight. No accounts, social features, cloud sync, or AI exist.

### Implemented flows

- **Today:** current cycle day, previous sets, weight prefills, progression dots/badge, editable weight/reps, dynamic set rows, draft autosave, workout/rest completion.
- **Split / Days:** add/rename/delete/reorder days, collapse cards, assign/remove/reorder exercises, load eight day-structure presets. Presets retain the exercise library/history but create empty new days requiring assignment.
- **Split / Exercises:** create custom exercises, reuse suggestions/existing exercises, configure name/sets/rep range/increment, assign to multiple days, delete exercise and its history.
- **Progress / Overview (default):** muscle-grouped cards, best/last weight, logged count, all-history sparkline, last six sessions, edit existing set values, delete an entire workout session. A 26-week heatmap shows training intensity by exercise-entry count and completed rest days, with totals and consistency streaks.
- **Progress / Muscles:** front/back body diagrams and equivalent muscle buttons open read-only details for all ten muscle groups. Shoulders and Calves share data across both sides. Every currently defined exercise with matching muscle/history is included, even without day assignments. Full session details and history editing/deletion remain in Overview.
- **Settings:** kg/lbs, backup import/export, manual current-day selection, undo last workout, reset. Installation/onboarding hints and update notifications also exist.

### Exact current rules

- Default program: eight-day Push/Pull/Legs/Rest repeated twice; 15 exercise definitions, generally two sets and 8–10 reps. The cycle advances only through user actions.
- A day labeled exactly `Rest`, or any day with no assigned exercises, displays the rest screen. Rest completion is recorded at most once per local date.
- Workout collection accepts parsed weight > 0 and integer-parsed reps > 0. At least one valid set is required. Missing/invalid rows are omitted after confirmation; fully filled workouts finish immediately. Stored weights over 300kg prompt a separate warning.
- Progression examines the latest two logs containing that exercise, sorted by timestamp. Each session qualifies if **any** set reaches the exercise's current `repMax`.
- Readiness requires both sessions to qualify and their **first-set** weights to differ by less than 0.1kg. The qualifying sets need not be those first sets.
- Dots: two for readiness; otherwise one if either of the latest two sessions qualifies; otherwise zero. Thus a latest-session miss does not necessarily reset the display to zero.
- Suggested increase is latest first-set weight plus the current exercise increment. When ready, configured rows prefill that suggestion; otherwise each row uses its corresponding prior set where available.
- Exercise configuration is global across assigned days. Changing rep targets changes progression calculated from old logs.
- Consistency streaks count consecutive local dates with training or completed rest, starting yesterday if today is uncovered. They are separate from exercise progression dots.
- Undo removes the last workout array entry and decrements the current cycle index; it does not undo rest completions or reconstruct intervening cycle changes.

### Muscle load-change metric

The headline **Average top-weight change** is logged load change, not muscle growth or ascend readiness. Sessions come from `exerciseLogsInOrder(exId)` in chronological order. Each session's top weight is its maximum stored kg set weight. The endpoints are the first and latest sessions across all available history, even if an intermediate session was heavier.

An exercise contributes only with at least two sessions, a positive first-session top weight, and finite endpoints, difference and percentage. Its percentage is `100 * (latestTopKg - firstTopKg) / firstTopKg`. The headline is the unweighted arithmetic mean of eligible exercise percentages, accompanied by the contributing count. Each exercise counts equally despite different history lengths. Calculations use stored kg without intermediate rounding; displayed percentages have one decimal, retain negative/zero changes, and normalize negative zero. Unit switching cannot change them. Displayed endpoints, differences and sparklines use existing unit helpers; differences are calculated in kg before conversion.

One-session exercises show their recorded maximum and session count without a fabricated change. Unlogged exercises do not dilute the average; zero eligible exercises show **Not enough history**. Empty definitions direct the user to Split, while defined but unlogged muscles invite logging. Missing/nonfinite set weights mark that session's maximum unavailable; unknown endpoints are never replaced by another session, and charts keep gaps in place. Invalid middle sessions do not disqualify otherwise valid endpoints. These guards apply to the new calculations, not general backup validation.

## PARTIAL / KNOWN LIMITATIONS

Draft recovery does not reproduce dynamic set counts. Current-day expansion initializes with collapsed state rather than following every cycle advance. Program mutations can leave edited Today inputs stale. Storage/import/reset boundaries are detailed in [DATA_MODEL.md](DATA_MODEL.md).

## PROPOSED/FUTURE STATE — unresolved decisions

No new features or revised rules are approved. Resolve these before changing behavior:

1. Should target-reaching sets themselves match weights, and should a latest-session miss reset dots?
2. Should zero-load/bodyweight sets be valid? Such exercises exist in suggestions, but zero weights cannot be logged.
3. How should active workouts behave when days/exercises are edited, reordered, removed, or replaced?
4. Should undo restore the original workout day, including after intervening rest/manual changes?
5. Should reset erase preferences/hints/drafts, and should backups include them?
6. Should rep ranges enforce minimum ≤ maximum? The current forms do not.

Production hosting on GitHub Pages is owner-confirmed; see [DEPLOYMENT.md](DEPLOYMENT.md). Browser support targets, Pages publishing settings, and future priorities remain unconfirmed. This baseline does not claim end-to-end verification of every implemented flow.
