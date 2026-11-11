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
