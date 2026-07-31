-- CreateTable
CREATE TABLE "UnitEvent" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitEvent_unitId_createdAt_idx" ON "UnitEvent"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "UnitEvent" ADD CONSTRAINT "UnitEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
