
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrate() {
  console.log('--- Starting Transfer Migration ---');
  
  const transfers = await prisma.transfer.findMany({
    include: {
      transactions: true,
    },
  });

  console.log(`Found ${transfers.length} transfers to migrate.`);

  for (const transfer of transfers) {
    try {
      console.log(`Migrating Transfer ${transfer.id}...`);
      
      const transactions = transfer.transactions;
      
      if (transactions.length !== 2) {
        console.warn(`  Warning: Transfer ${transfer.id} has ${transactions.length} transactions. Expected 2. Skipping.`);
        continue;
      }

      const sourceTx = transactions.find(t => t.walletId === transfer.sourceWalletId);
      const targetTx = transactions.find(t => t.walletId === transfer.targetWalletId);

      if (!sourceTx || !targetTx) {
        console.warn(`  Warning: Could not identify source/target transactions for Transfer ${transfer.id}. Skipping.`);
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // 1. Update source transaction to be the unified TRANSFER
        await tx.transaction.update({
          where: { id: sourceTx.id },
          data: {
            type: 'TRANSFER',
            targetWalletId: transfer.targetWalletId,
            targetAmount: transfer.targetAmount,
            amount: transfer.sourceAmount,
          },
        });

        // 2. Delete the redundant target transaction
        await tx.transaction.delete({
          where: { id: targetTx.id },
        });

        console.log(`  Success: Unified into Transaction ${sourceTx.id}`);
      });
    } catch (error) {
      console.error(`  Error migrating Transfer ${transfer.id}:`, error);
    }
  }

  console.log('--- Migration Complete ---');
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
