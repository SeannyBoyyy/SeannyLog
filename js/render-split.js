/* ===================== Split view (Days / Exercises) ===================== */
/* Split-builder presets, day reordering, the exercise picker/custom-exercise
   sheets, and all Split-tab editing. */

const PRESETS = [
  { name:'PPL Rest × 2',     desc:'8-day — the default, each muscle twice', days:['Push','Pull','Legs','Rest','Push','Pull','Legs','Rest'] },
  { name:'PPL Rest',         desc:'4-day repeating cycle',                   days:['Push','Pull','Legs','Rest'] },
  { name:'Upper / Lower',    desc:'6-day cycle with 2 rest days',            days:['Upper','Lower','Rest','Upper','Lower','Rest'] },
  { name:'Push / Pull / Legs / Upper / Lower / Rest', desc:'7-day cycle — PPL then UL', days:['Push','Pull','Legs','Rest','Upper','Lower','Rest'] },
  { name:'Push / Pull',      desc:'3-day repeating cycle',                   days:['Push','Pull','Rest'] },
  { name:'Bro Split',        desc:'5-day — one muscle group per day',        days:['Chest','Back','Shoulders','Arms','Legs'] },
  { name:'Arnold Split',     desc:'6-day — Chest+Back, Shoulders+Arms, Legs', days:['Chest & Back','Shoulders & Arms','Legs','Chest & Back','Shoulders & Arms','Legs'] },
  { name:'Full Body × 3',   desc:'7-day — 3 full body sessions per week',   days:['Full Body','Rest','Full Body','Rest','Full Body','Rest','Rest'] },
];

function openPresetSheet(){
  const rows = PRESETS.map(p => `
    <button class="picker-item" style="display:block; text-align:left;" data-preset='${JSON.stringify(p.days).replace(/'/g,"&#39;")}'>
      <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(p.name)}</div>
      <div style="font-family:var(--mono); font-size:10.5px; color:var(--chalk-dim); margin-bottom:4px;">${escapeHtml(p.desc)}</div>
      <div style="font-family:var(--mono); font-size:10px; color:var(--steel);">${p.days.join(' → ')}</div>
    </button>`).join('');
  setSheet(`
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Load Preset</h2>
    <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 14px; line-height:1.5;">
      Replaces your day structure. Your exercises stay in the library — reassign them to the new days after loading.
    </p>
    <div class="picker-list" style="max-height:420px;">${rows}</div>
  `);
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const labels = JSON.parse(btn.dataset.preset);
      if(!confirm(`Load "${labels.join(' / ')}"? This replaces your current days. Exercises stay in your library.`)) return;
      state.days = labels.map(label => ({id:uid('day'), label, exerciseIds:[]}));
      state.cycleIndex = 0;
      collapsedDays = null; // reset so next render re-initializes with current day expanded
      save(); closeSheet(); splitSegment = 'days'; renderSplit(); renderToday();
      toast('Preset loaded. Assign exercises to each day in the Days tab.');
    });
  });
  openSheet();
}

function openReorderDaysSheet(){
  function render(){
    const rows = state.days.map((day,i) => `
      <div class="reorder-row">
        <span class="reorder-num">Day ${i+1}</span>
        <span class="reorder-name">${escapeHtml(day.label)}${i===state.cycleIndex?'<span class="reorder-current">▶ now</span>':''}</span>
        <div class="reorder-btns">
          <button class="day-sheet-arrow" data-sup="${i}" ${i===0?'disabled':''}>↑</button>
          <button class="day-sheet-arrow" data-sdown="${i}" ${i===state.days.length-1?'disabled':''}>↓</button>
        </div>
      </div>`).join('');
    setSheet(`
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">Reorder Days</h2>
      <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 8px; line-height:1.5;">Tap ↑ ↓ to rearrange. Saves as you go.</p>
      ${rows}
      <button class="btn btn-primary" id="reorder-done" style="margin-top:18px;">Done</button>
    `);
    document.querySelectorAll('[data-sup]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.sup, 10);
        if(idx <= 0) return;
        [state.days[idx-1], state.days[idx]] = [state.days[idx], state.days[idx-1]];
        save(); render();
      });
    });
    document.querySelectorAll('[data-sdown]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.sdown, 10);
        if(idx >= state.days.length-1) return;
        [state.days[idx], state.days[idx+1]] = [state.days[idx+1], state.days[idx]];
        save(); render();
      });
    });
    document.getElementById('reorder-done').addEventListener('click', () => {
      closeSheet(); renderSplit(); safeRenderToday();
    });
  }
  render();
  openSheet();
}

