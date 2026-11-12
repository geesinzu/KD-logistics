# Delivery Brief

`/reports` is the new created-cohort report. `/reports/activity` preserves the
original report, activity-date metrics, trend drilldowns, CSV and print/PDF
implementation. A link at the top of the brief opens that report.

## Scope and calculations

The read-only `report.brief` endpoint accepts inclusive Lagos `from`/`to` dates,
optional branch/partner IDs, and an equal-length previous-period comparison.
Ranges are limited to 366 days. Queries select only report fields for the
requested cohorts, plus office/partner lookup names and the two custody event
types. Custody event ID lists are chunked into batches of 500. No schema change
or migration is required, and no records or notification settings are mutated.

Both cohorts use **current recorded outcomes**. They are not reconstructions of
historical snapshots: older cohorts have had longer to complete, and updated
ETAs are the current ETA values. This limitation is visible in the report.

- Volume includes cancellations; open work and service rates exclude them.
- Service on-time rate uses completed 3PL legs with valid receipt and ETA dates.
  On hub routes, service ends at hub arrival. ETA deadlines are the end of the
  Lagos calendar day. Acknowledgement is not substituted for a missing 3PL
  receipt timestamp.
- Direct final receipt uses delivery or a completed acknowledgement. Hub final
  confirmation uses acknowledgement, because a separate physical-arrival time
  is not consistently recorded. The interface labels this distinction.
- Onward work becomes overdue only against an explicit onward expected date.
  Missing onward dates are data gaps, not overdue accusations.
- A service completion with a missing timestamp is flagged for data review,
  not assigned an invented transit duration or an overdue accusation.
- Each duration stage has an independent valid sample. Invalid, negative and
  future timestamp samples are excluded. Stage averages must not be summed as
  a typical end-to-end time. Onward duration includes time to acknowledgement.
- Partner and branch groups use IDs so duplicate display names do not merge.
- Rates expose their numerator/denominator; fewer than 10 eligible completions
  is marked as a small sample, not treated as an official service target.

## Interface and exports

Executive brief, branch performance, partner scorecards and follow-up queue
share the same date/branch/partner filters. The queue also selects past ETA,
awaiting direct acknowledgement, or missing stage ETA. It paginates at 30 rows;
CSV exports the complete matching queue, not only the visible page. CSV cells
are escaped and formula-leading text is neutralized. Export timestamps use UTC;
the interface and PDF use Lagos time and clearly show the generation time.

Print / Save PDF prints all four report sections with the selected filters,
including all matching queue rows. Navigation, interactive controls and the app
sidebar are excluded. Detail dialogs show actual milestone evidence and link to
existing shipment pages. Follow-up owners are suggestions, not attribution of
fault. No automatic messages or push notifications are sent.

Access uses the same roles as the existing analytics report: super_admin,
admin, logistics_officer and viewer. Authentication and role checks run before
report database reads. Branch managers, warehouse staff, drivers and 3PL users
cannot call this endpoint.

## Verification

Unit coverage includes Lagos boundaries, invalid and oversized ranges,
comparative range length, dynamic branch IDs, direct vs hub completion,
acknowledgement separation, onward ETA, independent duration stages,
cancellations, missing/invalid/future dates, partial deliveries and the access
gate. Mocked Chromium checks cover filters, drilldowns, comparisons, queue
paging/reset, full CSV export, printable sections/PDF generation, mobile
horizontal overflow, empty/error states and access to the original report.

Live database totals and physical printer output require review in a separate
test environment. No deployment or production data change is part of this PR.
