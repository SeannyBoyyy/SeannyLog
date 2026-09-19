# Optional workout reminders

The workout app remains a static, offline PWA with no frontend dependencies or build step. Reminders are off by default. The frontend stays on free GitHub Pages at `https://seannyboyyy.github.io/SeannyLog/`; Cloudflare hosts only the companion reminder API and its D1 database. See the deployment record below for the current rollout status.

**Current release: manual tests only.** Automatic reminders and scheduled housekeeping are paused. The Worker API and database remain available, and the saved time has no active schedule. Registering a device, syncing, or sending a test does not turn scheduling back on. No Worker deployment or billing change accompanies this frontend release.

## Scheduling rules (implemented, currently paused)

- The split is a manually advanced cycle. Neither the browser nor the server advances it for scheduling.
- Only the current non-Rest day with at least one valid exercise is eligible. An exercise must exist, have a name, positive sets and increment, and a valid positive rep range.
- Any workout or rest completed on the current local calendar date suppresses that date, including after advancing to another workout day. Undo recalculates this from the remaining local records.
- One scheduled **send attempt** per actual push endpoint per local date. Manual tests have their own limit and do not consume the scheduled reminder.
- The Worker runs each minute. It sends at or after the selected local time, within a one-hour catch-up window. It does not send yesterday's overdue reminder. Enabling or becoming eligible inside that window can result in an immediate reminder.
- Eligibility expires **seven days (168 elapsed hours) after the server accepts a fresh eligibility sync**. Reminders do **not** stop after two days away. They can continue daily for the rest of that week if the last synced cycle day is eligible; at the seven-day boundary they pause until the app successfully syncs online again. This bounded policy was selected by the owner to allow several days away while limiting stale reminders.
- Opening the app offline, failed requests, manual test notifications, and replaying the same revision do not extend the seven days. A reconnect recomputes the current local state before sending it. The server accepts observations only within five minutes of its clock, and measures expiry from server acceptance, not the device clock. Keep the device clock automatic. DST does not lengthen or shorten this 168-hour lease.
- Push requests have a five-minute TTL. This limits queued delivery at the push service; the OS can still delay presentation. Network, browser, power saving, Focus/Do Not Disturb, and OS policies affect actual delivery. These are reminders, not exact alarms.

`js/reminder-rules.js` holds the pure eligibility and timezone rules used by both the app and Worker. The server receives only a current-day eligibility boolean and an optional completed-local-date, not the split or workout records.

### Timezones and daylight saving

The selected time is a wall-clock time in the device's **IANA timezone**, shown in Settings. Scheduling derives the correct offset for each date; it never saves a fixed UTC offset. When a spring transition skips the chosen time, the time shifts forward by the gap (New York 02:30 becomes 03:30). A repeated autumn time uses the first occurrence. Half-hour transitions are covered too.

The app checks the device timezone and local date on opening, returning to the foreground, reconnecting, opening Settings, and saving workout/split changes. A timezone change while the app is closed is unknown to the server until the next sync. The last synchronized timezone continues to apply, subject to the seven-day expiry. No browser timer or periodic background sync is used for closed-app scheduling.

Workout timestamps are interpreted in the current timezone. New rest completions also save a timestamp alongside the existing date-based `restLog`, preserving the progress view. Legacy backups have date-only rest records; those retain their recorded date because their original instant cannot be recovered. Notification deduplication is keyed by endpoint and date, **not timezone**, so changing timezone cannot cause another send for the same date.

### Offline changes and retries

Saving a workout, completing rest, undoing, manually syncing the cycle, editing a split/exercise, importing, and resetting all update reminder eligibility. Local workout saving does not wait for the network. A private local outbox retains pending reminder changes. Opening/foregrounding the app, reconnecting while it is open, or **Sync now** retries the latest state. Multiple tabs serialize network operations using Web Locks where available, with revision checks on the server as the final guard.

**The server cannot immediately know about an offline completion.** It might send using its last observation until the app reconnects, or that observation expires. A completion/disable racing an already claimed outbound push can also arrive too late to stop it. The service worker always displays incoming push notifications, as required for iOS Web Push; it cannot read the workout app's localStorage.

