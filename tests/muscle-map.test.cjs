const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function app(exercises = {}, logs = []){
  const storage = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    }
  });
  for(const file of ['state.js', 'logic.js', 'render-muscle-map.js']){
    vm.runInContext(readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context, {filename:file});
  }
  context.fixture = {schemaVersion:1, exercises, logs, days:[], cycleIndex:0, restLog:[]};
  vm.runInContext('state = fixture;', context);
  return context;
}

function exercise(id, muscle = 'Chest', name = id){
  return {id, name, muscle, sets:2, repMin:8, repMax:10, increment:1, custom:true};
}

function session(id, day, entries){
  return {
    id,
    date: `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
    dayId: 'day_removed',
    entries: Object.fromEntries(Object.entries(entries).map(([exId, weights]) => [exId, weights.map(weight => ({weight, reps:10}))]))
  };
}

test('first/latest session maxima retain positive, negative and zero changes; equal weighting ignores session count', () => {
  const exercises = Object.fromEntries(['up', 'down', 'flat', 'once', 'unlogged'].map(id => [id, exercise(id)]));
  const context = app(exercises, [
    session('log_latest', 20, {up:[20, 10], down:[20, 10], flat:[50, 30]}),
    session('log_first', 1, {up:[5, 10], down:[25, 40], flat:[30, 50], once:[7, 9]}),
    session('log_middle', 10, {down:[100], flat:[80]})
  ]);
  const before = JSON.stringify(context.fixture);
  const summary = context.getMuscleMapSummary('Chest');
  assert.equal(summary.definitionCount, 5);
  assert.equal(summary.loggedExercises.length, 4);
  assert.equal(summary.contributingCount, 3);
  assert.ok(Math.abs(summary.averageChangePercent - 50 / 3) < 1e-12);
  const [up, down, flat, once] = summary.loggedExercises;
  assert.equal(up.firstTopKg, 10);
  assert.equal(up.latestTopKg, 20);
  assert.equal(up.percentageChange, 100);
  assert.equal(down.firstTopKg, 40);
  assert.equal(down.latestTopKg, 20);
  assert.equal(down.percentageChange, -50);
  assert.equal(down.sessionCount, 3);
  assert.equal(flat.weightChangeKg, 0);
  assert.equal(flat.percentageChange, 0);
  assert.equal(once.sessionCount, 1);
  assert.equal(once.firstTopKg, 9);
  assert.equal(once.weightChangeKg, null);
  assert.equal(once.percentageChange, null);
  assert.equal(JSON.stringify(context.fixture), before, 'calculations must not mutate state');
});

test('single-session and untrained muscles have distinct limited/empty states', () => {
  const context = app({once:exercise('once'), waiting:exercise('waiting', 'Back')}, [session('log_one', 1, {once:[30, 40]})]);
  const one = context.getMuscleMapSummary('Chest');
  assert.equal(one.historyState, 'logged');
  assert.equal(one.averageChangePercent, null);
  assert.equal(one.contributingCount, 0);
  const card = context.renderMuscleMapExercise(one.loggedExercises[0]);
  assert.match(card, /Recorded top weight: 40 kg/);
  assert.match(card, /1 session logged/);
  assert.doesNotMatch(card, /%|muscle-map-change/);
  assert.equal(context.getMuscleMapSummary('Back').historyState, 'unlogged');
  const empty = context.getMuscleMapSummary('Abs');
  assert.equal(empty.historyState, 'no-exercises');
  assert.equal(empty.definitionCount, 0);
  assert.equal(empty.averageChangePercent, null);
  assert.equal(context.renderMuscleMapSparkline([]), '');
});

test('library definitions with history contribute without any day assignments; deleted definitions do not', () => {
  const context = app({orphan:exercise('orphan')}, [
    session('log_first', 1, {orphan:[30], deleted:[50]}),
    session('log_last', 2, {orphan:[45], deleted:[500]})
  ]);
  const summary = context.getMuscleMapSummary('Chest');
  assert.equal(summary.loggedExercises.length, 1);
  assert.equal(summary.loggedExercises[0].id, 'orphan');
  assert.equal(summary.contributingCount, 1);
  assert.equal(summary.averageChangePercent, 50);
});

test('percentage calculations stay in kg without intermediate rounding or negative zero', () => {
  const context = app({a:exercise('a'), b:exercise('b')}, [
    session('log_first', 1, {a:[3], b:[7]}), session('log_last', 2, {a:[4], b:[9]})
  ]);
  const expected = ((1 / 3) * 100 + (2 / 7) * 100) / 2;
  const kg = context.getMuscleMapSummary('Chest');
  assert.equal(kg.averageChangePercent, expected);
  context.setUnit('lbs');
  const lbs = context.getMuscleMapSummary('Chest');
  assert.equal(lbs.averageChangePercent, kg.averageChangePercent);
  assert.equal(JSON.stringify(lbs.loggedExercises), JSON.stringify(kg.loggedExercises));
  assert.equal(context.formatMuscleMapPercent(expected), '+31.0%');
  assert.equal(context.formatMuscleMapPercent(-2.34), '-2.3%');
  assert.equal(context.formatMuscleMapPercent(-0.001), '0.0%');
  assert.equal(context.formatMuscleMapPercent(-0), '0.0%');
  assert.equal(context.formatMuscleMapPercent(0), '0.0%');
  assert.equal(context.formatMuscleMapPercent(NaN), 'Not enough history');
  assert.equal(context.formatMuscleMapPercent(Infinity), 'Not enough history');
});

test('signed displayed differences convert the kg difference before display rounding', () => {
  const context = app({a:exercise('a')}, [session('log_first', 1, {a:[50]}), session('log_last', 2, {a:[50.06]})]);
  context.setUnit('lbs');
  const ex = context.getMuscleMapSummary('Chest').loggedExercises[0];
  assert.equal(context.toDisplay(ex.latestTopKg) - context.toDisplay(ex.firstTopKg), 0);
  assert.equal(context.formatMuscleMapWeight(ex.weightChangeKg, true), '+0.25 lbs');
  assert.match(context.renderMuscleMapExercise(ex), /\+0.25 lbs/);
  context.setUnit('kg');
  assert.equal(context.formatMuscleMapWeight(ex.weightChangeKg, true), '+0.06 kg');
  assert.equal(context.formatMuscleMapWeight(-0.001, true), '0 kg');
});

test('zero/negative baselines, missing/nonfinite sets and calculation overflow are ineligible', () => {
  const invalid = [0, -5, undefined, null, NaN, Infinity, '10', Number.MIN_VALUE];
  const exercises = Object.fromEntries(invalid.map((_, i) => [`a${i}`, exercise(`a${i}`)]));
  const first = Object.fromEntries(invalid.map((weight, i) => [`a${i}`, [weight]]));
  const latest = Object.fromEntries(invalid.map((_, i) => [`a${i}`, [10]]));
  const context = app(exercises, [session('log_first', 1, first), session('log_last', 2, latest)]);
  const summary = context.getMuscleMapSummary('Chest');
  assert.equal(summary.loggedExercises.length, invalid.length);
  assert.equal(summary.contributingCount, 0);
  assert.equal(summary.averageChangePercent, null);
  assert.equal(context.muscleMapSessionTopKg([]), null);
  assert.equal(context.muscleMapSessionTopKg(null), null);
  assert.equal(context.muscleMapSessionTopKg([null]), null);
  assert.equal(context.muscleMapSessionTopKg([{weight:10}, {}]), null);
  const markup = summary.loggedExercises.map(context.renderMuscleMapExercise).join('');
  assert.doesNotMatch(markup, /NaN|Infinity/);
  assert.equal(context.formatMuscleMapWeight(Number.MAX_VALUE), 'Weight unavailable');
});

test('invalid endpoints are never replaced; unavailable middle sessions break the sparkline', () => {
  const context = app({a:exercise('a'), b:exercise('b')}, [
    session('log_first', 1, {a:[undefined], b:[10]}),
    session('log_middle', 2, {a:[10], b:[NaN]}),
    session('log_last', 3, {a:[20], b:[20]})
  ]);
  const summary = context.getMuscleMapSummary('Chest');
  assert.equal(summary.contributingCount, 1);
  assert.equal(summary.averageChangePercent, 100);
  assert.equal(summary.loggedExercises[0].firstTopKg, null);
  assert.equal(summary.loggedExercises[0].percentageChange, null);
  const spark = context.renderMuscleMapSparkline(summary.loggedExercises[1].topWeightsKg);
  assert.match(spark, /d="M[^"]* M/);
  assert.doesNotMatch(spark, /NaN|Infinity/);
  assert.equal(context.renderMuscleMapSparkline([null, NaN, Infinity]), '');
});

test('all ten canonical muscles are reachable and shared groups use the same summaries', () => {
  const context = app({a:exercise('a', 'Shoulders'), b:exercise('b', 'Calves')}, [
    session('log_first', 1, {a:[10], b:[20]}), session('log_last', 2, {a:[15], b:[30]})
  ]);
  const groups = vm.runInContext('MUSCLE_MAP_GROUPS', context);
  const muscles = vm.runInContext('MUSCLES', context);
  assert.deepEqual([...new Set([...groups.front, ...groups.back])].sort(), Array.from(muscles).sort());
  for(const muscle of ['Shoulders', 'Calves']){
    const front = JSON.stringify(context.getMuscleMapSummary(muscle));
    vm.runInContext("muscleMapSide = 'back';", context);
    assert.equal(JSON.stringify(context.getMuscleMapSummary(muscle)), front);
  }
});

test('exercise names are escaped in detail markup', () => {
  const context = app({a:exercise('a', 'Chest', '<img src=x onerror="bad()"> & press')}, [session('log_one', 1, {a:[10]})]);
  const markup = context.renderMuscleMapExercise(context.getMuscleMapSummary('Chest').loggedExercises[0]);
  assert.match(markup, /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt; &amp; press/);
  assert.doesNotMatch(markup, /<img/);
});
