// Uses the same workerd/Miniflare version pinned by Wrangler. All outbound
// requests are intercepted; no real push service or Cloudflare account is used.
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {fixture,request} from './helpers.mjs';
import rules from '../../js/reminder-rules.js';

const {env,body} = fixture();
env.DB.close();
const now = Date.now();
const clock = rules.parts(now,'UTC');
body.observedAt = now;
body.timeZone = 'UTC';
body.time = `${String(Math.floor(clock.minute/60)).padStart(2,'0')}:${String(clock.minute%60).padStart(2,'0')}`;
let pushes = 0;
let pushStatus = 201;
const mf = new Miniflare(convertV4MiniflareOptions({
  modules:true, scriptPath:fileURLToPath(new URL('../.wrangler/build/worker.js',import.meta.url)),
  compatibilityDate:'2026-09-01', d1Databases:['DB'],
  bindings:{ALLOWED_ORIGINS:env.ALLOWED_ORIGINS,VAPID_SUBJECT:env.VAPID_SUBJECT,
    VAPID_PUBLIC_KEY:env.VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY:env.VAPID_PRIVATE_KEY},
  outboundService:async req => {
    assert.equal(new URL(req.url).hostname,'fcm.googleapis.com');
    assert.equal(req.headers.get('content-encoding'),'aes128gcm');
    assert.match(req.headers.get('authorization'),/^vapid /);
    assert.equal((await req.arrayBuffer()).byteLength,4096);
    pushes++;
    return new Response(null,{status:pushStatus});
  }
}));
try{
  const db = await mf.getD1Database('DB');
  const migrations = new URL('../migrations/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(file=>file.endsWith('.sql')).sort()){
    const sql = await readFile(new URL(file,migrations),'utf8');
    for(const command of sql.split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(command).run();
  }
  async function send(req){
    return mf.dispatchFetch(req.url,{method:req.method,headers:Object.fromEntries(req.headers),body:await req.text()});
  }
  let result = await send(request('PUT',body));
  assert.equal(result.status,200,await result.text());
  const worker = await mf.getWorker();
  // Real concurrent scheduled invocations exercise D1's durable unique claim.
  const scheduled = await Promise.all([worker.scheduled({cron:'* * * * *'}),worker.scheduled({cron:'* * * * *'})]);
  assert.equal(pushes,1,JSON.stringify({scheduled,deliveries:await db.prepare('SELECT outcome FROM deliveries').all(),
    schedule:await db.prepare('SELECT time, time_zone, observed_at, expires_at FROM subscriptions').first()}));
  assert.equal((await db.prepare('SELECT outcome FROM deliveries').first()).outcome,'accepted');
  result = await send(request('POST',null,{test:true}));
  assert.equal(result.status,200,await result.text());
  assert.equal(pushes,2);
  result = await send(request('POST',null,{test:true}));
  assert.equal(result.status,429);
  // A fresh allowed test returning 410 removes the actual D1 subscription.
  await db.prepare('UPDATE installations SET last_test_at = 0').run();
  pushStatus = 410;
  result = await send(request('POST',null,{test:true}));
  assert.equal(result.status,410,await result.text());
  assert.equal(await db.prepare('SELECT * FROM subscriptions').first(),null);
  console.log('Local workerd/D1: encrypted push, concurrent cron deduplication, rate limit and expiration checks passed.');
}finally{
  await mf.dispose();
}
