# Temporary historical acknowledgement correction

Super Admin → Profile → **Temporary tool: historical acknowledgements**
(`/maintenance/historical-acknowledgements`). This uses the deployed app's own
MySQL connection; no credentials need to be entered in the browser.

## Scope

The cutoff is fixed at **2026-11-01 00:00:00 Africa/Lagos**. It does not move
when the calendar changes. Eligible shipments are still `delivered`, have no
completion timestamp (legacy zero completion dates are accepted), have a valid
older delivery timestamp, no hub route, no recorded outstanding/inconsistent
quantities, and no existing acknowledgement event. Missing or ambiguous records
are shown for review instead of inventing a receipt date.

1. Preview the exact records and review the skipped records.
2. Type the displayed confirmation and apply once.
3. Wait for **Correction completed**. Refresh if the response is interrupted;
   the persistent completion marker determines whether the transaction committed.
4. Verify shipment history, dates, and report totals. Request removal of the
   temporary tool after confirming the production result.

Applying changes `status` to `completed` and copies the existing `delivered_at`
into `completed_at`. The existing delivery date, quantities, route, and other
shipment details are preserved. `updated_at` records the actual correction time.

## Audit and notifications

No push, email, or in-app notifications are sent, including to separately
authenticated 3PL accounts. This code does not call the normal acknowledgement
mutation or any notification sender. Its `delivery_acknowledged` history entries
use `actor_role = 'system_backfill'` and clearly describe an administrator-requested
historical correction, with the actual execution time and requesting user ID.
The notification-center query excludes this actor role **before** applying its
limit, so corrections cannot appear in the feed or unread count.

In one transaction, each original full shipment row and inserted history event
ID are saved in `activity_log` with action `historical_ack_backup`. A final
`historical_ack_completed` row has `entity_type = 'maintenance'` and
`details.job = 'kedi_ack_before_nov2026'`. Keep these records permanently. A
database backup should still be retained under the normal production process.

The preview digest is rechecked against locked records. An advisory MySQL lock
serializes apply requests; the persistent completion marker blocks repeat runs,
including across restarts or different app instances. All three live tables must
use InnoDB. Any error before commit rolls back the shipment, backups, events, and
completion marker together. A commit with an interrupted response is resolved
by refreshing the preview; never delete the marker to force a retry.

## Remove after production verification

Remove the maintenance router registration, `api/maintenance-router.ts`, its
service, the temporary page and route, the Profile link, and tool-specific tests
and helpers when no longer needed. **Keep** the notification query's
`system_backfill` exclusion and all durable audit/history rows, so removing the
tool never makes its historical events appear as notifications. No schema
migration or temporary database procedure is installed by the app tool.

If a correction needs recovery, first review the affected shipment for subsequent
operational changes. The audit rows contain the originals and event IDs; do not
blindly overwrite full rows after normal operations have resumed.

## Verification

`npm test` runs scope and authorization tests. Real-MySQL tests are opt-in and
refuse non-local hosts or database names not ending in `_test`:

```sh
DATABASE_URL=mysql://root@127.0.0.1:3307/kedi_ack_test npx drizzle-kit push --force
KEDI_ACK_TEST_URL=mysql://root@127.0.0.1:3307/kedi_ack_test npm test
```

Only run these against a disposable test database. Tests clear its shipment,
tracking-event, and activity-log tables. They exercise Lagos month boundaries,
backup and audit persistence, unchanged excluded shipments, stale previews,
transaction rollback after an injected event failure, concurrent execution,
repeat protection, and notification-center exclusion for Super Admin, branch
manager, and 3PL accounts. They do not connect to production.
