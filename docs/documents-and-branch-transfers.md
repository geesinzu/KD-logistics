# Shipment documents and branch transfers

These features run inside the existing KEDI app. The KEDI logo, normal shipment flow, Scan and separate 3PL portal remain available. Branch transfers are separate staff handovers and never create a normal shipment, driver assignment or 3PL task.

## First-time rollout

1. Deploy the reviewed feature branch after merging its PR. The app can start before the new feature tables exist; existing shipment actions remain available.
2. Sign in as an active Super Admin and open **Branch transfers** or **Documents**. Select **Enable documents and transfers** once.
3. This action creates only the three new tables defined in `db/operations-ddl.ts`, using `CREATE TABLE IF NOT EXISTS`, then records the setup in the activity log. It does not alter or clear existing tables. Repeating it is safe; a partial setup can be retried.
4. The production database account needs permission to create these tables. If setup fails, check hosting database permissions; the existing shipment records are unchanged. Staff can refresh or use **Check again** after setup.

No new credentials, external storage service or publicly accessible upload directory is required. Do not use legacy maintenance scripts or a full schema push to enable this release.

## Shipment documents

Open a shipment and choose **Attach document**, or use **Documents** in the staff workspace to find existing files. The searchable library supports filename/tracking-ID search, document-type filters and pagination.

Supported types are waybills, delivery notes, invoices, packing lists and other documents. Initial limits are PDF/JPG/PNG/WEBP, **5 MB per file**, and **30 active files / 50 MB per parent record**. Transfer item photos have a **3 MB** per-photo limit and at most five photos in each update. Larger transfer photos are resized in the browser; shipment document originals are preserved.

Files are KEDI-staff-only. 3PL accounts cannot upload, list, preview or download them, including files for their assigned shipments. KEDI branch managers and drivers have the same shipment scope as the existing shipment list. Viewer accounts can read permitted documents but cannot upload. Other authorised operational roles can upload within their scope. Only Super Admin can remove shipment documents, with a reason.

File bytes are stored in a dedicated private MySQL LONGBLOB table, separate from shipment rows. Metadata queries never select the file body. This avoids ephemeral-host filesystem loss and public links, but database storage and backups must be sized for the uploads. Removal clears the live file body while retaining removal metadata and an audit; deleting a shipment also retires its live file bodies. Database backups follow the hosting backup policy. No automatic legal-retention period has been invented.

Every download requires an active staff bearer token and rechecks access to the parent record. Responses use private/no-store, attachment disposition, nosniff and sandbox headers. Tokens never appear in URLs. Filenames are sanitised and server-side validation checks size, base64 encoding and actual file signatures against the declared MIME type. HTML, SVG and executable uploads are not supported. PDFs are downloaded rather than embedded. This release does **not** include antivirus scanning or a claim that every allowed PDF/image is malware-free; a scanning service can be added separately.

## Branch transfer workflow

1. **Request:** the sending branch manager selects the receiving branch, describes the items, enters a whole-number quantity and unit, gives a reason, records transport details, and adds at least one item photo. Operations staff may request on behalf of a branch.
2. **Review:** Super Admin, Admin or Logistics Officer approves or declines. The requester cannot approve or decline their own request. A decline requires a reason.
3. **Dispatch:** after approval, the sending branch manager confirms physical handover. Transport details can be confirmed/updated and additional dispatch photos are optional. The mandatory original sending-branch photos stay with the transfer.
4. **Receipt:** the receiving branch manager counts newly received items, adds their own photos, and confirms condition. Enter the **additional quantity for this update**, not the cumulative total. A partial receipt requires an explanation and leaves the outstanding balance open. The same staff member who dispatched cannot confirm receipt after moving branches.
5. **Complete:** cumulative receipts reach the transfer quantity; the transfer is marked Received in full. For example, 38 of 50 leaves 12 outstanding, and a later receipt of 12 closes it.

Transport information is entered as free text: logistics company name, contact person, phone, door-to-door versus collection, and a required pickup location for collection. The carrier does not need an app account and does not post updates. Both branches and authorised operations staff can download the photo evidence.

A branch manager sees only transfers involving their current branch. Super Admin/Admin/Logistics Officer have company-wide operations access; Viewer has read-only access. Drivers, shipment creators, warehouse users and 3PL accounts cannot access transfer records. Only the responsible branch managers confirm physical dispatch/receipt; administrator approval does not substitute for those steps.

The sending branch or KEDI operations can cancel with a reason before dispatch. Sent transfers cannot be silently cancelled or rewritten. Requests are not edited after submission; cancel and resubmit before dispatch if their items/counts are wrong. Transfer evidence and history are not removable through document controls. Exceptional receipt corrections/returns are not added in this release. These records track physical handover; they do not adjust stock balances or valuation.

## Integrity and audit

Request keys protect retries. Transfer actions lock the transfer, recheck the current staff role/branch, validate its version and allowed stage, then commit quantities, photos, history and audit together. Duplicate receipts do not increment twice; stale reviews and over-receipt are rejected. Uploads lock their parent shipment, enforce quotas and deduplicate repeated requests. Audits contain metadata and safe before/after quantities, never raw files, credentials or JWTs.

These features do not call the normal shipment notification helpers or send carrier notifications. Approval queues and handover updates are available in the transfer workspace. Dedicated scheduled alerts and the global audit page remain separate planned features.

## Verification evidence

- 19 policy tests and 13 real MySQL feature tests: setup, role/branch boundaries, file bytes/headers, removal, quota enforcement, independent approval, wrong-stage rejection, 38+12 receipts, duplicate/concurrent requests, stale retries and transaction rollback on audit failure.
- Main suite with the new MySQL fixture: 220 passed; the 62 other optional MySQL tests were run separately (23 security + 17 partial delivery + 14 3PL correction + 8 month filtering). **282 distinct cases passed.**
- Browser on synthetic local data: one-time setup; sending-branch request with photo and pickup location; independent approval; origin dispatch; receiving-branch 38/12 partial receipt then final 12; private upload/download/library search/removal; persistence after reload; desktop/mobile layouts; no uncaught page errors.
- Normal shipment rows and tracking events are unchanged by the complete transfer lifecycle. No production records have been used for these tests.
