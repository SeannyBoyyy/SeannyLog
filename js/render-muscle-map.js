/* ===================== Muscle progress ===================== */
/* Derived library/history summaries, inline body diagrams, and a read-only
   detail flow in the shared sheet. No persisted state or progression rules. */

let muscleMapSide = 'front';
let muscleMapSelectedMuscle = null;

const MUSCLE_MAP_GROUPS = {
  front: ['Chest', 'Shoulders', 'Biceps', 'Abs', 'Quads', 'Calves'],
  back: ['Back', 'Shoulders', 'Triceps', 'Glutes', 'Hamstrings', 'Calves']
};
const MUSCLE_MAP_HISTORY_LABELS = {
  'no-exercises': 'No exercises tagged',
  unlogged: 'No logged history',
  logged: 'Logged history'
};

/* ---------- calculations (stored kg; independent of DOM and units) ---------- */
function muscleMapSessionTopKg(sets){
  if(!Array.isArray(sets) || !sets.length) return null;
  let topKg = -Infinity;
  for(const set of sets){
    // An unknown set could have been the maximum. Do not silently drop it.
    if(!Number.isFinite(set?.weight)) return null;
    topKg = Math.max(topKg, set.weight);
  }
  return topKg;
}

function getMuscleMapSummary(muscleName){
  const definitions = Object.entries(state.exercises || {}).filter(([, ex]) => ex?.muscle === muscleName);
  const loggedExercises = [];
  definitions.forEach(([exId, ex]) => {
    const history = exerciseLogsInOrder(exId);
    if(!history.length) return;
    // Keep unavailable endpoints and gaps in place: never substitute another session.
    const topWeightsKg = history.map(session => muscleMapSessionTopKg(session.sets));
    const firstTopKg = topWeightsKg[0];
    const latestTopKg = topWeightsKg[topWeightsKg.length - 1];
    const hasEndpoints = history.length >= 2 && Number.isFinite(firstTopKg) && Number.isFinite(latestTopKg);
    const differenceKg = hasEndpoints ? latestTopKg - firstTopKg : null;
    const weightChangeKg = Number.isFinite(differenceKg) ? differenceKg : null;
    const percent = firstTopKg > 0 && weightChangeKg !== null ? (weightChangeKg / firstTopKg) * 100 : null;
    loggedExercises.push({
      id: exId,
      name: ex.name ?? 'Unnamed exercise',
      sessionCount: history.length,
      topWeightsKg,
      firstTopKg,
      latestTopKg,
      weightChangeKg,
      percentageChange: Number.isFinite(percent) ? percent : null
    });
  });
  const contributing = loggedExercises.filter(ex => ex.percentageChange !== null);
  // Divide before summing to avoid overflowing the sum of finite percentages.
  const mean = contributing.length
    ? contributing.reduce((sum, ex) => sum + ex.percentageChange / contributing.length, 0)
    : null;
  return {
    muscleName,
    definitionCount: definitions.length,
    loggedExercises,
    contributingCount: contributing.length,
    averageChangePercent: Number.isFinite(mean) ? mean : null,
    historyState: !definitions.length ? 'no-exercises' : loggedExercises.length ? 'logged' : 'unlogged'
  };
}

