-- Add documentType to DemoOcr table
ALTER TABLE "DemoOcr" ADD COLUMN "documentType" TEXT;

-- Add documentType to DemoDocument table
ALTER TABLE "DemoDocument" ADD COLUMN "documentType" TEXT;

-- Create DemoChatHistory table for storing chatbot conversations
CREATE TABLE "DemoChatHistory" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoChatHistory_pkey" PRIMARY KEY ("id")
);

-- Create index for faster queries
CREATE INDEX "DemoChatHistory_sessionId_idx" ON "DemoChatHistory"("sessionId");
CREATE INDEX "DemoChatHistory_chatSessionId_idx" ON "DemoChatHistory"("chatSessionId");

-- Add foreign key constraint
ALTER TABLE "DemoChatHistory" ADD CONSTRAINT "DemoChatHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
