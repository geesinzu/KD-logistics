# UI redesign: isolated testing branch

Work lives on `feat/ui-redesign-preview`. Keep the pull request as a draft.
Do not merge or deploy this branch until the redesign is tested and explicitly
approved. The existing deployment workflow runs on pushes to `main`; it is
unchanged. This branch contains no database/schema, API, credential, or live
configuration changes.

## Stage 1 — navigation and dashboard

- Original KEDI logo retained on desktop and mobile.
- Desktop sidebar and mobile bottom navigation, including Scan.
- Existing notification badge and push self-healing remain connected.
- Dashboard uses existing APIs with the same monthly and role scopes.
- Existing create, bulk create, scanner, reports, and delivery routes retained.
- Driver, warehouse, branch acknowledgement, and logistics assignment queues retained.
- Loading, error/retry, and empty states replace misleading zero fallbacks.
- Reminder diagnostic remains available to Super Admins under Administrator tools.
- New styles are scoped to the KEDI staff workspace. Login and 3PL source files
  have not changed.

Browser checks use mocked API responses to avoid changing real records. They
verify desktop/mobile layout, navigation, month query inputs, role-specific
queues and original logo. They do not establish live persistence, camera access,
or actual notification delivery.

## Gradual testing sequence

1. Review dashboard and navigation on mobile/desktop with each staff role.
2. Restyle and test shipment list, creation, details, and Scan. Test camera and
   QR lookup on a real phone using a separate test environment.
3. Restyle and test Branches, Users, staff transfers, notifications and Profile.
4. Restyle login pages and the separate 3PL portal. Test each 3PL handoff with
   test accounts and a nonproduction database.
5. Test the complete shipment flow, hub/onward routing, partial delivery,
   acknowledgement, permissions, and existing records in that test environment.
6. Only after explicit approval, plan the production merge and deployment.

Use a separate database and test credentials for any staging server. Do not
point staging mutations or the reminder scheduler at the production database.
No staging service or production deployment has been provisioned in Stage 1.

## Stage 2 — shipment screens and Scan presentation

- Shipment cards retain warehouse Label, logistics Assign, SLA, delivery outcome,
  receiver, item-count, ETA and hub-route information. Detail links are keyboard
  accessible. Status buttons expose their pressed state.
- Existing grouped status filters are retained. Pagination now exposes all
  matching records in pages of 50; search/status changes return to page 1.
- Removed tab badges calculated from only the first 200 records. The result
  count now uses the API total for the active filters.
- Single creation form retains the original payload and hub-route explanation;
  adds associated field labels and branch loading/error/retry states.
- Bulk review, warehouse, assignment, details and scanner use the new workflow
  headers and spacing. Their existing mutation/camera/QR handlers are retained.
- Bulk creation actions stay above mobile navigation.
- Chromium with mocked API responses verified search/status/pagination,
  single/bulk creation payloads, hub display, receiver prefill, warehouse payload,
  driver assignment, manual lookup and detail navigation. A generated QR image
  exercises the existing image decoder; camera denial exercises manual fallback.
- No live mutations, actual notification delivery or physical camera scan has
  been tested. These remain part of the separate nonproduction phone test.

## Stages 3–4 — staff management, identity and partner portal

- Branches, Users, Profile, notifications, driver deliveries and reports now use
  the shared visual system. Existing edit/approval/upload/notification controls
  and report calculations/export templates are retained.
- Users has working status filtering (including All), search, and pagination;
  Super Admin staff/branch edits retain their existing API restrictions.
- Staff login, registration and separate 3PL login share a responsive identity
  frame with the original KEDI logo. Endpoints, token storage and redirect
  destinations are unchanged.
- Partner portal retains pickup, receipt, partial/damaged condition, remaining
  intake, location/status updates, delivery quantities, delay/ETA, history,
  photos, notifications, push preferences and logout controls.
- Partner filter labels map to actual API statuses rather than sending labels
  like `done` to the database. Hub/onward shipments appear as completed for the
  3PL, whose delivery obligation ends at the hub. This changes filtering, not
  shipment mutation/state-transition rules.
- Partner pagination exposes additional pages of 50 records. Displayed counts
  explicitly describe the current page. Needs Follow-up remains a client-side
  filter of the current page, with a visible explanation; it is not a global
  backlog count.
- Partner and staff navigation remain separate; the partner portal does not
  render staff management links.

## Verification recorded for the complete preview

All 36 existing API tests, production build and focused lint checks passed.
Type checking still reports pre-existing missing declarations for `web-push`.
Mocked Chromium smoke tests cover desktop/mobile navigation and role queues,
monthly dashboard requests, shipment filters/pagination, single/bulk payloads,
warehouse/assignment payloads, manual QR lookup, generated QR image decoding,
camera-denied fallback, staff/partner login, registration, staff transfer,
branch editing, report CSV export, and partner pickup/partial receipt/remaining
items/partial delivery/delay/ETA/history/filters/pagination/notifications. The
tests check payloads and browser rendering; they do not prove live persistence.

This branch is ready for gradual review, not a verified production rollout.
Before merging, test physical camera scanning, printing/PDF output on target
devices, push delivery, and the complete delivery/acknowledgement flow against a
separate test database with staff and partner test accounts. Keep the production
branch, database and deployment configuration untouched during those tests.
