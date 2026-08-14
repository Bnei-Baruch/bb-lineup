-- Replace the single customMaterialLink/customMaterialName pair with a JSON
-- list of {name, url} links, so a slot can carry more than one custom link.
ALTER TABLE "LineupSlot" ADD COLUMN "customLinks" TEXT;

UPDATE "LineupSlot"
SET "customLinks" = json_array(json_object('name', COALESCE("customMaterialName", ''), 'url', "customMaterialLink"))
WHERE "customMaterialLink" IS NOT NULL;

ALTER TABLE "LineupSlot" DROP COLUMN "customMaterialLink";
ALTER TABLE "LineupSlot" DROP COLUMN "customMaterialName";
