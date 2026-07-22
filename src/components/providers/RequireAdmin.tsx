"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/KeycloakProvider";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { initialized, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initialized && !isAdmin) router.replace("/lineup");
  }, [initialized, isAdmin, router]);

  if (!initialized || !isAdmin) return null;
  return <>{children}</>;
}
