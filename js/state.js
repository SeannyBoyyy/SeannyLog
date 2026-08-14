/* ===================== SeannyLog — state & storage ===================== */
/* Global constants, persisted app state, unit conversion, and the workout
   draft (mid-session autosave). Loaded first — every other module reads
   from `state` and calls save()/load() defined here. */

const STORAGE_KEY = 'ironlog.v1';
const HINT_KEY = 'ironlog.hint.dismissed';
const DRAFT_KEY = 'ironlog.draft';
const UNIT_KEY = 'ironlog.unit';
const ONBOARDING_KEY = 'ironlog.onboarding';
const PROGRESS_HINT_KEY = 'ironlog.progress.hint.dismissed';
// Shown in Settings so you can confirm a deploy actually reached this device.
// No build step ties this to sw.js's CACHE_NAME automatically — bump both by
// hand together when you ship a change.
const APP_VERSION = '3.7';
let splitSegment = 'days';
let collapsedDays = null; // null = not yet initialized; Set of day IDs when ready

/* ---------- unit helpers ---------- */
const KG_TO_LBS = 2.20462;
function getUnit(){ return localStorage.getItem(UNIT_KEY) || 'kg'; }
function setUnit(u){ localStorage.setItem(UNIT_KEY, u); }
function toDisplay(kg){
  const n = Number(kg); if(!isFinite(n)) return 0;
  return getUnit()==='lbs' ? Math.round(n*KG_TO_LBS*4)/4 : Math.round(n*100)/100;
}
function toKg(val){
  const n = Number(val); if(!isFinite(n)) return 0;
  const kg = getUnit()==='lbs' ? (n/KG_TO_LBS) : n;
  return Math.round(kg*100)/100;
}
function unitLabel(){ return getUnit(); }
// converts a typed weight value from one unit to another, independent of the
// currently active global unit — used to fix up in-progress draft inputs when
// the person switches units mid-workout, so a typed number keeps its real
// meaning instead of being silently relabeled under the new unit
function convertWeightValue(val, fromUnit, toUnit){
  const n = parseFloat(val);
  if(!isFinite(n)) return val;
  if(fromUnit === toUnit) return val;
  const kg = fromUnit === 'lbs' ? n / KG_TO_LBS : n;
  const out = toUnit === 'lbs' ? kg * KG_TO_LBS : kg;
  const rounded = toUnit === 'lbs' ? Math.round(out*4)/4 : Math.round(out*100)/100;
  return formatWeight(rounded);
}
// re-converts any unsaved mid-workout draft weights so switching units doesn't
// silently corrupt whatever you've already typed but haven't finished/logged yet
function convertDraftUnits(newUnit){
  const oldUnit = getUnit();
  if(oldUnit === newUnit) return;
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return;
    const draft = JSON.parse(raw);
    if(!draft || !draft.entries) return;
    Object.values(draft.entries).forEach(sets => {
      sets.forEach(set => {
        if(set.weight !== '' && set.weight != null){
          set.weight = convertWeightValue(set.weight, oldUnit, newUnit);
        }
      });
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }catch(e){}
}
function incrDefault(){ return getUnit()==='lbs' ? 5 : 2.5; }
function incrStep(){   return getUnit()==='lbs' ? 0.5 : 0.25; }
function incrMin(){    return getUnit()==='lbs' ? 0.5 : 0.25; }
function incrMax(){    return getUnit()==='lbs' ? 50  : 20;   }

/* ---------- workout draft (survives page reload mid-workout) ---------- */
function saveDraft(){
  try{
    const day = state.days[state.cycleIndex];
    if(!day || day.label==='Rest' || !day.exerciseIds.length) return;
    const entries = {};
    day.exerciseIds.forEach(exId => {
      const sets = [];
      let i = 0;
      while(true){
        const w = document.getElementById(`set-w-${exId}-${i}`);
        const r = document.getElementById(`set-r-${exId}-${i}`);
        if(!w || !r) break;
        sets.push({weight: w.value, reps: r.value});
        i++;
      }
      entries[exId] = sets;
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      cycleIndex: state.cycleIndex,
      dayId: day.id,
      entries
    }));
  }catch(e){}
}

function clearDraft(){
  localStorage.removeItem(DRAFT_KEY);
}

function restoreDraft(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return false;
    const draft = JSON.parse(raw);
    const day = state.days[state.cycleIndex];
    if(!draft || draft.cycleIndex !== state.cycleIndex || draft.dayId !== day?.id) return false;
    let anyRestored = false;
    Object.entries(draft.entries).forEach(([exId, sets]) => {
      sets.forEach((set, i) => {
        const w = document.getElementById(`set-w-${exId}-${i}`);
        const r = document.getElementById(`set-r-${exId}-${i}`);
        if(w && set.weight !== '') { w.value = set.weight; anyRestored = true; }
        if(r && set.reps !== '')   { r.value = set.reps;   anyRestored = true; }
      });
    });
    return anyRestored;
  }catch(e){ return false; }
}

const MUSCLES = ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Abs'];

