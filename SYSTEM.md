# BB-Lineup — System Documentation

## What Is This?

**BB-Lineup** is a weekly broadcast scheduling tool built for KabbalaMedia content teams. It lets editors build, manage, and publish daily broadcast lineups — choosing which lessons, narrations, music, transitions, and live segments air each day, in what order, for how long.

The system is Hebrew-first (RTL layout, Hebrew labels) and integrates directly with the KabbalaMedia (KabMedia) content library.

---

## Core Concepts

### Lesson
A single piece of content from the KabMedia library — either a **video lesson** or an **article**. Each lesson has:
- A source reference (`sourceRef`) and narrator name
- A video duration and/or article word count (auto-calculated to reading time)
- An **approval status**: `pending` → `approved` → `used`
- Optional tags, series membership, and links to KabMedia pages

### Slot
A single item in a day's broadcast schedule. A slot has a **type** (see below) and may link to a lesson or component. Slots have type-specific metadata: timecodes, scripts, transition styles, group info, media codes, etc.

### Slot Types
There are 20+ slot types organized into groups:

| Group | Types |
|---|---|
| **Narrator** | Announcement, Read, Lesson Preparation |
| **Live Content** | Recorded Lesson, Conversations on the Way, Article Reading, Chevruta, Group Study, Workshop, Building Spiritual Society, Study Between Friends, Management |
| **Music** | Song, Acapella, Slide Melodies |
| **Structure** | Part Header, Transition, Break, End Card, Media |

Each type has a Hebrew label, a color, and shows only the fields relevant to it in the editor.

### Series
A named curriculum thread grouping related lessons (e.g., a book series like רב"ש or תע"ס). Each series tracks progress across days — which article, lesson, and page was last covered.

### Component
A reusable slot template. Instead of filling in all slot details from scratch, an editor can drag a pre-configured component (e.g., "Opening Narrator", "Musical Interlude") into a day and get sensible defaults instantly.

### Lineup
A **week container** keyed by the Monday date of that week. It holds 7 `LineupDay` records, each with an ordered list of `LineupSlot` records.

---

## Main Sections

### 1. Lesson Library (`/library`)

The lesson library is where content is catalogued and managed before being scheduled.

**Features:**
- Browse all lessons with full metadata
- Filter by series, approval status, scheduled/broadcast/unscheduled usage, date range, duration
- Free-text search across source ref, narrator, tags, and series name
- Bulk operations: change status, assign to series, delete
- Each lesson links to its KabMedia video, article, and book page

**Lesson lifecycle:**
1. Imported from KabMedia or created manually → `pending`
2. Reviewed and cleared for broadcast → `approved`
3. Aired in a lineup → `used`

---

### 2. Week View (`/lineup/[weekStart]`)

A top-level overview of the entire week's schedule. Shows all 7 days in a grid with a condensed card per slot.

**Features:**
- Navigate between weeks with a week picker
- One-click to drill into any day's full editor
- Apply a **Week Template** to pre-fill all 7 days with a standard slot structure
- Trigger **AI planning** (see below)

---

### 3. Day Editor (`/lineup/[weekStart]/day/[dayOfWeek]/edit`)

The main working area. Editors build and refine a single day's broadcast here.

**Layout:**
- **Left panel**: Ordered list of slots with running time clock. Drag handles for reordering.
- **Right sidebar**: Two palettes —
  - **Components**: Quick-add reusable slot templates
  - **Series**: Browse lessons by series and drag them in
- **Bottom**: Total duration summary

**Workflow:**
1. Drag a component or lesson from the sidebar into the slot list
2. Click a slot to open the **Slot Editor** and fill in details
3. Reorder slots with drag-and-drop (persisted automatically)
4. Set a broadcast start time — the running clock shows wall-clock times for every slot
5. Save the day as a reusable template for future weeks

---

### 4. Slot Editor (modal dialog)

Opens when clicking any slot in the Day Editor. Shows only the fields relevant to the slot's type.

| Slot type example | Fields shown |
|---|---|
| `recorded_lesson` | Lesson picker, start/end timecodes, opening/closing words, links |
| `article_reading` | Source search (KabMedia), word count, auto-calculated duration |
| `transition` | Transition style (תע"ס / רב"ש / etc.) |
| `narrator_announcement` | Narrator script text |
| `chevruta` | Leader, contact person, partners |
| `song` / `acapella` | Media code |
| `part_header` | Part number |

Duration can be set manually or derived from the linked lesson's video length or article word count.

---

### 5. AI Planning (`/api/ai/plan-week`)

An AI assistant (Claude) can auto-generate or fill in a week's lineup. It uses:
- **LineupRuleSet**: Constraints like target duration, max lesson length, preferred series, and a slot-by-slot day template
- Current lesson library and component library
- The existing partial lineup state

The AI calls tools to add, move, and remove slots until the schedule meets the rule set. Set `MOCK_AI=1` in the environment to skip the Anthropic API and use test data.

---

## Data Model (simplified)

```
Lineup (week)
  └── LineupDay (×7, one per day)
        ├── LineupSlot (×N, ordered)
        │     ├── → Lesson (optional)
        │     └── → LineupComponent (optional)
        └── SeriesProgress (×series, progress snapshot)

Lesson
  ├── → Series (optional grouping)
  └── → ArticleSource (cached KabMedia source)

LineupRuleSet  — AI planning constraints
WeekTemplate   — reusable day-structure templates
LineupComponent — reusable slot defaults
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | SQLite via Prisma + LibSQL adapter |
| UI | Tailwind CSS, shadcn-style components |
| Drag & Drop | dnd-kit |
| AI | Anthropic Claude (tool-calling) |
| External API | KabbalaMedia API (lesson search, sources, word counts) |

---

## Key Files

| Path | Purpose |
|---|---|
| `prisma/schema.prisma` | Full database schema |
| `src/types/index.ts` | All TypeScript types, slot type enums, Hebrew labels, colors |
| `src/lib/slot-includes.ts` | Shared Prisma query shapes for slots |
| `src/lib/km-client.ts` | KabMedia API client |
| `src/lib/time.ts` | Duration formatting utilities |
| `src/app/api/` | All backend route handlers |
| `src/components/lineup/DayEditor.tsx` | Main day scheduling UI |
| `src/components/lineup/SlotEditor.tsx` | Slot detail editor dialog |
| `src/components/library/LessonTable.tsx` | Filterable lesson library table |

---

## Environment Variables

```env
DATABASE_URL="file:./prisma/lineup.db"     # SQLite database location
ANTHROPIC_API_KEY="sk-ant-..."             # Required for AI planning
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
MOCK_AI=1                                  # Skip AI calls (dev mode)
```

## Running the App

```bash
npm run dev        # Start dev server → http://localhost:3000
npm run build      # Production build
npx prisma studio  # Open DB GUI
npx prisma migrate dev --name <name>  # Create a DB migration
```
