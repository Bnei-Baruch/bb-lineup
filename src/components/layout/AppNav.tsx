"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentWeekParam } from "@/lib/dates";
import { cn } from "@/lib/utils";

const links = [
  { href: () => `/lineup/${currentWeekParam()}`, label: "לוח שבועי" },
  { href: () => "/library", label: "ספרייה" },
  { href: () => "/components-page", label: "רכיבים" },
  { href: () => "/settings/lineup-rules", label: "תבניות AI" },
  { href: () => "/settings/week-templates", label: "תבניות שבוע" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-card sticky top-0 z-50">
      <div className="flex items-center gap-1 px-4 h-12">
        <span className="font-bold text-sm me-4 text-muted-foreground">תוכנית</span>
        {links.map(({ href, label }) => {
          const to = href();
          const active =
            to.startsWith("/lineup") ? pathname.startsWith("/lineup") :
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
      </div>
    </nav>
  );
}