const EXERCISE_LIBRARY = [
  {name:'Barbell Bench Press', muscle:'Chest'},
  {name:'Incline Dumbbell Press', muscle:'Chest'},
  {name:'Pec Dec', muscle:'Chest'},
  {name:'Chest Press Machine', muscle:'Chest'},
  {name:'Cable Fly', muscle:'Chest'},
  {name:'Lat Pulldown', muscle:'Back'},
  {name:'Single-Arm Lat Pulldown', muscle:'Back'},
  {name:'T-Bar Row', muscle:'Back'},
  {name:'Seated Cable Row', muscle:'Back'},
  {name:'Pull-Up', muscle:'Back'},
  {name:'Shoulder Press', muscle:'Shoulders'},
  {name:'Lateral Raise (Machine/Cable)', muscle:'Shoulders'},
  {name:'Rear Delt Fly', muscle:'Shoulders'},
  {name:'Front Raise', muscle:'Shoulders'},
  {name:'Preacher Curl', muscle:'Biceps'},
  {name:'Hammer Curl', muscle:'Biceps'},
  {name:'Cable Curl', muscle:'Biceps'},
  {name:'Tricep Pushdown', muscle:'Triceps'},
  {name:'Overhead Tricep Extension', muscle:'Triceps'},
  {name:'Skull Crusher', muscle:'Triceps'},
  {name:'Squat', muscle:'Quads'},
  {name:'Bulgarian Split Squat', muscle:'Quads'},
  {name:'Leg Extension', muscle:'Quads'},
  {name:'Leg Press', muscle:'Quads'},
  {name:'Romanian Deadlift', muscle:'Hamstrings'},
  {name:'Hamstring Curl', muscle:'Hamstrings'},
  {name:'Stiff-Leg Deadlift', muscle:'Hamstrings'},
  {name:'Hip Thrust', muscle:'Glutes'},
  {name:'Cable Kickback', muscle:'Glutes'},
  {name:'Standing Calf Raise', muscle:'Calves'},
  {name:'Seated Calf Raise', muscle:'Calves'},
  {name:'Ab Machine Crunch', muscle:'Abs'},
  {name:'Cable Crunch', muscle:'Abs'},
  {name:'Hanging Leg Raise', muscle:'Abs'},
];

/* ---------- helpers ---------- */
function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
// buckets a date by the LOCAL calendar day, not UTC — avoids the heatmap
// filing a workout under the wrong day for anyone outside UTC (e.g. logging
// a 2am session in a UTC+8 timezone should count as that local day, not the day before)
function localDateKey(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function clampInt(v, min, max, fallback){
  const n = parseInt(v,10);
  if(isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatWeight(n){
  const num = Number(n);
  if(!isFinite(num)) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
}
function formatDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
}
function defaultIncrement(muscle){
  const big = ['Quads','Back','Hamstrings','Glutes'];
  return big.includes(muscle) ? 2.5 : 1;
}

/* ---------- data ---------- */
function seedData(){
  function ex(name, muscle, increment){
    const id = uid('ex');
    return [id, {id, name, muscle, sets:2, repMin:8, repMax:10, increment, custom:false}];
  }
  const entries = [
    ex('Chest Machine Press (Upper Chest)','Chest',2.5),
    ex('Pec Dec','Chest',1),
    ex('Shoulder Press','Shoulders',2),
    ex('Lateral Raise (Machine/Cable)','Shoulders',1),
    ex('Tricep Pushdown','Triceps',1),
    ex('Lat Pulldown','Back',2.5),
    ex('Single-Arm Lat Pulldown','Back',1),
    ex('T-Bar Row','Back',2.5),
    ex('Preacher Curl','Biceps',1),
    ex('Hammer Curl','Biceps',1),
    ex('Hamstring Curl','Hamstrings',1),
    ex('SDL / RDL','Hamstrings',2.5),
    ex('Squat / Bulgarian Split Squat','Quads',2.5),
    ex('Leg Extension','Quads',1),
    ex('Abs Machine (Spinal Flexion)','Abs',1),
  ];
  const exercises = {};
  entries.forEach(([id,obj]) => { exercises[id] = obj; });
  const idByName = (name) => entries.find(([,o]) => o.name===name)[0];

  const push = ['Chest Machine Press (Upper Chest)','Pec Dec','Shoulder Press','Lateral Raise (Machine/Cable)','Tricep Pushdown'].map(idByName);
  const pull = ['Lat Pulldown','Single-Arm Lat Pulldown','T-Bar Row','Preacher Curl','Hammer Curl'].map(idByName);
  const legs = ['Hamstring Curl','SDL / RDL','Squat / Bulgarian Split Squat','Leg Extension','Abs Machine (Spinal Flexion)'].map(idByName);

  const days = [
    {id:uid('day'), label:'Push', exerciseIds:push.slice()},
    {id:uid('day'), label:'Pull', exerciseIds:pull.slice()},
    {id:uid('day'), label:'Legs', exerciseIds:legs.slice()},
    {id:uid('day'), label:'Rest', exerciseIds:[]},
    {id:uid('day'), label:'Push', exerciseIds:push.slice()},
    {id:uid('day'), label:'Pull', exerciseIds:pull.slice()},
    {id:uid('day'), label:'Legs', exerciseIds:legs.slice()},
    {id:uid('day'), label:'Rest', exerciseIds:[]},
  ];

  return { schemaVersion:1, cycleIndex:0, days, exercises, logs:[], restLog:[] };
}

let state = load();

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seedData();
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.days || !parsed.exercises) return seedData();
    if(!Array.isArray(parsed.restLog)) parsed.restLog = []; // backfill for older/imported backups
    return parsed;
  }catch(e){
    console.error('SeannyLog: failed to load, reseeding', e);
    return seedData();
  }
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ toast('Could not save — device storage may be full.'); }
}
