import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PACKAGE_CREATE_SHIPMENT_ROLES } from "@contracts/department-packages";
import { Link } from "react-router";
export function ShipmentPackages({
  shipmentId,
  destinationId,
}: {
  shipmentId: number;
  destinationId: number;
}) {
  const { user } = useAuth();
  const status = trpc.department.status.useQuery();
  const query = trpc.department.forShipment.useQuery(
    { shipmentId },
    {
      enabled: status.data?.ready === true && user?.role !== "department_staff",
    }
  );
  const utils = trpc.useUtils();
  const remove = trpc.department.removeFromShipment.useMutation({
    onSuccess: () => {
      void utils.department.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const ack = trpc.department.acknowledge.useMutation({
    onSuccess: () => {
      void utils.department.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  if (!status.data?.ready) return null;
  if (query.error)
    return (
      <p role="alert">
        Department packages could not be loaded.{" "}
        <button className="underline" onClick={() => void query.refetch()}>
          Retry
        </button>
      </p>
    );
  if (!query.data?.length) return null;
  return (
    <section className="ops-panel p-5 space-y-3">
      <h2 className="text-xl font-semibold">Also included in this shipment</h2>
      <p className="text-sm">
        Department packages are separate from stock quantities and the main
        shipment acknowledgement.
      </p>
      {query.data.map(p => (
        <article key={p.id} className="border-t py-3 space-y-2">
          <strong>
            {p.department} · {p.description}
          </strong>
          <p>
            DP-{p.requestId} · Package {p.packageNumber}
          </p>
          <Link
            className="underline text-sm"
            to={`/department-packages/${p.requestId}`}
          >
            Package details
          </Link>
          {p.receivedBranchAt ? (
            <p className="text-green-800">Package received by branch</p>
          ) : user?.role === "branch_manager" &&
            user.branchId === destinationId ? (
            <Button
              disabled={ack.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Confirm this individual department package physically arrived?"
                  )
                )
                  ack.mutate({ packageId: p.id });
              }}
            >
              Confirm package received
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">Awaiting receiving branch confirmation</p>
              {PACKAGE_CREATE_SHIPMENT_ROLES.some(r => r === user?.role) && (
                <Button
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this department package from the shipment? This is allowed only before assignment or dispatch."
                      )
                    )
                      remove.mutate({ packageId: p.id, shipmentId });
                  }}
                >
                  Remove before dispatch
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
