-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "transcriptionLinkEn" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "transcriptionLinkRu" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "transcriptionLinkEs" TEXT;

-- CreateTable
CREATE TABLE "LessonPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "startTimecode" TEXT,
    "endTimecode" TEXT,
    "broadcastDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LessonPart_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonPart_lessonId_partNumber_key" ON "LessonPart"("lessonId", "partNumber");
