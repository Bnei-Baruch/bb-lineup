"use client";

import { useAuth } from "@/components/providers/KeycloakProvider";

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : null;
}
