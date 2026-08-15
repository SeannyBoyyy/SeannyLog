/* ===================== Settings sheet ===================== */
/* Unit toggle, JSON backup export/import, manual day picker. */

/* ---------- sheet: settings ---------- */
function openSettings(){
  const isMobile = navigator.share !== undefined;
  const unit = getUnit();
  setSheet(`
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Settings</h2>
    <div class="settings-row">
      <div>
        <div class="settings-row-text">Weight unit</div>
        <div class="settings-row-sub">Applies everywhere — history auto-converts</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-small ${unit==='kg'?'btn-primary':'btn-ghost'}" id="unit-kg">KG</button>
        <button class="btn btn-small ${unit==='lbs'?'btn-primary':'btn-ghost'}" id="unit-lbs">LBS</button>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-text">Export backup</div>
        <div class="settings-row-sub">${isMobile ? 'Share your data via WhatsApp, Notes, etc.' : 'Download your data as a .json file'}</div>
      </div>
      <button class="btn btn-small btn-ghost" id="btn-export">Export</button>
    </div>
    <div class="settings-row" style="border-bottom:none;">
      <div>
        <div class="settings-row-text">Import backup</div>
        <div class="settings-row-sub">Restore from a file or pasted text</div>
      </div>
      <button class="btn btn-small btn-ghost" id="btn-import">Import</button>
    </div>
    <div style="margin-top:26px;">
      <div style="font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--chalk-dim); margin-bottom:10px;">Recovery</div>
      <div class="settings-row">
        <div>
          <div class="settings-row-text">Current day in cycle</div>
          <div class="settings-row-sub">Now on: Day ${state.cycleIndex+1} — ${escapeHtml(state.days[state.cycleIndex]?.label || '?')}</div>
        </div>
        <button class="btn btn-small btn-ghost" id="btn-set-day">Change</button>
      </div>
      <div class="settings-row" style="border-bottom:none;">
        <div><div class="settings-row-text">Undo last workout</div><div class="settings-row-sub">${state.logs.length} session${state.logs.length===1?'':'s'} logged</div></div>
        <button class="btn btn-small btn-ghost" id="btn-undo">Undo</button>
      </div>
    </div>
    <div style="margin-top:26px;">
      <div style="font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--danger); margin-bottom:10px;">Danger Zone</div>
      <div class="settings-row" style="border-bottom:none;">
        <div><div class="settings-row-text">Reset all data</div><div class="settings-row-sub">Wipes your split, history, everything</div></div>
        <button class="btn btn-small btn-danger" id="btn-reset">Reset</button>
      </div>
    </div>
    <p style="font-family:var(--mono); font-size:11px; color:var(--chalk-dim); margin-top:18px; line-height:1.6;">
      Everything lives only on this device. Export before clearing your browser or switching phones.
    </p>
    <p style="font-family:var(--mono); font-size:11px; color:var(--chalk-dim); margin-top:10px;">
      SeannyLog v${APP_VERSION}
    </p>
  `);
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', openImportSheet);
  document.getElementById('btn-set-day').addEventListener('click', openDayPicker);
  document.getElementById('unit-kg').addEventListener('click', () => { convertDraftUnits('kg'); setUnit('kg'); closeSheet(); renderAll(); toast('Unit set to kg.'); });
  document.getElementById('unit-lbs').addEventListener('click', () => { convertDraftUnits('lbs'); setUnit('lbs'); closeSheet(); renderAll(); toast('Unit set to lbs.'); });
  document.getElementById('btn-undo').addEventListener('click', () => {
    const didUndo = undoLastLog();
    if(didUndo) closeSheet();
  });
  document.getElementById('btn-reset').addEventListener('click', openResetConfirmSheet);
  openSheet();
}

// Reset wipes everything with no recovery path (short of a backup you may not
// have made), so it gets more than the one-tap-plus-generic-dialog protection
// Undo has — real numbers pulled from state instead of generic wording, and
// the button hierarchy deliberately inverted: Cancel reads as the primary,
// inviting action; the actual delete button is the quieter, secondary one.
// That's on purpose — it's the one action in this app a reflexive tap should
// never land on by default.
function openResetConfirmSheet(){
  const sessionCount = state.logs.length;
  const exerciseCount = Object.keys(state.exercises).length;
  setSheet(`
    <div class="sheet-handle"></div>
    <h2 class="sheet-title" style="color:var(--danger);">Reset Everything?</h2>
    <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 12px; line-height:1.6;">This permanently deletes:</p>
    <div style="margin-bottom:4px;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;">
        <span>Logged sessions</span>
        <span style="font-family:var(--mono); color:var(--chalk-dim);">${sessionCount}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;">
        <span>Exercises in your library</span>
        <span style="font-family:var(--mono); color:var(--chalk-dim);">${exerciseCount}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; font-size:13px;">
        <span>Your entire split</span>
        <span style="font-family:var(--mono); color:var(--chalk-dim);">gone</span>
      </div>
    </div>
    <p style="font-size:13px; color:var(--chalk-dim); margin:14px 0 0; line-height:1.5;">There's no undo for this. Export a backup first if you're not sure.</p>
    <button class="btn btn-primary" id="btn-reset-cancel" style="margin-top:16px;">Cancel</button>
    <button class="btn btn-danger" id="btn-reset-confirm" style="margin-top:8px;">Yes, Delete Everything</button>
  `);
  document.getElementById('btn-reset-cancel').addEventListener('click', () => closeSheet());
  document.getElementById('btn-reset-confirm').addEventListener('click', () => {
    state = seedData(); collapsedDays = null; save(); closeSheet(); renderAll();
    toast('Reset complete.');
  });
  openSheet();
}

