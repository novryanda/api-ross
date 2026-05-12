-- Align UserStatus with the Phase 1 domain enum. Existing SUSPENDED users are
-- normalized to INACTIVE before the old enum type is dropped.
ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "status" TYPE "UserStatus"
  USING (
    CASE
      WHEN "status"::text = 'SUSPENDED' THEN 'INACTIVE'
      ELSE "status"::text
    END
  )::"UserStatus";
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "UserStatus_old";

-- Add the archived lifecycle state for source social accounts.
ALTER TYPE "SocialAccountStatus" ADD VALUE 'ARCHIVED';

-- Type audit actions so service code uses the same event vocabulary as the spec.
CREATE TYPE "AuditAction" AS ENUM (
  'USER_CREATED',
  'USER_UPDATED',
  'CAMPAIGN_CREATED',
  'CAMPAIGN_UPDATED',
  'CAMPAIGN_ARCHIVED',
  'CAMPAIGN_MEMBER_ADDED',
  'CAMPAIGN_MEMBER_REMOVED',
  'SOCIAL_ACCOUNT_CREATED',
  'SOCIAL_ACCOUNT_UPDATED',
  'SOCIAL_ACCOUNT_STATUS_UPDATED',
  'BLAST_TARGET_CREATED',
  'BLAST_TARGET_UPDATED',
  'BLAST_TARGET_STATUS_UPDATED',
  'BLAST_ATTEMPT_CREATED',
  'BLAST_ATTEMPT_KEPT',
  'BLAST_ATTEMPT_RELEASED',
  'BLAST_ATTEMPT_EXPIRED',
  'BLAST_ATTEMPT_CANCELLED',
  'BLAST_REPORT_SUBMITTED',
  'COMMENT_COMMAND_CREATED',
  'COMMENT_COMMAND_UPDATED',
  'COMMENT_COMMAND_ASSIGNED',
  'COMMENT_TASK_STARTED',
  'COMMENT_TASK_COMPLETED',
  'COMMENT_TASK_REJECTED',
  'COMMENT_TASK_BLOCKED',
  'EXPORT_REQUESTED',
  'EXPORT_COMPLETED',
  'EXPORT_FAILED'
);

ALTER TABLE "audit_logs"
  ALTER COLUMN "action" TYPE "AuditAction"
  USING "action"::"AuditAction";

-- Additional Phase 1 indexes for common campaign/status/platform/time queries.
CREATE INDEX "campaigns_created_at_idx" ON "campaigns"("created_at");
CREATE INDEX "social_accounts_created_at_idx" ON "social_accounts"("created_at");
CREATE INDEX "blast_targets_created_at_idx" ON "blast_targets"("created_at");
CREATE INDEX "blast_attempts_created_at_idx" ON "blast_attempts"("created_at");
CREATE INDEX "comment_commands_created_at_idx" ON "comment_commands"("created_at");
CREATE INDEX "comment_tasks_created_at_idx" ON "comment_tasks"("created_at");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs"("entity_id");
