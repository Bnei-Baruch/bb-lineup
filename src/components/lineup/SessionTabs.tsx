import Link from "next/link";

interface SessionTabsProps {
  weekStart: string;
  dow: number;
  sessions: { sessionIndex: number; sessionLabel: string | null }[];
  currentIndex: number;
}

export function SessionTabs({ weekStart, dow, sessions, currentIndex }: SessionTabsProps) {
  if (sessions.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 print:hidden">
      {sessions.map((s) => {
        const isActive = s.sessionIndex === currentIndex;
        const label = s.sessionLabel ?? `שיעור ${s.sessionIndex + 1}`;
        const href = s.sessionIndex === 0
          ? `/lineup/${weekStart}/day/${dow}`
          : `/lineup/${weekStart}/day/${dow}/${s.sessionIndex}`;

        if (isActive) {
          return (
            <span key={s.sessionIndex} className="px-3 py-1 rounded-md text-sm font-semibold bg-primary text-primary-foreground">
              {label}
            </span>
          );
        }
        return (
          <Link
            key={s.sessionIndex}
            href={href}
            className="px-3 py-1 rounded-md text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
