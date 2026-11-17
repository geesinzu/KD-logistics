import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Camera,
  Building2,
  Phone,
  Truck,
  ShieldCheck,
  X,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { TRANSFER_LABELS } from "@contracts/operations";
import type {
  TransferActionInput,
  TransportInput,
  UploadInput,
} from "@contracts/operations";
import { operationDate } from "@/lib/operationFiles";
import { OperationsGate } from "@/components/operations/OperationsGate";
import { PrivatePhoto } from "@/components/operations/PrivatePhoto";
import { FilePicker } from "@/components/operations/FilePicker";
import { TransportFields } from "@/components/operations/TransportFields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
type Transfer = inferRouterOutputs<AppRouter>["operations"]["transfer"];
type Action = TransferActionInput["action"];
const titles: Record<Action, string> = {
  approve: "Approve transfer",
  reject: "Decline this request",
  cancel: "Cancel transfer",
  dispatch: "Confirm dispatch",
  receive: "Confirm items received",
};
const eventLabels: Record<string, string> = {
  request: "Transfer requested",
  approve: "Transfer approved",
  reject: "Request declined",
  cancel: "Transfer cancelled",
  dispatch: "Sending branch confirmed dispatch",
  receive: "Receiving branch confirmed items",
};
function ActionDialog({
  transfer: t,
  action,
  close,
}: {
  transfer: Transfer;
  action: Action;
  close: () => void;
}) {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<UploadInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [clientKey] = useState(() => crypto.randomUUID());
  const [transport, setTransport] = useState<TransportInput>({
    companyName: t.companyName,
    contactName: t.contactName,
    contactPhone: t.contactPhone,
    deliveryMode: t.deliveryMode,
    pickupLocation: t.pickupLocation ?? "",
  });
  const utils = trpc.useUtils();
  const mutation = trpc.operations.updateTransfer.useMutation({
    retry: false,
    onSuccess: async () => {
      close();
      await utils.operations.invalidate();
      toast.success(
        action === "receive"
          ? "Receipt saved. The outstanding balance has been updated."
          : action === "dispatch"
            ? "Dispatch recorded. The receiving branch can now confirm arrival."
            : "Transfer updated."
      );
    },
    onError: error => {
      toast.error(error.message);
      if (error.data?.code === "CONFLICT") {
        close();
        void utils.operations.invalidate();
      }
    },
  });
  const outstanding = t.quantity - t.receivedQty,
    qty = Number(quantity),
    partial = action === "receive" && qty > 0 && qty < outstanding;
  const noteRequired = action === "reject" || action === "cancel" || partial;
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !mutation.isPending && !busy) close();
      }}
    >
      <DialogContent className="ops-action-dialog">
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
          <DialogDescription>
            {t.reference} · {t.sourceName} → {t.destinationName}
          </DialogDescription>
        </DialogHeader>
        <form
          className="ops-form"
          onSubmit={e => {
            e.preventDefault();
            if (!confirmed || busy) return;
            const base = {
              id: t.id,
              expectedVersion: t.version,
              clientKey,
              note,
            };
            const input: TransferActionInput =
              action === "receive"
                ? { ...base, action, quantity: qty, photos }
                : action === "dispatch"
                  ? { ...base, action, transport, photos }
                  : { ...base, action };
            mutation.mutate(input);
          }}
        >
          {action === "approve" && (
            <div className="ops-callout">
              <ShieldCheck size={21} />
              <p>
                You are approving{" "}
                <strong>
                  {t.quantity} {t.unit}
                </strong>{" "}
                for the receiving branch. Review the sending branch's photos and
                transport details first.
              </p>
            </div>
          )}
          {action === "dispatch" && (
            <>
              <div className="ops-callout">
                <Truck size={21} />
                <p>
                  Confirm the items have been handed to the transport company.
                  The original sending-branch photos stay with this transfer.
                </p>
              </div>
              <TransportFields
                value={transport}
                onChange={setTransport}
                disabled={mutation.isPending}
              />
              <div>
                <Label>Additional dispatch photos (optional)</Label>
                <FilePicker
                  photos
                  files={photos}
                  onChange={setPhotos}
                  onBusyChange={setBusy}
                  disabled={mutation.isPending}
                />
              </div>
            </>
          )}
          {action === "receive" && (
            <>
              <div className="ops-receipt-balance">
                <span>
                  Already received{" "}
                  <strong>
                    {t.receivedQty} {t.unit}
                  </strong>
                </span>
                <span>
                  Still outstanding{" "}
                  <strong>
                    {outstanding} {t.unit}
                  </strong>
                </span>
              </div>
              <div>
                <Label htmlFor="receipt-additional">
                  Additional {t.unit} received in this update
                </Label>
                <Input
                  id="receipt-additional"
                  required
                  type="number"
                  min={1}
                  max={outstanding}
                  step={1}
                  value={quantity}
                  disabled={mutation.isPending}
                  onChange={e => setQuantity(e.target.value)}
                />
                <p className="ops-muted">
                  Count only newly received items. Do not enter the previous
                  total again.
                </p>
              </div>
              {qty > 0 && qty <= outstanding && (
                <p
                  className={`ops-receipt-preview ${partial ? "ops-partial" : ""}`}
                  role="status"
                >
                  After this receipt:{" "}
                  <strong>
                    {t.receivedQty + qty} received · {outstanding - qty}{" "}
                    outstanding
                  </strong>
                </p>
              )}
              <div>
                <Label>Photos of items received</Label>
                <FilePicker
                  photos
                  files={photos}
                  onChange={setPhotos}
                  onBusyChange={setBusy}
                  disabled={mutation.isPending}
                />
              </div>
            </>
          )}
          <div>
            <Label htmlFor="transfer-action-note">
              {action === "reject" || action === "cancel"
                ? "Reason"
                : partial
                  ? "Outstanding items or damage"
                  : "Note (optional)"}
            </Label>
            <Textarea
              id="transfer-action-note"
              required={noteRequired}
              minLength={noteRequired ? 5 : undefined}
              maxLength={1500}
              value={note}
              disabled={mutation.isPending}
              onChange={e => setNote(e.target.value)}
              placeholder={
                partial
                  ? "Explain what is still missing or describe the issue."
                  : "Add anything the other branch needs to know."
              }
            />
          </div>
          <label className="ops-confirm">
            <input
              type="checkbox"
              required
              checked={confirmed}
              disabled={mutation.isPending}
              onChange={e => setConfirmed(e.target.checked)}
            />
            <span>
              {action === "receive"
                ? "I counted the items received and checked their condition."
                : action === "dispatch"
                  ? "I verified the items sent and the transport contact details."
                  : action === "approve"
                    ? "I reviewed this request and its item photos."
                    : "I confirm this decision and the reason given."}
            </span>
          </label>
          {mutation.error && (
            <p role="alert" className="ops-form-error">
              {mutation.error.message}
            </p>
          )}
          <div className="ops-dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || busy}
              onClick={close}
            >
              Back
            </Button>
            <Button
              type="submit"
              className={
                action === "cancel" || action === "reject"
                  ? "bg-red-700 hover:bg-red-800"
                  : "bg-navy"
              }
              disabled={
                mutation.isPending ||
                busy ||
                !confirmed ||
                (noteRequired && note.trim().length < 5) ||
                (action === "receive" &&
                  (!photos.length || qty < 1 || qty > outstanding))
              }
            >
              {mutation.isPending ? "Saving…" : titles[action]}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Detail({ id }: { id: number }) {
  const query = trpc.operations.transfer.useQuery({ id });
  const { user } = useAuth();
  const [action, setAction] = useState<Action | null>(null);
  if (query.isLoading)
    return (
      <div className="ops-empty" role="status">
        Loading transfer…
      </div>
    );
  if (query.error || !query.data)
    return (
      <div className="ops-empty ops-panel" role="alert">
        <h2>Transfer unavailable</h2>
        <p>{query.error?.message ?? "This transfer could not be found."}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
        <Link to="/transfers">Back to transfers</Link>
      </div>
    );
  const t = query.data,
    operations =
      !!user &&
      ["super_admin", "admin", "logistics_officer"].includes(user.role),
    origin =
      user?.role === "branch_manager" && user.branchId === t.sourceBranchId,
    destination =
      user?.role === "branch_manager" &&
      user.branchId === t.destinationBranchId;
  const canApprove =
      operations && user?.id !== t.requestedBy && t.status === "requested",
    canCancel =
      (operations || origin) && ["requested", "approved"].includes(t.status),
    canReceive =
      destination &&
      user?.id !== t.dispatchedBy &&
      ["dispatched", "partially_received"].includes(t.status);
  const steps = ["Requested", "Approved", "Sent", "Received"];
  const current =
    t.status === "requested"
      ? 0
      : t.status === "approved"
        ? 1
        : t.status === "received"
          ? 3
          : ["dispatched", "partially_received"].includes(t.status)
            ? 2
            : -1;
  return (
    <>
      <header className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">BRANCH HANDOVER</span>
          <h1>{t.reference}</h1>
          <p>Requested {operationDate(t.createdAt)}</p>
        </div>
        <span className={`ops-status ops-status-${t.status}`}>
          {TRANSFER_LABELS[t.status]}
        </span>
      </header>
      {current >= 0 && (
        <ol className="ops-stepper" aria-label="Transfer progress">
          {steps.map((step, index) => (
            <li
              key={step}
              className={index <= current ? "ops-step-done" : ""}
              aria-current={index === current ? "step" : undefined}
            >
              <span>
                {index < current || current === 3 ? (
                  <Check size={15} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      )}
      <div className="ops-detail-grid">
        <div className="ops-form-stack">
          <section className="ops-panel">
            <div className="ops-route ops-route-large">
              <span>
                <Building2 size={20} />
                <small>Sending branch</small>
                <strong>{t.sourceName}</strong>
              </span>
              <ArrowRight size={24} />
              <span>
                <Building2 size={20} />
                <small>Receiving branch</small>
                <strong>{t.destinationName}</strong>
              </span>
            </div>
            <div className="ops-quantity-grid">
              <div>
                <span>Transfer quantity</span>
                <strong>{t.quantity}</strong>
                <small>{t.unit}</small>
              </div>
              <div>
                <span>Received</span>
                <strong>{t.receivedQty}</strong>
                <small>{t.unit}</small>
              </div>
              <div>
                <span>Outstanding</span>
                <strong>{t.quantity - t.receivedQty}</strong>
                <small>{t.unit}</small>
              </div>
            </div>
            <h2 className="ops-detail-label">Items</h2>
            <p className="ops-preserve">{t.description}</p>
            <h2 className="ops-detail-label">Reason for transfer</h2>
            <p className="ops-preserve ops-muted">{t.reason}</p>
          </section>
          <section className="ops-panel">
            <div className="ops-section-heading">
              <h2>
                <Camera size={19} /> Item photo evidence
              </h2>
              <span className="ops-muted">KEDI staff only</span>
            </div>
            <div className="ops-evidence-group">
              <h3>Sending branch · before dispatch</h3>
              <div className="ops-photo-grid">
                {t.files
                  .filter(f => f.stage === "request")
                  .map(f => (
                    <PrivatePhoto key={f.id} file={f} />
                  ))}
              </div>
            </div>
            {t.files.some(f => f.stage === "dispatch") && (
              <div className="ops-evidence-group">
                <h3>At dispatch</h3>
                <div className="ops-photo-grid">
                  {t.files
                    .filter(f => f.stage === "dispatch")
                    .map(f => (
                      <PrivatePhoto key={f.id} file={f} />
                    ))}
                </div>
              </div>
            )}
            {t.events
              .filter(e => e.action === "receive")
              .map(event => (
                <div key={event.id} className="ops-evidence-group">
                  <h3>
                    Received +{event.quantity} {t.unit}{" "}
                    <span>{operationDate(event.createdAt)}</span>
                  </h3>
                  <div className="ops-photo-grid">
                    {t.files
                      .filter(f => f.eventId === event.id)
                      .map(f => (
                        <PrivatePhoto key={f.id} file={f} />
                      ))}
                  </div>
                </div>
              ))}
          </section>
          <section className="ops-panel">
            <div className="ops-section-heading">
              <h2>
                <Clock3 size={19} /> Handover history
              </h2>
            </div>
            <ol className="ops-timeline">
              {t.events.map(event => (
                <li key={event.id}>
                  <span className="ops-timeline-dot">
                    <Check size={13} />
                  </span>
                  <div>
                    <strong>
                      {eventLabels[event.action] ?? event.action}
                      {event.action === "receive"
                        ? ` · +${event.quantity} ${t.unit}`
                        : ""}
                    </strong>
                    <p>
                      {event.actorName} · {operationDate(event.createdAt)}
                    </p>
                    {event.note && <blockquote>{event.note}</blockquote>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="ops-form-stack">
          <section className="ops-panel ops-next-action">
            <span className="ops-eyebrow">NEXT STEP</span>
            <h2>
              {t.status === "requested"
                ? "KEDI approval"
                : t.status === "approved"
                  ? "Ready for dispatch"
                  : t.status === "received"
                    ? "Handover complete"
                    : t.status === "dispatched" ||
                        t.status === "partially_received"
                      ? "Receiving branch confirmation"
                      : "Transfer closed"}
            </h2>
            <p>
              {t.status === "requested"
                ? "A different authorised staff member reviews the request and item photos."
                : t.status === "approved"
                  ? "The sending branch confirms when the items are handed over to the transport company."
                  : t.status === "received"
                    ? "The receiving branch has confirmed the full quantity. Both branches' evidence remains in the record."
                    : t.status === "dispatched" ||
                        t.status === "partially_received"
                      ? "The receiving branch counts the items and adds photos. Partial receipts keep the balance open."
                      : "The decision and reason are recorded in the handover history."}
            </p>
            {canApprove && (
              <>
                <Button
                  className="bg-navy"
                  onClick={() => setAction("approve")}
                >
                  <ShieldCheck size={17} /> Approve transfer
                </Button>
                <Button variant="outline" onClick={() => setAction("reject")}>
                  <X size={16} /> Decline request
                </Button>
              </>
            )}
            {origin && t.status === "approved" && (
              <Button className="bg-navy" onClick={() => setAction("dispatch")}>
                <Truck size={17} /> Confirm dispatch
              </Button>
            )}
            {canReceive && (
              <Button className="bg-navy" onClick={() => setAction("receive")}>
                <CheckCircle2 size={17} /> Confirm items received
              </Button>
            )}
            {canCancel && (
              <Button
                variant="ghost"
                className="text-red-700"
                onClick={() => setAction("cancel")}
              >
                Cancel transfer
              </Button>
            )}
            {operations &&
              user?.id === t.requestedBy &&
              t.status === "requested" && (
                <p className="ops-muted">
                  You requested this transfer. Another authorised staff member
                  must approve it.
                </p>
              )}
          </section>
          <section className="ops-panel ops-transport-card">
            <span className="ops-eyebrow">TRANSPORT DETAILS</span>
            <h2>{t.companyName}</h2>
            <p>{t.contactName}</p>
            <a href={`tel:${t.contactPhone.replace(/[^+0-9]/g, "")}`}>
              <Phone size={16} />
              {t.contactPhone}
            </a>
            <span className="ops-tag">
              {t.deliveryMode === "door_to_door"
                ? "Door-to-door delivery"
                : "Branch collection"}
            </span>
            {t.deliveryMode === "pickup" && (
              <div>
                <h3>Pickup location</h3>
                <p>{t.pickupLocation}</p>
              </div>
            )}
            <p className="ops-muted">
              Transport arrangements only. This company does not update the
              transfer through the app.
            </p>
          </section>
        </aside>
      </div>
      {action && (
        <ActionDialog
          key={`${action}-${t.version}`}
          transfer={t}
          action={action}
          close={() => setAction(null)}
        />
      )}
    </>
  );
}
export default function TransferDetail() {
  const { id } = useParams();
  return (
    <div className="ops-workspace">
      <Link className="ops-back" to="/transfers">
        <ArrowLeft size={17} /> Branch transfers
      </Link>
      <OperationsGate>
        <Detail id={Number(id)} />
      </OperationsGate>
    </div>
  );
}
