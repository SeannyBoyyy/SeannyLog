import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function worker(windows = [], scope = 'https://example.github.io/seannylog/'){
  const handlers = new Map();
  const shown = [], opened = [];
  const context = vm.createContext({URL, Response,
    self:{registration:{scope, showNotification:async (...args) => shown.push(args)},
      clients:{matchAll:async () => windows, openWindow:async url => opened.push(url)},
      addEventListener:(name,callback) => handlers.set(name,callback)}});
  vm.runInContext(readFileSync(new URL('../../sw.js',import.meta.url),'utf8'),context);
  return {handlers,shown,opened,context};
}
async function dispatch(handlers, name, event){
  let promise;
  handlers.get(name)({...event, waitUntil:value => {promise=value;}});
  await promise;
}
test('push always shows generic text, safe icons and ignores untrusted URLs/content', async () => {
  const {handlers,shown} = worker();
  await dispatch(handlers,'push',{data:{json:() => ({body:'Sensitive exercise history',url:'https://evil.test',tag:'workout-2026-09-14'})}});
  assert.equal(shown[0][0],'SeannyLog');
  assert.equal(shown[0][1].body,'Ready for your next workout? Open SeannyLog to get started.');
  assert.equal(shown[0][1].icon,'https://example.github.io/seannylog/icon-192.png');
  assert.equal(shown[0][1].data.url,'https://example.github.io/seannylog/index.html#today');
  assert.equal(shown[0][1].renotify,false);
  await dispatch(handlers,'push',{data:{json:() => {throw new Error('bad JSON');}}});
  assert.equal(shown.length,2);
});
test('notification clicks focus the app and switch to Today without navigating a draft', async () => {
  let focused = false, message;
  const {handlers,opened} = worker([
    {url:'https://example.github.io/another-app/',focus(){throw new Error('wrong app');}},
    {url:'https://example.github.io/seannylog/index.html#progress',focus:async () => {focused=true;},postMessage:value => {message=value;}}
  ]);
  await dispatch(handlers,'notificationclick',{notification:{close(){}}});
  assert.equal(focused,true);
  assert.equal(message.type,'SEANNYLOG_OPEN_TODAY');
  assert.deepEqual(opened,[]);
});
test('notification clicks open Today within the GitHub Pages subdirectory', async () => {
  const {handlers,opened} = worker();
  await dispatch(handlers,'notificationclick',{notification:{close(){},data:{url:'https://evil.test'}}});
  assert.deepEqual(opened,['https://example.github.io/seannylog/index.html#today']);
});
test('app/cache versions match and every runtime frontend asset is precached', () => {
  const {context} = worker();
  const state = readFileSync(new URL('../../js/state.js',import.meta.url),'utf8');
  const version = state.match(/APP_VERSION = '([^']+)'/)[1];
  assert.equal(vm.runInContext('CACHE_NAME',context),`seannylog-v${version}`);
  const html = readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => `./${match[1]}`);
  const assets = vm.runInContext('ASSETS',context);
  for(const script of scripts) assert.ok(assets.includes(script),`${script} must be cached`);
});

test('published configuration has only public push settings and automatic cron remains paused', () => {
  const context = vm.createContext({window:{}});
  vm.runInContext(readFileSync(new URL('../../js/reminder-config.js',import.meta.url),'utf8'),context);
  const config = context.window.SEANNYLOG_REMINDERS;
  assert.deepEqual(Object.keys(config).sort(),['apiBase','vapidPublicKey']);
  assert.equal(config.apiBase,'https://seannylog-reminders.seannylog.workers.dev');
  const publicKey = Buffer.from(config.vapidPublicKey,'base64url');
  assert.equal(publicKey.length,65);
  assert.equal(publicKey[0],4);
  const workerConfig = readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
  assert.match(workerConfig,/^crons\s*=\s*\[\s*\]\s*$/m);
});

test('production clicks preserve the case-sensitive /SeannyLog/ repository path', async () => {
  const scope = 'https://seannyboyyy.github.io/SeannyLog/';
  const fresh = worker([],scope);
  await dispatch(fresh.handlers,'notificationclick',{notification:{close(){}}});
  assert.deepEqual(fresh.opened,[scope+'index.html#today']);
  let focused = false;
  const existing = worker([
    {url:'https://seannyboyyy.github.io/',focus(){throw new Error('wrong app');}},
    {url:'https://seannyboyyy.github.io/seannylog/',focus(){throw new Error('wrong case');}},
    {url:scope+'index.html#settings',focus:async()=>{focused=true;},postMessage(){}}
  ],scope);
  await dispatch(existing.handlers,'notificationclick',{notification:{close(){}}});
  assert.equal(focused,true);
  assert.deepEqual(existing.opened,[]);
});
