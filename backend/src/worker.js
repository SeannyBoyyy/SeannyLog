import rules from '../../js/reminder-rules.js';
import { HttpError, readBody, validateUpdate } from './validation.js';
import { sendPush, permanentExpiration } from './push.js';

// Load Intl's locale data during Worker startup, outside the first HTTP/cron
// invocation's small Free-plan CPU allowance. All scheduling still uses IANA zones.
rules.parts(0, 'UTC');

const DAY = 86400000;
// Limit each invocation to one device's timezone calculation and encrypted
// push. The durable cursor reaches other devices on subsequent minutes.
// This bounds peak work; production CPU measurements are still required.
const SCHEDULE_BATCH = 1;
export async function digest(value){
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function configured(env){
  if(!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT || '')){
    throw new HttpError(503, 'Reminder service is not configured.');
  }
}
async function limit(db, bucket, maximum, expiresAt){
  const result = await db.prepare(`INSERT INTO rate_limits(bucket, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
    .bind(bucket, expiresAt, maximum).first();
  if(!result) throw new HttpError(429, 'Too many requests. Please wait before trying again.');
}
function response(body, status, origin){
  const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin' };
  if(origin) Object.assign(headers, {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Max-Age':'600'
  });
  if(status === 429) headers['Retry-After'] = '60';
  return new Response(body === null ? null : JSON.stringify(body), {status, headers});
}

export async function handleRequest(request, env, now = Date.now(), push = sendPush){
  let origin;
  try{
    const incomingOrigin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
    if(!incomingOrigin || !allowed.includes(incomingOrigin)) throw new HttpError(403, 'Origin is not allowed.');
    origin = incomingOrigin;
    const match = new URL(request.url).pathname.match(/^\/v1\/subscriptions\/([a-f0-9]{32})(\/test)?$/);
    if(!match) throw new HttpError(404, 'Not found.');
    if(request.method === 'OPTIONS') return response(null, 204, origin);
    const [, id, test] = match;
    if(!(test ? request.method === 'POST' : ['PUT', 'DELETE'].includes(request.method)))
      throw new HttpError(405, 'Method not allowed.');
    const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!token) throw new HttpError(401, 'Missing installation credential.');
    const credentialHash = await digest(token);
    const db = env.DB;
    const ip = await digest(`${Math.floor(now / DAY)}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
    await limit(db, `api:${ip}:${Math.floor(now/60000)}`, 120, now+DAY);
    let installation = await db.prepare('SELECT * FROM installations WHERE id = ?').bind(id).first();
    if(installation && installation.credential_hash !== credentialHash)
      throw new HttpError(403, 'Installation credential does not match.');

    if(test){
      configured(env);
      if(!installation) throw new HttpError(404, 'Enable reminders first.');
      const row = await db.prepare('SELECT * FROM subscriptions WHERE installation_id = ?').bind(id).first();
      if(!row) throw new HttpError(404, 'Subscription expired or was disabled. Enable reminders again.');
      await limit(db, `test:${ip}:${Math.floor(now/60000)}`, 10, now+DAY);
      const claimed = await db.prepare(`UPDATE installations SET last_test_at = ? WHERE id = ?
        AND (last_test_at = 0 OR last_test_at <= ?) RETURNING id`).bind(now, id, now-60000).first();
      if(!claimed) throw new HttpError(429, 'Wait one minute between test notifications.');
      let status;
      try{ status = await push(env, row, 'seannylog-test'); }
      catch{ throw new HttpError(502, 'Push service did not confirm delivery. Wait a minute before testing again.'); }
      if(permanentExpiration(status)){
        await db.prepare('DELETE FROM subscriptions WHERE installation_id = ? AND endpoint_hash = ?')
          .bind(id, row.endpoint_hash).run();
        throw new HttpError(410, 'Subscription expired. Disable reminders, then enable them again.');
      }
      if(status < 200 || status >= 300) throw new HttpError(502, 'Push service rejected the test notification.');
      return response({ok:true, message:'Test accepted by the push service. Delivery may be delayed.'}, 200, origin);
    }

    const deleting = request.method === 'DELETE';
    const body = await readBody(request);
    await validateUpdate(body, now, deleting);
    if(!deleting) configured(env);
    if(!installation){
      await limit(db, `create:${ip}:${Math.floor(now/3600000)}`, 10, now+DAY);
      await db.prepare(`INSERT OR IGNORE INTO installations(id, credential_hash, revision, updated_at)
        VALUES (?, ?, 0, ?)`).bind(id, credentialHash, now).run();
      installation = await db.prepare('SELECT * FROM installations WHERE id = ?').bind(id).first();
      if(installation.credential_hash !== credentialHash) throw new HttpError(403, 'Installation credential does not match.');
    }
    if(body.revision <= installation.revision){
      const existing = await db.prepare('SELECT expires_at, observed_at FROM subscriptions WHERE installation_id = ?').bind(id).first();
      return response({ok:body.revision === installation.revision, revision:installation.revision, registered:!!existing,
        expiresAt:existing?.expires_at || null, observedAt:existing?.observed_at || null,
        syncedAt:existing ? installation.updated_at : null},
        body.revision === installation.revision ? 200 : 409, origin);
    }
    const update = db.prepare(`UPDATE installations SET revision = ?, updated_at = ?
      WHERE id = ? AND credential_hash = ? AND revision < ?`)
      .bind(body.revision, now, id, credentialHash, body.revision);
    if(deleting){
      await db.batch([update, db.prepare(`DELETE FROM subscriptions WHERE installation_id = ? AND EXISTS
        (SELECT 1 FROM installations WHERE id = ? AND revision = ? AND credential_hash = ?)`)
        .bind(id, id, body.revision, credentialHash)]);
    }else{
      const endpointHash = await digest(body.subscription.endpoint);
      const expiresAt = now + rules.ELIGIBILITY_TTL;
      await db.batch([update, db.prepare(`INSERT INTO subscriptions
        (installation_id, endpoint, endpoint_hash, p256dh, auth, time, time_zone,
         current_day_eligible, completed_local_date, observed_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
          (SELECT 1 FROM installations WHERE id = ? AND revision = ? AND credential_hash = ?)
        ON CONFLICT(installation_id) DO UPDATE SET endpoint=excluded.endpoint, endpoint_hash=excluded.endpoint_hash,
          p256dh=excluded.p256dh, auth=excluded.auth, time=excluded.time, time_zone=excluded.time_zone,
          current_day_eligible=excluded.current_day_eligible, completed_local_date=excluded.completed_local_date,
          observed_at=excluded.observed_at, expires_at=excluded.expires_at`)
        .bind(id, body.subscription.endpoint, endpointHash, body.subscription.keys.p256dh, body.subscription.keys.auth,
          body.time, body.timeZone, Number(body.currentDayEligible), body.completedLocalDate, body.observedAt, expiresAt,
          id, body.revision, credentialHash)]);
    }
    const latest = await db.prepare('SELECT revision FROM installations WHERE id = ?').bind(id).first();
    if(latest.revision !== body.revision) return response({ok:false, revision:latest.revision}, 409, origin);
    return response({ok:true, registered:!deleting, revision:body.revision,
      observedAt:deleting ? null : body.observedAt,
      syncedAt:deleting ? null : now,
      expiresAt:deleting ? null : now+rules.ELIGIBILITY_TTL}, 200, origin);
  }catch(error){
    // Never log endpoint URLs, credentials, subscription keys or raw requests.
    if(String(error.message).includes('UNIQUE constraint failed: subscriptions'))
      return response({error:'This subscription belongs to another installation. Disable it and try again.'}, 409, origin);
    return response({error:error instanceof HttpError ? error.message : 'Reminder service is temporarily unavailable.'},
      error instanceof HttpError ? error.status : 500, origin);
  }
}

