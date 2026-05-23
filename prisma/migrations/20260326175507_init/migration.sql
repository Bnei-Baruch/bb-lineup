-- CreateTable
CREATE TABLE "Lesson" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lineup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LineupDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lineupId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "notes" TEXT,
    CONSTRAINT "LineupDay_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "Lineup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LineupSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "slotType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "durationMin" INTEGER,
    "lessonId" TEXT,
    "chevrutaPartners" TEXT,
    "holidayTag" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LineupSlot_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "LineupDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LineupSlot_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_kmUid_key" ON "Lesson"("kmUid");

-- CreateIndex
CREATE UNIQUE INDEX "Lineup_weekStart_key" ON "Lineup"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "LineupDay_lineupId_dayOfWeek_key" ON "LineupDay"("lineupId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "LineupSlot_dayId_sortOrder_idx" ON "LineupSlot"("dayId", "sortOrder");
