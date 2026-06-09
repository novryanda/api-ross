DROP INDEX IF EXISTS "posting_submissions_posting_order_id_key";

CREATE UNIQUE INDEX "posting_submissions_posting_order_id_submitted_by_key"
ON "posting_submissions"("posting_order_id", "submitted_by");

CREATE INDEX "posting_submissions_posting_order_id_idx"
ON "posting_submissions"("posting_order_id");
