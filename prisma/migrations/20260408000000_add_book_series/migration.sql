-- Add bookSeries column
ALTER TABLE "ArticleSource" ADD COLUMN "bookSeries" TEXT;

-- Drop unused pageVol1/2/3 columns (SQLite: recreate table)
CREATE TABLE "ArticleSource_new" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "ref"        TEXT NOT NULL DEFAULT '',
  "link"       TEXT,
  "wordCount"  INTEGER,
  "readingSec" INTEGER,
  "bookSeries" TEXT,
  "bookVolume" INTEGER,
  "bookPage"   INTEGER
);

INSERT INTO "ArticleSource_new" ("id","ref","link","wordCount","readingSec","bookSeries","bookVolume","bookPage")
SELECT "id","ref","link","wordCount","readingSec","bookSeries","bookVolume","bookPage"
FROM "ArticleSource";

DROP TABLE "ArticleSource";
ALTER TABLE "ArticleSource_new" RENAME TO "ArticleSource";

-- Populate bookSeries for רב"ש (volumes 1-3, pages 11-2097)
UPDATE "ArticleSource" SET "bookSeries" = 'ravash'
WHERE "bookPage" IS NOT NULL AND "bookVolume" IN (1,2,3)
  AND "bookPage" >= 11 AND "bookPage" <= 2097
  AND id IN (
    SELECT id FROM "ArticleSource" WHERE "bookVolume" IN (1,2,3)
    AND "bookPage" >= 11
    AND (
      ("bookVolume" = 1 AND "bookPage" <= 773) OR
      ("bookVolume" = 2 AND "bookPage" >= 787) OR
      ("bookVolume" = 3 AND "bookPage" >= 1601)
    )
  );

-- Populate bookSeries for זוהר לעם (volumes 1-12, pages starting at 5)
UPDATE "ArticleSource" SET "bookSeries" = 'zohar-laam'
WHERE "bookPage" IS NOT NULL AND "bookSeries" IS NULL
  AND "bookVolume" IS NOT NULL;