Disable records the user's intent locally first, tries browser unsubscribe, and retains a pending server DELETE until acknowledged. Closing while offline does not magically synchronize it: reopen online. Reset also disables reminders and clears drafts, retaining only the credentials/outbox needed to finish deletion. Browser unsubscribe failures remain visible and retryable. A lost or expired browser subscription needs a new click on **Enable test notifications**; the app never requests permission in the background.

## Backend setup

Operator reference only: the backend is already configured. Publishing this frontend does not require a Worker deployment, migration, new credentials, or billing changes. Automatic scheduling must stay paused.

Prerequisites: Node 22.14+, npm, a Cloudflare account with Workers and D1 available, and the GitHub Pages origin. Run the commands below from `backend/`. The shared rules file at `../js/reminder-rules.js` must remain available when building.

1. Install locked backend/test dependencies:

   ```sh
   npm ci
   ```

2. Generate a VAPID key pair locally:

   ```sh
   npm run keys
   ```

   This creates (or validates and reuses) `backend/.secrets/vapid.json`, after verifying that Git ignores it. It prints only the public key. The private value stays in the ignored file for direct backend upload. Back up that file in your secret manager; never copy it into frontend files or commit it. Use one stable pair for this deployment; rotating it requires devices to disable and re-enable reminders.

3. Create D1 and update `backend/wrangler.toml`:

   ```sh
   npx wrangler login --use-keyring --scopes account:read user:read workers:write workers_scripts:write workers_tail:read d1:write
   npx wrangler d1 create reminders
   ```

   For this repository the account and database IDs are already configured; do not create a duplicate database. For another deployment, replace them with its IDs. `ALLOWED_ORIGINS` is exactly `https://seannyboyyy.github.io` (no path or trailing slash); the `/SeannyLog/` path belongs in frontend URLs, not the Origin header. Localhost and other GitHub Pages hosts are denied. The VAPID contact is the public repository URL `https://github.com/SeannyBoyyy/SeannyLog`; a monitored `mailto:` contact is also supported. Keep `crons = []`: automatic scheduling is paused. Do not restore a trigger without explicit authorization and Free-plan CPU verification. Login can use `--device` if the localhost callback times out. Credentials are stored encrypted with a key in Windows Credential Manager when `--use-keyring` is enabled.

4. Upload the VAPID pair directly from the ignored file into Worker secrets:

   ```sh
   npx wrangler secret bulk .secrets/vapid.json
   ```

   Wrangler may offer to create the named Worker on first use. These are backend operations. No private key needs to be printed or pasted into chat. The private value must never appear in `wrangler.toml`, frontend JavaScript, GitHub Pages, or a workout backup. The public key is safe to copy to frontend configuration.

5. Apply the production migration and deploy the Worker:

   ```sh
   npx wrangler d1 migrations apply reminders --remote
   npx wrangler deploy
   ```

   Use the resulting HTTPS Worker URL. The scheduled handler code is retained, but the empty cron list deploys no scheduled trigger. The existing deployed trigger was removed and Cloudflare confirmed zero triggers; preserve that paused state. The Worker returns 503 until its VAPID configuration is present.

6. Edit the static `js/reminder-config.js`:

   ```js
   window.SEANNYLOG_REMINDERS = Object.freeze({
     apiBase: 'https://seannylog-reminders.YOUR-SUBDOMAIN.workers.dev',
     vapidPublicKey: 'YOUR_VAPID_PUBLIC_KEY'
   });
   ```

   Publish the static files to GitHub Pages using the repository's usual process. This feature bumps `APP_VERSION` and `CACHE_NAME` together to **3.11**, and precaches all three new scripts. For later configuration/code updates, bump both again. Existing devices may need to use the app's **Update ready → Refresh** action. No frontend npm install is needed.

7. Open Settings on a supported device, click **Enable test notifications**, allow permission, wait for registration success, and send a test. The saved reminder time is inactive; registering or syncing does not resume automatic reminders. Complete the device checklist below before relying on delivery.

## Deployment record and frontend publication

On 2026-09-15, the owner authorized and completed Cloudflare OAuth access and confirmed **Workers Free** in the dashboard. No paid plan or paid service was enabled. The reminder backend is deployed:

