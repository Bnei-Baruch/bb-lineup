"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { currentWeekParam } from "@/lib/dates";
import { cn } from "@/lib/utils";

const links = [
  { href: () => `/lineup/${currentWeekParam()}`, label: "לוח שבועי" },
  { href: () => "/library", label: "ספרייה" },
  { href: () => "/components-page", label: "רכיבים" },
  { href: () => "/settings/lineup-rules", label: "תבניות AI" },
  { href: () => "/settings/week-templates", label: "תבניות שבוע" },
];

// Broadcast day-view pages (not their /edit siblings) render full-screen, no nav chrome.
const BROADCAST_VIEW = /^\/lineup\/[^/]+\/day\/[^/]+(\/(?!edit$)[^/]+)?$/;

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (BROADCAST_VIEW.test(pathname)) return null;

  const isLineupsListActive = pathname === "/lineup";
  const roles = session?.user?.roles ?? [];
  const isAdmin = roles.includes("lineup_admin");
  const visibleLinks = isAdmin ? links : links.filter((l) => l.label === "לוח שבועי");

  return (
    <nav className="border-b border-border bg-card sticky top-0 z-50">
      <div className="flex items-center gap-1 px-4 h-12">
        <Link
          href="/lineup"
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-bold me-4 transition-colors",
            isLineupsListActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          תוכנית
        </Link>
        {visibleLinks.map(({ href, label }) => {
          const to = href();
          const active =
            to.startsWith("/lineup") ? (pathname.startsWith("/lineup") && !isLineupsListActive) :
            pathname.startsWith(to);
          return (
            <Link
              key={label}
              href={to}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {label}
            </Link>
          );
        })}
        {session?.user && (
          <div className="ms-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span>{session.user.name ?? session.user.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="px-2 py-1 rounded-md hover:bg-accent hover:text-foreground transition-colors"
            >
              התנתק
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
