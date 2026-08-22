-- Persists which slot the play-start event resolved, so the corresponding
-- stop event can reuse the same slot instead of re-running the (ambiguous)
-- playoutCode/mediaCode match a second time.
ALTER TABLE "PlayoutNowPlaying" ADD COLUMN "matchedSlotId" TEXT;
