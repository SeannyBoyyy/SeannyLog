/* ===================== Progression logic ===================== */
/* Core rules: reading exercise history, computing streak/ascend status,
   finishing a workout, undo, and adding library exercises to a day. */

/* ---------- progression logic ---------- */
function exerciseLogsInOrder(exId){
  return state.logs
    .filter(l => l.entries && l.entries[exId] && l.entries[exId].length)
    .map(l => ({id:l.id, date:l.date, sets:l.entries[exId]}))
    .sort((a,b) => a.date.localeCompare(b.date));
}

// treats weights as equal if they're within a small tolerance — protects against
// floating-point drift from kg/lbs unit round-tripping (e.g. 45.3593 vs 45.36),
// and against normal small variation in real-world loading (e.g. 59.92 vs 59.87).
// Must be comfortably larger than the smallest displayable step (0.01), or a
// single real-world "one tick different" weight will wrongly break the streak.
const WEIGHT_TOLERANCE = 0.1;
function weightsMatch(a, b){
  return Math.abs(a - b) < WEIGHT_TOLERANCE;
}

function getProgressionStatus(exId){
  const ex = state.exercises[exId];
  if(!ex) return {streak:0, ready:false, lastSession:null, suggestedWeight:null};
  const history = exerciseLogsInOrder(exId);
  const last2 = history.slice(-2);

  // a session "hits top" if ANY logged set reaches the rep max — works whether
  // someone logs just 1 set that day, or throws in extra bonus sets beyond ex.sets
  const hitTop = (session) => session.sets.some(s => s.reps >= ex.repMax);

  let streak = 0;
  if(last2.length===2){
    const h0 = hitTop(last2[0]);
    const h1 = hitTop(last2[1]);
    const sameWeight = last2[0].sets[0] && last2[1].sets[0] && weightsMatch(last2[0].sets[0].weight, last2[1].sets[0].weight);
    if(h0 && h1 && sameWeight) streak = 2;
    else if(h0 || h1) streak = 1;
  } else if(last2.length===1 && hitTop(last2[0])){
    streak = 1;
  }

  const lastSession = history[history.length-1] || null;
  const suggestedWeight = (lastSession && lastSession.sets[0])
    ? +(lastSession.sets[0].weight + ex.increment).toFixed(2)
    : null;

  return { streak, ready: streak>=2, lastSession, suggestedWeight };
}

/* ---------- mutations ---------- */
function advanceCycle(){
  state.cycleIndex = (state.cycleIndex + 1) % state.days.length;
}

function finishWorkout(){
  const day = state.days[state.cycleIndex];
  const entries = {};
  let anyFilled = false;

  day.exerciseIds.forEach(exId => {
    const ex = state.exercises[exId];
    if(!ex) return;
    const sets = [];
    let i = 0;
    while(true){
      const w = document.getElementById(`set-w-${exId}-${i}`);
      const r = document.getElementById(`set-r-${exId}-${i}`);
      if(!w || !r) break;
      const wv = parseFloat(w.value);
      const rv = parseInt(r.value,10);
      if(!isNaN(wv) && !isNaN(rv) && wv>0 && rv>0) sets.push({weight:toKg(wv), reps:rv});
      i++;
    }
    if(sets.length){ entries[exId] = sets; anyFilled = true; }
  });

  if(!anyFilled){ toast('Log at least one set before finishing.'); return; }

  // sanity check — warn if any weight looks like a typo (> 300kg / 660lbs)
  const maxKg = 300;
  const suspiciousSets = [];
  Object.entries(entries).forEach(([exId, sets]) => {
    const ex = state.exercises[exId];
    sets.forEach(s => {
      if(s.weight > maxKg){
        suspiciousSets.push(`${ex?.name}: ${formatWeight(toDisplay(s.weight))}${unitLabel()}`);
      }
    });
  });
  if(suspiciousSets.length){
    const msg = `These weights look unusually high — possible typo?\n\n${suspiciousSets.join('\n')}\n\nLog anyway?`;
    if(!confirm(msg)) return;
  }

  const willAscend = [];
  day.exerciseIds.forEach(exId => {
    if(!entries[exId]) return;
    const before = getProgressionStatus(exId);
    const tempLog = {id:'temp', dayId:day.id, date:new Date().toISOString(), entries:{[exId]:entries[exId]}};
    state.logs.push(tempLog);
    const after = getProgressionStatus(exId);
    state.logs.pop();
    if(after.ready && !before.ready) willAscend.push(state.exercises[exId].name);
  });

  state.logs.push({ id: uid('log'), dayId: day.id, date: new Date().toISOString(), entries });
  advanceCycle();
  clearDraft();
  save();
  renderToday();
  renderProgress();

  if(willAscend.length){
    toast(`Logged. Time to ascend on ${willAscend.length>1 ? willAscend.length+' lifts' : willAscend[0]} next time.`);
  } else {
    toast('Workout logged. Nice work.');
  }
}

function undoLastLog(){
  if(!state.logs.length){ toast('No workouts to undo.'); return false; }
  if(!confirm('Remove the most recently logged workout? This cannot be undone.')) return false;
  state.logs.pop();
  state.cycleIndex = (state.cycleIndex - 1 + state.days.length) % state.days.length;
  save();
  renderAll();
  toast('Last workout removed.');
  return true;
}

function addLibraryExerciseToDay(name, muscle, dayId){
  let existing = Object.values(state.exercises).find(e => e.name===name);
  let exId;
  if(existing){ exId = existing.id; }
  else{
    exId = uid('ex');
    state.exercises[exId] = {id:exId, name, muscle, sets:2, repMin:8, repMax:10, increment:defaultIncrement(muscle), custom:false};
  }
  const day = state.days.find(d => d.id===dayId);
  if(!day.exerciseIds.includes(exId)) day.exerciseIds.push(exId);
  save();
}

// Attach an exercise that already exists in state.exercises (seeded, library-added,
// or custom) to another day. No name lookup needed since we already have its id —
// this is what lets a custom exercise created via the Exercises tab (skip-day-assignment
// path) get picked up later from any day's "+ Exercise" sheet.
function addExistingExerciseToDay(exId, dayId){
  const day = state.days.find(d => d.id===dayId);
  if(day && !day.exerciseIds.includes(exId)) day.exerciseIds.push(exId);
  save();
}
