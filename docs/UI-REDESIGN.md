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
