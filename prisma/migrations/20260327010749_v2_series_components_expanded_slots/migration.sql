-- AlterTable
ALTER TABLE "LineupDay" ADD COLUMN "broadcastStartTime" TEXT;

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "currentArticleRef" TEXT,
    "currentLessonRef" TEXT,
    "currentPage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SeriesProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "articleRef" TEXT,
    "lessonRef" TEXT,
    "pageRef" TEXT,
    "notes" TEXT,
    CONSTRAINT "SeriesProgress_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeriesProgress_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "LineupDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LineupComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slotType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultLabel" TEXT,
    "defaultDurationMin" INTEGER,
    "defaultNarratorScript" TEXT,
    "defaultTransitionType" TEXT,
    "defaultMediaCode" TEXT,
    "defaultLanguage" TEXT,
    "defaultHasSubtitles" BOOLEAN NOT NULL DEFAULT false,
    "defaultHasWorkshopQuestions" BOOLEAN NOT NULL DEFAULT false,
    "defaultNotes" TEXT,
    "defaultPartNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "approvalDate" DATETIME,
    "recordingDate" DATETIME,
    "kmUid" TEXT,
    "kmPageLink" TEXT,
    "sourceRef" TEXT,
    "videoLink" TEXT,
    "transcriptionLink" TEXT,
    "videoDurationMin" INTEGER,
    "narratorName" TEXT,
    "articleSourceRef" TEXT,
    "articleSourceId" TEXT,
    "articleSourceLink" TEXT,
    "articleWordCount" INTEGER,
    "articleReadingMin" INTEGER,
    "totalTimeMin" INTEGER,
    "initialNotes" TEXT,
    "openingStatement" TEXT,
    "closingStatement" TEXT,
    "tags" TEXT,
    "seriesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lesson_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lesson" ("approvalDate", "approvalStatus", "articleReadingMin", "articleSourceId", "articleSourceLink", "articleSourceRef", "articleWordCount", "closingStatement", "createdAt", "id", "initialNotes", "kmPageLink", "kmUid", "narratorName", "openingStatement", "recordingDate", "sourceRef", "tags", "totalTimeMin", "transcriptionLink", "updatedAt", "videoDurationMin", "videoLink") SELECT "approvalDate", "approvalStatus", "articleReadingMin", "articleSourceId", "articleSourceLink", "articleSourceRef", "articleWordCount", "closingStatement", "createdAt", "id", "initialNotes", "kmPageLink", "kmUid", "narratorName", "openingStatement", "recordingDate", "sourceRef", "tags", "totalTimeMin", "transcriptionLink", "updatedAt", "videoDurationMin", "videoLink" FROM "Lesson";
DROP TABLE "Lesson";
ALTER TABLE "new_Lesson" RENAME TO "Lesson";
CREATE UNIQUE INDEX "Lesson_kmUid_key" ON "Lesson"("kmUid");
CREATE TABLE "new_LineupSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "slotType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "durationMin" INTEGER,
    "lessonId" TEXT,
    "partNumber" INTEGER,
    "narratorScript" TEXT,
    "transitionType" TEXT,
    "studyMaterialLink" TEXT,
    "mediaCode" TEXT,
    "recordedLessonLink" TEXT,
    "startTimecode" TEXT,
    "endTimecode" TEXT,
    "openingWords" TEXT,
    "closingWords" TEXT,
    "hasSubtitles" BOOLEAN NOT NULL DEFAULT false,
    "hasWorkshopQuestions" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT,
    "chevrutaPartners" TEXT,
    "groupLeader" TEXT,
    "contactPerson" TEXT,
    "holidayTag" TEXT,
    "notes" TEXT,
    "componentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LineupSlot_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "LineupDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LineupSlot_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LineupSlot_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "LineupComponent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LineupSlot" ("chevrutaPartners", "createdAt", "dayId", "durationMin", "holidayTag", "id", "label", "lessonId", "notes", "slotType", "sortOrder", "updatedAt") SELECT "chevrutaPartners", "createdAt", "dayId", "durationMin", "holidayTag", "id", "label", "lessonId", "notes", "slotType", "sortOrder", "updatedAt" FROM "LineupSlot";
DROP TABLE "LineupSlot";
ALTER TABLE "new_LineupSlot" RENAME TO "LineupSlot";
CREATE INDEX "LineupSlot_dayId_sortOrder_idx" ON "LineupSlot"("dayId", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Series_name_key" ON "Series"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesProgress_seriesId_dayId_key" ON "SeriesProgress"("seriesId", "dayId");

-- CreateIndex
CREATE UNIQUE INDEX "LineupComponent_name_key" ON "LineupComponent"("name");
