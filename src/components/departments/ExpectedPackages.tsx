import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
export function ExpectedPackages() {
  const { role } = useAuth();
  const status = trpc.department.status.useQuery(undefined, {
    enabled: role === "branch_manager",
  });
  const list = trpc.department.list.useQuery(
    { search: "", page: 1 },
    { enabled: role === "branch_manager" && status.data?.ready === true }
  );
  const pending = list.data
    ?.filter(r => !r.cancelledAt && r.packages.some(p => !p.receivedBranchAt))
    .slice(0, 3);
  if (!pending?.length) return null;
  return (
    <section className="ops-panel p-5 mb-5 space-y-3">
      <h2 className="text-xl font-semibold">
        Department packages to look out for
      </h2>
      {pending.map(r => (
        <Link
          key={r.id}
          to={`/department-packages/${r.id}`}
          className="block border-t pt-2"
        >
          <strong>
            {r.department} · {r.description}
          </strong>
          <p className="text-sm">
            {r.packages.some(p => p.shipmentId)
              ? "Included in a shipment — view package references"
              : "Expected in a future shipment — not yet included"}
          </p>
        </Link>
      ))}
      <Link className="underline" to="/department-packages">
        View department package transactions
      </Link>
    </section>
  );
}
