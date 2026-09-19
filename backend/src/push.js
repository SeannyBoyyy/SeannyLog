import { buildPushPayload } from '@block65/webcrypto-web-push';
import { validateEndpoint } from './validation.js';

export const NOTIFICATION_BODY = 'Ready for your next workout? Open SeannyLog to get started.';
export function permanentExpiration(status){ return status === 404 || status === 410; }

export async function sendPush(env, row, tag, fetcher = fetch){
  validateEndpoint(row.endpoint); // Also protect against invalid stored rows.
  const payload = await buildPushPayload({
    data: JSON.stringify({ title:'SeannyLog', body:NOTIFICATION_BODY, tag }),
    options: { ttl:300, urgency:'normal', topic:tag }
  }, {
    endpoint:row.endpoint, expirationTime:null,
    keys:{p256dh:row.p256dh, auth:row.auth}
  }, {
    subject:env.VAPID_SUBJECT, publicKey:env.VAPID_PUBLIC_KEY, privateKey:env.VAPID_PRIVATE_KEY
  });
  // Workers supports "manual", not the browser's "error" redirect mode.
  // A 3xx remains a failed attempt; never follow it to another destination.
  const response = await fetcher(row.endpoint, {
    ...payload, redirect:'manual', signal:AbortSignal.timeout(10000)
  });
  await response.body?.cancel();
  return response.status;
}
