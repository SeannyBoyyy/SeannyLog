import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest, runScheduled} from '../src/worker.js';
import {sendPush} from '../src/push.js';
import {validateEndpoint} from '../src/validation.js';
import {fixture, request, NOW, ID} from './helpers.mjs';
import {readFileSync} from 'node:fs';

const DAY = 86400000;

test('installation credential protects updates, deletion, and test endpoint; CORS is exact', async t => {
  const {env, body} = fixture(); t.after(() => env.DB.close());
  assert.equal((await handleRequest(request('PUT',body),env,NOW)).status,200);
  for(const method of ['PUT','DELETE','POST']){
    const result = await handleRequest(request(method,method==='POST'?null:{...body,revision:2},
      {token:'c'.repeat(64),test:method==='POST'}),env,NOW);
    assert.equal(result.status,403);
  }
  assert.equal((await handleRequest(request('PUT',body,{origin:'https://example.github.io.evil.test'}),env,NOW)).status,403);
  assert.equal((await handleRequest(request('PUT',body,{token:''}),env,NOW)).status,401);
  const preflight = await handleRequest(request('OPTIONS'),env,NOW);
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://example.github.io');
});
test('input validation rejects arbitrary destinations, malformed keys, unknown fields and oversized input', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  for(const endpoint of ['https://127.0.0.1/push','http://fcm.googleapis.com/fcm/send/token',
    'https://fcm.googleapis.com.evil.test/fcm/send/token', 'https://fcm.googleapis.com/other',
    'https://fcm.googleapis.com/fcm/send/token?url=https://evil.test',
    'https://web.push.apple.com@evil.test/token','https://fcm.googleapis.com:8443/fcm/send/token']){
    assert.throws(() => validateEndpoint(endpoint));
  }
  for(const patch of [{time:'24:00'},{timeZone:'Not/AZone'},{currentDayEligible:'yes'},
    {completedLocalDate:'2026-09-13'}, {observedAt:NOW+600000}, {observedAt:NOW-300001}, {history:[]},
    {subscription:{...body.subscription, keys:{...body.subscription.keys,auth:'bad'}}}]){
    assert.equal((await handleRequest(request('PUT',{...body,...patch}),env,NOW)).status,400);
  }
  assert.equal((await handleRequest(request('PUT',{...body,history:'x'.repeat(9000)}),env,NOW)).status,413);
});
test('a newer DELETE wins over an old PUT, including replay and subscription re-enable', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  await handleRequest(request('PUT',body),env,NOW);
  assert.equal((await handleRequest(request('DELETE',{revision:3}),env,NOW)).status,200);
  assert.equal((await handleRequest(request('PUT',{...body,revision:2}),env,NOW)).status,409);
  assert.equal((await handleRequest(request('DELETE',{revision:3}),env,NOW)).status,200);
  assert.equal(await env.DB.prepare('SELECT * FROM subscriptions').first(),null);
  assert.equal((await handleRequest(request('PUT',{...body,revision:4}),env,NOW)).status,200);
});
test('a lost PUT response replays original expiry instead of falsely extending freshness', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  const original = await (await handleRequest(request('PUT',body),env,NOW)).json();
  const retry = await (await handleRequest(request('PUT',{...body,observedAt:NOW+3600000}),env,NOW+3600000)).json();
  assert.equal(retry.registered,true);
  assert.equal(retry.expiresAt,original.expiresAt);
  assert.equal(retry.observedAt,NOW);
});
test('subscription endpoint cannot be managed by another installation', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  await handleRequest(request('PUT',body),env,NOW);
  const result = await handleRequest(request('PUT',body,{id:'c'.repeat(32),token:'d'.repeat(64)}),env,NOW);
  assert.equal(result.status,409);
  assert.equal((await env.DB.prepare('SELECT installation_id FROM subscriptions').first()).installation_id,ID);
});
test('daily durable claim deduplicates repeated cron, updates, timezone changes and re-enable', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  let sends = 0; const push = async () => { sends++; return 201; };
  await handleRequest(request('PUT',body),env,NOW);
  await runScheduled(env,NOW,push);
  await runScheduled(env,NOW+60000,push);
  await handleRequest(request('PUT',{...body,revision:2,timeZone:'UTC',time:'10:00'}),env,NOW);
  await runScheduled(env,NOW,push);
  await handleRequest(request('DELETE',{revision:3}),env,NOW);
  await handleRequest(request('PUT',{...body,revision:4}),env,NOW);
  await runScheduled(env,NOW,push);
  assert.equal(sends,1);
  await runScheduled(env,NOW+86400000,push);
  assert.equal(sends,2);
});
test('ambiguous push failures and retry after a crash never repeat a reminder', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  await handleRequest(request('PUT',body),env,NOW);
  let sends = 0;
  const push = async () => { sends++; throw new Error('connection lost after acceptance'); };
  assert.equal((await runScheduled(env,NOW,push)).uncertain,1);
  await runScheduled(env,NOW+60000,push);
  assert.equal(sends,1);
});
test('completion and stale eligibility suppress dispatch; undo restores eligibility without clearing dedup', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  let sends = 0; const push = async () => { sends++; return 201; };
  await handleRequest(request('PUT',{...body,completedLocalDate:'2026-09-14'}),env,NOW);
  await runScheduled(env,NOW,push);
  assert.equal(sends,0);
  await handleRequest(request('PUT',{...body,revision:2}),env,NOW);
  await runScheduled(env,NOW,push);
  assert.equal(sends,1);
  await runScheduled(env,NOW+7*DAY,push);
  assert.equal(sends,1);
});

