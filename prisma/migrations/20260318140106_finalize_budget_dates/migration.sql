/*
  Warnings:

  - You are about to drop the column `month` on the `Budget` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `Budget` table. All the data in the column will be lost.
  - Made the column `endDate` on table `Budget` required. This step will fail if there are existing NULL values in that column.
  - Made the column `startDate` on table `Budget` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Budget" DROP COLUMN "month",
DROP COLUMN "year",
ALTER COLUMN "endDate" SET NOT NULL,
ALTER COLUMN "startDate" SET NOT NULL;
