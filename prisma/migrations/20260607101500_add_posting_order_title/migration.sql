ALTER TABLE "posting_orders"
ADD COLUMN "title" VARCHAR(255);

UPDATE "posting_orders"
SET "title" = COALESCE(NULLIF("caption", ''), 'Posting Order')
WHERE "title" IS NULL;

ALTER TABLE "posting_orders"
ALTER COLUMN "title" SET NOT NULL;