function openDayPicker(){
  const rows = state.days.map((d,i) => `
    <label class="day-check-row" style="cursor:pointer;">
      <input type="radio" name="day-pick" value="${i}" ${i===state.cycleIndex?'checked':''} style="accent-color:var(--rust); width:18px; height:18px; flex:none;">
      <span>
        Day ${i+1} — <strong>${escapeHtml(d.label)}</strong>
        ${i===state.cycleIndex ? '<span style="font-family:var(--mono);font-size:10px;color:var(--rust);margin-left:6px;">current</span>' : ''}
      </span>
    </label>`).join('');
  setSheet(`
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Set Current Day</h2>
    <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 14px; line-height:1.5;">
      If your cycle got out of sync, pick the day you're actually on. This only changes where you are in the rotation — it doesn't delete any history.
    </p>
    ${rows}
    <button class="btn btn-primary" id="dp-save" style="margin-top:18px;">Set Day</button>
  `);
  document.getElementById('dp-save').addEventListener('click', () => {
    const picked = document.querySelector('input[name="day-pick"]:checked');
    if(!picked) return;
    state.cycleIndex = parseInt(picked.value, 10);
    if(collapsedDays) collapsedDays.delete(state.days[state.cycleIndex]?.id);
    save(); closeSheet(); renderToday(); renderSplit();
    toast(`Cycle set to Day ${state.cycleIndex+1} — ${state.days[state.cycleIndex].label}.`);
  });
  openSheet();
}

async function exportData(){
  const json = JSON.stringify(state, null, 2);
  const filename = `seannylog-backup-${todayISO()}.json`;

  // Try Web Share API first (iOS Safari, Android Chrome — opens native share sheet)
  if(navigator.share){
    try{
      const file = new File([json], filename, {type:'application/json'});
      // Check if sharing files is supported
      if(navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({
          title: 'SeannyLog Backup',
          text: 'SeannyLog workout data backup',
          files: [file]
        });
        toast('Backup shared.');
        return;
      }
      // Fallback: share as text (copies-friendly for notes/whatsapp)
      await navigator.share({
        title: 'SeannyLog Backup',
        text: json
      });
      toast('Backup shared.');
      return;
    }catch(err){
      if(err.name === 'AbortError') return; // user cancelled share sheet
      // fall through to download
    }
  }

  // Desktop fallback — direct download
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Backup downloaded.');
}

function parseAndRestoreBackup(json){
  try{
    const parsed = JSON.parse(json);
    if(!parsed.days || !parsed.exercises) throw new Error('bad shape');
    if(!Array.isArray(parsed.restLog)) parsed.restLog = [];
    state = parsed; collapsedDays = null; save(); closeSheet(); renderAll();
    toast('Backup restored.');
    return true;
  }catch(err){
    toast("That doesn't look like a valid SeannyLog backup.");
    return false;
  }
}

function openImportSheet(){
  setSheet(`
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Import Backup</h2>
    <p style="font-size:13px; color:var(--chalk-dim); margin:0 0 18px; line-height:1.6;">
      Choose how you have your backup:
    </p>
    <button class="btn btn-ghost" id="imp-file" style="margin-bottom:10px;">
      📂 Pick a .json file
    </button>
    <input type="file" id="file-import-sheet" accept="application/json" style="display:none;">
    <div style="display:flex; align-items:center; gap:10px; margin:6px 0 14px;">
      <div style="flex:1; height:1px; background:var(--line);"></div>
      <span style="font-family:var(--mono); font-size:11px; color:var(--chalk-dim);">or</span>
      <div style="flex:1; height:1px; background:var(--line);"></div>
    </div>
    <label class="field-label" style="margin-top:0;">Paste backup text</label>
    <textarea id="imp-paste" rows="5" placeholder="Paste your SeannyLog backup JSON here..."
      style="width:100%; background:var(--iron); border:1px solid var(--line); border-radius:9px;
             padding:11px 12px; font-size:12px; color:var(--chalk); font-family:var(--mono);
             resize:none; line-height:1.5;"></textarea>
    <button class="btn btn-primary" id="imp-paste-go" style="margin-top:10px;">Restore from Paste</button>
  `);
  document.getElementById('imp-file').addEventListener('click', () =>
    document.getElementById('file-import-sheet').click()
  );
  document.getElementById('file-import-sheet').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => parseAndRestoreBackup(reader.result);
    reader.readAsText(file);
    e.target.value = '';
  });
  document.getElementById('imp-paste-go').addEventListener('click', () => {
    const text = document.getElementById('imp-paste').value.trim();
    if(!text){ toast('Paste your backup text first.'); return; }
    parseAndRestoreBackup(text);
  });
  openSheet();
}
