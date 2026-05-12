ALTER TYPE "AuditAction" ADD VALUE 'REBLAST_ATTEMPT_CREATED';

ALTER TABLE "audit_logs"
  ADD COLUMN "campaign_id" UUID,
  ALTER COLUMN "actor_id" DROP NOT NULL,
  ALTER COLUMN "entity_id" DROP NOT NULL;

CREATE INDEX "audit_logs_campaign_id_idx" ON "audit_logs"("campaign_id");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
