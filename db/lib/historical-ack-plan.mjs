import { createHash } from 'node:crypto';

export function validateCutoff(cutoff) {
  if (!/^\d{4}-\d{2}-01$/.test(cutoff) || !Number.isFinite(Date.parse(cutoff)) || new Date(cutoff).toISOString().slice(0, 10) !== cutoff) throw new Error('Cutoff must be a valid first day of a month (YYYY-MM-01)');
  return cutoff + ' 00:00:00';
}
function validDelivery(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(value)) return false;
  const ms = Date.parse(value.replace(' ', 'T') + '+01:00');
  if (!Number.isFinite(ms)) return false;
  // Validate the calendar date too (Date.parse normalizes 30 February).
  const day = value.slice(0, 10);
  return new Date(day).toISOString().slice(0, 10) === day && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}
export function planAcknowledgements(rows, cutoff, acknowledgedIds = new Set()) {
  const boundary = validateCutoff(cutoff), eligible = [], skipped = [];
  for (const row of rows) {
    let reason;
    if (row.status !== 'delivered') reason = 'not_awaiting_final_acknowledgement';
    else if (row.completed_at && !String(row.completed_at).startsWith('0000-00-00')) reason = 'already_acknowledged';
    else if (!validDelivery(row.delivered_at)) reason = 'missing_or_invalid_delivery_date';
    else if (row.delivered_at >= boundary) reason = 'current_month_or_later_delivery';
    else if (row.hub_branch_id !== null && row.hub_branch_id !== undefined) reason = 'hub_arrival_is_not_final_branch_delivery';
    else if (Number(row.remaining_qty ?? 0) !== 0 || (row.actual_item_count != null && row.delivered_qty != null && Number(row.actual_item_count) > Number(row.delivered_qty))) reason = 'outstanding_or_inconsistent_quantities';
    else if (acknowledgedIds.has(String(row.id))) reason = 'existing_acknowledgement_event_needs_review';
    if (reason) skipped.push({ id: String(row.id), trackingId: row.tracking_id, reason });
    else eligible.push(row);
  }
  eligible.sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  const digest = createHash('sha256').update(JSON.stringify({ cutoff, eligible })).digest('hex');
  return { cutoff, boundary, eligible, skipped, digest };
}
