import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {keys} from '../test/helpers.mjs';

const publicKey = keys().publicKey;
const seed = {schemaVersion:1, cycleIndex:0,
  days:[{id:'push',label:'Push',exerciseIds:['press']},{id:'pull',label:'Pull',exerciseIds:['press']},{id:'rest',label:'Rest',exerciseIds:[]}],
  exercises:{press:{id:'press',name:'Bench Press',muscle:'Chest',sets:2,repMin:8,repMax:10,increment:2.5,custom:false}},
  logs:[],restLog:[],restCompletions:[]};

async function start(page, {push=false, permission='default', ios=false, unsupported=false, unconfigured=false} = {}){
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(({seed,push,permission,ios,unsupported,publicKey}) => {
    if(!localStorage.getItem('ironlog.v1')) localStorage.setItem('ironlog.v1',JSON.stringify(seed));
    localStorage.setItem('ironlog.onboarding','1');
    localStorage.setItem('ironlog.hint.dismissed','1');
    if(ios){
      Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
    }
    if(unsupported) delete window.PushManager;
    if(push){
      window.permissionRequests = 0;
      let currentPermission = localStorage.getItem('test.push.permission') || permission;
      class MockNotification {
        static get permission(){ return currentPermission; }
        static async requestPermission(){
          window.permissionRequests++; currentPermission='granted';
          localStorage.setItem('test.push.permission', currentPermission);
          return currentPermission;
        }
      }
      Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
      const subscription = {
        toJSON(){ return {endpoint:'https://fcm.googleapis.com/fcm/send/browser-fixture',expirationTime:null,
          keys:{p256dh:publicKey,auth:'AAAAAAAAAAAAAAAAAAAAAA'}}; },
        async unsubscribe(){ localStorage.removeItem('test.push.active'); return true; }
      };
      Object.defineProperty(ServiceWorkerRegistration.prototype,'pushManager',{get(){ return {
        async getSubscription(){ return localStorage.getItem('test.push.active') ? subscription : null; },
        async subscribe(){ localStorage.setItem('test.push.active','1'); return subscription; }
      }; }});
    }
  }, {seed,push,permission,ios,unsupported,publicKey});
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  if(push) await page.evaluate(publicKey => {
    window.SEANNYLOG_REMINDERS = {apiBase:'https://reminders.example',vapidPublicKey:publicKey};
  }, publicKey);
  if(unconfigured) await page.evaluate(()=>{
    window.SEANNYLOG_REMINDERS = {apiBase:'',vapidPublicKey:''};
  });
  return errors;
}
async function api(page, {fail=false, gate=null} = {}){
  const calls = [];
  const control = {fail, gate, testStatus:200};
  await page.route('https://reminders.example/**', async route => {
    const req = route.request();
    if(req.method() === 'OPTIONS'){
      await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'http://localhost:8080',
        'Access-Control-Allow-Methods':'PUT,DELETE,POST','Access-Control-Allow-Headers':'Authorization,Content-Type'}});
      return;
    }
    const body = req.postDataJSON();
    calls.push({method:req.method(), body, authorization:req.headers().authorization});
    if(control.gate) await control.gate;
    if(control.fail){ await route.abort('failed'); return; }
    if(req.method() === 'POST' && control.testStatus !== 200){
      await route.fulfill({status:control.testStatus,contentType:'application/json',
        headers:{'Access-Control-Allow-Origin':'http://localhost:8080'},
        body:JSON.stringify({error:'Subscription expired. Disable reminders, then enable them again.'})});
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'http://localhost:8080'},
      body:JSON.stringify({ok:true, registered:req.method()!=='DELETE',revision:body?.revision,
        expiresAt:Date.now()+7*86400000,message:'Test accepted by the push service. Delivery may be delayed.'})});
  });
  return {calls, control};
}
async function enable(page){
  await page.click('#btn-settings');
  await page.click('#reminder-enable');
  await expect(page.locator('#reminder-status')).toContainText('Device registered for test notifications.');
}
async function fillWorkout(page){
  await page.fill('#set-w-press-0','50'); await page.fill('#set-r-press-0','10');
  await page.fill('#set-w-press-1','50'); await page.fill('#set-r-press-1','8');
}

test('existing logging, drafts, split editing, backups and offline subdirectory loading', async ({page,context}) => {
  const errors = await start(page);
  await page.click('#btn-settings');
  await expect(page.locator('#reminder-status')).toContainText('Test notifications are off.');
  await expect(page.locator('#reminder-enable')).toBeEnabled();
  await page.evaluate(() => closeSheet());
  await fillWorkout(page);
  await page.reload();
  await expect(page.locator('#set-w-press-0')).toHaveValue('50');
  await expect(page.locator('#set-r-press-1')).toHaveValue('8');
  await page.click('#btn-finish');
  await expect.poll(() => page.evaluate(() => state.logs.length)).toBe(1);
  expect(await page.evaluate(() => state.cycleIndex)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem(DRAFT_KEY))).toBeNull();
  await page.click('[data-view="split"]');
  await page.locator('[data-day-label="pull"]').fill('Upper');
  await page.locator('[data-day-label="pull"]').blur();
  expect(await page.evaluate(() => state.days[1].label)).toBe('Upper');
  await page.click('#btn-settings');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#btn-export');
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(),'utf8'));
  expect(backup.logs[0].entries.press[0]).toEqual({weight:50,reps:10});
  expect(backup.days[1].label).toBe('Upper');
  await page.evaluate(backup => parseAndRestoreBackup(JSON.stringify(backup)),backup);
  await page.click('[data-view="today"]');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#btn-finish')).toBeVisible();
  await expect(page.locator('#set-w-press-0')).toHaveValue('50');
  expect(await page.evaluate(() => state.logs.length)).toBe(1);
  expect(await page.evaluate(() => APP_VERSION)).toBe('3.11');
  expect(errors).toEqual([]);
});

