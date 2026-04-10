-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `creditAmount` DOUBLE NULL,
    ADD COLUMN `creditId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_creditId_fkey` FOREIGN KEY (`creditId`) REFERENCES `Credit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
