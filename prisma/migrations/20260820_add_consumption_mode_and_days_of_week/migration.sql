-- Series.consumptionMode: "continuous" (strict in-order playback, e.g. TES) vs
-- "pickable" (search unused lessons for the best duration fit, e.g. Rabash).
ALTER TABLE "Series" ADD COLUMN "consumptionMode" TEXT NOT NULL DEFAULT 'pickable';

-- LineupRuleSet.daysOfWeek: JSON int array (0=Sun..6=Sat) of which day(s) this
-- rule set applies to, replacing free-text-name guessing for apply-week.
ALTER TABLE "LineupRuleSet" ADD COLUMN "daysOfWeek" TEXT;