- API: `https://seannylog-reminders.seannylog.workers.dev`.
- Worker: `seannylog-reminders`; cron removed at the owner's request on 2026-09-18. Cloudflare confirmed zero scheduled triggers. The API and D1 remain live; local `crons = []` prevents a later deployment from restoring scheduling.
- D1: `reminders`, ID `ff9d55e4-8633-4f52-912c-50892f8be78b`, region APAC. Migrations `0001_reminders.sql` and `0002_free_plan_scheduler.sql` applied remotely.
- VAPID public/private keys uploaded as Worker secrets; the stable local pair is Git-ignored. Preview URLs and application observability are disabled.
- `js/reminder-config.js` contains only the public API URL and public VAPID key. Frontend **3.11** publishes manual test notifications with an explicit automatic-reminders-paused notice. The Pages source is `main` at `/` (root); the Worker is not deployed by this publication.

Publication uses the repository's existing `main`/GitHub Pages source. Push the reviewed source files and wait for the Pages build to finish. Keep the same `https://seannyboyyy.github.io/SeannyLog/` origin/path so existing localStorage and offline logging remain available. Publish `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, and the three icon PNGs. The frontend needs no build, npm dependencies, Cloudflare Pages, or paid GitHub features. Commit backend source and this guide separately or alongside the feature as desired, while keeping `.secrets/`, `.wrangler/`, `.dev.vars`, and `node_modules/` ignored. Never clear site data to update.

After publication, verify `js/state.js` reports `APP_VERSION = '3.11'`, reopen the existing installed app online, and use **Update ready → Refresh** if offered. Then verify notifications on the phone as described below. No further Cloudflare account setup or secret entry is required for this deployment.

### Cloudflare Free plan assessment

Checked against Cloudflare's current documentation on 2026-09-15. Limits are shared with other workloads on the account.

**Local CPU patch, 2026-09-18 — not deployed:** the cron batch is reduced from four devices to one. The existing durable cursor preserves fairness and daily deduplication. This limits each invocation to one timezone calculation and at most one encrypted send, at the cost of a longer sweep across multiple devices. The live Worker still uses four. The earlier aggregate CPU sample does not identify the expensive handler and cannot establish that this patch, or the HTTP handlers, stays within 10 ms. Cloudflare CPU measurements of the revised build are still missing; local correctness tests cannot substitute for them. Worker deployment remains on hold. Frontend publication is separately authorized for manual tests only.

Targeted validation for this patch: **7 tests passed**, covering one-device batches and fair cursor wraparound, daily deduplication, ambiguous retries, completion/undo, seven-day expiry/renewal, and permanent 404/410 cleanup. The existing browser and live-delivery checks were not repeated. No cloud resources, billing settings, frontend files, or credentials were changed.

| Resource | Free-plan limit | This backend |
| --- | --- | --- |
| Workers requests / triggers | 100,000 requests/day; 5 cron triggers/account | One Worker, API calls only while paused. A deliberately restored minute trigger would add 1,440 scheduled invocations/day. |
| Worker CPU / outbound requests | 10 ms CPU/invocation; 50 subrequests/invocation | Local patch: at most one subscription checked per cron, with a durable cursor; fewer than 50 D1 queries/subrequests. CPU fit remains unverified. |
| D1 daily rows | 5 million read; 100,000 written | Indexed cleanup; local patch returns at most one candidate row per minute, plus small authorization/rate-limit/claim operations. Rows scanned by queries also count. |
| D1 capacity | 10 databases; 500 MB/database; 5 GB/account | One small database; short retention and minimal subscription metadata. |

For a personal installation or a few devices, request and storage allowances are ample. If scheduling is deliberately restored, cron writes its cursor once/minute (1,440 writes/day before other activity). With the local patch, a sweep takes approximately one minute per eligible device; keep device counts small enough to fit comfortably in the one-hour delivery window. This is not sized as a large public push service.

