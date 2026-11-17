# High-priority security fixes

## Access rules

- Every authenticated procedure requires an active account. Existing JWTs stop authenticating when staff are suspended or 3PL users are made inactive. The 3PL login rejects inactive accounts too.
- Only Super Admin can create or approve administrator roles, or approve, suspend or delete an existing administrator account. Admin can still create and approve operational staff. Role inputs use the defined role enum; approval applies only to pending signups. The Users screen offers roles the current administrator may grant.
- Logistics company creation requires Admin or Super Admin.
- 3PL shipment mutations require the assigned 3PL, or an explicit KEDI operations override (Super Admin, Admin or Logistics Officer). Viewer, Driver, Warehouse, Shipment Creator and Branch Manager cannot call those mutations.
- Shipment details, history and QR/manual lookup apply the same branch/driver/company scope as shipment lists. Hub branch managers retain access to shipments routed through their hub. 3PL details and history exclude pre-assignment and post-hub-delivery events.
- Attention counts respect driver, branch and 3PL scope. Branch managers without an assigned branch get no activity records. Manual overdue flagging requires KEDI operations permission.

## Shipment integrity

Warehouse processing is allowed only at Created; it cannot silently regenerate an existing shipping label. Normal assignment is allowed only at Labeled and requires an active partner and, for KEDI drop-off, an active assigned driver. Pickup and drop-off require their expected stage and assigned driver, with existing administrator overrides retained.

3PL pickup, receipt and progress actions require an appropriate active stage. Completed, cancelled, delivered and onward shipments cannot be reopened by a stale progress request. Movement updates preserve a partial-delivery stage. Receipt quantities must be whole items within the confirmed total; full delivery refuses inconsistent overcounts or a branch-reported shortfall requiring branch confirmation.

The affected actions lock the shipment row, validate inside that lock, then save shipment state and history in one transaction. Pushes are scheduled after commit. Final full acknowledgement now records the final delivered count and zero remaining, including completion after an earlier shortfall. Existing driver, direct-pickup and hub workflows remain available.

## Production JWT prerequisite

Before merging/deploying, verify **JWT_SECRET** is configured on the host actually serving the app (currently Railway; also cPanel if that deployment remains active). It must be a private randomly generated value of at least **32 bytes**, and cannot be the old source-known fallback. Do not paste it into chat, Git, screenshots or logs.

Production now refuses to start with a missing, short or former fallback secret. Set the secret in hosting environment settings before deployment. Use a password manager's secure generator or generate 32 random bytes encoded as hex. Preserve an already strong private secret to keep current sessions valid. Changing the secret invalidates existing sessions, so users will need to sign in again. Development without a configured secret uses an ephemeral random key; restarting that local server requires signing in again.

No database migration or historical shipment backfill is required. This change does not rotate hosting secrets or alter production data.

## Verification

The security policy suite checks middleware, role grants, read scope, terminal-state rejection and JWT configuration. A separately designated localhost MySQL schema exercises real authentication, transactional mutations, concurrent pickups, rollback on history failure, normal direct-pickup/driver/hub flows and final shortfall completion. Existing quantity-repair, company-correction and monthly-filter suites should also be run using their isolated test schema settings.

Validated for this change:

- Full suite with the security MySQL fixture: **211 passed**; 39 other optional integration cases were run separately.
- Dedicated partial-delivery, 3PL correction and monthly-shipment MySQL runs: **17 + 14 + 8 passed**. All **250 distinct cases** passed across these runs.
- `npm run check`, `npm run build`, focused ESLint on the new policies/services/tests, and `git diff --check` passed.
- Browser: actual Admin login and restricted role picker; assigned-driver manual scan; separate 3PL login and shipment list; branch receipt saved as 50 delivered/0 remaining and persisted after reload; mobile layout without horizontal overflow or uncaught page errors.
- Built production server: refused startup without JWT_SECRET and started with a generated private test key. Test values stayed in the subprocess environment; no production secret was read or changed.