/* ---------- rendering: split ---------- */
function renderSplit(){
  const root = document.getElementById('view-split');
  let html = `<div class="day-heading" style="margin-top:6px;"><p class="day-eyebrow">Manage</p><h1 class="day-title">Split</h1></div>`;
  html += `<div class="segment-ctrl">
    <button class="segment-btn ${splitSegment==='days'?'active':''}" data-segment="days">Days</button>
    <button class="segment-btn ${splitSegment==='exercises'?'active':''}" data-segment="exercises">Exercises</button>
  </div>`;

  if(splitSegment === 'days'){
    html += `
      <button class="btn btn-ghost" id="btn-add-day" style="width:100%; margin-bottom:8px;">+ Add Day</button>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button class="btn btn-outline" id="btn-reorder-days" style="flex:1; font-size:12.5px;">⇅ Reorder Days</button>
        <button class="btn btn-outline" id="btn-load-preset" style="flex:1; font-size:12px; color:var(--chalk-dim);">Load Preset</button>
      </div>
      <div class="section-title" style="margin-top:0;">Your ${state.days.length}-Day Cycle</div>`;
    // init collapsed state: all days collapsed except current, on first render
    if(collapsedDays === null){
      collapsedDays = new Set(state.days.map(d=>d.id));
      collapsedDays.delete(state.days[state.cycleIndex]?.id);
    }

    state.days.forEach((day,i) => {
      const isCurrent = i === state.cycleIndex;
      const isCollapsed = collapsedDays.has(day.id);
      const exListHtml = day.exerciseIds.map((id, idx) => {
        const ex = state.exercises[id];
        if(!ex) return '';
        const isFirst = idx === 0;
        const isLast = idx === day.exerciseIds.length - 1;
        return `
          <div class="day-ex-item">
            <div class="day-ex-reorder">
              <button class="day-ex-arrow" data-move-up="${id}" data-day="${day.id}" data-idx="${idx}" ${isFirst?'disabled':''} aria-label="Move up">↑</button>
              <button class="day-ex-arrow" data-move-down="${id}" data-day="${day.id}" data-idx="${idx}" ${isLast?'disabled':''} aria-label="Move down">↓</button>
            </div>
            <span class="day-ex-name">${escapeHtml(ex.name)}</span>
            <button class="day-ex-remove" data-remove-ex="${id}" data-day="${day.id}" aria-label="Remove">×</button>
          </div>`;
      }).join('');
      const exCount = day.exerciseIds.length;
      html += `
        <div class="day-card ${isCollapsed?'collapsed':''}" data-day="${day.id}">
          <div class="day-card-head" data-toggle-day="${day.id}">
            <div style="flex:1; min-width:0;">
              <input class="day-label-input" value="${escapeHtml(day.label)}" data-day-label="${day.id}" style="width:100%;">
            </div>
            <span class="day-num-badge ${isCurrent?'is-current':''}">
              ${isCurrent ? '▶ Day '+(i+1) : 'Day '+(i+1)}
            </span>
            <span class="day-chevron">▾</span>
          </div>
          <div class="day-collapsed-hint">${exCount} exercise${exCount!==1?'s':''}</div>
          <div class="day-card-body">
            <div class="day-ex-list">${exListHtml}</div>
            <button class="chip chip-add" data-add-day="${day.id}" style="width:100%; margin-top:4px;">+ Exercise</button>
            ${state.days.length > 1 ? '<button data-delete-day="' + day.id + '" style="width:100%; background:none; border:none; color:var(--chalk-dim); font-family:var(--mono); font-size:11px; padding:10px 4px 2px; cursor:pointer; opacity:0.5;" aria-label="Delete day">delete this day</button>' : ''}
          </div>
        </div>`;
    });
  } else {
    html += `<div class="section-title" style="margin-top:0;">All Exercises</div>`;
    Object.values(state.exercises).forEach(ex => {
      html += `
        <div class="ex-edit-card">
          <div class="ex-edit-head">
            <div class="ex-edit-name-wrap">
              <input class="ex-edit-name" value="${escapeHtml(ex.name)}" data-name="${ex.id}">
              <span class="ex-edit-muscle">${ex.muscle}</span>
            </div>
            <button class="ex-row-del" data-delete-ex="${ex.id}" aria-label="Delete">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"></path></svg>
            </button>
          </div>
          <div class="ex-edit-fields">
            <div class="ex-edit-field">
              <label class="ex-edit-label">Sets</label>
              <input type="number" class="ex-edit-input" min="1" max="6" value="${ex.sets}" data-sets="${ex.id}">
            </div>
            <div class="ex-edit-field">
              <label class="ex-edit-label">Min reps</label>
              <input type="number" class="ex-edit-input" min="1" max="30" value="${ex.repMin}" data-repmin="${ex.id}">
            </div>
            <div class="ex-edit-field">
              <label class="ex-edit-label">Max reps</label>
              <input type="number" class="ex-edit-input" min="1" max="30" value="${ex.repMax}" data-repmax="${ex.id}">
            </div>
            <div class="ex-edit-field">
              <label class="ex-edit-label">+${unitLabel()}</label>
              <input type="number" class="ex-edit-input" step="${incrStep()}" min="${incrMin()}" value="${formatWeight(toDisplay(ex.increment))}" data-increment="${ex.id}">
            </div>
          </div>
        </div>`;
    });
    html += `<button class="btn btn-outline" id="btn-add-custom-ex" style="margin-top:6px; margin-bottom:8px;">+ Add New Exercise</button>`;
  }

  root.innerHTML = html;
  root.querySelectorAll('[data-segment]').forEach(btn => {
    btn.addEventListener('click', () => { splitSegment = btn.dataset.segment; renderSplit(); });
  });
  wireSplitView(root);
}

