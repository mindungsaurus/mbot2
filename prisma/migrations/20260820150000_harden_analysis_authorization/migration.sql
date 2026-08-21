-- Add attempt-level authorization snapshots for paid AI execution audit.
ALTER TABLE "AnalysisRun" ADD COLUMN "authorizedByUserId" TEXT;
ALTER TABLE "AnalysisRun" ADD COLUMN "authorizedAt" TIMESTAMP(3);

UPDATE "AnalysisRun" AS run
SET
  "authorizedByUserId" = task."authorizedByUserId",
  "authorizedAt" = task."authorizedAt"
FROM "AnalysisTask" AS task
WHERE run."taskId" = task."id"
  AND task."authorizedByUserId" IS NOT NULL
  AND task."authorizedAt" IS NOT NULL;

CREATE INDEX "AnalysisRun_authorizedByUserId_idx" ON "AnalysisRun"("authorizedByUserId");

ALTER TABLE "AnalysisRun"
ADD CONSTRAINT "AnalysisRun_authorizedByUserId_fkey"
FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove V1 job-level authorization and billing-owner concepts.
ALTER TABLE "AnalysisJob" DROP CONSTRAINT IF EXISTS "AnalysisJob_authorizedByUserId_fkey";
ALTER TABLE "AnalysisJob" DROP CONSTRAINT IF EXISTS "AnalysisJob_billingOwnerUserId_fkey";
DROP INDEX IF EXISTS "AnalysisJob_authorizedByUserId_idx";
DROP INDEX IF EXISTS "AnalysisJob_billingOwnerUserId_idx";
ALTER TABLE "AnalysisJob" DROP COLUMN "authorizedByUserId";
ALTER TABLE "AnalysisJob" DROP COLUMN "billingOwnerUserId";
ALTER TABLE "AnalysisJob" DROP COLUMN "authorizedAt";

ALTER TABLE "AnalysisTask" DROP CONSTRAINT IF EXISTS "AnalysisTask_billingOwnerUserId_fkey";
DROP INDEX IF EXISTS "AnalysisTask_billingOwnerUserId_idx";
ALTER TABLE "AnalysisTask" DROP COLUMN "billingOwnerUserId";
