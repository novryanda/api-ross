-- Phase 7: Exports enrichment (scope/date range/retry), audit actions, timing columns.

-- 1. New enum for export scope.
DO $$ BEGIN
  CREATE TYPE "ExportScope" AS ENUM ('SUMMARY', 'BLAST_REPORTS', 'COMMENT_TASKS', 'FULL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. New audit actions used by Phase 7 export flow.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORT_RETRIED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORT_DOWNLOADED';

-- 3. Extend export_reports columns.
ALTER TABLE "export_reports"
  ADD COLUMN IF NOT EXISTS "scope"           "ExportScope" NOT NULL DEFAULT 'FULL',
  ADD COLUMN IF NOT EXISTS "date_from"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "date_to"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "file_name"       TEXT,
  ADD COLUMN IF NOT EXISTS "file_path"       TEXT,
  ADD COLUMN IF NOT EXISTS "file_size"       INTEGER,
  ADD COLUMN IF NOT EXISTS "mime_type"       TEXT,
  ADD COLUMN IF NOT EXISTS "error_message"   TEXT,
  ADD COLUMN IF NOT EXISTS "retried_from_id" UUID,
  ADD COLUMN IF NOT EXISTS "started_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failed_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_at"      TIMESTAMP(3);

-- 4. Rename generated_at → completed_at (preserve existing timestamps).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'export_reports'
      AND column_name = 'generated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'export_reports'
      AND column_name = 'completed_at'
  ) THEN
    EXECUTE 'ALTER TABLE "export_reports" RENAME COLUMN "generated_at" TO "completed_at"';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'export_reports'
      AND column_name = 'generated_at'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'export_reports'
      AND column_name = 'completed_at'
  ) THEN
    -- Copy any lingering timestamps from generated_at into the new completed_at, then drop.
    EXECUTE 'UPDATE "export_reports" SET "completed_at" = COALESCE("completed_at", "generated_at")';
    EXECUTE 'ALTER TABLE "export_reports" DROP COLUMN "generated_at"';
  END IF;
END $$;

-- 5. Ensure completed_at exists even when the rename branch above did not run
-- (e.g. an env that was already rebuilt from a newer schema).
ALTER TABLE "export_reports"
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- 6. Backfill updated_at so the NOT NULL constraint can be applied safely.
UPDATE "export_reports"
SET "updated_at" = COALESCE("updated_at", "completed_at", "created_at", NOW())
WHERE "updated_at" IS NULL;

ALTER TABLE "export_reports"
  ALTER COLUMN "updated_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT NOW();

-- 7. Default status changes from PROCESSING to PENDING.
ALTER TABLE "export_reports"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- 8. Self-referencing retry FK.
DO $$ BEGIN
  ALTER TABLE "export_reports"
    ADD CONSTRAINT "export_reports_retried_from_id_fkey"
    FOREIGN KEY ("retried_from_id") REFERENCES "export_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 9. Supporting indexes.
CREATE INDEX IF NOT EXISTS "export_reports_status_idx"          ON "export_reports" ("status");
CREATE INDEX IF NOT EXISTS "export_reports_scope_idx"           ON "export_reports" ("scope");
CREATE INDEX IF NOT EXISTS "export_reports_retried_from_id_idx" ON "export_reports" ("retried_from_id");