function wireSplitView(root){
  root.querySelectorAll('[data-day-label]').forEach(input => {
    input.addEventListener('change', () => {
      const day = state.days.find(d => d.id === input.dataset.dayLabel);
      if(day){ day.label = input.value.trim() || 'Day'; save(); }
    });
  });
  // delete day
  root.querySelectorAll('[data-delete-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(state.days.length <= 1){ toast("Can't delete the last day."); return; }
      const day = state.days.find(d => d.id === btn.dataset.deleteDay);
      if(!day) return;
      if(!confirm(`Delete "${day.label}"? Exercises stay in your library.`)) return;
      state.days = state.days.filter(d => d.id !== day.id);
      state.cycleIndex = Math.min(state.cycleIndex, state.days.length-1);
      save(); renderSplit(); safeRenderToday();
      toast(`"${day.label}" removed from cycle.`);
    });
  });
  // toggle collapse on day card header tap
  root.querySelectorAll('[data-toggle-day]').forEach(head => {
    head.addEventListener('click', (e) => {
      if(e.target.classList.contains('day-label-input')) return; // let name input work normally
      const dayId = head.dataset.toggleDay;
      const card = head.closest('.day-card');
      if(collapsedDays.has(dayId)){
        collapsedDays.delete(dayId);
        card.classList.remove('collapsed');
      } else {
        collapsedDays.add(dayId);
        card.classList.add('collapsed');
      }
    });
  });
  // add day — starts expanded
  const addDayBtn = document.getElementById('btn-add-day');
  if(addDayBtn) addDayBtn.addEventListener('click', () => {
    const newDay = {id:uid('day'), label:'Day', exerciseIds:[]};
    state.days.push(newDay);
    if(collapsedDays) collapsedDays.delete(newDay.id); // start expanded
    save(); renderSplit();
    toast('New day added. Tap the name to rename it.');
  });
  // reorder days sheet
  const reorderBtn = document.getElementById('btn-reorder-days');
  if(reorderBtn) reorderBtn.addEventListener('click', openReorderDaysSheet);
  // load preset
  const loadPresetBtn = document.getElementById('btn-load-preset');
  if(loadPresetBtn) loadPresetBtn.addEventListener('click', openPresetSheet);
  root.querySelectorAll('[data-remove-ex]').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = state.days.find(d => d.id === btn.dataset.day);
      const exId = btn.dataset.removeEx;
      const ex = state.exercises[exId];
      if(!day || !ex) return;
      const idx = day.exerciseIds.indexOf(exId);
      // remove immediately
      day.exerciseIds = day.exerciseIds.filter(id => id !== exId);
      save(); renderSplit(); safeRenderToday();
      // offer undo for 4 seconds
      toastWithUndo(`"${ex.name}" removed from ${day.label}.`, () => {
        // restore at original position
        if(idx >= 0 && idx <= day.exerciseIds.length){
          day.exerciseIds.splice(idx, 0, exId);
        } else {
          day.exerciseIds.push(exId);
        }
        save(); renderSplit(); safeRenderToday();
        toast(`"${ex.name}" restored.`);
      });
    });
  });
  root.querySelectorAll('[data-add-day]').forEach(btn => {
    btn.addEventListener('click', () => openExercisePicker(btn.dataset.addDay));
  });
  root.querySelectorAll('[data-move-up]').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = state.days.find(d => d.id === btn.dataset.day);
      const idx = parseInt(btn.dataset.idx, 10);
      if(day && idx > 0){
        const exId1 = day.exerciseIds[idx-1];
        const exId2 = day.exerciseIds[idx];
        [day.exerciseIds[idx-1], day.exerciseIds[idx]] = [day.exerciseIds[idx], day.exerciseIds[idx-1]];
        save(); renderSplit();
        const isCurrentDay = day.id === state.days[state.cycleIndex]?.id;
        if(isCurrentDay){ todayIsDirty() ? swapTodayCards(exId1, exId2) : renderToday(); }
      }
    });
  });
  root.querySelectorAll('[data-move-down]').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = state.days.find(d => d.id === btn.dataset.day);
      const idx = parseInt(btn.dataset.idx, 10);
      if(day && idx < day.exerciseIds.length - 1){
        const exId1 = day.exerciseIds[idx];
        const exId2 = day.exerciseIds[idx+1];
        [day.exerciseIds[idx], day.exerciseIds[idx+1]] = [day.exerciseIds[idx+1], day.exerciseIds[idx]];
        save(); renderSplit();
        const isCurrentDay = day.id === state.days[state.cycleIndex]?.id;
        if(isCurrentDay){ todayIsDirty() ? swapTodayCards(exId1, exId2) : renderToday(); }
      }
    });
  });
  root.querySelectorAll('[data-name]').forEach(input => {
    input.addEventListener('change', () => {
      if(state.exercises[input.dataset.name]) state.exercises[input.dataset.name].name = input.value.trim() || 'Exercise';
      save();
    });
  });
  root.querySelectorAll('[data-sets]').forEach(input => {
    input.addEventListener('input', () => {
      const v = clampInt(input.value, 1, 6, 2);
      if(state.exercises[input.dataset.sets]) state.exercises[input.dataset.sets].sets = v;
      save();
    });
  });
  root.querySelectorAll('[data-repmin]').forEach(input => {
    input.addEventListener('input', () => {
      if(state.exercises[input.dataset.repmin]) state.exercises[input.dataset.repmin].repMin = clampInt(input.value,1,30,8);
      save();
    });
  });
  root.querySelectorAll('[data-repmax]').forEach(input => {
    input.addEventListener('input', () => {
      if(state.exercises[input.dataset.repmax]) state.exercises[input.dataset.repmax].repMax = clampInt(input.value,1,30,10);
      save();
    });
  });
  root.querySelectorAll('[data-increment]').forEach(input => {
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if(state.exercises[input.dataset.increment]) state.exercises[input.dataset.increment].increment = (!isNaN(v) && v > 0) ? toKg(v) : toKg(1);
      save();
    });
  });
  root.querySelectorAll('[data-delete-ex]').forEach(btn => {
    btn.addEventListener('click', () => {
      const exId = btn.dataset.deleteEx;
      const ex = state.exercises[exId];
      if(!ex) return;
      const sessionCount = state.logs.filter(l => l.entries && l.entries[exId]).length;
      const historyNote = sessionCount > 0 ? ` This will also erase its ${sessionCount} logged session${sessionCount>1?'s':''}.` : '';
      if(!confirm(`Delete "${ex.name}"?${historyNote} This cannot be undone.`)) return;
      // purge exercise
      delete state.exercises[exId];
      // remove from all days
      state.days.forEach(d => { d.exerciseIds = d.exerciseIds.filter(id => id !== exId); });
      // clean up orphaned log entries so storage doesn't grow forever
      state.logs.forEach(log => { if(log.entries) delete log.entries[exId]; });
      // remove now-empty logs
      state.logs = state.logs.filter(log => log.entries && Object.keys(log.entries).length > 0);
      save(); renderSplit(); renderProgress(); safeRenderToday();
      toast(`"${ex.name}" deleted.`);
    });
  });
  const addCustomBtn = document.getElementById('btn-add-custom-ex');
  if(addCustomBtn) addCustomBtn.addEventListener('click', () => openCustomExerciseForm());
}

