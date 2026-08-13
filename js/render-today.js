/* ===================== Today view ===================== */
/* Renders the active training day: exercise cards, set inputs, and the
   rest-day screen. Owns the single delegated click/input listener for
   everything inside #view-today. */

/* ---------- rendering: today ---------- */
function getInstallHintHtml(){
  if(window.matchMedia('(display-mode: standalone)').matches) return '';
  if(localStorage.getItem(HINT_KEY)) return '';
  return `<div class="install-hint" id="install-hint">
    Tip: open your browser menu and choose "Add to Home Screen" so SeannyLog installs like an app.
    <button id="dismiss-hint">Got it</button>
  </div>`;
}
function getOnboardingHtml(){
  if(localStorage.getItem(ONBOARDING_KEY)) return '';
  return `<div class="onboarding-card" id="onboarding-card">
    <button class="onboarding-close" id="dismiss-onboarding" aria-label="Dismiss">×</button>
    <p class="onboarding-title">How SeannyLog works</p>
    <p class="onboarding-body">
      Each session, log the <strong>weight and reps</strong> for every set.<br><br>
      Hit your top rep target on <strong>any set</strong> (1 set or several — doesn't need to be every set) in <strong>each of your last two logged sessions</strong> at the same weight — the app tells you it's <strong>Time to Ascend</strong> and bumps the suggested weight up.<br><br>
      The two dots <strong>●●</strong> on each exercise track your streak toward that trigger.
    </p>
  </div>`;
}
function renderExerciseCard(ex){
  if(!ex) return '';
  const status = getProgressionStatus(ex.id);
  const lastSets = status.lastSession ? status.lastSession.sets : null;
  const dotsHtml = [0,1].map(i => `<span class="streak-dot ${i < status.streak ? 'filled':''}"></span>`).join('');
  const streakLabel = status.ready ? 'add weight!' : `${status.streak}/2`;
  const badgeHtml = status.ready ? `
    <div class="ascend-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>
      Time to ascend — add ${formatWeight(toDisplay(ex.increment))}${unitLabel()}
    </div>` : '';

  const setsHtml = Array.from({length: ex.sets}).map((_,i) => {
    const lastSet = lastSets ? lastSets[i] : null;
    const rawW = status.ready ? status.suggestedWeight : (lastSet ? lastSet.weight : null);
    const prefillWeight = rawW != null ? formatWeight(toDisplay(rawW)) : '';
    const placeholderReps = lastSet ? `last ${lastSet.reps}` : 'reps';
    return `
      <div class="set-row">
        <span class="set-row-label">${i+1}</span>
        <input class="set-input unit" type="text" inputmode="decimal" placeholder="${unitLabel()}" value="${prefillWeight}" id="set-w-${ex.id}-${i}">
        <span class="set-x">×</span>
        <input class="set-input" type="text" inputmode="numeric" placeholder="${placeholderReps}" id="set-r-${ex.id}-${i}">
      </div>`;
  }).join('');

  const hitAnySet = lastSets ? lastSets.some(s => s.reps >= ex.repMax) : false;
  const fellShort = !status.ready && lastSets && !hitAnySet;
  const lastLine = lastSets
    ? `Last: ${lastSets.map(s => `${formatWeight(toDisplay(s.weight))}${unitLabel()} × ${s.reps}`).join(' · ')}${fellShort ? ` — need at least one set to hit ${ex.repMax} reps to count` : ''}`
    : `No history yet — target ${ex.repMin}–${ex.repMax} reps`;

  const lastWeight = (lastSets && lastSets.length) ? formatWeight(toDisplay(lastSets[lastSets.length-1].weight)) : '';
  return `
    <div class="ex-card" data-ex="${ex.id}">
      <div class="ex-card-top">
        <div>
          <div class="ex-name">${escapeHtml(ex.name)}</div>
          <div class="ex-meta"><span class="ex-muscle-tag">${ex.muscle}</span> · ${ex.repMin}–${ex.repMax} reps · ${ex.repMax} to ascend</div>
        </div>
        <div class="streak-wrap">
          <div class="streak-dots">${dotsHtml}</div>
          <span class="streak-count">${streakLabel}</span>
        </div>
      </div>
      ${badgeHtml}
      <div class="set-rows" id="set-rows-${ex.id}">${setsHtml}</div>
      <div class="set-actions">
        <button class="btn-add-set" data-add-set="${ex.id}" data-last-weight="${lastWeight}">+ Set</button>
        <button class="btn-remove-set" data-remove-set="${ex.id}" ${ex.sets <= 1 ? 'disabled' : ''} aria-label="Remove last set">−</button>
      </div>
      <div class="last-line">${lastLine}</div>
    </div>`;
}

