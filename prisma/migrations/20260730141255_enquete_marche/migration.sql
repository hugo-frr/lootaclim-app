-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "housing" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "priceRange" TEXT NOT NULL,
    "currentSolution" TEXT NOT NULL,
    "blocker" TEXT NOT NULL,
    "ageRange" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurveyResponse_createdAt_idx" ON "SurveyResponse"("createdAt");