export async function runScheduled(env, now = Date.now(), push = sendPush){
  configured(env);
  const db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM deliveries WHERE claimed_at < ?').bind(now - 7*DAY),
    db.prepare('DELETE FROM installations WHERE updated_at < ?').bind(now - 30*DAY)
  ]);
  const state = await db.prepare('SELECT cursor FROM scheduler_state WHERE id = 1').first();
  let cursor = state?.cursor || '';
  const counts = { claimed:0, accepted:0, expired:0, uncertain:0 };
  const page = after => db.prepare(`SELECT s.*, i.revision FROM subscriptions s JOIN installations i ON i.id = s.installation_id
      WHERE s.installation_id > ? AND s.current_day_eligible = 1 AND s.expires_at > ?
      ORDER BY s.installation_id LIMIT ?`).bind(after, now, SCHEDULE_BATCH).all();
  let {results} = await page(cursor);
  if(!results.length && cursor) ({results} = await page(''));
    for(const row of results){
      cursor = row.installation_id;
      const date = rules.dueDate({currentDayEligible:!!row.current_day_eligible, time:row.time,
        timeZone:row.time_zone, completedLocalDate:row.completed_local_date,
        observedAt:row.observed_at, expiresAt:row.expires_at}, now);
      if(!date) continue;
      // The durable claim precedes the outbound request. A retry or concurrent
      // cron cannot send again, even if a process dies after the push is accepted.
      const claimed = await db.prepare(`INSERT OR IGNORE INTO deliveries(endpoint_hash, local_date, claimed_at)
        SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM subscriptions s JOIN installations i ON i.id=s.installation_id
          WHERE s.installation_id=? AND s.endpoint_hash=? AND i.revision=? AND s.expires_at > ?
          AND s.current_day_eligible=1 AND (s.completed_local_date IS NULL OR s.completed_local_date != ?))
        RETURNING endpoint_hash`).bind(row.endpoint_hash, date, now, row.installation_id, row.endpoint_hash,
          row.revision, now, date).first();
      if(!claimed) continue;
      counts.claimed++;
      let outcome = 'uncertain';
      try{
        const status = await push(env, row, `workout-${date}`);
        if(permanentExpiration(status)){
          await db.prepare('DELETE FROM subscriptions WHERE installation_id = ? AND endpoint_hash = ?')
            .bind(row.installation_id, row.endpoint_hash).run();
          outcome = 'expired';
        }else if(status >= 200 && status < 300) outcome = 'accepted';
      }catch{ /* Ambiguous transport failure: retain the claim; do not resend. */ }
      counts[outcome]++;
      await db.prepare('UPDATE deliveries SET outcome = ? WHERE endpoint_hash = ? AND local_date = ?')
        .bind(outcome, row.endpoint_hash, date).run();
    }
  await db.prepare('UPDATE scheduler_state SET cursor = ? WHERE id = 1')
    .bind(results.length === SCHEDULE_BATCH ? cursor : '').run();
  return counts;
}

export default {
  fetch(request, env){ return handleRequest(request, env); },
  async scheduled(event, env){
    // Use actual execution time: a delayed/retried cron must not send yesterday's reminder.
    await runScheduled(env, Date.now());
  }
};
