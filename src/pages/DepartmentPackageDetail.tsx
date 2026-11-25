import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import QRCode from "qrcode";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DepartmentGate } from "@/components/departments/DepartmentGate";
import {
  packageStatus,
  PACKAGE_SCAN_ROLES,
  PACKAGE_QR_PREFIX,
} from "@contracts/department-packages";
import { toast } from "sonner";
import "@/components/departments/packages.css";
function Detail() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const highlight = Number(params.get("package"));
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const printable = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState(params.get("labels") === "1");
  const [qrs, setQrs] = useState<Record<number, string>>({});
  const [qrError, setQrError] = useState(false);
  const query = trpc.department.detail.useQuery(
    { requestId: id },
    { enabled: Number.isSafeInteger(id) && id > 0, retry: false }
  );
  const changed = () => {
    void utils.department.invalidate();
  };
  const office = trpc.department.receiveOffice.useMutation({
    onSuccess: changed,
    onError: e => toast.error(e.message),
  });
  const ack = trpc.department.acknowledge.useMutation({
    onSuccess: changed,
    onError: e => toast.error(e.message),
  });
  const cancel = trpc.department.cancel.useMutation({
    onSuccess: changed,
    onError: e => toast.error(e.message),
  });
  useEffect(() => {
    let active = true;
    setQrError(false);
    if (!query.data) return;
    void Promise.all(
      query.data.packages.map(
        async p =>
          [
            p.id,
            await QRCode.toDataURL(PACKAGE_QR_PREFIX + p.token, {
              width: 256,
              margin: 4,
            }),
          ] as const
      )
    )
      .then(rows => {
        if (active) setQrs(Object.fromEntries(rows));
      })
      .catch(() => {
        if (active) setQrError(true);
      });
    return () => {
      active = false;
    };
  }, [query.data]);
  if (!Number.isSafeInteger(id) || id <= 0)
    return <p>Invalid package request.</p>;
  if (query.isLoading) return <p role="status">Loading package details…</p>;
  if (query.error || !query.data)
    return (
      <p role="alert">
        {query.error?.message ?? "Not found"}{" "}
        <Button onClick={() => void query.refetch()}>Retry</Button>
      </p>
    );
  const r = query.data;
  async function print() {
    if (!printable.current) return;
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Allow the print window to open, then try again.");
      return;
    }
    win.document.write(
      "<!doctype html><html><head><title>KEDI department package labels</title><style>@page{size:A4;margin:12mm}body{font:16px Arial;color:#14294d;margin:0}.department-label{box-sizing:border-box;break-inside:avoid;height:124mm;margin-bottom:7mm;padding:8mm;border:1px solid #738294;border-radius:3mm}.department-label:nth-child(2n){break-after:page}.department-label:last-child{break-after:auto}header{display:flex;align-items:center;justify-content:space-between}.department-label-logo{width:28mm}.department-label-qr{width:35mm;height:35mm;float:right}h2{font-size:28px}footer{clear:both;padding-top:8mm;font-size:13px}p{overflow-wrap:anywhere}</style></head><body></body></html>"
    );
    win.document.body.append(win.document.importNode(printable.current, true));
    win.document.close();
    try {
      await Promise.all([...win.document.images].map(img => img.decode()));
      win.focus();
      win.print();
    } catch {
      toast.error(
        "A label image could not load. Close the print window and retry."
      );
    }
  }
  return (
    <div className="management-page space-y-5">
      <Link to="/department-packages" className="underline">
        Department packages
      </Link>
      <header>
        <p className="text-sm">
          DP-{r.id} · {r.department}
        </p>
        <h1 className="management-title">{r.description}</h1>
        <p>
          {r.branch} · {r.packages.length} packages
          {r.cancelledAt ? " · Cancelled" : ""}
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setLabels(!labels)}>
          {labels ? "Hide labels" : "View / print labels"}
        </Button>
        {user?.role === "department_staff" &&
          user.id === r.createdBy &&
          !r.cancelledAt &&
          r.packages.every(p => !p.receivedOfficeAt && !p.shipmentId) && (
            <Button
              variant="outline"
              disabled={cancel.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Cancel this package request? Its labels will no longer be valid for receipt or inclusion."
                  )
                )
                  cancel.mutate({ requestId: id });
              }}
            >
              Cancel request
            </Button>
          )}
      </div>
      {!r.cancelledAt &&
        ["super_admin", "admin", "logistics_officer"].includes(
          user?.role ?? ""
        ) &&
        r.packages.every(p => !p.shipmentId && !p.receivedBranchAt) && (
          <Button
            variant="outline"
            disabled={cancel.isPending}
            onClick={() => {
              const reason = window.prompt(
                "Return or cancel this request. Give a reason (at least 5 characters); the history is kept."
              );
              if (reason) cancel.mutate({ requestId: id, reason });
            }}
          >
            Return / cancel request
          </Button>
        )}
      {labels && (
        <section className="ops-panel p-5 space-y-4">
          <h2 className="text-xl font-semibold">
            One label per physical package
          </h2>
          <p>
            Reprinting uses the same references. Printing is not confirmation of
            receipt.
          </p>
          {qrError && (
            <p role="alert">
              Could not generate the QR labels. Reload this page and retry.
            </p>
          )}
          <Button
            disabled={
              !!r.cancelledAt || qrError || r.packages.some(p => !qrs[p.id])
            }
            onClick={() => void print()}
          >
            Print all labels · A4
          </Button>
          <div ref={printable} className="department-label-grid">
            {r.packages.map(p => (
              <article className="department-label" key={p.id}>
                <header>
                  <img
                    src="/kedi-logo.png"
                    alt="KEDI Healthcare"
                    className="department-label-logo"
                  />
                  <strong>
                    DP-{r.id} / {p.packageNumber}
                  </strong>
                </header>
                <h2>{r.branch}</h2>
                {qrs[p.id] && (
                  <img
                    className="department-label-qr"
                    src={qrs[p.id]}
                    alt={`QR label for package ${p.packageNumber}`}
                  />
                )}
                <p>From {r.department}</p>
                <p>
                  <strong>{r.description}</strong>
                </p>
                <p>
                  Package {p.packageNumber} of {r.packages.length}
                </p>
                <footer>
                  Department package · To accompany a branch shipment
                  <br />
                  Office receipt and branch acknowledgement are recorded
                  separately.
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="grid gap-4 lg:grid-cols-2">
        {r.packages.map(p => (
          <article
            key={p.id}
            className={`ops-panel p-5 space-y-3 ${p.id === highlight ? "ring-2 ring-blue-600" : ""}`}
          >
            <h2 className="text-lg font-semibold">
              Package {p.packageNumber} of {r.packages.length}
            </h2>
            <strong>{r.cancelledAt ? "Cancelled" : packageStatus(p)}</strong>
            <p className="text-sm">
              Logistics office:{" "}
              {p.receivedOfficeAt
                ? new Date(p.receivedOfficeAt).toLocaleString()
                : "Awaiting receipt"}
            </p>
            <p className="text-sm">
              Shipment:{" "}
              {p.shipmentId
                ? p.trackingId || `Shipment #${p.shipmentId}`
                : "Awaiting inclusion"}
            </p>
            <p className="text-sm">
              Branch:{" "}
              {p.receivedBranchAt
                ? new Date(p.receivedBranchAt).toLocaleString()
                : "Awaiting package acknowledgement"}
            </p>
            {!r.cancelledAt &&
              !p.receivedOfficeAt &&
              !p.shipmentId &&
              PACKAGE_SCAN_ROLES.some(role => role === user?.role) && (
                <Button
                  disabled={office.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Confirm this package was physically received at the logistics office?"
                      )
                    )
                      office.mutate({ packageId: p.id });
                  }}
                >
                  Confirm logistics-office receipt
                </Button>
              )}
            {p.shipmentId &&
              !p.receivedBranchAt &&
              user?.role === "branch_manager" &&
              user.branchId === r.destBranchId && (
                <Button
                  disabled={ack.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Confirm this individual department package physically arrived? This does not acknowledge the main shipment."
                      )
                    )
                      ack.mutate({ packageId: p.id });
                  }}
                >
                  Confirm package received
                </Button>
              )}
          </article>
        ))}
      </section>
      <section className="ops-panel p-5">
        <h2 className="text-xl font-semibold mb-3">Package activity</h2>
        <ol className="space-y-3">
          {r.history.map(e => (
            <li key={e.id} className="border-b pb-3">
              <strong>
                {(
                  {
                    submitted: "Submitted",
                    received_office: "Received at logistics office",
                    included: "Included in shipment",
                    received_branch: "Received by branch",
                    released: "Returned to waiting",
                    cancelled: "Request cancelled",
                  } as Record<string, string>
                )[e.action] ?? e.action}
              </strong>
              <p className="text-sm">
                Package{" "}
                {r.packages.find(p => p.id === e.packageId)?.packageNumber} ·{" "}
                {e.actor ?? "Former staff member"} ·{" "}
                {new Date(e.at).toLocaleString()}
              </p>
              {e.note && <p className="text-sm">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>
      <p className="text-sm text-ink-soft">
        Warehouse has no required scanning or marking step. Shipment inclusion
        records the creator’s selection, not a separate packing verification.
      </p>
    </div>
  );
}
export default function DepartmentPackageDetail() {
  return (
    <DepartmentGate>
      <Detail />
    </DepartmentGate>
  );
}
