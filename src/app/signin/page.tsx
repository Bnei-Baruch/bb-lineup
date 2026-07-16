"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/lineup";
  const error = searchParams.get("error");

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold">בונה תוכנית שבועית</h1>
      <p className="text-muted-foreground">יש להתחבר כדי להמשיך</p>
      {error && (
        <p className="text-sm text-destructive">
          אין לך הרשאה מתאימה לצפייה בעמוד זה.
        </p>
      )}
      <Button onClick={() => signIn("keycloak", { callbackUrl })}>
        התחברות
      </Button>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <SignInContent />
      </Suspense>
    </div>
  );
}