test('permission is click-only; registration must succeed before enabled; test and private backups', async ({page}) => {
  const errors = await start(page,{push:true});
  let release;
  const {calls,control} = await api(page,{gate:new Promise(resolve => {release=resolve;})});
  await page.click('#btn-settings');
  expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
  await expect(page.locator('.reminder-settings')).toContainText('Automatic workout reminders are paused.');
  await expect(page.locator('#reminder-enable')).toHaveText('Enable test notifications');
  await page.fill('#reminder-time','19:15'); await page.locator('#reminder-time').blur();
  await page.click('#reminder-enable');
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator('#reminder-status')).toContainText('not enabled yet');
  expect(await page.evaluate(() => window.permissionRequests)).toBe(1);
  control.gate = null; release();
  await expect(page.locator('#reminder-status')).toContainText('Device registered for test notifications.');
  expect(calls[0].body.time).toBe('19:15');
  expect(calls[0].body.timeZone).toBe('Asia/Manila');
  expect(Object.keys(calls[0].body).sort()).toEqual(['completedLocalDate','currentDayEligible','observedAt','revision','subscription','time','timeZone']);
  expect(calls[0].authorization).toMatch(/^Bearer [a-f0-9]{64}$/);
  await page.screenshot({path:fileURLToPath(new URL('../../artifacts/reminders-review/settings-enabled.png',import.meta.url))});
  await page.click('#reminder-test');
  await expect(page.locator('#reminder-status')).toContainText('Test accepted');
  await expect(page.locator('#reminder-status')).toContainText('Automatic reminders remain paused.');
  await expect(page.locator('#reminder-status')).not.toContainText('Reminders enabled.');
  expect(calls.at(-1).method).toBe('POST');
  const downloadPromise = page.waitForEvent('download'); await page.click('#btn-export');
  const backup = await readFile(await (await downloadPromise).path(),'utf8');
  const credential = await page.evaluate(() => reminderPreferences().credential);
  expect(backup).not.toContain(credential);
  expect(backup).not.toContain('endpoint');
  expect(backup).not.toContain('reminder');
  expect(errors).toEqual([]);
});

test('network failure stays pending; offline disable survives reload and syncs deletion on reconnect', async ({page,context}) => {
  const errors = await start(page,{push:true});
  const {calls,control} = await api(page,{fail:true});
  await page.click('#btn-settings'); await page.click('#reminder-enable');
  await expect(page.locator('#reminder-status')).toContainText('Changes remain pending');
  expect(await page.evaluate(() => reminderPreferences().registered)).toBe(false);
  control.fail = false;
  await page.click('#reminder-sync');
  await expect(page.locator('#reminder-status')).toContainText('Device registered for test notifications.');
  // Route mocks can still fulfill a request in Chromium's offline emulation.
  // Make the mock push API unreachable too, as it would be on a real device.
  control.fail = true;
  await context.setOffline(true);
  await page.click('#reminder-disable');
  await expect(page.locator('#reminder-status')).toContainText('server removal is pending');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('test.push.active'))).toBeNull();
  await page.reload(); await page.click('#btn-settings');
  await expect(page.locator('#reminder-status')).toContainText('server removal is pending');
  control.fail = false;
  await context.setOffline(false);
  await page.click('#reminder-sync');
  await expect.poll(() => calls.some(call => call.method === 'DELETE')).toBe(true);
  await expect.poll(() => page.evaluate(() => reminderPreferences().pending)).toBe(false);
  await expect(page.locator('#reminder-status')).toContainText('Test notifications are off.');
  expect(errors).toEqual([]);
});

