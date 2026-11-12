# Shipment month navigation

The four Overview cards are links to the staff shipment list, carrying the
selected creation month and corresponding status group. Cards work with mouse,
touch, keyboard, open-in-new-tab, and normal browser navigation.

The staff Shipments page defaults to the current month in **Africa/Lagos**.
Its month/year picker applies to **shipment creation**, consistent with Reports
and the existing Overview month selection. It does not select the completion
month: a shipment created in October and completed in November appears under
October when Completed is selected. The page explains this, includes the month
in its heading and count, and shows creation dates on individual shipments and
completion dates on completed shipments. **All months** removes the date filter.

Month, status, search, and page are stored in URL parameters. Changing month,
status, or search resets pagination. Refresh, Back, and shared/deep links retain
the filters. The Overview month is also stored in its URL.

`contracts/shipment-navigation.ts` shares the status groups and Lagos month
boundaries. Active excludes delivered, completed, and cancelled. Pending label
uses created. In transit retains Overview's existing `IN_TRANSIT_STATUSES`
definition (including pickup and hub/onward stages). Delivered includes delivered
and completed. Separate Delivered and Completed filters remain available.

Staff list and count queries use the same date and role scope. Branch managers
see destinations and hub routes for their assigned branch; managers without an
assigned branch see no rows. Drivers see their assigned shipments. Separate 3PL
accounts cannot call these staff endpoints; their existing portal/list endpoint
is unchanged. All-month live follow-up links stay all-month so older outstanding
shipments are not hidden by the new current-month default. These links open the
list, rather than adding new follow-up filtering logic.

This is read-only navigation. It does not change shipment statuses, dates,
acknowledgements, operational actions, or notification delivery.

## Verification

`npm test` covers month parsing, Lagos rollover, leap years, year rollover,
invalid/partial month input, status groups, URL parsing, and legacy missing dates.

The optional real-MySQL suite requires a disposable local schema named with an
`_test` suffix. It clears shipments in that schema. Never use production URLs:

```sh
DATABASE_URL=mysql://root@127.0.0.1:3307/kedi_navigation_test npx drizzle-kit push --force
DATABASE_URL=mysql://root@127.0.0.1:3307/kedi_navigation_test KEDI_SHIPMENT_TEST_URL=mysql://root@127.0.0.1:3307/kedi_navigation_test npm test
```

Integration checks compare all four card counts against their lists for Super
Admin, branch-manager and driver contexts; they cover hub scope, exact Lagos
month boundaries, creation versus completion dates, All months, pagination,
search, missing branch assignment, and separation from 3PL authentication.
Browser verification used real local API/MySQL data to check all four cards,
keyboard activation, month/status headings, search and page reset, refresh and
Back persistence, individual dates, mobile overflow, and no operational writes.
