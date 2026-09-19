import test from 'node:test';
import assert from 'node:assert/strict';
import rules from '../../js/reminder-rules.js';

const ex = {name:'Squat', sets:2, repMin:8, repMax:10, increment:2.5};
const base = () => ({cycleIndex:0, days:[{label:'Legs', exerciseIds:['ex']}, {label:'Pull', exerciseIds:['ex']},
  {label:'Rest', exerciseIds:[]}], exercises:{ex}, logs:[], restLog:[], restCompletions:[]});
const now = Date.parse('2026-09-14T00:15:00Z');
const snapshot = (state, instant=now, zone='America/Los_Angeles') => rules.snapshot(state, instant, zone);
const due = (overrides={}) => ({currentDayEligible:true, completedLocalDate:null, time:'18:00', timeZone:'Asia/Manila',
  observedAt:Date.parse('2026-09-14T00:00:00Z'), expiresAt:Date.parse('2026-09-21T00:00:00Z'), ...overrides});

test('eligibility follows only the manually selected cycle day and valid exercise references', () => {
  const state = base();
  const before = structuredClone(state);
  assert.equal(snapshot(state).currentDayEligible, true);
  assert.deepEqual(state, before);
  state.cycleIndex = 2;
  assert.equal(snapshot(state).currentDayEligible, false);
  state.days[2].exerciseIds = ['ex'];
  assert.equal(snapshot(state).currentDayEligible, false);
  state.cycleIndex = 0;
  state.days[0].exerciseIds = ['missing'];
  assert.equal(snapshot(state).currentDayEligible, false);
  state.days[0].exerciseIds = ['invalid'];
  state.exercises.invalid = {...ex, sets:0};
  assert.equal(snapshot(state).currentDayEligible, false);
  state.days[0].exerciseIds.push('ex');
  assert.equal(snapshot(state).currentDayEligible, true);
});
test('local calendar boundaries differ from UTC, including extreme timezone offsets', () => {
  assert.equal(rules.localDate(now,'America/Los_Angeles'), '2026-09-13');
  assert.equal(rules.localDate(now,'Asia/Manila'), '2026-09-14');
  assert.equal(rules.localDate('2026-09-14T10:00Z','Pacific/Kiritimati'), '2026-09-15');
  assert.equal(rules.localDate('2026-09-14T09:59Z','Pacific/Kiritimati'), '2026-09-14');
});
test('completed workout suppresses the same local date after advancing, even across UTC midnight', () => {
  const state = base();
  state.logs.push({date:'2026-09-13T23:50:00Z', entries:{ex:[{weight:50,reps:10}]}});
  state.cycleIndex = 1;
  assert.deepEqual(snapshot(state), {currentDayEligible:true, completedLocalDate:'2026-09-13'});
  assert.equal(rules.eligibleToday(snapshot(state), now, 'America/Los_Angeles'), false);
  assert.equal(snapshot(state, '2026-09-14T07:00:00Z').completedLocalDate, null);
});
test('rest completion suppresses the newly advanced workout day; legacy backups remain supported', () => {
  const state = base();
  state.restLog = ['2026-09-13'];
  assert.equal(snapshot(state).completedLocalDate, '2026-09-13');
  state.restCompletions = [{date:'2026-09-14T00:00:00Z', localDate:'2026-09-13'}];
  assert.equal(snapshot(state, now, 'Asia/Manila').completedLocalDate, '2026-09-14');
  assert.equal(snapshot(state, '2026-09-15T00:00Z', 'Asia/Manila').completedLocalDate, null);
});
test('undo removes suppression only when no other workout or rest was completed that date', () => {
  const state = base();
  state.logs.push({date:new Date(now).toISOString()});
  assert.equal(snapshot(state).completedLocalDate,'2026-09-13');
  state.logs.pop();
  assert.equal(snapshot(state).completedLocalDate,null);
  state.restLog.push('2026-09-13');
  assert.equal(snapshot(state).completedLocalDate,'2026-09-13');
});
test('travel recalculates completion dates from timestamps in the new device timezone', () => {
  const state = base();
  state.logs = [{date:'2026-09-13T23:00Z'}];
  assert.equal(snapshot(state, now, 'Asia/Manila').completedLocalDate, '2026-09-14');
  assert.equal(snapshot(state, now, 'Europe/London').completedLocalDate, '2026-09-14');
  assert.equal(snapshot(state, now, 'UTC').completedLocalDate, null);
});
test('scheduled time uses the date-specific IANA offset', () => {
  assert.equal(new Date(rules.scheduledInstant('2026-01-10','18:00','America/New_York')).toISOString(), '2026-01-10T23:00:00.000Z');
  assert.equal(new Date(rules.scheduledInstant('2026-07-10','18:00','America/New_York')).toISOString(), '2026-07-10T22:00:00.000Z');
});
test('DST spring gap shifts forward; autumn fold selects the first occurrence', () => {
  assert.equal(new Date(rules.scheduledInstant('2026-03-08','02:30','America/New_York')).toISOString(), '2026-03-08T07:30:00.000Z');
  assert.equal(new Date(rules.scheduledInstant('2026-11-01','01:30','America/New_York')).toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(new Date(rules.scheduledInstant('2026-10-04','02:15','Australia/Lord_Howe')).toISOString(), '2026-10-03T15:45:00.000Z');
});
test('scheduler respects completion, expiry, exact boundaries and one-hour catch-up window', () => {
  const instant = Date.parse('2026-09-14T10:00Z');
  assert.equal(rules.dueDate(due(), instant-1), null);
  assert.equal(rules.dueDate(due(), instant), '2026-09-14');
  assert.equal(rules.dueDate(due(), instant+3600000), null);
  assert.equal(rules.dueDate(due({expiresAt:instant}), instant), null);
  assert.equal(rules.dueDate(due({currentDayEligible:false}), instant), null);
  assert.equal(rules.dueDate(due({completedLocalDate:'2026-09-14'}), instant), null);
  assert.equal(rules.dueDate(due({completedLocalDate:'2026-09-13'}), instant), '2026-09-14');
});

test('seven-day expiry is 168 elapsed hours across DST, independent of local midnight', () => {
  assert.equal(rules.ELIGIBILITY_TTL,7*86400000);
  for(const [start,expected] of [
    ['2026-03-04T18:00:00Z','2026-03-11T18:00:00.000Z'],
    ['2026-10-28T18:00:00Z','2026-11-04T18:00:00.000Z']
  ]){
    const observedAt = Date.parse(start), expiresAt = observedAt+rules.ELIGIBILITY_TTL;
    assert.equal(new Date(expiresAt).toISOString(),expected);
    const clock = rules.parts(expiresAt-1,'America/New_York');
    const time = `${String(Math.floor(clock.minute/60)).padStart(2,'0')}:${String(clock.minute%60).padStart(2,'0')}`;
    const row = due({observedAt,expiresAt,time,timeZone:'America/New_York'});
    assert.equal(rules.dueDate(row,expiresAt-1),clock.date);
    assert.equal(rules.dueDate(row,expiresAt),null);
  }
});