**CPU is a practical caveat, not a guarantee:** live requests and scheduled sends completed without execution errors, but the observed sample included an occasional invocation above the nominal 10 ms CPU allowance. Intl locale initialization was moved to Worker startup to reduce first-invocation overhead; a subsequent small sample still measured P99 at 12.82 ms. Cloudflare permits some occasional overrun and can terminate invocations that repeatedly exceed the limit. Monitor Workers → Metrics for CPU time and `exceededCpu`, plus D1 Row Metrics. Optimize/batch further if needed; do not upgrade without the owner's approval. Free D1 quota exhaustion returns errors instead of automatically charging for overages. The Wrangler billing-subscription API was scope-restricted; the Free-plan confirmation came from the owner viewing the dashboard, not from inferring a plan from the API's `standard` usage-model label.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), and [D1 pricing/quota behavior](https://developers.cloudflare.com/d1/platform/pricing/).

## Local execution and checks

No Cloudflare login, remote database, or real push subscription is needed for automated checks:

```sh
cd backend
npm ci
npm test
npm run check
npm run db:local
npm run test:runtime
npm run test:browser
```

`check` is explicitly `wrangler deploy --dry-run`; `db:local` explicitly uses `--local`. Node tests execute the production SQL migration in in-memory SQLite and check encrypted Web Push requests with generated test keys. `test:runtime` builds and runs the real Worker in Wrangler's pinned Miniflare/workerd, with local D1 and an intercepted outbound push service, including concurrent cron invocations. The browser suite runs a localhost server under `/seannylog/`, tests real offline caching in Chrome, and mocks permission/push/API responses. On Windows it uses installed Chrome; elsewhere run `npx playwright install chromium` first, or set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. Tests use port 8080.

For interactive Worker testing only, create a Git-ignored `backend/.dev.vars` with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `ALLOWED_ORIGINS` for a **local test** key pair and localhost origin, then run:

```sh
npm run db:local
npm run dev
```

This uses local D1 and exposes the scheduled handler through Wrangler's local `http://localhost:8787/__scheduled` route. Calling that route exercises the same scheduler. It requires eligible subscriptions to send anything. An actual push subscription and valid matching VAPID configuration can send a real notification even from a local Worker. Automated tests substitute the outbound push service instead.

For interactive frontend testing, serve the repository on localhost:8080 (for example `python -m http.server 8080`). Configure the public API base as `http://localhost:8787` and use your local test public key. Keep `http://localhost:8080` in the local Worker origin list. Restore production configuration before publishing. A phone cannot reach your computer using its own `localhost`; physical-device testing needs a reachable HTTPS frontend and Worker.

## API and security

Each installation creates a random 128-bit ID and 256-bit bearer credential using the browser cryptographic RNG. It persists them outside workout state and sends the credential only in an Authorization header to the chosen reminder backend. The backend saves only a SHA-256 credential hash. There is no subscription listing or public subscription management API.

| Method and path | Purpose |
| --- | --- |
| `PUT /v1/subscriptions/:installationId` | Authenticated idempotent creation/update with an increasing revision, subscription, local time, IANA zone, observation time, eligibility boolean, and optional completed-local-date. The first registration claims the random ID with its credential. |
| `DELETE /v1/subscriptions/:installationId` | Authenticated removal; JSON body contains only the increasing revision. Same-revision retries are safe. |
| `POST /v1/subscriptions/:installationId/test` | Authenticated test, limited to once per installation per minute and ten tests per IP per minute. |

All requests require the exact configured Origin and `Authorization: Bearer <installation credential>`. PUT/DELETE require JSON. The API limits body size to 8 KiB (including streamed bodies), validates fields and EC subscription keys, bounds observation freshness, and rejects unknown payload fields. Management is also limited to 120 requests per IP/minute and ten new installations per IP/hour. CORS is an additional browser boundary; authorization always uses the installation credential.

Outbound URLs must match fixed HTTPS push-only endpoint patterns on `fcm.googleapis.com`, `updates.push.services.mozilla.com`, or `web.push.apple.com`. Credentials, ports, queries, fragments, other hosts/paths, and redirects are rejected. This is not a general-purpose fetch proxy. Browsers using another push provider currently receive an unsupported-provider error; review its official endpoint format before extending the allowlist.

The maintained [`@block65/webcrypto-web-push` 2.0.0](https://github.com/block65/webcrypto-web-push) dependency uses runtime Web Crypto with `aes128gcm` and VAPID. It is isolated in `backend/package.json` and locked with `package-lock.json`; no third-party push SDK is shipped to the frontend.

### Idempotency and retention

D1 atomically claims `(endpoint_hash, local_date)` **before** sending. A concurrent or retried cron, changing time/timezone, undo, or disabling/re-enabling the same endpoint cannot send another scheduled reminder for that date. Revision-checked D1 batches prevent stale PUTs from overwriting newer updates or a DELETE. A failed database operation before claiming can be retried by the next minute's trigger.

There is no exactly-once transaction across D1 and an external push provider. Once a send is claimed, it is **never automatically resent**, even on 5xx, network timeout, ambiguous acceptance, or a crash before the request. This deliberately permits a missed reminder to preserve the at-most-once requirement. Tests are manually retryable after one minute. HTTP **404/410** removes expired subscriptions. Other push failures retain the subscription for a future eligible date.

When scheduling is active, cron also removes expired rate-limit buckets, delivery claims older than seven days, and installations not updated in 30 days (cascading deletion of their subscription). Scheduled housekeeping is paused along with reminders; dormant metadata may remain until explicit unsubscribe or deliberate scheduler resumption. Cleanup columns are indexed. The local CPU patch checks at most one eligible subscription per invocation (four in the deployed version), then stores a round-robin cursor for the next minute; expired/ineligible rows are excluded. This bounds work without starving later devices. Allow additional minutes for multiple devices to receive their reminders. Disabling removes subscription details immediately after server acknowledgement, while its credential hash/revision tombstone remains for up to 30 days to reject delayed writes. Test notifications do not extend eligibility or retention.

## Privacy change

Workout history, exercise names, split details, weights, reps, and drafts stay in localStorage. Enabling reminders shares only:

- Push endpoint and subscription encryption keys, installation ID, and credential hash.
- Reminder time, IANA zone, current-day eligibility, optional completed-local-date, observation/expiry timestamps, and synchronization revision.
- Short-lived endpoint-hash/date delivery claims, outcome markers, and rate-limit counters keyed by daily hashes of IP addresses. The infrastructure necessarily processes IP addresses while handling requests.

Notification text is always: “Ready for your next workout? Open SeannyLog to get started.” It does not reveal exercises or workout results. Clicking focuses the existing app and switches to Today without discarding a draft, or opens `index.html#today` under the service-worker scope, including a GitHub Pages subdirectory.

Workout export/import does not include or transfer reminder settings, credentials, or device subscriptions. Enable separately on a new device. Clearing browser storage without disabling first loses the deletion credential; the old eligibility expires seven days after its last successful sync and, while cron remains paused, the server record is retained until explicitly removed. The 30-day cleanup only runs when scheduling is active. Disable and synchronize **before** clearing site data or removing the PWA whenever possible. App-level request/payload logging and Worker observability are disabled by default; review any Cloudflare account-level logging and access controls separately.

## Validation recorded on 2026-09-15

Frontend publication checks on 2026-09-19: three focused configuration/service-worker tests and one browser test passed. They check the paused schedule, public-only configuration, matching v3.11 app/cache versions, `/SeannyLog/` clicks, click-only opt-in, manual test requests, and credentials excluded from backups. Browser push/API responses were mocked. Earlier completed checks below were reused; no new real-device or Cloudflare CPU verification is claimed.

- `npm test`: **30 passed**, including eligibility, local-date boundaries, workouts/rest, undo, DST/fold/gap and half-hour transitions, authorization, validation, durable deduplication, seven-day renewal/expiry across DST, replay freshness, bounded scheduler fairness, expiration, exact production CORS, and case-sensitive `/SeannyLog/` service-worker clicks.
- `npm run test:browser`: **12 passed** in local headless Chrome on Windows, including logging, drafts, split editing, export/import, offline loading under `/seannylog/`, missing backend configuration, permission/registration failures, offline disable and reset, in-flight disable, expiry recovery, and a mocked device timezone change. Actual IANA date/offset rules run through native Intl in the rule tests. The original blank-configuration assertion was updated after configuring the deployed API; a separate test retains coverage of unconfigured installations.
- `npm run test:runtime`: **passed** with actual local workerd/D1, generated test keys, encrypted outbound payloads, concurrent scheduled invocations, rate limiting, and expired-subscription deletion. The push service response was intercepted.
- `npm run db:local`: production SQL migration **applied successfully to local D1**. The Worker dry-run build, JavaScript syntax checks, and `git diff --check` also passed. The Settings layout was visually inspected at a phone-sized viewport.
- Live API checks: registration, exact seven-day expiry, idempotent retry, credential protection, unsubscribe/deletion, and exact-origin CORS passed. A disposable never-issued FCM endpoint returned permanent expiration through both the test endpoint and the actual deployed cron; each removed its subscription. This proves deployed scheduling and cleanup, not delivery to a real device.
- Real desktop Chrome: a temporary regular profile registered a genuine FCM subscription, received the test notification, received a scheduled notification with its app tab closed, and unsubscribed with no pending synchronization. An immediate second test returned HTTP 429 as expected. Generic notification text was observed. Chrome itself remained running. The local static frontend used a verification proxy for production API Origin; production CORS was verified separately. This did not publish Pages or touch the owner's existing browser profile. Incognito push registration was rejected by Chrome, so it was not counted as a delivery test.
- **Not performed:** physical Android or iOS permission/installation/closed-app behavior, live OS timezone changes, Focus/power-saving behavior, or phone delivery timing. Use the checklist below after publishing the frontend.

## Manual device checklist (not performed by the automated suite)

For the current release: install/open the existing Pages app, refresh to v3.11, open Settings, click **Enable test notifications**, allow permission, wait for registration success, then click **Send test notification**. Switch away or lock the phone, look for the notification, and tap it to check Today opens under `/SeannyLog/`. A test is sent immediately; closing the app afterward does not prove scheduled closed-app delivery. Disable notifications to verify unsubscribe. Do not clear site data. **Real push delivery for this published frontend and Free-plan CPU compatibility remain unverified.**

The scheduled-reminder, seven-day expiry, and scheduled-cleanup checks below are for a future explicitly authorized rollout; automatic reminders will not fire while paused.

For the main phone check, preserve your existing data and use the current cycle day. It must already be a valid workout day, with no workout/rest completed today and no scheduled reminder already attempted today. If today is suppressed, use Send test notification now and verify scheduling on the next eligible date; do not advance or reset the cycle just to obtain a reminder. Use a separate browser profile or test installation for destructive reset/import/undo scenarios. Pick a time a few minutes ahead. Browser mocks cannot prove delivery or OS behavior.

| Check | Android Chrome / installed PWA | iPhone/iPad installed PWA |
| --- | --- | --- |
| Installation | Open HTTPS site, install from browser menu. Verify offline launch. | iOS/iPadOS 16.4+; Safari Share → Add to Home Screen, then launch from that icon. Check ordinary Safari tab shows guidance. |
| Opt-in | No initial permission prompt; click Enable, allow, and wait for success. Test deny/block and restore via device settings. | Same; the prompt must follow the click inside the Home Screen app. |
| Test delivery | Send test, observe generic text, immediately retry and confirm rate-limit feedback. | Same; inspect Notification Center and device notification settings. |
| Closed-app reminder | Close the app before the chosen time, lock phone, and wait. Record actual delay. | Close the Home Screen app and lock phone. Record actual delay; also test Focus settings. |
| Notification click | Existing window focuses Today and keeps a draft; with no window, Today opens under the correct subdirectory. | Same from Notification Center/lock screen; verify the installed app opens. |
| Completion suppression | Complete a workout before time, confirm cycle advances but no reminder that date. Repeat with rest completion advancing to a workout. | Same. |
| Undo and cycle edits | Undo before the chosen time restores eligibility; Rest/empty/invalid days suppress it. Sync/import/split edits recalculate. | Same. |
| Daily dedup | Invoke/retry cron twice, edit time/timezone, disable/re-enable: only one scheduled notification for that endpoint/date. | Same, including a repeated DST hour where practical. |
| Offline edits | Complete offline, observe pending sync; reopen online and check suppression. A notification before sync is an acknowledged limitation. | Same. |
| Offline disable/reset | Disable/reset offline, confirm pending removal survives relaunch, reconnect and verify server row deletion and browser unsubscribe. | Same; also test removing notification permission in Settings. |
| Freshness and travel | After two unsynchronized days, eligible reminders continue. After seven days, they pause. Reopen online to renew; check timezone changes after sync. | Same. |
| DST / expiry | Use staging clock fixtures for gap/fold dates; revoke a subscription and verify 404/410 removal. | Same; test re-enabling after OS/browser subscription loss. |

Phone delivery with the app closed, device permission UI, physical Android/iOS behavior, Focus/power saving, and live DST travel require manual verification. The successful desktop push-service acceptance and tab-closed delivery checks above do not establish those phone behaviors.

## Primary references

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) and [local scheduled-handler testing](https://developers.cloudflare.com/workers/runtime-apis/scheduled-event/).
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) and [local D1 development](https://developers.cloudflare.com/d1/best-practices/local-development/).
- [WebKit: Web Push for Home Screen web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) and [Apple: sending Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
