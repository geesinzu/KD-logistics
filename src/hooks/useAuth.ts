import { trpc } from "@/providers/trpc";
import { useCallback, useMemo } from "react";

export function useAuth() {
  const utils = trpc.useUtils();

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      localStorage.removeItem("kedi_token");
      await utils.invalidate();
      window.location.href = "/login";
    },
  });

  const logout = useCallback(() => {
    localStorage.removeItem("kedi_token");
    logoutMutation.mutate();
    window.location.href = "/login";
  }, [logoutMutation]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: isLoading || logoutMutation.isPending,
      isAdmin: user?.role === "super_admin" || user?.role === "admin",
      isSuperAdmin: user?.role === "super_admin",
      role: user?.role || null,
      error,
      logout,
      refresh: refetch,
    }),
    [user, isLoading, logoutMutation.isPending, error, logout, refetch],
  );
}
