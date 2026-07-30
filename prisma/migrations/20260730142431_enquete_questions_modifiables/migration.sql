/*
  Warnings:

  - You are about to drop the column `ageRange` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `blocker` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `currentSolution` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `duration` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `housing` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `priceRange` on the `SurveyResponse` table. All the data in the column will be lost.
  - You are about to drop the column `surface` on the `SurveyResponse` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SurveyResponse" DROP COLUMN "ageRange",
DROP COLUMN "blocker",
DROP COLUMN "currentSolution",
DROP COLUMN "duration",
DROP COLUMN "email",
DROP COLUMN "housing",
DROP COLUMN "location",
DROP COLUMN "priceRange",
DROP COLUMN "surface";

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helper" TEXT,
    "type" TEXT NOT NULL DEFAULT 'choice',
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyChoice" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,

    CONSTRAINT "SurveyChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choiceId" TEXT,
    "text" TEXT,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurveyQuestion_position_idx" ON "SurveyQuestion"("position");

-- CreateIndex
CREATE INDEX "SurveyChoice_questionId_position_idx" ON "SurveyChoice"("questionId", "position");

-- CreateIndex
CREATE INDEX "SurveyAnswer_responseId_idx" ON "SurveyAnswer"("responseId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "SurveyChoice" ADD CONSTRAINT "SurveyChoice_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "SurveyChoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