test('seven days starts at successful sync; day three still sends, expiry pauses, and a fresh sync resumes', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  const initial = await (await handleRequest(request('PUT',{...body,observedAt:NOW-60000}),env,NOW)).json();
  assert.equal(initial.syncedAt,NOW);
  assert.equal(initial.expiresAt,NOW+7*DAY);
  let sends = 0; const push = async () => { sends++; return 201; };
  for(const days of [0,2,6]){
    assert.equal((await runScheduled(env,NOW+days*DAY,push)).accepted,1);
    assert.equal((await runScheduled(env,NOW+days*DAY+60000,push)).accepted,0);
  }
  assert.equal((await runScheduled(env,NOW+7*DAY,push)).accepted,0);
  const renewedAt = NOW+7*DAY;
  const renewed = await (await handleRequest(request('PUT',{
    ...body,revision:2,observedAt:renewedAt
  }),env,renewedAt)).json();
  assert.equal(renewed.expiresAt,renewedAt+7*DAY);
  assert.equal((await runScheduled(env,renewedAt,push)).accepted,1);
  assert.equal((await runScheduled(env,renewedAt+60000,push)).accepted,0);
  assert.equal(sends,4);
});

test('production CORS allows only the exact GitHub Pages origin', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  const config = readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
  env.ALLOWED_ORIGINS = config.match(/^ALLOWED_ORIGINS = "([^"]+)"/m)[1];
  const origin = 'https://seannyboyyy.github.io';
  assert.equal(env.ALLOWED_ORIGINS,origin);
  for(const method of ['OPTIONS','PUT']){
    const result = await handleRequest(request(method,method==='PUT'?body:null,{origin}),env,NOW);
    assert.equal(result.status,method==='OPTIONS'?204:200);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);
  }
  for(const invalid of ['http://seannyboyyy.github.io',origin+'/',origin+'/SeannyLog/',
    origin+'.evil.test','https://other.github.io','http://localhost:8080']){
    const result = await handleRequest(request('OPTIONS',null,{origin:invalid}),env,NOW);
    assert.equal(result.status,403);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'),null);
  }
});

test('bounded cron checks one device per invocation without starving later devices or repeating sends', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  for(let n=1;n<=9;n++){
    const id = n.toString(16).padStart(32,'0');
    const sub = {...body.subscription,endpoint:body.subscription.endpoint+'-'+n};
    assert.equal((await handleRequest(request('PUT',{...body,subscription:sub},{id}),env,NOW)).status,200);
  }
  let sends = 0; const push = async () => { sends++; return 201; };
  for(let minute=0;minute<18;minute++){
    assert.equal((await runScheduled(env,NOW+minute*60000,push)).accepted,minute<9?1:0);
  }
  assert.equal(sends,9);
});
for(const status of [404,410]) test(`permanent ${status} responses remove subscriptions`, async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  await handleRequest(request('PUT',body),env,NOW);
  assert.equal((await runScheduled(env,NOW,async()=>status)).expired,1);
  assert.equal(await env.DB.prepare('SELECT * FROM subscriptions').first(),null);
  assert.ok(await env.DB.prepare('SELECT * FROM installations').first());
});
test('test notifications are rate-limited, separate from daily scheduling, and expire on 410', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  await handleRequest(request('PUT',body),env,NOW);
  const testRequest = () => request('POST',null,{test:true});
  assert.equal((await handleRequest(testRequest(),env,NOW,async()=>201)).status,200);
  assert.equal((await handleRequest(testRequest(),env,NOW+1000,async()=>201)).status,429);
  assert.equal((await runScheduled(env,NOW,async()=>201)).accepted,1);
  assert.equal((await handleRequest(testRequest(),env,NOW+60000,async()=>410)).status,410);
  assert.equal(await env.DB.prepare('SELECT * FROM subscriptions').first(),null);
});
test('push library creates an encrypted VAPID request with redirects disabled and short TTL', async t => {
  const {env,body} = fixture(); t.after(() => env.DB.close());
  let captured;
  const row = {...body.subscription, ...body.subscription.keys};
  const status = await sendPush(env,row,'workout-2026-09-14',async (url, options) => {
    captured = {url,options}; return new Response(null,{status:201});
  });
  assert.equal(status,201);
  assert.equal(captured.options.redirect,'manual');
  assert.equal(captured.options.headers['content-encoding'],'aes128gcm');
  assert.equal(captured.options.headers.ttl,'300');
  assert.match(captured.options.headers.authorization,/^vapid /);
  assert.ok(captured.options.body.byteLength >= 4096);
  assert.equal(new TextDecoder().decode(captured.options.body).includes('Ready for your'),false);
});
