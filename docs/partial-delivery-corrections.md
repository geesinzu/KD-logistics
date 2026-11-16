# Correcting partial-delivery quantities

Previously, deleting a partial-delivery tracking entry removed its history but left its quantity in the shipment total. Entering the replacement added to that stale total. For example, deleting 32 and entering 38 could leave 70 delivered against a shipment of 50.

## Future deletions

Super Admin deletion now subtracts the deleted entry's recorded quantity and recalculates the remaining balance atomically with the deletion and its audit. Later movement history is retained. Unsafe deletions involving completed delivery, acknowledgements, inconsistent quantities, or an intervening total correction are blocked rather than guessed.

The 3PL partial-delivery field explicitly asks for **additional items delivered in this update**. Invalid increments, over-delivery and increments that complete the shipment are rejected; use the existing full-delivery action for completion.

## Repairing an existing stale total

After deployment, an active Super Admin can open the shipment's Details and select **Correct partial-delivery total**. Enter the verified cumulative delivered quantity, provide a reason, review the remaining balance, and confirm verification before saving.

For the example above, enter **38**, leaving **12** outstanding. Keep the valid 38-item delivery entry. Do not ask the 3PL to enter that delivery again.

The repair requires an eligible shipment without downstream receipt evidence and either an audited partial-entry deletion or a narrowly verified historical overcount. Without a deletion audit, delivered must exceed the actual item total, remaining must be zero, every surviving partial entry must have a positive whole quantity, their sum must exactly match the requested correction, and no previous quantity-correction audit may exist. The correction audit records the evidence source and surviving event IDs. It checks that the displayed shipment quantities and status have not changed before saving. It preserves valid history, driver and logistics assignments, dates and the actual item count. The correction adds a note and a separate audit record in the same transaction. Neither deletion nor correction sends a push notification.

This change does not automatically modify production shipment records or backfill all historical quantities.

## Verification

Unit and local MySQL integration tests cover rollback, repeated partial entries, concurrent deletion, cumulative repair, later increments, permission checks, stale requests, and transaction rollback on audit failure. Browser verification covers the 70-to-38 repair, persistence, retained history, mobile layout and ordinary-admin restrictions using synthetic local data.
