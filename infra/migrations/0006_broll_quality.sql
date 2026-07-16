-- 0006: previously applied out-of-band — broll_projects already has
-- `quality`, `video_provider`, and `render_video` columns. Re-running the
-- ALTERs would fail with `duplicate column name: quality` on prod D1, so we
-- collapse this migration to a tracked no-op to keep the chain advancing.
SELECT 1;