/* ---------- display helpers ---------- */
function formatMuscleMapPercent(value){
  if(!Number.isFinite(value)) return 'Not enough history';
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

function formatMuscleMapWeight(kg, signed = false){
  if(!Number.isFinite(kg)) return 'Weight unavailable';
  const displayed = toDisplay(kg);
  if(!Number.isFinite(displayed)) return 'Weight unavailable';
  const sign = signed && displayed > 0 ? '+' : '';
  return `${sign}${formatWeight(displayed === 0 ? 0 : displayed)} ${unitLabel()}`;
}

function renderMuscleMapSparkline(topWeightsKg){
  const values = topWeightsKg.map(kg => Number.isFinite(kg) ? toDisplay(kg) : null);
  const finite = values.filter(Number.isFinite);
  if(!finite.length) return '';
  const min = finite.reduce((a, b) => Math.min(a, b));
  const max = finite.reduce((a, b) => Math.max(a, b));
  const range = (max - min) || 1;
  const width = 260, height = 46, pad = 5;
  let connected = false;
  let path = '';
  let dots = '';
  values.forEach((value, i) => {
    if(!Number.isFinite(value)){ connected = false; return; }
    const x = values.length === 1 ? width / 2 : pad + i * (width - pad * 2) / (values.length - 1);
    const y = min === max ? height / 2 : height - pad - (value - min) / range * (height - pad * 2);
    path += `${connected ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`;
    connected = true;
  });
  return `<svg class="muscle-map-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`Session top weights in ${unitLabel()}, oldest to newest. Gaps indicate unavailable weights.`)}">
    <path d="${path}"/>${dots}
  </svg>`;
}

/* ---------- handwritten body geometry ---------- */
function renderMuscleMapBody(summaries){
  // All paths are original. Mirroring pairs anatomy within one muscle target;
  // front/rear anatomy stays separate even where the underlying data is shared.
  const bilateral = (...paths) => paths.map(path => `<path d="${path}"/><path d="${path}" transform="translate(300 0) scale(-1 1)"/>`).join('');
  const shape = (area, contours = '', midline = '') => ({area, contours, midline});
  const isFront = muscleMapSide === 'front';
  const shapes = isFront ? {
    Chest: shape(
      bilateral('M145 114 C135 109 122 107 114 112 C110 118 108 128 105 139 C113 151 126 157 140 154 L146 150 L146 120 Q146 116 145 114 Z'),
      bilateral('M113 122 Q126 135 139 136'),
      '<path d="M147 118 H153 V148 H147 Z"/>'
    ),
    Shoulders: shape(
      bilateral('M102 104 C89 105 79 120 80 133 C81 143 90 149 99 143 Q105 134 105 122 Q106 111 102 104 Z'),
      bilateral('M87 129 Q89 117 98 112')
    ),
    Biceps: shape(
      bilateral('M92 150 C83 151 81 163 78 176 L73 191 Q73 197 79 196 C87 192 95 178 99 161 Q101 153 96 150 Z'),
      bilateral('M93 158 C94 169 87 186 80 190')
    ),
    Abs: shape(bilateral(
      'M131 164 Q138 159 146 162 L146 178 Q138 181 130 178 Z',
      'M130 184 Q138 187 146 184 L146 201 Q138 204 130 200 Z',
      'M130 207 Q138 210 146 207 L146 224 Q139 227 132 223 Z',
      'M133 230 Q140 233 146 230 L146 248 Q139 245 135 239 Z',
      'M116 166 Q121 162 125 164 L124 197 Q125 218 130 236 C122 225 118 210 117 193 Z'
    ), '', '<path d="M146 162 H154 V247 H146 Z"/>'),
    Quads: shape(
      bilateral('M110 265 Q122 266 139 282 C143 307 145 327 143 349 C142 367 139 380 135 384 Q130 386 126 378 C118 370 115 353 112 338 C106 313 103 288 110 265 Z'),
      bilateral('M118 279 C131 306 135 331 130 351 Q128 365 124 371 M139 324 Q141 354 132 375')
    ),
    Calves: shape(bilateral('M121 409 C116 423 120 446 125 461 L129 478 Q133 463 130 448 C127 433 130 419 126 411 Z'))
  } : {
    Back: shape(
      bilateral('M137 88 Q127 100 112 104 L111 112 C111 126 107 137 105 144 C108 164 115 185 117 208 Q119 228 129 242 L145 250 C148 231 147 211 147 192 L147 104 Q141 98 140 89 Z'),
      bilateral('M115 111 Q126 130 143 142 M118 129 Q128 135 130 145 M110 154 Q125 164 142 158 M142 184 Q133 212 131 233'),
      '<path d="M148 104 H152 V247 H148 Z"/>'
    ),
    Shoulders: shape(
      bilateral('M103 104 C92 104 82 111 81 124 L80 134 Q86 145 96 138 L105 127 Q110 115 103 104 Z'),
      bilateral('M87 125 Q95 126 101 119')
    ),
    Triceps: shape(
      bilateral('M90 148 C83 148 78 164 75 181 L73 192 Q77 201 83 192 C91 181 97 168 99 153 Z'),
      bilateral('M91 156 Q88 175 80 189')
    ),
    Glutes: shape(
      bilateral('M115 254 C122 251 137 256 146 264 L146 283 C145 295 136 301 123 297 C112 295 106 285 107 273 Q108 261 115 254 Z'),
      bilateral('M116 279 Q119 289 131 291')
    ),
    Hamstrings: shape(
      bilateral('M112 303 C122 309 133 307 143 300 C143 327 144 349 141 372 L136 385 Q129 389 124 379 L117 354 C112 335 110 319 112 303 Z'),
      bilateral('M123 316 C121 336 130 358 132 376')
    ),
    Calves: shape(
      bilateral('M124 408 C117 418 120 438 126 451 L134 469 Q139 456 143 448 C147 435 144 415 140 409 Q135 413 132 409 Q128 406 124 408 Z'),
      bilateral('M132 418 Q131 435 135 450')
    )
  };
  const regions = MUSCLE_MAP_GROUPS[muscleMapSide].map(muscleName => {
    const summary = summaries[muscleName];
    const selected = muscleMapSelectedMuscle === muscleName;
    const {area, contours, midline} = shapes[muscleName];
    return `<g class="muscle-map-region muscle-map-${summary.historyState} ${selected ? 'muscle-map-selected' : ''}" data-muscle="${escapeHtml(muscleName)}" role="button" tabindex="0" aria-label="${escapeHtml(`${muscleName}: ${MUSCLE_MAP_HISTORY_LABELS[summary.historyState]}. View details`)}" aria-pressed="${selected}" aria-haspopup="dialog" aria-controls="sheet-content">
      <g class="muscle-map-hit ${['Chest', 'Shoulders'].includes(muscleName) ? 'muscle-map-hit-tight' : ''}" aria-hidden="true">${area}${midline}</g>
      <g class="muscle-map-paint" aria-hidden="true">${area}</g>
      <g class="muscle-map-lines" aria-hidden="true">${contours}</g>
    </g>`;
  }).join('');
  const head = isFront
    ? 'M127 34 C127 19 136 10 150 10 C164 10 173 19 173 34 L171 54 Q168 64 158 72 Q150 77 142 72 Q132 65 129 54 Z'
    : 'M126 35 C126 19 135 10 150 10 C165 10 174 19 174 35 L172 54 Q171 65 165 72 L162 80 Q150 86 138 80 L135 72 Q129 64 128 54 Z';
  return `<svg class="muscle-map-body" viewBox="0 0 300 540" role="group" aria-labelledby="muscle-map-body-title" xmlns="http://www.w3.org/2000/svg">
    <title id="muscle-map-body-title">${isFront ? 'Front' : 'Back'} muscle diagram</title>
    <ellipse class="muscle-map-ground" cx="150" cy="532" rx="48" ry="3" aria-hidden="true"/>
    <g class="muscle-map-silhouette" aria-hidden="true">
      <path d="M137 72 L136 91 C130 97 116 97 103 102 C88 106 79 120 78 138 C75 154 75 165 70 181 L60 204 C55 217 50 232 45 245 L43 257 Q35 265 36 275 L40 286 Q43 290 47 284 L48 278 L48 287 Q52 291 54 284 L57 271 Q56 263 54 260 L57 248 L72 219 L81 197 C91 184 97 168 102 150 C104 173 112 192 113 208 L110 239 C103 253 101 272 104 293 C105 322 110 349 115 371 L118 391 C114 408 117 432 122 454 L126 477 L127 503 C123 510 119 514 117 519 Q116 526 125 527 L141 527 Q146 525 145 519 L141 505 L142 478 L145 454 L145 421 L146 397 L148 359 L149 313 Q150 300 151 313 L152 359 L154 397 L155 421 L155 454 L158 478 L159 505 L155 519 Q154 525 159 527 L175 527 Q184 526 183 519 C181 514 177 510 173 503 L174 477 L178 454 C183 432 186 408 182 391 L185 371 C190 349 195 322 196 293 C199 272 197 253 190 239 L187 208 C188 192 196 173 198 150 C203 168 209 184 219 197 L228 219 L243 248 L246 260 Q244 263 243 271 L246 284 Q248 291 252 287 L252 278 L253 284 Q257 290 260 286 L264 275 Q265 265 257 257 L255 245 C250 232 245 217 240 204 L230 181 C225 165 225 154 222 138 C221 120 212 106 197 102 C184 97 170 97 164 91 L163 72 Z"/>
      <path d="${head}"/>
    </g>
    ${regions}
    <g class="muscle-map-contours" aria-hidden="true">
      ${isFront
        ? `<path d="M136 35 H142 M158 35 H164 M150 38 L147 48 Q150 50 153 48 M144 59 Q150 62 156 59 M139 81 L142 97 M161 81 L158 97 M150 257 V261"/>
          ${bilateral('M113 104 Q127 107 141 103', 'M111 245 Q125 251 138 263', 'M72 205 Q63 225 55 243', 'M43 262 L47 269 L45 280', 'M126 390 Q132 386 139 391 L138 400 Q132 405 126 400 Z', 'M138 413 Q135 452 137 496', 'M123 517 Q132 514 140 519')}`
        : `<path d="M140 79 Q150 85 160 79 M150 90 V245 M150 265 V292"/>
          ${bilateral('M71 205 Q63 228 55 244', 'M45 265 L49 278', 'M122 394 Q132 399 142 392', 'M134 474 L135 500', 'M129 508 Q134 511 140 507')}`}
    </g>
  </svg>`;
}

function renderMuscleMap(){
  const summaries = Object.fromEntries(MUSCLE_MAP_GROUPS[muscleMapSide].map(muscleName => [muscleName, getMuscleMapSummary(muscleName)]));
  return `<div class="muscle-map-view">
    <div class="segment-ctrl muscle-map-side-control" role="group" aria-label="Body view">
      <button type="button" class="segment-btn ${muscleMapSide==='front'?'active':''}" data-muscle-side="front" aria-pressed="${muscleMapSide==='front'}" aria-controls="muscle-map-diagram">Front</button>
      <button type="button" class="segment-btn ${muscleMapSide==='back'?'active':''}" data-muscle-side="back" aria-pressed="${muscleMapSide==='back'}" aria-controls="muscle-map-diagram">Back</button>
    </div>
    <p class="muscle-map-intro">Tap a region or choose a muscle below.</p>
    <div id="muscle-map-diagram">${renderMuscleMapBody(summaries)}</div>
    <div class="muscle-map-buttons" role="group" aria-label="${muscleMapSide === 'front' ? 'Front' : 'Back'} muscles">
      ${MUSCLE_MAP_GROUPS[muscleMapSide].map(muscleName => {
        const summary = summaries[muscleName];
        const selected = muscleMapSelectedMuscle === muscleName;
        return `<button type="button" class="btn btn-outline muscle-map-select ${selected ? 'muscle-map-selected' : ''}" data-muscle="${escapeHtml(muscleName)}" aria-label="${escapeHtml(`${muscleName}: ${MUSCLE_MAP_HISTORY_LABELS[summary.historyState]}. View details`)}" aria-pressed="${selected}" aria-haspopup="dialog" aria-controls="sheet-content">
          <span class="muscle-map-swatch muscle-map-${summary.historyState}" aria-hidden="true"></span>${escapeHtml(muscleName)}
        </button>`;
      }).join('')}
    </div>
    <ul class="muscle-map-legend" aria-label="Muscle history legend">
      ${Object.entries(MUSCLE_MAP_HISTORY_LABELS).map(([historyState, label]) => `<li><span class="muscle-map-swatch muscle-map-${historyState}" aria-hidden="true"></span>${escapeHtml(label)}</li>`).join('')}
    </ul>
    <p class="muscle-map-note">Color shows history availability. Select any muscle to see its logged load change.</p>
  </div>`;
}

/* ---------- read-only details ---------- */
function renderMuscleMapExercise(ex){
  let weights = `<p class="muscle-map-weights">Recorded top weight: ${escapeHtml(formatMuscleMapWeight(ex.firstTopKg))}</p>`;
  let change = '';
  if(ex.sessionCount >= 2){
    weights = `<p class="muscle-map-caption">First → latest session top weight</p>
      <p class="muscle-map-weights"><span>${escapeHtml(formatMuscleMapWeight(ex.firstTopKg))}</span><span aria-hidden="true">→</span><span>${escapeHtml(formatMuscleMapWeight(ex.latestTopKg))}</span></p>`;
    change = `<p class="muscle-map-change">${ex.weightChangeKg === null ? 'Load change unavailable' : escapeHtml(formatMuscleMapWeight(ex.weightChangeKg, true))}${ex.percentageChange === null ? '' : ` · ${formatMuscleMapPercent(ex.percentageChange)}`}</p>`;
    if(ex.percentageChange === null){
      change += '<p class="muscle-map-note">Percentage needs valid first/latest weights and a positive first-session top weight.</p>';
    }
  }
  return `<article class="muscle-map-exercise">
    <h3 class="ex-name">${escapeHtml(ex.name)}</h3>
    ${weights}${change}
    <p class="muscle-map-caption">${ex.sessionCount} session${ex.sessionCount === 1 ? '' : 's'} logged</p>
    ${renderMuscleMapSparkline(ex.topWeightsKg)}
    ${ex.topWeightsKg.some(kg => !Number.isFinite(kg)) ? '<p class="muscle-map-note">Some session weights are unavailable; chart gaps preserve their place in history.</p>' : ''}
  </article>`;
}

function openMuscleMapSheet(muscleName, trigger){
  if(!MUSCLES.includes(muscleName)) return;
  const summary = getMuscleMapSummary(muscleName);
  let details = summary.loggedExercises.map(renderMuscleMapExercise).join('');
  if(!summary.definitionCount){
    details = `<p class="empty-note">No exercises tagged to ${escapeHtml(muscleName)} yet — add one in Split.</p>`;
  } else if(!summary.loggedExercises.length){
    details = '<p class="empty-note">Not trained yet. Log an exercise for this muscle to see progress.</p>';
  }

  const backdrop = document.getElementById('sheet-backdrop');
  const events = new AbortController();
  let background = [];
  setSheet(`<div class="muscle-map-detail" role="dialog" aria-modal="true" aria-labelledby="muscle-map-sheet-title">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="muscle-map-detail-head">
      <h2 class="sheet-title" id="muscle-map-sheet-title" tabindex="-1">${escapeHtml(muscleName)}</h2>
      <button type="button" class="btn btn-ghost btn-small muscle-map-close" aria-label="${escapeHtml(`Close ${muscleName} details`)}">Close</button>
    </div>
    <div class="muscle-map-summary">
      <h3 class="muscle-map-metric-label">Average top-weight change</h3>
      <p class="muscle-map-average">${formatMuscleMapPercent(summary.averageChangePercent)}</p>
      <p class="muscle-map-caption">${summary.contributingCount} exercise${summary.contributingCount === 1 ? '' : 's'} contributing to the average</p>
    </div>
    <p class="muscle-map-note">Average change in each exercise’s session top weight, from its first to latest logged session.</p>
    <p class="muscle-map-note">Each contributing exercise counts equally, even when history lengths differ. This measures logged load change, not muscle growth.</p>
    ${details}
    <p class="muscle-map-note muscle-map-history-note">For full session details and history editing/deletion, use Overview. It shows the latest six sessions per exercise.</p>
  </div>`, restoreFocus => {
    events.abort();
    background.forEach(({element, wasInert}) => { element.inert = wasInert; });
    if(restoreFocus && trigger?.isConnected) trigger.focus({preventScroll:true});
  });

  // Only this flow makes the surrounding app inert; replacement/close restores it.
  background = Array.from(backdrop.parentElement.children).filter(element => element !== backdrop)
    .map(element => ({element, wasInert: element.inert}));
  background.forEach(({element}) => { element.inert = true; });
  const sheet = document.getElementById('sheet-content');
  const dialog = sheet.querySelector('.muscle-map-detail');
  const close = dialog.querySelector('.muscle-map-close');
  close.addEventListener('click', closeSheet, {signal:events.signal});
  dialog.addEventListener('keydown', event => {
    if(event.key === 'Escape'){
      event.preventDefault();
      closeSheet();
    } else if(event.key === 'Tab'){
      // Close is the only interactive detail control. Keep tab focus inside.
      event.preventDefault();
      close.focus();
    }
  }, {signal:events.signal});
  openSheet();
  sheet.scrollTop = 0;
  document.getElementById('muscle-map-sheet-title').focus({preventScroll:true});
}

function wireMuscleMap(root){
  root.querySelectorAll('[data-muscle-side]').forEach(button => {
    button.addEventListener('click', () => {
      if(muscleMapSide === button.dataset.muscleSide) return;
      muscleMapSide = button.dataset.muscleSide;
      renderProgress();
      root.querySelector(`[data-muscle-side="${muscleMapSide}"]`).focus();
    });
  });
  root.querySelectorAll('[data-muscle]').forEach(control => {
    const selectMuscle = () => {
      muscleMapSelectedMuscle = control.dataset.muscle;
      root.querySelectorAll('[data-muscle]').forEach(region => {
        const selected = region.dataset.muscle === muscleMapSelectedMuscle;
        region.classList.toggle('muscle-map-selected', selected);
        region.setAttribute('aria-pressed', String(selected));
      });
      openMuscleMapSheet(muscleMapSelectedMuscle, control);
    };
    control.addEventListener('click', selectMuscle);
    if(control.matches('.muscle-map-region')){
      control.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          selectMuscle();
        }
      });
    }
  });
}