let todayWired = false;

// True once the user has actually typed into a set field or added/removed a
// set row since the last renderToday(). This is what todayIsDirty() (ui.js)
// reads. It's intentionally NOT "do any inputs currently have a value" —
// weight inputs are prefilled with a suggested/last-session weight as soon as
// a card renders, so that check was true almost immediately on load, before
// the person touched anything. That made safeRenderToday() a permanent no-op
// for any day with prior history, so a newly added exercise (e.g. from the
// Split tab) never appeared in Today until a full page reload.
let todayUserEdited = false;

function wireTodayDelegation(){
  const root = document.getElementById('view-today');

  // autosave draft on every input change
  root.addEventListener('input', (e) => {
    if(e.target.classList.contains('set-input')){ todayUserEdited = true; saveDraft(); }
  });
  root.addEventListener('click', (e) => {
    // Finish workout button — opens a confirm sheet rather than finishing
    // immediately, so a stray tap can't end the session by itself.
    if(e.target.id === 'btn-finish'){ openFinishConfirmSheet(); return; }

    // Finish rest button
    if(e.target.id === 'btn-finish-rest'){
      const ds = localDateKey(new Date());
      if(!state.restLog.includes(ds)) state.restLog.push(ds);
      advanceCycle(); clearDraft(); save(); renderToday();
      toast('Rest logged. Back at it next session.');
      return;
    }

    // Dismiss install hint
    if(e.target.id === 'dismiss-hint'){
      localStorage.setItem(HINT_KEY, '1');
      document.getElementById('install-hint')?.remove();
      return;
    }

    // Dismiss onboarding
    if(e.target.id === 'dismiss-onboarding'){
      localStorage.setItem(ONBOARDING_KEY, '1');
      document.getElementById('onboarding-card')?.remove();
      return;
    }

    // + Set
    const addBtn = e.target.closest('[data-add-set]');
    if(addBtn){
      const exId = addBtn.dataset.addSet;
      const container = document.getElementById(`set-rows-${exId}`);
      if(!container) return;
      const nextIdx = container.querySelectorAll('.set-row').length;
      const prefill = addBtn.dataset.lastWeight || '';
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <span class="set-row-label">${nextIdx+1}</span>
        <input class="set-input unit" type="text" inputmode="decimal" placeholder="${unitLabel()}" value="${escapeHtml(String(prefill))}" id="set-w-${exId}-${nextIdx}">
        <span class="set-x">×</span>
        <input class="set-input" type="text" inputmode="numeric" placeholder="reps" id="set-r-${exId}-${nextIdx}">
      `;
      container.appendChild(row);
      row.querySelector('input').focus();
      const rmBtn = addBtn.closest('.ex-card')?.querySelector('[data-remove-set]');
      if(rmBtn) rmBtn.disabled = false;
      todayUserEdited = true;
      saveDraft();
      return;
    }

    // − Set
    const rmBtn = e.target.closest('[data-remove-set]');
    if(rmBtn){
      const exId = rmBtn.dataset.removeSet;
      const container = document.getElementById(`set-rows-${exId}`);
      if(!container) return;
      const rows = container.querySelectorAll('.set-row');
      if(rows.length <= 1) return;
      rows[rows.length - 1].remove();
      if(container.querySelectorAll('.set-row').length <= 1) rmBtn.disabled = true;
      todayUserEdited = true;
      saveDraft();
    }
  });
}

// Confirm sheet shown before a workout is actually finished. Always requires
// an explicit second tap — even on a fully-logged day — so one stray tap on
// "Finish Workout" can never end the session by itself. When something's
// still unlogged it lists exactly what, since that's the case a misclick is
// most often trying (and failing) to avoid.
function openFinishConfirmSheet(){
  const { incomplete, anyFilled } = collectTodaySetData();

  // Nothing logged, or everything's logged — finish immediately either way.
  // finishWorkout() itself already toasts + blocks the "nothing logged" case.
  // "Everything logged" has no real decision left to confirm; the standing
  // Undo in Settings is the safety net for a rare misclick here, not a sheet
  // tapped through on every single completed workout.
  if(!anyFilled || incomplete.length === 0){ finishWorkout(); return; }

  const day = state.days[state.cycleIndex];
  setSheet(`
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Finish ${escapeHtml(day.label)}?</h2>
    <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 12px; line-height:1.5;">Some sets aren't logged yet:</p>
    <div style="margin-bottom:4px;">
      ${incomplete.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;">
          <span>${escapeHtml(item.name)}</span>
          <span style="font-family:var(--mono); color:var(--chalk-dim);">${item.logged}/${item.total} sets</span>
        </div>`).join('')}
    </div>
    <p style="font-size:13px; color:var(--chalk-dim); margin:14px 0 0; line-height:1.5;">Unlogged sets won't be saved. Finish anyway, or go back and fill them in.</p>
    <button class="btn btn-primary" id="btn-finish-confirm" style="margin-top:16px;">Finish Workout</button>
    <button class="btn btn-outline" id="btn-finish-cancel" style="margin-top:8px;">Go Back</button>
  `);
  document.getElementById('btn-finish-confirm').addEventListener('click', () => {
    closeSheet();
    finishWorkout();
  });
  document.getElementById('btn-finish-cancel').addEventListener('click', () => closeSheet());
  openSheet();
}

function renderToday(){
  // fresh render = clean slate; nothing has been edited in this DOM incarnation yet
  todayUserEdited = false;
  const root = document.getElementById('view-today');
  const day = state.days[state.cycleIndex];
  const pips = state.days.map((d,i) =>
    `<span class="cycle-pip ${i===state.cycleIndex?'is-current':''} ${d.label==='Rest'?'is-rest':''}"></span>`
  ).join('');

  if(!day || day.label==='Rest' || day.exerciseIds.length===0){
    const nextDay = state.days[(state.cycleIndex+1)%state.days.length];
    root.innerHTML = `
      ${getInstallHintHtml()}
      <div class="cycle-track">${pips}</div>
      <div class="day-heading">
        <p class="day-eyebrow">Day ${state.cycleIndex+1} of ${state.days.length}</p>
        <h1 class="day-title">Rest</h1>
      </div>
      <div class="rest-card">
        <span class="ex-name">No lifting today</span>
        <p>Recovery is part of the program. Sleep, eat, hydrate — back under the bar next session.</p>
        <button class="btn btn-primary" id="btn-finish-rest">Mark Done → Next: ${escapeHtml(nextDay.label)}</button>
      </div>`;
    if(!todayWired){ wireTodayDelegation(); todayWired = true; }
    return;
  }

  const cardsHtml = day.exerciseIds.map(id => renderExerciseCard(state.exercises[id])).join('');
  root.innerHTML = `
    ${getInstallHintHtml()}
    ${getOnboardingHtml()}
    <div class="cycle-track">${pips}</div>
    <div class="day-heading">
      <p class="day-eyebrow">Day ${state.cycleIndex+1} of ${state.days.length}</p>
      <h1 class="day-title">${escapeHtml(day.label)}</h1>
    </div>
    ${cardsHtml}
    <div class="finish-bar">
      <button class="btn btn-primary" id="btn-finish">Finish Workout</button>
    </div>`;
  if(!todayWired){ wireTodayDelegation(); todayWired = true; }
  const restored = restoreDraft();
  if(restored) toast('Draft restored — your inputs are back.');
}