test('completion, undo, cycle sync, rest, split edits, import and reset recalculate eligibility', async ({page}) => {
  const errors = await start(page,{push:true});
  const {calls} = await api(page); await enable(page);
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => closeSheet());
  await fillWorkout(page); await page.click('#btn-finish');
  await expect.poll(() => calls.at(-1)?.body?.completedLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(calls.at(-1).body.currentDayEligible).toBe(true);
  await page.click('#btn-settings'); await page.click('#btn-undo');
  await expect.poll(() => calls.at(-1)?.body?.completedLocalDate).toBeNull();
  await page.click('#btn-settings'); await page.click('#btn-set-day');
  await page.check('input[name="day-pick"][value="2"]'); await page.click('#dp-save');
  await expect.poll(() => calls.at(-1)?.body?.currentDayEligible).toBe(false);
  await page.click('#btn-finish-rest');
  await expect.poll(() => calls.at(-1)?.body?.currentDayEligible).toBe(true);
  expect(calls.at(-1).body.completedLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.click('[data-view="split"]');
  await page.locator('[data-day-label="push"]').fill('Rest'); await page.locator('[data-day-label="push"]').blur();
  await expect.poll(() => calls.at(-1)?.body?.currentDayEligible).toBe(false);
  await page.evaluate(seed => parseAndRestoreBackup(JSON.stringify(seed)),seed);
  await expect.poll(() => calls.at(-1)?.body?.currentDayEligible).toBe(true);
  expect(calls.at(-1).body.completedLocalDate).toBeNull();
  await page.click('#btn-settings'); await page.click('#btn-reset'); await page.click('#btn-reset-confirm');
  await expect.poll(() => calls.at(-1)?.method).toBe('DELETE');
  expect(await page.evaluate(() => reminderPreferences().wanted)).toBe(false);
  expect(await page.evaluate(() => state.cycleIndex)).toBe(0);
  expect(errors).toEqual([]);
});

test('a disable while registration is in flight wins and never shows enabled', async ({page}) => {
  await start(page,{push:true});
  let release;
  const {calls,control} = await api(page,{gate:new Promise(resolve => {release=resolve;})});
  await page.click('#btn-settings'); await page.click('#reminder-enable');
  await expect.poll(() => calls.length).toBe(1);
  await page.click('#reminder-disable');
  await expect(page.locator('#reminder-status')).toContainText('server removal is pending');
  control.gate=null; release();
  await expect.poll(() => calls.at(-1)?.method).toBe('DELETE');
  await expect(page.locator('#reminder-status')).toContainText('Test notifications are off.');
  expect(calls[1].body.revision).toBeGreaterThan(calls[0].body.revision);
});

test('timezone/date changes on foreground sync recalculate eligibility without advancing the cycle', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-09-14T00:15:00Z'));
  await start(page,{push:true});
  const {calls} = await api(page); await enable(page);
  await page.evaluate(() => { state.logs.push({id:'travel',date:'2026-09-13T23:50:00Z',entries:{}}); save(); });
  await expect.poll(() => calls.at(-1)?.body?.completedLocalDate).toBe('2026-09-14');
  // Simulate the device reporting a new zone. Explicit-zone formatting still
  // uses native Intl; physical travel/OS timezone changes need the device check.
  await page.evaluate(() => {
    const NativeDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(locales, options){
      return new NativeDateTimeFormat(locales,{timeZone:'UTC',...options});
    };
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => calls.at(-1)?.body?.timeZone).toBe('UTC');
  expect(calls.at(-1).body.completedLocalDate).toBeNull();
  await expect(page.locator('#reminder-zone')).toContainText('UTC');
  await page.clock.setFixedTime(new Date('2026-09-15T00:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => calls.at(-1)?.body?.observedAt).toBe(Date.parse('2026-09-15T00:00:00Z'));
  expect(await page.evaluate(() => state.cycleIndex)).toBe(0);
});

test('expired subscriptions stop showing enabled and can be enabled again explicitly', async ({page}) => {
  await start(page,{push:true});
  const {control} = await api(page); await enable(page);
  control.testStatus=410;
  await page.click('#reminder-test');
  await expect(page.locator('#reminder-status')).toContainText('Subscription expired');
  expect(await page.evaluate(() => reminderPreferences().registered)).toBe(false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('test.push.active'))).toBeNull();
  await page.click('#reminder-enable');
  await expect(page.locator('#reminder-status')).toContainText('Device registered for test notifications.');
  expect(await page.evaluate(() => window.permissionRequests)).toBe(1);
});

test('reopening detects browser subscription loss even when the last sync was recent', async ({page}) => {
  await start(page,{push:true});
  await api(page); await enable(page);
  await page.evaluate(() => localStorage.removeItem('test.push.active'));
  await page.reload();
  await page.click('#btn-settings');
  await expect(page.locator('#reminder-status')).toContainText('browser subscription expired');
  expect(await page.evaluate(() => reminderPreferences().registered)).toBe(false);
});

for(const [name,options,message] of [
  ['missing backend configuration',{push:true,unconfigured:true},'not configured'],
  ['denied permission',{push:true,permission:'denied'},'Notifications are blocked'],
  ['iOS browser tab',{ios:true},'Add to Home Screen'],
  ['unsupported browser',{unsupported:true},'Web Push is unavailable']
]) test(`${name} has actionable guidance and cannot prompt`, async ({page}) => {
  await start(page,options);
  await page.click('#btn-settings');
  await expect(page.locator('#reminder-status')).toContainText(message);
  await expect(page.locator('#reminder-enable')).toBeDisabled();
  expect(await page.evaluate(() => window.permissionRequests || 0)).toBe(0);
});
