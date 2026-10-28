-- CreateTable
CREATE TABLE IF NOT EXISTS "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable Campaign
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable CampaignBatch
CREATE TABLE IF NOT EXISTS "CampaignBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "messageText" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "validRecipients" INTEGER NOT NULL DEFAULT 0,
    "submittedCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBatch_pkey" PRIMARY KEY ("id")
);

-- AlterTable CampaignRecipient
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MessageTemplate_isArchived_idx" ON "MessageTemplate"("isArchived");
CREATE INDEX IF NOT EXISTS "MessageTemplate_createdAt_idx" ON "MessageTemplate"("createdAt");

CREATE INDEX IF NOT EXISTS "Campaign_isArchived_idx" ON "Campaign"("isArchived");

CREATE INDEX IF NOT EXISTS "CampaignBatch_campaignId_idx" ON "CampaignBatch"("campaignId");
CREATE INDEX IF NOT EXISTS "CampaignBatch_status_idx" ON "CampaignBatch"("status");
CREATE INDEX IF NOT EXISTS "CampaignBatch_createdAt_idx" ON "CampaignBatch"("createdAt");

CREATE INDEX IF NOT EXISTS "CampaignRecipient_batchId_idx" ON "CampaignRecipient"("batchId");

-- Unique constraint on campaignId and phone
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CampaignRecipient_campaignId_phone_key'
    ) THEN
        ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_phone_key" UNIQUE ("campaignId", "phone");
    END IF;
END $$;

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CampaignBatch_campaignId_fkey'
    ) THEN
        ALTER TABLE "CampaignBatch" ADD CONSTRAINT "CampaignBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CampaignRecipient_batchId_fkey'
    ) THEN
        ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CampaignBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
