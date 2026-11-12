# Historical acknowledgement correction — retired

The administrator confirmed that the one-time correction was applied. The
temporary Super Admin page, Profile link, API procedures, and write service were
removed on 12 November 2026. The app can no longer invoke this maintenance job.
The cutoff was fixed at **1 November 2026, Africa/Lagos**; the correction copied
existing eligible delivery dates into acknowledgement dates.

## Records retained

No production data is reverted by removing the tool. Full original shipment rows
and inserted history event IDs remain in `activity_log` under action
`historical_ack_backup`. The completion marker uses action
`historical_ack_completed`, entity type `maintenance`, and details job
`kedi_ack_before_nov2026`. Preserve these audit records and shipment history.

Historical correction events use actor role `system_backfill`. The notification
feed continues to exclude this role before pagination, preventing correction
events from appearing in staff or 3PL feeds or unread counts after tool removal.

For recovery, review each shipment for later operational changes before using
its original audit snapshot and inserted event ID. Do not blindly restore full
rows or delete the completion marker. Implementation is retained in Git history
at PR #14; it is no longer part of the deployed application.
