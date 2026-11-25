import type { ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function DepartmentGate({ children }: { children: ReactNode }) {
  const { isSuperAdmin } = useAuth();
  const status = trpc.department.status.useQuery();
  const utils = trpc.useUtils();
  const enable = trpc.department.enable.useMutation({
    onSuccess: () => {
      void utils.department.invalidate();
      toast.success("Department packages enabled.");
    },
    onError: e => toast.error(e.message),
  });
  if (status.isLoading)
    return <p role="status">Loading department workspace…</p>;
  if (status.error)
    return (
      <div role="alert">
        <p>{status.error.message}</p>
        <Button onClick={() => void status.refetch()}>Retry</Button>
      </div>
    );
  if (!status.data?.ready)
    return (
      <section className="ops-panel p-6 space-y-4">
        <h2 className="text-xl font-semibold">Department packages</h2>
        <p>
          Prepare department labels, receive them at the logistics office, and
          include them in branch shipments. Warehouse has no required marking
          step.
        </p>
        {isSuperAdmin ? (
          <>
            <p>
              Enable the new tables and department staff role once. Existing
              shipments and staff assignments are kept.
            </p>
            <Button disabled={enable.isPending} onClick={() => enable.mutate()}>
              {enable.isPending ? "Enabling…" : "Enable department packages"}
            </Button>
          </>
        ) : (
          <p>Ask Super Admin to enable department packages.</p>
        )}
      </section>
    );
  return children;
}
