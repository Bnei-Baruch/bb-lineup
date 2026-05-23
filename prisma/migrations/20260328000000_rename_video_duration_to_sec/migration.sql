-- Rename videoDurationMin to videoDurationSec and convert existing values (minutes → seconds)
ALTER TABLE "Lesson" ADD COLUMN "videoDurationSec" INTEGER;
UPDATE "Lesson" SET "videoDurationSec" = "videoDurationMin" * 60 WHERE "videoDurationMin" IS NOT NULL;
ALTER TABLE "Lesson" DROP COLUMN "videoDurationMin";
