-- Custom link + name pair for the חומר לימוד (Study Material) column,
-- mirroring the existing likutimLink / likutimName pair.
ALTER TABLE "LineupSlot" ADD COLUMN "customMaterialLink" TEXT;
ALTER TABLE "LineupSlot" ADD COLUMN "customMaterialName" TEXT;
