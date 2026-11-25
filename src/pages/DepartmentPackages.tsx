import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DepartmentGate } from "@/components/departments/DepartmentGate";
import {
  packageStatus,
  PACKAGE_SCAN_ROLES,
} from "@contracts/department-packages";
import { toast } from "sonner";
function Workspace() {
  const { user, isSuperAdmin } = useAuth();
  const nav = useNavigate();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [branch, setBranch] = useState(""),
    [description, setDescription] = useState(""),
    [count, setCount] = useState(1);
  const context = trpc.department.context.useQuery(undefined, { retry: false });
  const list = trpc.department.list.useQuery({ search, page });
  const branches = trpc.branch.list.useQuery();
  const create = trpc.department.create.useMutation({
    retry: false,
    onError: e => toast.error(e.message),
    onSuccess: r => {
      void utils.department.invalidate();
      nav(`/department-packages/${r.requestId}?labels=1`);
    },
  });
  return (
    <div className="management-page space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">DEPARTMENT PACKAGES</p>
          <h1 className="management-title">
            {context.data?.department
              ? `${context.data.department.name} packages`
              : "Department handovers"}
          </h1>
          <p>
            {user?.role === "department_staff"
              ? "Only your department’s package transactions are shown."
              : "Labels, logistics-office receipt and receiving-branch acknowledgement."}
          </p>
        </div>
        <div className="flex gap-2">
          {PACKAGE_SCAN_ROLES.some(r => r === user?.role) && (
            <Button asChild variant="outline">
              <Link to="/scan">Scan package</Link>
            </Button>
          )}
          {isSuperAdmin && (
            <Button asChild variant="outline">
              <Link to="/department-packages/access">Staff access</Link>
            </Button>
          )}
        </div>
      </header>
      {context.error && (
        <p role="alert" className="text-red-700">
          {context.error.message}
        </p>
      )}
      {user?.role === "department_staff" && (
        <form
          className="ops-panel p-5 space-y-4"
          onSubmit={e => {
            e.preventDefault();
            create.mutate({
              destBranchId: Number(branch),
              description,
              packageCount: count,
            });
          }}
        >
          <h2 className="text-xl font-semibold">What are you sending?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="package-branch">Receiving branch</Label>
              <select
                className="ops-select w-full"
                id="package-branch"
                required
                value={branch}
                onChange={e => setBranch(e.target.value)}
              >
                <option value="">Select a branch</option>
                {branches.data?.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="package-count">Number of physical packages</Label>
              <Input
                id="package-count"
                type="number"
                min={1}
                max={20}
                step={1}
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="package-description">Short description</Label>
            <Input
              id="package-description"
              maxLength={200}
              minLength={2}
              required
              placeholder="e.g. Confidential HR envelope"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <p className="text-sm text-ink-soft">
            Print one label per package, then hand the labelled items to the
            logistics office. Keep confidential contents out of the description.
          </p>
          {branches.error && (
            <p role="alert">
              Could not load branches.{" "}
              <button type="button" onClick={() => void branches.refetch()}>
                Retry
              </button>
            </p>
          )}
          <Button
            className="bg-navy"
            disabled={
              create.isPending ||
              !branch ||
              !context.data?.department ||
              branches.isLoading ||
              !!branches.error
            }
          >
            {create.isPending ? "Saving…" : "Save & view labels"}
          </Button>
        </form>
      )}
      <div>
        <Label htmlFor="package-search">Search package descriptions</Label>
        <Input
          id="package-search"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {list.isLoading ? (
        <p role="status">Loading packages…</p>
      ) : list.error ? (
        <p role="alert">
          {list.error.message}{" "}
          <Button variant="outline" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </p>
      ) : !list.data?.length ? (
        <div className="ops-panel p-6">No matching department packages.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map(r => (
            <Link
              key={r.id}
              to={`/department-packages/${r.id}`}
              className="ops-panel p-5 block space-y-3 hover:border-navy"
            >
              <div className="flex justify-between">
                <strong>
                  DP-{r.id} · {r.department}
                </strong>
                {r.cancelledAt && <span>Cancelled</span>}
              </div>
              <h2 className="text-lg font-semibold">{r.description}</h2>
              <p>
                {r.branch} · {r.packages.length} packages
              </p>
              <p className="text-sm">
                {r.packages.filter(p => p.receivedOfficeAt).length} received at
                logistics · {r.packages.filter(p => p.shipmentId).length}{" "}
                included · {r.packages.filter(p => p.receivedBranchAt).length}{" "}
                received by branch
              </p>
              <ul className="text-sm space-y-1">
                {r.packages.map(p => (
                  <li key={p.id}>
                    Package {p.packageNumber}:{" "}
                    {r.cancelledAt ? "Cancelled" : packageStatus(p)}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      )}
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="outline"
          disabled={(list.data?.length ?? 0) < 30}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      <p className="text-sm text-ink-soft">
        Package counts are separate from stock quantities. Selection records the
        shipment creator’s choice; no warehouse packing confirmation is assumed.
      </p>
    </div>
  );
}
export default function DepartmentPackages() {
  return (
    <DepartmentGate>
      <Workspace />
    </DepartmentGate>
  );
}
