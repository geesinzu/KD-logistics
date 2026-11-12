export interface HistoricalAckRow {
  id: string | number;
  tracking_id: string | null;
  status: string;
  delivered_at: string | null;
  completed_at: string | null;
  updated_at?: string | null;
  hub_branch_id: string | number | null;
  actual_item_count: number | null;
  delivered_qty: number | null;
  remaining_qty: number | null;
}
export function validateCutoff(cutoff: string): string;
export function planAcknowledgements(rows: HistoricalAckRow[], cutoff: string, acknowledgedIds?: Set<string>): {
  cutoff: string;
  boundary: string;
  eligible: HistoricalAckRow[];
  skipped: { id: string; trackingId: string | null; reason: string }[];
  digest: string;
};
