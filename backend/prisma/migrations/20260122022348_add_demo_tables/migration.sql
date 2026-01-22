/*
  Warnings:

  - You are about to drop the `Detail` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Detail";

-- DropEnum
DROP TYPE "AnalysisStatus";

-- CreateTable
CREATE TABLE "DemoSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoDocument" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoCadData" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "siteArea" DOUBLE PRECISION,
    "buildingArea" DOUBLE PRECISION,
    "floorArea" DOUBLE PRECISION,
    "bcr" DOUBLE PRECISION,
    "far" DOUBLE PRECISION,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoCadData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoInfrastructure" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius" DOUBLE PRECISION,
    "buildings" JSONB,
    "roads" JSONB,
    "railways" JSONB,
    "waterways" JSONB,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoInfrastructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoOcr" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "extractedText" TEXT,
    "engine" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoOcr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoDocument_sessionId_idx" ON "DemoDocument"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoCadData_sessionId_key" ON "DemoCadData"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoInfrastructure_sessionId_key" ON "DemoInfrastructure"("sessionId");

-- CreateIndex
CREATE INDEX "DemoOcr_sessionId_idx" ON "DemoOcr"("sessionId");

-- AddForeignKey
ALTER TABLE "DemoDocument" ADD CONSTRAINT "DemoDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoCadData" ADD CONSTRAINT "DemoCadData_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoInfrastructure" ADD CONSTRAINT "DemoInfrastructure_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoOcr" ADD CONSTRAINT "DemoOcr_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
