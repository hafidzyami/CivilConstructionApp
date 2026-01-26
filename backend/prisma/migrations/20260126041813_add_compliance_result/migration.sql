-- CreateTable
CREATE TABLE "DemoComplianceResult" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "applicableRegulations" JSONB NOT NULL,
    "recommendations" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoComplianceResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoComplianceResult_sessionId_key" ON "DemoComplianceResult"("sessionId");

-- AddForeignKey
ALTER TABLE "DemoComplianceResult" ADD CONSTRAINT "DemoComplianceResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
