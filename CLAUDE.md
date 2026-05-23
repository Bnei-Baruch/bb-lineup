# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server (http://localhost:3000)
npm run build      # Production build
npm run lint       # Run ESLint
npx prisma studio  # Open Prisma DB GUI
npx prisma migrate dev --name <name>  # Create and apply a new migration
npx prisma db push # Push schema changes without a migration (dev only)
```

There is no test suite configured.

## Environment Variables

```
DATABASE_URL="file:./prisma/lineup.db"   # SQLite via LibSQL adapter
ANTHROPIC_API_KEY="sk-ant-..."           # Required for AI planning endpoint
NEXT_PUBLIC_BASE_URL="http://localhost:3000"  # Used for internal API calls
MOCK_AI=1                                # Skip Anthropic calls, use mock data
```

## Architecture

This is a **Next.js 14 App Router** application for weekly educational content scheduling. It is Hebrew-first (RTL layout, Heebo font, Hebrew labels).

### Database

SQLite via **Prisma with LibSQL adapter** (`prisma/lineup.db`). The central data model:

- **Lineup** → weekly schedule container (keyed by `weekStart` date)
- **LineupDay** → one of 7 days in a lineup
- **LineupSlot** → individual content slot in a day (has a `slotType` enum with 25+ variants)
- **Lesson** → content unit from the KabbalaMedia library (video/article)
- **Series** → ordered collection of lessons; **SeriesProgress** tracks per-day position
- **LineupComponent** → reusable slot templates (narrators, transitions, etc.)
- **LineupRuleSet** / **WeekTemplate** → AI planning constraints and day structure templates

### API Routes (`src/app/api/`)

All routes are Next.js Route Handlers. Key groups:
- `/lineup`, `/lineup/[weekStart]` — CRUD for weekly lineups
- `/days/[id]`, `/slots`, `/slots/[id]`, `/slots/reorder` — slot management; reorder does a batch position update for drag-and-drop
- `/lessons`, `/lessons/[id]` — lesson library with pagination, full-text search, bulk operations
- `/series`, `/series/[id]`, `/series/from-collection` — series management; `from-collection` bulk-imports from KabbalaMedia
- `/components`, `/components/[id]` — component template CRUD
- `/lineup-rules`, `/week-templates` — AI rule sets and day templates
- `/km/unit`, `/km/sources`, `/km/source-wordcount` — proxy to KabbalaMedia external API (`src/lib/km-client.ts`)
- `/ai/plan-week` — calls Claude API with tool-calling to generate a weekly schedule

### Shared Utilities (`src/lib/`)

- `prisma.ts` — singleton Prisma client
- `km-client.ts` — KabbalaMedia API client (fetch units, search sources, docx→HTML conversion)
- `slot-includes.ts` — shared Prisma `include`/`select` shapes for slots+lessons; always use these for consistency
- `time.ts` — duration formatting and reading-time calculation from word count
- `timecodes.ts` — timecode parsing/formatting for lesson segments
- `dates.ts` — week/date utilities (`toWeekStart`, `weekStartParam`, etc.)

### Types (`src/types/index.ts`)

Central type definitions and constants shared between client and server:
- `SlotType` enum (25 variants), `SLOT_TYPE_LABELS` (Hebrew), `SLOT_TYPE_COLORS`, `SLOT_TYPE_GROUPS`
- Composite types: `SlotWithLesson`, `DayWithSlots`, `LineupWithDays` — these mirror the Prisma include shapes in `slot-includes.ts`
- `ApprovalStatus`, `ComponentCategory`, `TransitionType`

### Frontend Component Layout

- `src/components/ui/` — primitive UI components (shadcn-style)
- `src/components/lineup/` — main scheduling UI: `DayEditor`, `SlotCard`, `SlotEditor`, `ComponentPalette`, `LessonPicker`, `SeriesLessonPalette`
- `src/components/library/` — lesson library: `LessonForm`, `LessonTable`, `StatusBadge`
- `src/components/series/` — `SeriesManager`
- `src/components/components/` — `ComponentForm`, `ComponentTable`
- `src/components/layout/` — `AppNav`

Drag-and-drop in the day editor uses `@dnd-kit`.

### AI Planning (`/api/ai/plan-week`)

Uses Anthropic Claude with tool-calling. The AI receives the current lineup state, rule sets, and available lessons/components, then calls tools to add/move/remove slots. `MOCK_AI=1` env var bypasses the API for local dev.
