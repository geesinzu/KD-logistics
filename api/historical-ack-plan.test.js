import { describe, expect, it } from 'vitest';
import { planAcknowledgements, validateCutoff } from '../db/lib/historical-ack-plan.mjs';
const base = { id: 1, tracking_id: 'TEST-OLD', status: 'delivered', completed_at: null, delivered_at: '2026-10-31 23:59:59', hub_branch_id: null, actual_item_count: 10, delivered_qty: 10, remaining_qty: 0 };
describe('Historical acknowledgement scope', () => {
  it('includes deliveries strictly before 1 November Lagos time', () => { const p = planAcknowledgements([base], '2026-11-01'); expect(p.eligible).toEqual([base]); expect(p.boundary).toBe('2026-11-01 00:00:00'); });
  it.each(['2026-11-01 00:00:00', '2026-11-11 14:00:00', '2026-12-01 00:00:00'])('leaves this month or later unchanged: %s', date => { expect(planAcknowledgements([{ ...base, delivered_at: date }], '2026-11-01').eligible).toEqual([]); });
  it.each(['created', 'partially_delivered', 'at_hub', 'onward_in_transit', 'completed', 'cancelled'])('does not invent final delivery for %s', status => { expect(planAcknowledgements([{ ...base, status }], '2026-11-01').eligible).toEqual([]); });
  it('preserves existing acknowledgements', () => { expect(planAcknowledgements([{ ...base, completed_at: '2026-10-31 23:59:59' }], '2026-11-01').eligible).toEqual([]); });
  it.each([null, '0000-00-00 00:00:00', '2026-02-30 12:00:00', '2026-10-31 25:00:00'])('skips invalid delivery timestamps %s', delivered_at => { expect(planAcknowledgements([{ ...base, delivered_at }], '2026-11-01').eligible).toEqual([]); });
  it('excludes hub arrival and outstanding quantities', () => { expect(planAcknowledgements([{ ...base, hub_branch_id: 7 }, { ...base, id: 2, remaining_qty: 2 }, { ...base, id: 3, delivered_qty: 8 }], '2026-11-01').eligible).toEqual([]); });
  it('skips existing acknowledgement audit events', () => { expect(planAcknowledgements([base], '2026-11-01', new Set(['1'])).eligible).toEqual([]); });
  it('accepts legacy zero completion timestamps but never zero delivery dates', () => { expect(planAcknowledgements([{ ...base, completed_at: '0000-00-00 00:00:00' }], '2026-11-01').eligible).toHaveLength(1); });
  it('changes the digest when target data changes', () => { expect(planAcknowledgements([base], '2026-11-01').digest).not.toBe(planAcknowledgements([{ ...base, delivered_at: '2026-10-30 12:00:00' }], '2026-11-01').digest); });
  it.each(['2026-11-02', '2026-13-01', ''])('rejects ambiguous cutoff %s', date => { expect(() => validateCutoff(date)).toThrow(); });
});
