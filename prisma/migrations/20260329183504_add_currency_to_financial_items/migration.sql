-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Credit" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "SavingGoal" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';
