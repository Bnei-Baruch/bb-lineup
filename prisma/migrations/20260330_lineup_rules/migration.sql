CREATE TABLE "LineupRuleSet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "broadcastStartTime" TEXT NOT NULL DEFAULT '02:40',
  "targetDurationSec" INTEGER,
  "hardMaxDurationSec" INTEGER,
  "splitLongLessons" BOOLEAN NOT NULL DEFAULT true,
  "maxLessonDurationSec" INTEGER,
  "dayTemplate" TEXT NOT NULL DEFAULT '[]',
  "preferredSeriesIds" TEXT,
  "extraInstructions" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "LineupRuleSet_name_key" ON "LineupRuleSet"("name");
