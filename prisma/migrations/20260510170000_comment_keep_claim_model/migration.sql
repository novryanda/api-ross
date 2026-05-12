-- CommentCommand now owns slots, and CommentTask uses the same keep/claim shape as BlastAttempt.
CREATE TYPE "CommentCommandStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_COMMAND_PAUSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_COMMAND_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_TASK_KEPT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_TASK_RELEASED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_TASK_EXPIRED';

ALTER TABLE "comment_commands"
  ADD COLUMN "required_slots" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "keep_expiry_minutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "status" "CommentCommandStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "comment_commands"
SET "deadline" = COALESCE("deadline", "created_at" + INTERVAL '7 days');

ALTER TABLE "comment_commands"
  ALTER COLUMN "deadline" SET NOT NULL;

WITH task_counts AS (
  SELECT "command_id", COUNT(*)::INTEGER AS "task_count"
  FROM "comment_tasks"
  GROUP BY "command_id"
)
UPDATE "comment_commands" command
SET "required_slots" = GREATEST(1, task_counts."task_count")
FROM task_counts
WHERE command."id" = task_counts."command_id";

ALTER TABLE "comment_tasks"
  ADD COLUMN "task_no" INTEGER,
  ADD COLUMN "kept_by" UUID,
  ADD COLUMN "kept_at" TIMESTAMP(3),
  ADD COLUMN "keep_expires_at" TIMESTAMP(3);

WITH numbered_tasks AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "command_id" ORDER BY "assigned_at", "created_at", "id")::INTEGER AS "task_no"
  FROM "comment_tasks"
)
UPDATE "comment_tasks" task
SET
  "task_no" = numbered_tasks."task_no",
  "kept_by" = task."assigned_to",
  "kept_at" = task."assigned_at"
FROM numbered_tasks
WHERE task."id" = numbered_tasks."id";

ALTER TABLE "comment_tasks"
  ALTER COLUMN "task_no" SET NOT NULL;

ALTER TABLE "comment_tasks" DROP CONSTRAINT IF EXISTS "comment_tasks_assigned_to_fkey";
ALTER TABLE "comment_tasks" DROP CONSTRAINT IF EXISTS "comment_tasks_assigned_by_fkey";

DROP INDEX IF EXISTS "comment_tasks_command_id_assigned_to_key";
DROP INDEX IF EXISTS "comment_tasks_assigned_to_idx";
DROP INDEX IF EXISTS "comment_tasks_assigned_by_idx";

ALTER TYPE "CommentTaskStatus" RENAME TO "CommentTaskStatus_old";
CREATE TYPE "CommentTaskStatus" AS ENUM ('AVAILABLE', 'KEPT', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "comment_tasks"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "CommentTaskStatus"
  USING (
    CASE "status"::text
      WHEN 'PENDING' THEN 'KEPT'
      WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
      WHEN 'COMPLETED' THEN 'COMPLETED'
      WHEN 'REJECTED' THEN 'CANCELLED'
      WHEN 'BLOCKED' THEN 'CANCELLED'
      ELSE 'CANCELLED'
    END
  )::"CommentTaskStatus",
  ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';

DROP TYPE "CommentTaskStatus_old";

ALTER TABLE "comment_tasks"
  DROP COLUMN "assigned_to",
  DROP COLUMN "assigned_by",
  DROP COLUMN "rejection_reason",
  DROP COLUMN "blocked_reason",
  DROP COLUMN "assigned_at",
  DROP COLUMN IF EXISTS "started_at";

CREATE UNIQUE INDEX "comment_tasks_command_id_task_no_key" ON "comment_tasks"("command_id", "task_no");
CREATE INDEX "comment_commands_status_idx" ON "comment_commands"("status");
CREATE INDEX "comment_tasks_kept_by_idx" ON "comment_tasks"("kept_by");
CREATE INDEX "comment_tasks_keep_expires_at_idx" ON "comment_tasks"("keep_expires_at");

ALTER TABLE "comment_tasks"
  ADD CONSTRAINT "comment_tasks_kept_by_fkey"
  FOREIGN KEY ("kept_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
