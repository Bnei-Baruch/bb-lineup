-- LineupSlot: durationMin → durationSec
ALTER TABLE "LineupSlot" ADD COLUMN "durationSec" INTEGER;
UPDATE "LineupSlot" SET "durationSec" = "durationMin" * 60 WHERE "durationMin" IS NOT NULL;
ALTER TABLE "LineupSlot" DROP COLUMN "durationMin";

-- LineupComponent: defaultDurationMin → defaultDurationSec
ALTER TABLE "LineupComponent" ADD COLUMN "defaultDurationSec" INTEGER;
UPDATE "LineupComponent" SET "defaultDurationSec" = "defaultDurationMin" * 60 WHERE "defaultDurationMin" IS NOT NULL;
ALTER TABLE "LineupComponent" DROP COLUMN "defaultDurationMin";
