import { trpc } from "@/providers/trpc";
export function WaitingPackages({
  branchId,
  selected,
  onChange,
}: {
  branchId: number;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const query = trpc.department.waiting.useQuery({ branchId });
  if (query.isLoading)
    return <p role="status">Checking department packages…</p>;
  if (query.error)
    return (
      <p role="alert">
        Could not check department packages.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void query.refetch()}
        >
          Retry
        </button>
      </p>
    );
  if (!query.data?.length) return null;
  return (
    <section className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
      <h2 className="font-semibold">Department packages for this branch</h2>
      <p className="text-sm">
        Tick only the packages confirmed for this shipment. Unticked packages
        remain waiting. Warehouse has no required scan or marking step.
      </p>
      {query.data.map(p => (
        <label
          className="flex items-start gap-3 bg-white rounded-lg p-3 border"
          key={p.id}
        >
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            disabled={!p.receivedOfficeAt}
            checked={selected.includes(p.id)}
            onChange={e =>
              onChange(
                e.target.checked
                  ? [...selected, p.id]
                  : selected.filter(id => id !== p.id)
              )
            }
          />
          <span>
            <strong>
              {p.department} · {p.description}
            </strong>
            <small className="block text-sm">
              DP-{p.requestId} · Package {p.packageNumber} ·{" "}
              {p.receivedOfficeAt
                ? "Received at logistics office"
                : "Awaiting logistics-office receipt"}
            </small>
          </span>
        </label>
      ))}
    </section>
  );
}
