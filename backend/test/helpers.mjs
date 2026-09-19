import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

// Execute the production migration and SQL in real SQLite. This small adapter
// mirrors D1's async interface and atomic batch, not the scheduler's behavior.
export function database(){
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for(const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(file,migrations), 'utf8'));
  const statement = (sql, bindings = []) => ({
    bind(...args){ return statement(sql, args); },
    async first(){ return sqlite.prepare(sql).get(...bindings) || null; },
    async all(){ return {results:sqlite.prepare(sql).all(...bindings)}; },
    async run(){ return {meta:sqlite.prepare(sql).run(...bindings)}; }
  });
  return {
    prepare:statement,
    async batch(statements){
      sqlite.exec('BEGIN');
      try{
        const results = [];
        for(const query of statements) results.push(await query.run());
        sqlite.exec('COMMIT');
        return results;
      }catch(error){ sqlite.exec('ROLLBACK'); throw error; }
    },
    close(){ sqlite.close(); }
  };
}
export function keys(){
  const {privateKey} = generateKeyPairSync('ec', {namedCurve:'prime256v1'});
  const jwk = privateKey.export({format:'jwk'});
  return {
    publicKey:Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x,'base64url'), Buffer.from(jwk.y,'base64url')]).toString('base64url'),
    privateKey:jwk.d
  };
}
export const NOW = Date.parse('2026-09-14T10:00:00Z'); // Manila 18:00
export const ID = 'a'.repeat(32);
export const TOKEN = 'b'.repeat(64);
export function fixture(){
  const vapid = keys();
  const subscriptionKey = keys();
  return {
    env:{DB:database(), ALLOWED_ORIGINS:'https://example.github.io',
      VAPID_SUBJECT:'mailto:owner@example.com', VAPID_PUBLIC_KEY:vapid.publicKey, VAPID_PRIVATE_KEY:vapid.privateKey},
    body:{revision:1, time:'18:00', timeZone:'Asia/Manila', currentDayEligible:true,
      completedLocalDate:null, observedAt:NOW,
      subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/fixture-endpoint', expirationTime:null,
        keys:{p256dh:subscriptionKey.publicKey, auth:randomBytes(16).toString('base64url')}}}
  };
}
export function request(method, body, {id=ID, token=TOKEN, origin='https://example.github.io', test=false} = {}){
  return new Request(`https://reminders.example/v1/subscriptions/${id}${test ? '/test' : ''}`, {
    method, headers:{Origin:origin, Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {})
  });
}
