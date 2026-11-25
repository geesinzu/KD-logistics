# Department packages

Department packages accompany normal branch shipments. They are not stock items, do not affect shipment item/delivery quantities, and do not require warehouse scanning or a packing confirmation.

## Enable after deployment

1. Sign in as Super Admin and open **Department packages**.
2. Select **Enable department packages**. This creates five additive InnoDB tables and appends `department_staff` to the existing staff-role enum. It preserves current roles, staff assignments and shipment data. Activation is explicit, repeatable, and never runs on app startup. Database credentials need CREATE/ALTER privileges; failure leaves the feature unavailable and can be retried.
3. In **Staff access**, create the department names, then create department accounts or explicitly assign existing non-administrator staff. Assignment replaces their previous operational role and branch assignment. It does not automatically activate a pending or suspended account; use the separate Activate control after reviewing it.
4. Staff use the existing phone/password login. Share new credentials privately. This release does not send email invitations or allow users to choose their department at signup.

## Daily workflow

- Department Staff create a destination, short description and 1–20 physical packages. They print one numbered QR label per package. Reprinting preserves identifiers. They see only their department's requests, package progress and a shipment reference; they cannot open the branch's shipment or stock records. Confidential envelopes should use a generic description.
- Logistics Officer, Super Admin, Admin and Warehouse Supply can scan package labels using the existing scanner, upload a QR image, or enter `DP-<request>/<package>`. Scanning opens details; receipt requires an explicit confirmation that the package physically reached the logistics office. Repeated confirmation is idempotent. The office forwards items to warehouse using its existing physical process; no warehouse acknowledgement is required.
- During single **or bulk** shipment creation, selecting a destination reveals waiting department packages for that exact final branch. Office-received packages can be ticked individually; unticked or not-yet-received packages remain waiting. Nothing is automatically selected. Saving commits shipment, package inclusion and history together. The record names the shipment creator, without claiming a warehouse packing verification.
- Before assignment/dispatch, the creator or operations team can remove a mistakenly selected package. Cancelling/deleting a shipment also releases its unreceived department packages to waiting; shipments with a branch-received package cannot be cancelled/deleted.
- The destination branch sees expected packages on its overview and linked packages inside shipment details. It confirms each physical package separately. Partial arrival leaves the others outstanding. Neither the main shipment acknowledgement nor a department package acknowledgement automatically completes the other. Hub branches do not acknowledge a final branch's department packages.

## Access and history

Department scope is enforced by the server, including guessed request IDs and QR tokens. Generic shipment/report/user-directory/document/3PL endpoints deny the department role. 3PL sessions cannot access department records. Department reassignment changes scope immediately; suspended accounts cannot sign in. Old shipment push payloads are suppressed when a former shipment creator becomes Department Staff. Package actions record actor and time; stock quantities are untouched.

The department list is paginated (30 requests per page); shipment selection returns up to 500 waiting physical packages for a branch. Existing shipments without package selections keep their existing workflow. No production database changes are made by this pull request before deployment and explicit activation.

## Verification

Run `npm run check`, `npm run build`, and `npm test`.

The integration suite `api/department-packages-mysql.test.ts` requires both `DATABASE_URL` and `KEDI_DEPARTMENT_TEST_URL` to be the same **isolated localhost database with a name ending `_test`**. It deletes test fixtures and exercises old-schema activation, department/branch/3PL scope, QR references, office receipt, concurrent inclusion, transactional rollback, bulk creation, cancellation, removal and partial acknowledgement. Never point it at production.

Browser verification uses normal logins against that local database and covers printing, package lookup/receipt, selection on shipment creation, destination acknowledgement and denied cross-department access. Camera hardware and an actual physical printer still need a device smoke test after rollout; manual references and uploaded QR images provide alternatives.

Corrections: before office receipt, the submitting department user can cancel and recreate a request. After office receipt, Super Admin/Admin/Logistics Officer can return or cancel an unassigned request with a recorded reason, preserving the handover history. Included packages must first be removed from their shipment before dispatch. No package destination is silently rewritten after receipt.

Rollback: suspend Department Staff accounts before reverting to an application version that predates this role. Keep the new enum value and feature tables while their records exist; an older application's generic staff-access rules do not provide this release's department restrictions.

Admin deletion: Admin and Super Admin can delete an unassigned package request with a reason. It disappears from active lists and its labels can no longer be used by departments, logistics or branches. The request, original handover times and actor/reason events are retained for audit, rather than permanently erased. All packages must be removed from their shipment before the request can be deleted; dispatch/receipt restrictions continue to apply. This uses the existing event history and requires no database schema upgrade.
