/* ===================== Progress view ===================== */
/* Consistency heatmap, per-exercise history cards, sparkline, and the
   session edit sheet. */

/* ---------- rendering: progress hint ---------- */
function getProgressHintHtml(){
  if(localStorage.getItem(PROGRESS_HINT_KEY)) return '';
  return `<div class="onboarding-card" id="progress-hint-card">
    <button class="onboarding-close" id="dismiss-progress-hint" aria-label="Dismiss">×</button>
    <p class="onboarding-title">Reading these cards</p>
    <p class="onboarding-body">
      <strong>Logged</strong> = total times you've recorded this exercise, any reps.<br><br>
      The <strong>●● dots</strong> count sessions where you hit your rep target on any set (doesn't need to be every set) — hit it in each of your last two logged sessions at the same weight, and that triggers Time to Ascend.
    </p>
  </div>`;
}
function wireProgressHint(){
  const btn = document.getElementById('dismiss-progress-hint');
  if(btn) btn.addEventListener('click', () => {
    localStorage.setItem(PROGRESS_HINT_KEY, '1');
    document.getElementById('progress-hint-card')?.remove();
  });
}

/* ---------- rendering: sparkline ---------- */
function sparklineSvg(values){
  if(values.length<2) return '';
  const w=260, h=46, pad=4;
  const min=Math.min(...values), max=Math.max(...values);
  const range=(max-min)||1;
  const pts = values.map((v,i) => {
    const x = pad + (i*(w-2*pad))/(values.length-1);
    const y = h-pad - ((v-min)/range)*(h-2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="#C1572A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------- rendering: heatmap ---------- */
function renderHeatmap(){
  const WEEKS = 26, C = 12, G = 2, DLW = 16;

  // date → exercise count (actual training only)
  const logsByDate = {};
  state.logs.forEach(log => {
    const d = localDateKey(log.date);
    const n = log.entries ? Object.keys(log.entries).length : 1;
    logsByDate[d] = (logsByDate[d]||0) + n;
  });

  // completed rest days — tracked separately so they count toward the streak
  // without being treated as a workout (no exercise count, no progression impact)
  const restSet = new Set(state.restLog || []);
  // a day is "covered" for streak purposes if you either trained or completed rest
  const isCovered = (ds) => !!logsByDate[ds] || restSet.has(ds);

  const today = new Date();
  const todayStr = localDateKey(today);

  // grid starts Sunday of the week 25 weeks ago (matches GitHub's layout exactly)
  const dow = today.getDay(); // 0=Sun ... 6=Sat
  const thisSunday = new Date(today);
  thisSunday.setDate(today.getDate()-dow);
  const start = new Date(thisSunday);
  start.setDate(thisSunday.getDate()-(WEEKS-1)*7);

  // build weeks
  const weeks = [];
  const cur = new Date(start);
  for(let w=0;w<WEEKS;w++){
    const week=[];
    for(let d=0;d<7;d++){
      const ds=localDateKey(cur);
      week.push({ds, count:logsByDate[ds]||0, isRest: restSet.has(ds) && !logsByDate[ds], isToday:ds===todayStr, isFuture:cur>today});
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }

  // month labels
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mLabels=[]; let lastM=-1;
  weeks.forEach((wk,wi)=>{
    const m=parseInt(wk[0].ds.slice(5,7))-1;
    if(m!==lastM){ mLabels.push({wi,label:MON[m]}); lastM=m; }
  });

  // stats
  const total = state.logs.length;
  const thisM = todayStr.slice(0,7);
  const thisMonthCount = state.logs.filter(l=>localDateKey(l.date).slice(0,7)===thisM).length;

  // current streak (consecutive covered days going back — trained or completed rest)
  let streak=0;
  const sc=new Date(today);
  if(!isCovered(todayStr)) sc.setDate(sc.getDate()-1);
  while(true){
    const ds=localDateKey(sc);
    if(isCovered(ds)){streak++;sc.setDate(sc.getDate()-1);}
    else break;
  }

  // longest streak
  const sorted=Array.from(new Set([...Object.keys(logsByDate), ...restSet])).sort();
  let longest=0,run=0,prev='';
  sorted.forEach(ds=>{
    const diff=prev?((new Date(ds)-new Date(prev))/86400000):0;
    run=(!prev||diff!==1)?1:run+1;
    longest=Math.max(longest,run); prev=ds;
  });

  // cell color
  function cc(count,isFuture,isRest){
    if(isFuture) return 'transparent';
    if(isRest) return 'rgba(110,139,152,0.55)'; // steel tone — completed rest day, distinct from training intensity
    if(!count) return '#433E37';
    if(count<=2) return 'rgba(193,87,42,0.32)';
    if(count<=4) return 'rgba(193,87,42,0.64)';
    return '#C1572A';
  }

  // SVG dimensions — RPAD adds blank space after the last column so the
  // right-edge fade overlay sits on empty space instead of covering today's cell
  const RPAD = 14;
  const svgW = DLW + WEEKS*(C+G) + RPAD;
  const svgH = 14 + 7*(C+G);

  let svg=`<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" xmlns="http://www.w3.org/2000/svg" style="display:block;">`;

  // month labels
  mLabels.forEach(({wi,label})=>{
    const x=DLW+wi*(C+G);
    svg+=`<text x="${x}" y="10" font-family="IBM Plex Mono,monospace" font-size="9" fill="#A39E94">${label}</text>`;
  });

  // day labels M W F
  [{d:1,l:'M'},{d:3,l:'W'},{d:5,l:'F'}].forEach(({d,l})=>{
    const y=14+d*(C+G)+C*0.78;
    svg+=`<text x="0" y="${y}" font-family="IBM Plex Mono,monospace" font-size="9" fill="#A39E94">${l}</text>`;
  });

  // cells
  weeks.forEach((wk,wi)=>{
    wk.forEach((cell,di)=>{
      const x=DLW+wi*(C+G), y=14+di*(C+G);
      const fill=cc(cell.count,cell.isFuture,cell.isRest);
      const stroke=cell.isToday?'#EDEAE3':'none';
      if(cell.isFuture){
        svg+=`<rect x="${x}" y="${y}" width="${C}" height="${C}" rx="2.5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      } else {
        svg+=`<rect class="hm-cell" data-date="${cell.ds}" data-count="${cell.count}" data-rest="${cell.isRest?'1':'0'}" x="${x}" y="${y}" width="${C}" height="${C}" rx="2.5" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer;"/>`;
      }
    });
  });

  svg+='</svg>';

  return `
    <div class="heatmap-card">
      <p class="heatmap-title">Consistency — last 26 weeks</p>
      <div class="heatmap-stats">
        <div class="hstat"><div class="hstat-val">${total}</div><div class="hstat-label">Total</div></div>
        <div class="hstat"><div class="hstat-val">${thisMonthCount}</div><div class="hstat-label">This month</div></div>
        <div class="hstat"><div class="hstat-val">${streak}</div><div class="hstat-label">Streak</div></div>
        <div class="hstat"><div class="hstat-val">${longest}</div><div class="hstat-label">Best streak</div></div>
      </div>
      <div class="heatmap-scroll-wrap">
        <div class="heatmap-scroll" id="heatmap-scroll-el">${svg}</div>
        <div class="heatmap-fade"></div>
      </div>
      <div class="heatmap-legend">
        <span class="legend-swatch" style="background:rgba(110,139,152,0.55)"></span>
        <span>Rest</span>
        <span style="width:10px;"></span>
        <span>Less</span>
        <span class="legend-swatch" style="background:#433E37"></span>
        <span class="legend-swatch" style="background:rgba(193,87,42,0.32)"></span>
        <span class="legend-swatch" style="background:rgba(193,87,42,0.64)"></span>
        <span class="legend-swatch" style="background:#C1572A"></span>
        <span>More</span>
      </div>
      <p class="heatmap-scroll-hint">← swipe for earlier weeks</p>
    </div>`;
}

/* ---------- rendering: progress ---------- */
function openEditSessionSheet(logId, exId){
  const log = state.logs.find(l => l.id === logId);
  const ex = state.exercises[exId];
  if(!log || !ex || !log.entries[exId]){ toast('Could not find that session.'); return; }
  const sets = log.entries[exId];

  function render(){
    const rows = sets.map((s,i) => `
      <div class="set-row" style="margin-bottom:8px;">
        <span class="set-row-label">${i+1}</span>
        <input class="set-input unit" type="text" inputmode="decimal" value="${formatWeight(toDisplay(s.weight))}" id="edit-w-${i}">
        <span class="set-x">×</span>
        <input class="set-input" type="text" inputmode="numeric" value="${s.reps}" id="edit-r-${i}">
      </div>`).join('');
    setSheet(`
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">Edit Session</h2>
      <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 2px;">${escapeHtml(ex.name)}</p>
      <p style="font-family:var(--mono); font-size:11px; color:var(--steel); margin:0 0 16px;">${formatDate(log.date)} — date won't change</p>
      ${rows}
      <button class="btn btn-primary" id="edit-save" style="margin-top:10px;">Save Changes</button>
    `);
    document.getElementById('edit-save').addEventListener('click', () => {
      const newSets = [];
      for(let i=0;i<sets.length;i++){
        const w = document.getElementById(`edit-w-${i}`);
        const r = document.getElementById(`edit-r-${i}`);
        const wv = parseFloat(w.value);
        const rv = parseInt(r.value,10);
        if(isNaN(wv) || isNaN(rv) || wv<=0 || rv<=0){ toast('Enter a valid weight and reps for every set.'); return; }
        newSets.push({weight: toKg(wv), reps: rv});
      }
      const maxKg = 300;
      const bad = newSets.filter(s => s.weight > maxKg);
      if(bad.length){
        const msg = `These weights look unusually high — possible typo?\n\n${bad.map(s=>formatWeight(toDisplay(s.weight))+unitLabel()).join(', ')}\n\nSave anyway?`;
        if(!confirm(msg)) return;
      }
      log.entries[exId] = newSets;
      save(); closeSheet(); renderProgress();
      toast('Session updated — date unchanged.');
    });
  }
  render();
  openSheet();
}

function renderProgressCard(ex){
  const history = exerciseLogsInOrder(ex.id);
  const status = getProgressionStatus(ex.id);
  const dotsHtml = [0,1].map(i => `<span class="streak-dot ${i < status.streak ? 'filled':''}"></span>`).join('');

  if(!history.length){
    return `
      <div class="progress-card">
        <div class="progress-card-head" style="cursor:default; opacity:0.6;">
          <div>
            <div class="ex-name" style="font-size:14.5px;">${escapeHtml(ex.name)}</div>
            <div class="ex-meta">${ex.repMin}–${ex.repMax} reps · not yet logged</div>
          </div>
        </div>
      </div>`;
  }

  const last = history[history.length-1];
  const bestWeight = Math.max(...history.map(h => Math.max(...h.sets.map(s=>s.weight))));
  const spark = sparklineSvg(history.map(h => toDisplay(Math.max(...h.sets.map(s=>s.weight)))));
  const rows = history.slice(-6).reverse().map(h => {
    const log = state.logs.find(l => l.id === h.id);
    const dayLabel = state.days.find(d => d.id === log?.dayId)?.label || 'Session';
    const exCount = Object.keys(log?.entries||{}).length;
    return `<tr>
      <td>${formatDate(h.date)}</td>
      <td data-edit-log="${h.id}" data-edit-ex="${ex.id}" style="cursor:pointer;">${h.sets.map(s=>`${formatWeight(toDisplay(s.weight))}${unitLabel()}×${s.reps}`).join(', ')} <span style="opacity:0.45;">✎</span></td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="session-del-btn" data-log-id="${h.id}" data-day-label="${escapeHtml(dayLabel)}" data-ex-count="${exCount}" data-date="${formatDate(h.date)}" aria-label="Delete session">×</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="progress-card" data-ex="${ex.id}">
      <div class="progress-card-head">
        <div>
          <div class="ex-name" style="font-size:14.5px;">${escapeHtml(ex.name)}</div>
          <div class="ex-meta">${ex.repMin}–${ex.repMax} reps · last: ${formatWeight(toDisplay(last.sets[0].weight))}${unitLabel()}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <div class="streak-dots">${dotsHtml}</div>
          <span class="expand-hint">history <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"></path></svg></span>
        </div>
      </div>
      <div class="progress-card-body hidden">
        <div class="progress-stats">
          <div class="stat"><div class="stat-label">Best</div><div class="stat-value">${formatWeight(toDisplay(bestWeight))} <span style="font-size:12px;color:var(--chalk-dim)">${unitLabel()}</span></div></div>
          <div class="stat"><div class="stat-label">Last</div><div class="stat-value">${formatWeight(toDisplay(last.sets[0].weight))} <span style="font-size:12px;color:var(--chalk-dim)">${unitLabel()}</span></div></div>
          <div class="stat"><div class="stat-label">Logged</div><div class="stat-value">${history.length}</div></div>
        </div>
        <div class="spark-wrap">${spark}</div>
        <table class="history-table"><thead><tr><th>Date</th><th>Sets</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function renderProgress(){
  const root = document.getElementById('view-progress');
  const allEx = Object.values(state.exercises);
  const heatmap = renderHeatmap();

  if(!allEx.length){
    root.innerHTML = `<div class="day-heading" style="margin-top:6px;"><p class="day-eyebrow">All Lifts</p><h1 class="day-title">Progress</h1></div>
      ${heatmap}
      <div class="empty-note">No exercises yet. Add some in the Split tab.</div>`;
    return;
  }
  const byMuscle = {};
  allEx.forEach(ex => { (byMuscle[ex.muscle] = byMuscle[ex.muscle]||[]).push(ex); });

  let html = `<div class="day-heading" style="margin-top:6px;"><p class="day-eyebrow">All Lifts</p><h1 class="day-title">Progress</h1></div>${heatmap}${getProgressHintHtml()}`;
  Object.keys(byMuscle).sort().forEach(muscle => {
    html += `<div class="section-title">${muscle}</div>`;
    byMuscle[muscle].forEach(ex => { html += renderProgressCard(ex); });
  });
  root.innerHTML = html;
  wireProgressHint();
  const hmScroll = document.getElementById('heatmap-scroll-el');
  if(hmScroll) hmScroll.scrollLeft = hmScroll.scrollWidth;
  if(hmScroll && !hmScroll.dataset.wired){
    hmScroll.dataset.wired = '1';
    hmScroll.addEventListener('click', (e) => {
      const cell = e.target.closest('.hm-cell');
      if(!cell) return;
      const ds = cell.dataset.date;
      const count = parseInt(cell.dataset.count, 10);
      const isRest = cell.dataset.rest === '1';
      const d = new Date(ds + 'T12:00:00');
      const label = d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
      const msg = count > 0
        ? `${label} — ${count} exercise${count!==1?'s':''} logged`
        : isRest ? `${label} — rest day` : `${label} — no workout logged`;
      toast(msg);
    });
  }

  // expand/collapse progress cards
  root.querySelectorAll('.progress-card[data-ex]').forEach(card => {
    const head = card.querySelector('.progress-card-head');
    const body = card.querySelector('.progress-card-body');
    if(head && body) head.addEventListener('click', () => {
      body.classList.toggle('hidden');
      head.classList.toggle('open');
    });
  });

  // tap a session's sets to edit weight/reps without changing the date
  root.querySelectorAll('[data-edit-log]').forEach(td => {
    td.addEventListener('click', () => {
      openEditSessionSheet(td.dataset.editLog, td.dataset.editEx);
    });
  });

  // per-session delete buttons
  root.querySelectorAll('[data-log-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't trigger card expand/collapse
      const logId = btn.dataset.logId;
      const dayLabel = btn.dataset.dayLabel;
      const exCount = btn.dataset.exCount;
      const dateStr = btn.dataset.date;
      if(!confirm(`Delete the ${dayLabel} session from ${dateStr}?\n\nThis removes all ${exCount} exercise${exCount!=='1'?'s':''} logged in that session. This cannot be undone.`)) return;
      state.logs = state.logs.filter(l => l.id !== logId);
      save(); renderProgress();
      toast(`${dayLabel} session from ${dateStr} deleted.`);
    });
  });
}
