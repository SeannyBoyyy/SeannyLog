/* Optional Web Push. Only the companion Worker schedules/delivers reminders.
   This file synchronizes device preferences and a minimal eligibility snapshot.
   Its separate storage key is deliberately excluded from workout backups. */
const REMINDER_APP_BASE = new URL('./', document.baseURI);
const REMINDER_KEY = `seannylog.reminders.v1:${REMINDER_APP_BASE.pathname}`;
let reminderSyncPromise = null;
let reminderActionBusy = false;
let reminderMessage = '';

function reminderZone(){ return Intl.DateTimeFormat().resolvedOptions().timeZone; }
function reminderPreferences(){
  try{
    const saved = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
    return {wanted:false, registered:false, pending:false, unsubscribePending:false,
      time:'18:00', timeZone:reminderZone(), revision:0, ...saved};
  }catch(e){ return {wanted:false, registered:false, pending:false, time:'18:00', timeZone:reminderZone(), revision:0}; }
}
function storeReminderPreferences(prefs){
  localStorage.setItem(REMINDER_KEY, JSON.stringify(prefs));
}
function reminderRevision(prefs){ return Math.max(Date.now(), Number(prefs.revision || 0) + 1); }
function reminderHex(bytes){
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, '0')).join('');
}
function reminderPublicKey(value){
  if(typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid public key.');
  const key = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if(key.length !== 65 || key[0] !== 4) throw new Error('Invalid public key.');
  return key;
}
function reminderConfig(){
  const config = window.SEANNYLOG_REMINDERS || {};
  if(!config.apiBase || !config.vapidPublicKey) return null;
  try{
    const url = new URL(config.apiBase);
    if(url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if(url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    reminderPublicKey(config.vapidPublicKey);
    return {apiBase:url.origin, publicKey:config.vapidPublicKey};
  }catch(e){ return null; }
}
function reminderSupportProblem(){
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if(ios && !installed) return 'On iPhone or iPad (iOS 16.4+), use Share → Add to Home Screen, then open SeannyLog from its icon to enable reminders.';
  if(!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'Web Push is unavailable in this browser. Use a supported browser over HTTPS, or an installed iOS Home Screen app.';
  if(Notification.permission === 'denied') return 'Notifications are blocked. Allow them in your browser or device settings, then return here.';
  if(!SeannyReminderRules.validZone(reminderZone())) return 'Your device timezone is unavailable. Check your date and time settings.';
  if(!reminderConfig()) return 'Reminders are not configured on this site yet. Workout logging still works offline.';
  return '';
}
function reminderSnapshot(prefs){
  // Another open tab may have saved more recently than this tab's in-memory state.
  const latestState = load();
  return SeannyReminderRules.snapshot(latestState, Date.now(), prefs.timeZone);
}
function reminderSignature(prefs){
  return JSON.stringify({time:prefs.time, timeZone:prefs.timeZone,
    date:SeannyReminderRules.localDate(Date.now(), prefs.timeZone), ...reminderSnapshot(prefs)});
}
function reminderSettingsHtml(){
  return `<section class="reminder-settings" aria-labelledby="reminder-title">
    <h3 id="reminder-title" class="field-label">Workout reminders</h3>
    <p class="settings-row-sub"><strong>Automatic workout reminders are paused.</strong> You can register this device and send manual test notifications. Your cycle only advances when you change it.</p>
    <label class="field-label" for="reminder-time">Saved reminder time (currently inactive)</label>
    <input class="text-input" type="time" id="reminder-time" required>
    <p class="settings-row-sub" id="reminder-zone"></p>
    <p class="reminder-status" id="reminder-status" role="status" aria-live="polite"></p>
    <div class="reminder-actions">
      <button class="btn btn-small btn-primary" id="reminder-enable">Enable test notifications</button>
      <button class="btn btn-small btn-ghost" id="reminder-disable">Disable reminders</button>
      <button class="btn btn-small btn-ghost" id="reminder-test">Send test notification</button>
      <button class="btn btn-small btn-ghost" id="reminder-sync">Sync now</button>
    </div>
    <p class="settings-row-sub reminder-note">Enabling shares this device’s push subscription, reminder time, timezone, and minimal eligibility with the reminder service. Your exercises, history, weights, reps, and drafts stay here.</p>
    <p class="settings-row-sub reminder-note">Enabling or syncing does not resume automatic reminders. Offline changes sync when you reopen or reconnect. Test delivery depends on network, browser, and OS behavior.</p>
  </section>`;
}
function renderReminderSettings(){
  const status = document.getElementById('reminder-status');
  if(!status) return;
  const prefs = reminderPreferences();
  const problem = reminderSupportProblem();
  const time = document.getElementById('reminder-time');
  if(document.activeElement !== time) time.value = prefs.time;
  document.getElementById('reminder-zone').textContent = `Timezone: ${reminderZone()} · follows this device on next sync`;
  let message = 'Test notifications are off.';
  if(prefs.wanted){
    message = prefs.registered ? 'Device registered for test notifications.' : 'Test notifications are not enabled yet — registration is pending.';
    if(prefs.registered && 'Notification' in window && Notification.permission !== 'granted')
      message = 'Notifications are unavailable on this device. The server registration still exists; disable reminders to remove it.';
    if(prefs.pending) message += ' Changes are pending server synchronization.';
  }else if(prefs.pending){
    message = 'Disabled on this device; server removal is pending. Reopen online or tap Sync now to finish. A previously queued reminder may still arrive.';
  }else if(prefs.unsubscribePending){
    message = 'Disabled on the server; browser unsubscribe is pending. Tap Sync now to retry.';
  }
  if(!navigator.onLine && (prefs.pending || prefs.unsubscribePending)) message += ' You are offline.';
  status.textContent = [message, 'Automatic reminders remain paused.', problem, reminderMessage].filter(Boolean).join(' ');
  document.getElementById('reminder-enable').hidden = prefs.wanted && prefs.registered;
  document.getElementById('reminder-enable').disabled = !!problem || reminderActionBusy || !!reminderSyncPromise || (!prefs.wanted && prefs.pending);
  document.getElementById('reminder-disable').hidden = !prefs.wanted;
  document.getElementById('reminder-test').disabled = !prefs.registered || !prefs.wanted || prefs.pending || !!problem || reminderActionBusy || !!reminderSyncPromise;
  document.getElementById('reminder-sync').hidden = !prefs.wanted && !prefs.pending && !prefs.unsubscribePending;
  document.getElementById('reminder-sync').disabled = reminderActionBusy || !!reminderSyncPromise;
}
function wireReminderSettings(){
  document.getElementById('reminder-enable').addEventListener('click', enableReminders);
  document.getElementById('reminder-disable').addEventListener('click', disableReminders);
  document.getElementById('reminder-test').addEventListener('click', testReminder);
  document.getElementById('reminder-sync').addEventListener('click', () => refreshReminders(true));
  document.getElementById('reminder-time').addEventListener('change', event => {
    if(!SeannyReminderRules.validTime(event.target.value)){ reminderMessage = 'Choose a valid reminder time.'; renderReminderSettings(); return; }
    try{
      const prefs = reminderPreferences();
      prefs.time = event.target.value;
      prefs.timeZone = reminderZone();
      prefs.revision = reminderRevision(prefs);
      prefs.pending = prefs.pending || prefs.wanted;
      prefs.queuedSignature = reminderSignature(prefs);
      storeReminderPreferences(prefs);
      reminderMessage = '';
      syncReminders();
    }catch(e){ reminderMessage = 'Could not save reminder settings. Check device storage.'; }
    renderReminderSettings();
  });
  renderReminderSettings();
  refreshReminders();
}
async function reminderRegistration(){
  const registration = await navigator.serviceWorker.getRegistration(REMINDER_APP_BASE.href);
  if(!registration?.active) throw new Error('Offline support is still starting. Reload the app and try again.');
  return registration;
}
async function reminderRequest(prefs, method, body, suffix = ''){
  const result = await fetch(`${prefs.apiBase}/v1/subscriptions/${prefs.id}${suffix}`, {
    method, headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${prefs.credential}`},
    ...(body ? {body:JSON.stringify(body)} : {}),
    credentials:'omit', cache:'no-store', redirect:'error', signal:AbortSignal.timeout(15000)
  });
  const data = await result.json();
  if(!result.ok){
    const error = new Error(data.error || 'Reminder settings changed elsewhere. Sync again.');
    error.status = result.status;
    error.revision = data.revision;
    throw error;
  }
  return data;
}
async function enableReminders(){
  const problem = reminderSupportProblem();
  if(problem){ reminderMessage = problem; renderReminderSettings(); return; }
  if(reminderActionBusy) return;
  reminderActionBusy = true;
  reminderMessage = '';
  try{
    // Keep this call directly in the user's click, before any other await.
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if(permission !== 'granted') throw new Error('Notification permission was not granted. Reminders remain off.');
    renderReminderSettings();
    const config = reminderConfig();
    const registration = await reminderRegistration();
    let prefs = reminderPreferences();
    if(prefs.apiBase && prefs.apiBase !== config.apiBase && (prefs.registered || prefs.pending))
      throw new Error('The reminder service changed. Disable and sync existing reminders before enabling again.');
    let subscription = await registration.pushManager.getSubscription();
    if(subscription && (!prefs.id || prefs.publicKey !== config.publicKey)){
      if(!await subscription.unsubscribe()) throw new Error('Could not replace the old push subscription. Try again online.');
      subscription = null;
    }
    if(!subscription) subscription = await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:reminderPublicKey(config.publicKey)});
    // Persist identity before the network request so an ambiguous response can
    // be retried or deleted using the same installation credential.
    if(!prefs.id || prefs.apiBase !== config.apiBase){ prefs.id = reminderHex(16); prefs.credential = reminderHex(32); }
    prefs = {...prefs, ...config, wanted:true, registered:false, pending:true,
      unsubscribePending:false, timeZone:reminderZone(), revision:reminderRevision(prefs)};
    prefs.queuedSignature = reminderSignature(prefs);
    storeReminderPreferences(prefs);
    await syncReminders();
  }catch(e){ reminderMessage = e.name === 'TypeError' ? 'Could not connect. Registration has not succeeded; reconnect and try again.' : e.message; }
  finally{ reminderActionBusy = false; renderReminderSettings(); }
}
function disableReminders(){
  try{
    const prefs = reminderPreferences();
    prefs.wanted = false;
    prefs.registered = false;
    prefs.pending = !!prefs.id;
    prefs.unsubscribePending = true;
    prefs.revision = reminderRevision(prefs);
    storeReminderPreferences(prefs);
    reminderMessage = '';
    // A reset/disable during an in-flight PUT wins by revision. Its outbox is
    // retained until DELETE is acknowledged; browser unsubscribe is also retried.
    syncReminders();
  }catch(e){ reminderMessage = 'Could not save the disable request. Check device storage and try again.'; }
  renderReminderSettings();
}
async function syncReminderLoop(){
  for(let attempt = 0; attempt < 4; attempt++){
    const prefs = reminderPreferences();
    if(!prefs.pending && !prefs.unsubscribePending) return;
    try{
      if(!prefs.wanted){
        let unsubscribePending = false;
        try{
          if('serviceWorker' in navigator){
            const registration = await navigator.serviceWorker.getRegistration(REMINDER_APP_BASE.href);
            const subscription = await registration?.pushManager?.getSubscription();
            if(subscription) unsubscribePending = !await subscription.unsubscribe();
          }
        }catch(e){ unsubscribePending = true; }
        if(prefs.pending){
          if(!navigator.onLine) throw new Error('Server removal will sync when you reconnect.');
          await reminderRequest(prefs, 'DELETE', {revision:prefs.revision});
        }
        const latest = reminderPreferences();
        if(latest.revision !== prefs.revision) continue;
        storeReminderPreferences({...latest, pending:false, unsubscribePending, registered:false});
        reminderMessage = unsubscribePending ? 'Browser unsubscribe could not finish. Sync again.' : '';
        return;
      }
      if(!navigator.onLine) throw new Error('Waiting for an internet connection to sync.');
      if(!('Notification' in window) || Notification.permission !== 'granted')
        throw new Error('Notification permission is unavailable. Disable reminders to remove the server subscription.');
      const registration = await reminderRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if(!subscription){
        const latest = reminderPreferences();
        if(latest.revision === prefs.revision) storeReminderPreferences({...latest, registered:false});
        throw new Error('The browser subscription expired. Click Enable test notifications to create a new one.');
      }
      const timeZone = reminderZone();
      const snapshot = reminderSnapshot({...prefs, timeZone});
      const result = await reminderRequest(prefs, 'PUT', {revision:prefs.revision,
        subscription:subscription.toJSON(), time:prefs.time, timeZone,
        observedAt:Date.now(), ...snapshot});
      const latest = reminderPreferences();
      if(latest.revision !== prefs.revision) continue;
      if(!result.registered){
        storeReminderPreferences({...latest, registered:false});
        throw new Error('Subscription expired. Click Enable test notifications again.');
      }
      // A PUT may have succeeded before its response was lost. Replaying its
      // revision returns the original freshness, never a fabricated renewal.
      if(result.observedAt && result.observedAt < Date.now() - 12*3600000){
        storeReminderPreferences({...latest, revision:reminderRevision(latest)});
        continue;
      }
      storeReminderPreferences({...latest, registered:true, pending:false, timeZone,
        expiresAt:result.expiresAt || latest.expiresAt, lastSyncedAt:result.syncedAt || result.observedAt || Date.now(),
        signature:JSON.stringify({time:prefs.time, timeZone,
          date:SeannyReminderRules.localDate(Date.now(), timeZone), ...snapshot})});
      reminderMessage = '';
      return;
    }catch(e){
      const latest = reminderPreferences();
      if(latest.revision !== prefs.revision) continue;
      if(e.status === 409 && Number.isSafeInteger(e.revision)){
        storeReminderPreferences({...latest, revision:Math.max(reminderRevision(latest), e.revision+1)});
        continue;
      }
      reminderMessage = ['TypeError','TimeoutError','AbortError'].includes(e.name) ?
        'Could not reach the reminder service. Changes remain pending; reconnect or tap Sync now to retry.' : e.message;
      return;
    }
  }
}
function syncReminders(){
  if(reminderSyncPromise) return reminderSyncPromise;
  const run = () => syncReminderLoop();
  reminderSyncPromise = (navigator.locks ? navigator.locks.request(REMINDER_KEY, run) : run())
    .catch(() => { reminderMessage = 'Reminder synchronization failed. Check device storage and reconnect to retry.'; })
    .finally(() => { reminderSyncPromise = null; renderReminderSettings(); });
  renderReminderSettings();
  return reminderSyncPromise;
}
function refreshReminders(force = false){
  try{
    const prefs = reminderPreferences();
    if(prefs.wanted){
      prefs.timeZone = reminderZone();
      const signature = reminderSignature(prefs);
      const changed = signature !== (prefs.pending ? prefs.queuedSignature : prefs.signature);
      if(force || changed || (!prefs.pending && Date.now() - (prefs.lastSyncedAt || 0) > 12*3600000)){
        prefs.pending = true;
        prefs.revision = reminderRevision(prefs);
        prefs.queuedSignature = signature;
        storeReminderPreferences(prefs);
      }
    }
    if(prefs.pending || prefs.unsubscribePending) syncReminders();
  }catch(e){ reminderMessage = 'Could not update reminders. Check device storage and timezone settings.'; }
  renderReminderSettings();
}
async function testReminder(){
  reminderActionBusy = true;
  reminderMessage = '';
  renderReminderSettings();
  try{
    const result = await reminderRequest(reminderPreferences(), 'POST', null, '/test');
    reminderMessage = result.message;
  }catch(e){
    reminderMessage = e.name === 'TypeError' ? 'Could not connect to send a test notification.' : e.message;
    if(e.status === 404 || e.status === 410){
      const prefs = reminderPreferences();
      storeReminderPreferences({...prefs, registered:false});
      if(e.status === 410){
        try{ const sub = await (await reminderRegistration()).pushManager.getSubscription(); await sub?.unsubscribe(); }catch(ignored){}
      }
    }
  }finally{ reminderActionBusy = false; renderReminderSettings(); }
}

// No browser timer or background sync schedules notifications. Refresh on
// app lifecycle/user events; the closed app cannot detect travel or offline edits.
window.addEventListener('online', () => refreshReminders(true));
window.addEventListener('offline', renderReminderSettings);
window.addEventListener('focus', () => refreshReminders(true));
window.addEventListener('pageshow', () => refreshReminders(true));
window.addEventListener('storage', event => {
  if(event.key === STORAGE_KEY) refreshReminders();
  else if(event.key === REMINDER_KEY){
    const prefs = reminderPreferences();
    if(prefs.pending || prefs.unsubscribePending) syncReminders();
    renderReminderSettings();
  }
});
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') refreshReminders(true);
});
