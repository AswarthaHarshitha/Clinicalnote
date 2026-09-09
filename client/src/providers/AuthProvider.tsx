import { createContext, useContext, useCallback, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import { User, Organization } from "@/types";

interface MeResponse {
  user: User;
  organization: Organization | null;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  organization: Organization | null;
  role: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetch: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const res = await api.get<MeResponse>("/auth/me");
        return res.data;
      } catch (err) {
        if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
  });

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
  }, [queryClient]);

  const value: AuthContextValue = {
    user: data?.user ?? null,
    organization: data?.organization ?? null,
    role: data?.role ?? null,
    isLoading,
    isAuthenticated: Boolean(data?.user),
    refetch,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
