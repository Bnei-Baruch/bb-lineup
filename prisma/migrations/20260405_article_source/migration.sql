CREATE TABLE "ArticleSource" (
  "id"         TEXT    NOT NULL PRIMARY KEY,
  "ref"        TEXT    NOT NULL DEFAULT '',
  "link"       TEXT,
  "wordCount"  INTEGER,
  "readingSec" INTEGER,
  "pageVol1"   INTEGER,
  "pageVol2"   INTEGER,
  "pageVol3"   INTEGER
);

-- Seed from existing lessons so FK references are satisfied immediately
INSERT OR IGNORE INTO "ArticleSource" ("id","ref","link","wordCount","readingSec")
SELECT DISTINCT
  "articleSourceId",
  COALESCE("articleSourceRef", ''),
  "articleSourceLink",
  "articleWordCount",
  "articleReadingSec"
FROM "Lesson"
WHERE "articleSourceId" IS NOT NULL;
