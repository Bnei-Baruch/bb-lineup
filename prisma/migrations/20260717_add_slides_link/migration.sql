-- Add slides link fields: a per-component default and a per-slot override,
-- mirroring the existing lineupLink / defaultLineupLink pair.
ALTER TABLE "LineupComponent" ADD COLUMN "defaultSlidesLink" TEXT;
ALTER TABLE "LineupSlot" ADD COLUMN "slidesLink" TEXT;