/* ---------- sheet: exercise picker ---------- */
function openExercisePicker(dayId){
  const day = state.days.find(d => d.id===dayId);
  let activeMuscle = 'All';
  const muscleOptions = ['All', ...MUSCLES];

  function listHtml(){
    // Your own exercises (seeded, library-added, or custom — e.g. one you made
    // via the Exercises tab and skipped assigning to a day) surface first, since
    // reusing something you already track is the common case. Matched by id, not
    // name, since these already have one.
    const mine = Object.values(state.exercises).filter(ex => activeMuscle==='All' || ex.muscle===activeMuscle);
    const mineNames = new Set(mine.map(ex => ex.name));
    // Preset suggestions, minus anything you've already created under the same
    // name so the same exercise doesn't show up twice.
    const suggested = EXERCISE_LIBRARY.filter(item => (activeMuscle==='All' || item.muscle===activeMuscle) && !mineNames.has(item.name));

    if(!mine.length && !suggested.length) return `<div class="empty-note">No matches.</div>`;

    let html = '';
    if(mine.length){
      html += `<div class="section-title" style="margin-top:0;">Your Exercises</div>`;
      html += mine.map(ex => {
        const alreadyAdded = day.exerciseIds.includes(ex.id);
        return `<button class="picker-item ${alreadyAdded?'added':''}" data-pick-existing="${ex.id}" ${alreadyAdded?'disabled':''}>
          <span>${escapeHtml(ex.name)}</span><span class="muscle">${ex.muscle}</span>
        </button>`;
      }).join('');
    }
    if(suggested.length){
      html += `<div class="section-title">Suggested</div>`;
      html += suggested.map(item => {
        return `<button class="picker-item" data-pick="${escapeHtml(item.name)}" data-muscle="${item.muscle}">
          <span>${escapeHtml(item.name)}</span><span class="muscle">${item.muscle}</span>
        </button>`;
      }).join('');
    }
    return html;
  }
  function chipsHtml(){
    return muscleOptions.map(m => `<button class="muscle-chip ${m===activeMuscle?'active':''}" data-muscle-filter="${m}">${m}</button>`).join('');
  }
  function render(){
    setSheet(`
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">Add to ${escapeHtml(day.label)}</h2>
      <div class="muscle-filter">${chipsHtml()}</div>
      <div class="picker-list">${listHtml()}</div>
      <button class="btn btn-outline" style="margin-top:14px;" id="btn-open-custom">+ Add Custom Exercise</button>
    `);
    document.querySelectorAll('[data-muscle-filter]').forEach(btn => {
      btn.addEventListener('click', () => { activeMuscle = btn.dataset.muscleFilter; render(); });
    });
    document.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        addLibraryExerciseToDay(btn.dataset.pick, btn.dataset.muscle, dayId);
        closeSheet(); renderSplit(); safeRenderToday();
        toast(`${btn.dataset.pick} added to ${day.label}.`);
      });
    });
    document.querySelectorAll('[data-pick-existing]').forEach(btn => {
      btn.addEventListener('click', () => {
        const exId = btn.dataset.pickExisting;
        const name = state.exercises[exId] ? state.exercises[exId].name : 'Exercise';
        addExistingExerciseToDay(exId, dayId);
        closeSheet(); renderSplit(); safeRenderToday();
        toast(`${name} added to ${day.label}.`);
      });
    });
    document.getElementById('btn-open-custom').addEventListener('click', () => openCustomExerciseForm(dayId));
  }
  render();
  openSheet();
}

