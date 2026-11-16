# Correct an administrative 3PL assignment

An active Super Admin can open **Shipment details → 3PL Information → Correct
3PL assignment**, choose the correct active company, enter a reason and confirm
that they reviewed the physical handover records.

For the reported case, the intended change is from **S.generation Logistics**
to **Knightpride Logistics**. The partner directory was verified, but the
protected production shipment was not read or modified during development.
Review its actual state before applying. Tests use synthetic shipment records.

## What changes

Only `tpl_id` and the normal `updated_at` field change. The original tracking ID,
driver, assignment date, pickup type, status, quantities, ETA, branch route, hub
fields, delivery timestamps and existing tracking events are preserved. A new
`note_added` event explains the correction and reason. A separate
`correct_tpl_assignment` activity-log entry stores the before/after company,
actor, preserved stage and correction event ID. No old events are rewritten.

The change is atomic: row locks and a transaction cover the update, history note
and audit entry. All other shipment fields are compared before commit; a failed
write or audit rolls the entire change back. Expected company/stage values reject
a stale review or duplicate submission. No schema migration is required.

This deliberately does **not** call the normal `assign3pl` workflow or push
notification helpers. It does not reset pickup or ask the driver to replay a
completed handover. The correction note appears in shipment history and can
appear in the normal in-app activity feed. An original notification already
delivered to a device is not withdrawn by changing the assignment.

## Eligibility and review

Simple correction is available at waiting-for-driver-pickup, picked-up,
at-3PL/drop-off, or waiting-for-direct-3PL-pickup stages, before any recorded 3PL
confirmation or 3PL activity. Delivery, completion, hub receipt, existing 3PL
quantities or downstream activity require a separate evidence review. Even a
stage edited backward cannot hide prior 3PL activity from the server check.
Do not delete real history to force eligibility.

Normal assignment now rejects a shipment that is no longer labeled, preventing
an accidental workflow reset through the old assignment page.

## 3PL access after correction

The correct company sees the shipment in its portal on refresh. Its history keeps
the original assignment/pickup/drop-off records and the correction note; no new
`assigned_to_3pl` event resets the original assignment date or history cutoff.

The former company is excluded from its shipment list, single-shipment reads and
history. Pickup, receipt, receive-remaining, delivery updates and ETA updates
check ownership **after locking the shipment row**, so a request waiting during
a correction cannot subsequently write using a stale ownership check. Staff
workflow permissions remain as before; the correction itself is Super Admin-only.

## Verification

Unit tests cover eligibility, invalid legacy timestamps, role restrictions,
active-account requirements, reasons and stale review parameters. Optional MySQL
tests require matching `DATABASE_URL` and `KEDI_CORRECTION_TEST_URL` pointing to
an isolated localhost database with a name ending in `_test`. Tests clear that
schema's shipment/partner/audit/event records; never use production credentials.

```sh
DATABASE_URL=mysql://root@127.0.0.1:3307/kedi_correction_test npx drizzle-kit push --force
DATABASE_URL=mysql://root@127.0.0.1:3307/kedi_correction_test KEDI_CORRECTION_TEST_URL=mysql://root@127.0.0.1:3307/kedi_correction_test npm test
```

Integration coverage includes full-field preservation, original event retention,
correct-company reads and confirmation, former-company read/write rejection,
concurrent corrections, stale reviews, inactive targets, downstream-state review,
transaction rollback on audit failure and ownership checks after a row-lock wait.
Browser checks use local synthetic records to verify the form, target selection,
required reason/confirmation, unchanged stage/history, refresh, ordinary-Admin
restrictions and desktop/mobile rendering.
