import type { ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { FolderLock, Loader2 } from "lucide-react";
import { toast } from "sonner";
export function OperationsGate({ children }: { children: ReactNode }) {
  const { isSuperAdmin } = useAuth();
  const status = trpc.operations.status.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });
  const utils = trpc.useUtils();
  const enable = trpc.operations.enable.useMutation({
    retry: false,
    onSuccess: async () => {
      await utils.operations.status.invalidate();
      toast.success("Documents and branch transfers are ready.");
    },
    onError: error => toast.error(error.message),
  });
  if (status.isLoading)
    return (
      <div className="ops-empty" role="status">
        <Loader2 className="animate-spin" size={22} /> Loading workspace…
      </div>
    );
  if (status.error)
    return (
      <div className="ops-empty" role="alert">
        <p>Could not check this workspace.</p>
        <Button variant="outline" onClick={() => void status.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (status.data?.ready) return <>{children}</>;
  return (
    <section className="ops-empty ops-setup">
      <FolderLock size={34} />
      <h2>Ready for the next handover</h2>
      <p>
        Documents and branch transfers need a one-time setup. Existing shipment
        records stay as they are.
      </p>
      {isSuperAdmin ? (
        <Button
          className="bg-navy"
          disabled={enable.isPending}
          onClick={() => enable.mutate()}
        >
          {enable.isPending ? "Setting up…" : "Enable documents and transfers"}
        </Button>
      ) : (
        <div>
          <p>Ask Super Admin to enable this workspace.</p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
          >
            Check again
          </Button>
        </div>
      )}
    </section>
  );
}
