/* ===================== UI utilities & app init ===================== */
/* Sheet/toast helpers, view switching, and the init code that wires up
   nav buttons + the service worker and kicks off the first render.
   This file must load LAST — it calls functions defined in every
   other module and runs renderAll() immediately. */

/* ---------- sheet plumbing ---------- */
function setSheet(html){ document.getElementById('sheet-content').innerHTML = html; }
function openSheet(){ document.getElementById('sheet-backdrop').classList.remove('hidden'); }
function closeSheet(){ document.getElementById('sheet-backdrop').classList.add('hidden'); }

/* ---------- toast ---------- */
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.innerHTML = `<span class="toast-msg">${escapeHtml(msg)}</span>`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
function toastWithUndo(msg, onUndo, delay=4000){
  const el = document.getElementById('toast');
  el.innerHTML = `<span class="toast-msg">${escapeHtml(msg)}</span><button class="toast-undo" id="toast-undo-btn">Undo</button>`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  let committed = false;
  const commit = () => { committed = true; el.classList.add('hidden'); };
  toastTimer = setTimeout(commit, delay);
  document.getElementById('toast-undo-btn').addEventListener('click', () => {
    if(committed) return;
    clearTimeout(toastTimer);
    el.classList.add('hidden');
    onUndo();
  });
}

/* ---------- nav / init ---------- */
function todayIsDirty(){
  return [...document.querySelectorAll('#view-today .set-input')].some(inp => inp.value.trim() !== '');
}
function safeRenderToday(){
  if(!todayIsDirty()) renderToday();
}

/* swap two exercise cards in Today's DOM without wiping any inputs */
function swapTodayCards(exId1, exId2){
  const today = document.getElementById('view-today');
  const c1 = today.querySelector(`.ex-card[data-ex="${exId1}"]`);
  const c2 = today.querySelector(`.ex-card[data-ex="${exId2}"]`);
  if(!c1 || !c2 || c1.parentNode !== c2.parentNode) return;
  const anchor = document.createComment('swap');
  c1.parentNode.insertBefore(anchor, c1);
  c2.parentNode.insertBefore(c1, c2);
  anchor.parentNode.insertBefore(c2, anchor);
  anchor.parentNode.removeChild(anchor);
}
function switchView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-'+view).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view===view));
  window.scrollTo(0,0);
  if(view === 'progress') renderProgress();
  else if(view === 'split') renderSplit();
  else if(view === 'today' && !todayIsDirty()) renderToday();
}
function renderAll(){ renderToday(); renderProgress(); renderSplit(); }

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('sheet-backdrop').addEventListener('click', (e) => {
  if(e.target.id==='sheet-backdrop') closeSheet();
});

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

renderAll();
