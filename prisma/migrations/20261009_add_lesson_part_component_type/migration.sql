-- AlterTable
ALTER TABLE "LessonPart" ADD COLUMN "componentId" TEXT REFERENCES "LineupComponent" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LessonPart" ADD COLUMN "partType" TEXT;
