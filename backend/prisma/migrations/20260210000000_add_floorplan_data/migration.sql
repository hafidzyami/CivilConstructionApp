-- CreateTable
CREATE TABLE "DemoFloorplanData" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "roomStats" JSONB,
    "iconStats" JSONB,
    "roomSummary" JSONB,
    "iconSummary" JSONB,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoFloorplanData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoFloorplanData_sessionId_key" ON "DemoFloorplanData"("sessionId");

-- AddForeignKey
ALTER TABLE "DemoFloorplanData" ADD CONSTRAINT "DemoFloorplanData_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
