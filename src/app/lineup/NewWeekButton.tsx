"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { weekStartParam } from "@/lib/dates";
import { Plus, Loader2 } from "lucide-react";

export function NewWeekButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const weekStart = weekStartParam(new Date());
      const res = await fetch("/api/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      if (res.ok) {
        router.push(`/lineup/${weekStart}`);
        router.refresh();
      } else if (res.status === 409 || res.status === 500) {
        // Week already exists — navigate to it
        router.push(`/lineup/${weekStart}`);
      }
    });
  }

  return (
    <Button onClick={handleCreate} disabled={pending}>
      {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plus className="me-2 h-4 w-4" />}
      שבוע חדש
    </Button>
  );
}