/* ---------- sheet: custom exercise ---------- */
function openCustomExerciseForm(dayId){
  function showForm(){
    // form state
    let selectedMuscle = 'Chest';
    let setsVal = 2, repMinVal = 8, repMaxVal = 10, incrVal = incrDefault();

    function musclePills(){
      return MUSCLES.map(m => `
        <button class="muscle-pill ${m===selectedMuscle?'active':''}" data-mpick="${m}">${m}</button>
      `).join('');
    }

    function buildSheet(){
      setSheet(`
        <div class="sheet-handle"></div>
        <h2 class="sheet-title">${dayId ? 'Add Custom Exercise' : 'New Exercise'}</h2>

        <label class="field-label">Name</label>
        <input class="text-input" id="cf-name" placeholder="e.g. Cable Fly" autocomplete="off">

        <label class="field-label">Muscle group</label>
        <div class="muscle-pill-grid" id="cf-muscle-grid">${musclePills()}</div>
        <input type="hidden" id="cf-muscle" value="${selectedMuscle}">

        <label class="field-label">Sets</label>
        <div class="stepper">
          <button class="stepper-btn" id="sets-minus" ${setsVal<=1?'disabled':''}>−</button>
          <input class="stepper-val" id="cf-sets" type="number" value="${setsVal}" min="1" max="6" inputmode="numeric" readonly>
          <button class="stepper-btn" id="sets-plus" ${setsVal>=6?'disabled':''}>+</button>
        </div>

        <label class="field-label">Rep range</label>
        <div class="rep-row">
          <div class="stepper">
            <button class="stepper-btn" id="repmin-minus" ${repMinVal<=1?'disabled':''}>−</button>
            <input class="stepper-val" id="cf-repmin" type="number" value="${repMinVal}" min="1" max="30" inputmode="numeric" readonly>
            <button class="stepper-btn" id="repmin-plus" ${repMinVal>=30?'disabled':''}>+</button>
          </div>
          <div style="display:flex;align-items:center;padding:0 4px;color:var(--chalk-dim);font-family:var(--mono);font-size:13px;">to</div>
          <div class="stepper">
            <button class="stepper-btn" id="repmax-minus" ${repMaxVal<=1?'disabled':''}>−</button>
            <input class="stepper-val" id="cf-repmax" type="number" value="${repMaxVal}" min="1" max="30" inputmode="numeric" readonly>
            <button class="stepper-btn" id="repmax-plus" ${repMaxVal>=30?'disabled':''}>+</button>
          </div>
        </div>

        <label class="field-label">Weight increment (${unitLabel()})</label>
        <div class="stepper">
          <button class="stepper-btn" id="incr-minus" ${incrVal<=incrMin()?'disabled':''}>−</button>
          <input class="stepper-val" id="cf-increment" type="number" value="${incrVal}" inputmode="decimal" readonly>
          <button class="stepper-btn" id="incr-plus">+</button>
        </div>

        <button class="btn btn-primary" id="cf-save" style="margin-top:22px;">
          ${dayId ? 'Add Exercise' : 'Next: Choose Days →'}
        </button>
      `);

      document.getElementById('cf-name').focus();

      // muscle pills
      document.getElementById('cf-muscle-grid').addEventListener('click', e => {
        const pill = e.target.closest('[data-mpick]');
        if(!pill) return;
        selectedMuscle = pill.dataset.mpick;
        document.getElementById('cf-muscle').value = selectedMuscle;
        document.querySelectorAll('[data-mpick]').forEach(p => p.classList.toggle('active', p.dataset.mpick === selectedMuscle));
      });

      // stepper helper
      function wireStep(minusId, plusId, inputId, step, min, max, getVal, setVal){
        document.getElementById(minusId).addEventListener('click', () => {
          const next = Math.round((getVal() - step) * 100) / 100;
          if(next < min) return;
          setVal(next);
          document.getElementById(inputId).value = next;
          document.getElementById(minusId).disabled = next <= min;
          document.getElementById(plusId).disabled = next >= max;
        });
        document.getElementById(plusId).addEventListener('click', () => {
          const next = Math.round((getVal() + step) * 100) / 100;
          if(next > max) return;
          setVal(next);
          document.getElementById(inputId).value = next;
          document.getElementById(minusId).disabled = next <= min;
          document.getElementById(plusId).disabled = next >= max;
        });
      }

      wireStep('sets-minus','sets-plus','cf-sets',1,1,6,()=>setsVal,v=>setsVal=v);
      wireStep('repmin-minus','repmin-plus','cf-repmin',1,1,30,()=>repMinVal,v=>repMinVal=v);
      wireStep('repmax-minus','repmax-plus','cf-repmax',1,1,30,()=>repMaxVal,v=>repMaxVal=v);
      wireStep('incr-minus','incr-plus','cf-increment',incrStep(),incrMin(),incrMax(),()=>incrVal,v=>incrVal=v);

      document.getElementById('cf-save').addEventListener('click', () => {
        const name = document.getElementById('cf-name').value.trim();
        if(!name){ toast('Give it a name first.'); return; }
        const exId = uid('ex');
        state.exercises[exId] = {
          id:exId, name,
          muscle: selectedMuscle,
          sets: setsVal,
          repMin: repMinVal,
          repMax: repMaxVal,
          increment: toKg(incrVal),
          custom:true
        };
        if(dayId){
          state.days.find(d=>d.id===dayId).exerciseIds.push(exId);
          save(); closeSheet(); renderSplit(); safeRenderToday();
          toast(`${name} added to ${state.days.find(d=>d.id===dayId)?.label || 'day'}.`);
        } else {
          save();
          showDayPicker(exId, name);
        }
      });
    }

    buildSheet();
  }

  function showDayPicker(exId, name){
    const nonRestDays = state.days.filter(d => d.label !== 'Rest');
    const dayRows = nonRestDays.map((d,i) => `
      <label class="day-check-row">
        <input type="checkbox" class="day-check" value="${d.id}" id="dc-${i}">
        <span>${escapeHtml(d.label)} <span style="font-family:var(--mono); font-size:11px; color:var(--chalk-dim);">Day ${state.days.indexOf(d)+1}</span></span>
      </label>`).join('');
    setSheet(`
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">Add to days</h2>
      <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 16px; line-height:1.5;">
        Which days should <strong style="color:var(--chalk);">${escapeHtml(name)}</strong> appear in? You can change this any time in the Days tab.
      </p>
      ${dayRows || '<p style="color:var(--chalk-dim); font-size:13px;">No training days found. Add them in the Days tab.</p>'}
      <button class="btn btn-primary" id="cf-assign" style="margin-top:18px;">Done</button>
      <button class="btn btn-outline" id="cf-skip" style="margin-top:8px; color:var(--chalk-dim);">Skip — I'll add it to days later</button>
    `);
    document.getElementById('cf-assign').addEventListener('click', () => {
      const checked = [...document.querySelectorAll('.day-check:checked')].map(cb => cb.value);
      checked.forEach(dId => {
        const day = state.days.find(d => d.id === dId);
        if(day && !day.exerciseIds.includes(exId)) day.exerciseIds.push(exId);
      });
      save(); closeSheet(); renderSplit(); safeRenderToday();
      const msg = checked.length
        ? `${name} added to ${checked.length} day${checked.length>1?'s':''}.`
        : `${name} saved. Go to Days tab to schedule it.`;
      toast(msg);
    });
    document.getElementById('cf-skip').addEventListener('click', () => {
      closeSheet(); renderSplit();
      toast(`${name} saved to library. Add it to days from the Days tab.`);
    });
  }

  showForm();
  openSheet();
}
