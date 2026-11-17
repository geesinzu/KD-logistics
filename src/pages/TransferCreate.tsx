import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OperationsGate } from "@/components/operations/OperationsGate";
import { FilePicker } from "@/components/operations/FilePicker";
import { TransportFields } from "@/components/operations/TransportFields";
import type { UploadInput, TransportInput } from "@contracts/operations";
import { toast } from "sonner";
function RequestForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const offices = trpc.branch.list.useQuery();
  const [source, setSource] = useState(
    user?.branchId ? String(user.branchId) : ""
  );
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("cartons");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<UploadInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [clientKey] = useState(() => crypto.randomUUID());
  const [transport, setTransport] = useState<TransportInput>({
    companyName: "",
    contactName: "",
    contactPhone: "",
    deliveryMode: "door_to_door",
    pickupLocation: "",
  });
  const request = trpc.operations.requestTransfer.useMutation({
    retry: false,
    onSuccess: async result => {
      await utils.operations.invalidate();
      toast.success(`${result.reference} sent for approval.`);
      navigate(`/transfers/${result.id}`);
    },
    onError: error => toast.error(error.message),
  });
  if (user?.role === "branch_manager" && !user.branchId)
    return (
      <div className="ops-empty ops-panel">
        Ask Super Admin to assign your branch before requesting a transfer.
      </div>
    );
  return (
    <form
      className="ops-create-grid"
      onSubmit={e => {
        e.preventDefault();
        if (busy || !confirmed) return;
        request.mutate({
          clientKey,
          sourceBranchId: Number(source),
          destinationBranchId: Number(destination),
          description,
          quantity: Number(quantity),
          unit,
          reason,
          transport,
          photos,
        });
      }}
    >
      <div className="ops-form-stack">
        <section className="ops-panel ops-form">
          <div className="ops-section-heading">
            <div>
              <span className="ops-eyebrow">01 · THE HANDOVER</span>
              <h2>What is moving?</h2>
            </div>
          </div>
          <fieldset disabled={request.isPending} className="ops-form-grid">
            <div>
              <Label htmlFor="transfer-source">Sending branch</Label>
              <select
                id="transfer-source"
                className="ops-select"
                required
                value={source}
                disabled={user?.role === "branch_manager" || offices.isLoading}
                onChange={e => {
                  setSource(e.target.value);
                  if (e.target.value === destination) setDestination("");
                }}
              >
                <option value="">Choose branch</option>
                {offices.data?.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="transfer-destination">Receiving branch</Label>
              <select
                id="transfer-destination"
                className="ops-select"
                required
                value={destination}
                disabled={offices.isLoading}
                onChange={e => setDestination(e.target.value)}
              >
                <option value="">Choose branch</option>
                {offices.data
                  ?.filter(b => String(b.id) !== source)
                  .map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="ops-span-2">
              <Label htmlFor="transfer-description">
                Items being transferred
              </Label>
              <Textarea
                id="transfer-description"
                required
                minLength={5}
                maxLength={3000}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the items clearly, including product names and packaging."
              />
            </div>
            <div>
              <Label htmlFor="transfer-quantity">Total quantity</Label>
              <Input
                id="transfer-quantity"
                required
                type="number"
                min={1}
                max={1_000_000}
                step={1}
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="transfer-unit">Counted in</Label>
              <Input
                id="transfer-unit"
                required
                minLength={2}
                maxLength={30}
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="e.g. cartons or pieces"
              />
            </div>
            <div className="ops-span-2">
              <Label htmlFor="transfer-reason">
                Why is this transfer needed?
              </Label>
              <Textarea
                id="transfer-reason"
                required
                minLength={5}
                maxLength={1500}
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
          </fieldset>
          {offices.error && (
            <p role="alert">
              Could not load branches.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void offices.refetch()}
              >
                Retry
              </button>
            </p>
          )}
        </section>
        <section className="ops-panel ops-form">
          <div className="ops-section-heading">
            <div>
              <span className="ops-eyebrow">02 · TRANSPORT</span>
              <h2>Who will carry it?</h2>
            </div>
          </div>
          <TransportFields
            value={transport}
            onChange={setTransport}
            disabled={request.isPending}
          />
        </section>
        <section className="ops-panel ops-form">
          <div className="ops-section-heading">
            <div>
              <span className="ops-eyebrow">03 · ITEM EVIDENCE</span>
              <h2>Photos from the sending branch</h2>
            </div>
          </div>
          <p className="ops-muted">
            Show the items and their condition before sending. Add at least one
            photo.
          </p>
          <FilePicker
            photos
            files={photos}
            onChange={setPhotos}
            disabled={request.isPending}
            onBusyChange={setBusy}
          />
        </section>
      </div>
      <aside className="ops-panel ops-request-summary">
        <span className="ops-eyebrow">TRANSFER SUMMARY</span>
        <div className="ops-summary-route">
          <strong>
            {offices.data?.find(b => String(b.id) === source)?.name ??
              "Sending branch"}
          </strong>
          <ArrowRight size={20} />
          <strong>
            {offices.data?.find(b => String(b.id) === destination)?.name ??
              "Receiving branch"}
          </strong>
        </div>
        <div className="ops-summary-quantity">
          <strong>{quantity || "—"}</strong>
          <span>{unit || "items"}</span>
        </div>
        <div className="ops-callout">
          <ShieldCheck size={20} />
          <p>
            Another authorised KEDI staff member will review the request. The
            sending branch confirms dispatch after approval.
          </p>
        </div>
        <label className="ops-confirm">
          <input
            type="checkbox"
            required
            checked={confirmed}
            disabled={request.isPending}
            onChange={e => setConfirmed(e.target.checked)}
          />
          <span>
            I checked the quantities, item photos and transport details.
          </span>
        </label>
        <Button
          type="submit"
          className="bg-navy w-full"
          disabled={
            request.isPending ||
            busy ||
            !confirmed ||
            !photos.length ||
            !source ||
            !destination ||
            !!offices.error
          }
        >
          {request.isPending ? "Sending request…" : "Send for approval"}
        </Button>
        <p className="ops-muted">
          The receiving branch confirms the actual quantity and adds its own
          photos.
        </p>
      </aside>
    </form>
  );
}
export default function TransferCreate() {
  return (
    <div className="ops-workspace">
      <Link className="ops-back" to="/transfers">
        <ArrowLeft size={17} /> Branch transfers
      </Link>
      <header className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">NEW BRANCH HANDOVER</span>
          <h1>Request a transfer</h1>
          <p>Give both branches a clear record of what is being sent.</p>
        </div>
      </header>
      <OperationsGate>
        <RequestForm />
      </OperationsGate>
    </div>
  );
}
