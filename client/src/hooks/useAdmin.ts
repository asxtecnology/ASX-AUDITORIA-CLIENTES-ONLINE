import { trpc } from "@/lib/trpc";

/**
 * Hook para verificar se o usuário logado é admin.
 * Retorna { isAdmin, isLoading }.
 */
export function useAdmin() {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    isAdmin: user?.role === "admin",
    isLoading,
  };
}
