import rules from '../../js/reminder-rules.js';

export class HttpError extends Error {
  constructor(status, message){ super(message); this.status = status; }
}
export function check(condition, message){
  if(!condition) throw new HttpError(400, message);
}
function fields(object, allowed){
  check(object && typeof object === 'object' && !Array.isArray(object), 'Expected an object.');
  check(Object.keys(object).every(key => allowed.includes(key)), 'Unknown field.');
}
export function validateEndpoint(endpoint){
  check(typeof endpoint === 'string' && endpoint.length <= 2048, 'Invalid push endpoint.');
  let url;
  try{ url = new URL(endpoint); }catch{ throw new HttpError(400, 'Invalid push endpoint.'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    !url.search && !url.hash && url.href === endpoint, 'Invalid push endpoint.');
  // Exact provider hosts and push-only paths. No user-configurable destinations,
  // IP addresses, wildcard hosts, redirects, or generic proxying.
  const providers = {
    'fcm.googleapis.com': /^\/(?:fcm|wp)\/send\/[A-Za-z0-9_:-]+$/,
    'updates.push.services.mozilla.com': /^\/wpush\/v[12]\/[A-Za-z0-9_-]+$/,
    'web.push.apple.com': /^\/[A-Za-z0-9_-]+$/
  };
  check(providers[url.hostname]?.test(url.pathname), 'This push provider is not supported.');
  return endpoint;
}
function decodeKey(value, length){
  check(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), 'Invalid subscription key.');
  let bytes;
  try{ bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
  catch{ throw new HttpError(400, 'Invalid subscription key.'); }
  check(bytes.length === length, 'Invalid subscription key length.');
  return bytes;
}
export async function validateSubscription(sub, now){
  fields(sub, ['endpoint', 'expirationTime', 'keys']);
  validateEndpoint(sub.endpoint);
  check(sub.expirationTime == null || (Number.isFinite(sub.expirationTime) && sub.expirationTime > now),
    'Subscription has expired. Disable reminders, then enable them again.');
  fields(sub.keys, ['p256dh', 'auth']);
  const publicKey = decodeKey(sub.keys.p256dh, 65);
  decodeKey(sub.keys.auth, 16);
  check(publicKey[0] === 4, 'Invalid subscription public key.');
  try{ await crypto.subtle.importKey('raw', publicKey, {name:'ECDH', namedCurve:'P-256'}, false, []); }
  catch{ throw new HttpError(400, 'Invalid subscription public key.'); }
}
export async function readBody(request){
  check(request.headers.get('Content-Type')?.split(';')[0].trim() === 'application/json', 'Use application/json.');
  if(Number(request.headers.get('Content-Length')) > 8192) throw new HttpError(413, 'Request too large.');
  const reader = request.body?.getReader();
  check(reader, 'Missing request body.');
  const chunks = [];
  let size = 0;
  while(true){
    const {done, value} = await reader.read();
    if(done) break;
    size += value.byteLength;
    if(size > 8192){ await reader.cancel(); throw new HttpError(413, 'Request too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for(const chunk of chunks){ bytes.set(chunk, offset); offset += chunk.length; }
  try{ return JSON.parse(new TextDecoder().decode(bytes)); }
  catch{ throw new HttpError(400, 'Invalid JSON.'); }
}
export async function validateUpdate(body, now, deleting = false){
  fields(body, deleting ? ['revision'] : ['revision', 'subscription', 'time', 'timeZone',
    'currentDayEligible', 'completedLocalDate', 'observedAt']);
  check(Number.isSafeInteger(body.revision) && body.revision > 0, 'Invalid revision.');
  if(deleting) return;
  check(rules.validTime(body.time), 'Choose a local reminder time.');
  check(rules.validZone(body.timeZone), 'Invalid IANA timezone.');
  check(typeof body.currentDayEligible === 'boolean', 'Invalid eligibility.');
  // A reconnect takes a fresh snapshot; accepting an old queued observation
  // must not grant another week to eligibility the app has not rechecked.
  check(Number.isSafeInteger(body.observedAt) && body.observedAt >= now - 300000 &&
    body.observedAt <= now + 300000, 'Check the device clock and sync again.');
  check(body.completedLocalDate === null || body.completedLocalDate === rules.localDate(body.observedAt, body.timeZone),
    'Invalid completion date.');
  await validateSubscription(body.subscription, now);
}
