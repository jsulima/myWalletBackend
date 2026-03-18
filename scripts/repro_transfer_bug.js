const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('--- Starting Multi-Currency Transfer Edit Verification ---');

  const user = await prisma.user.findFirst();
  if (!user) throw new Error('No user found');

  const walletUSD = await prisma.wallet.create({
    data: { name: 'Family (USD)', balance: 1000, userId: user.id, currency: 'USD' }
  });
  const walletUAH = await prisma.wallet.create({
    data: { name: 'Mono (UAH)', balance: 5000, userId: user.id, currency: 'UAH' }
  });
  const category = await prisma.category.findFirst({ where: { type: 'EXPENSE' } });

  console.log(`Wallets created. USD: ${walletUSD.balance}, UAH: ${walletUAH.balance}`);

  // 1. Create a transfer of $10 to ₴440 (Rate: 44)
  console.log('Step 1: Creating a transfer of $10 to ₴440');
  const transfer = await prisma.$transaction(async (tx) => {
    const t = await tx.transfer.create({
      data: {
        sourceWalletId: walletUSD.id,
        targetWalletId: walletUAH.id,
        sourceAmount: 10,
        targetAmount: 440,
        exchangeRate: 44,
        description: 'Original Transfer'
      }
    });

    await tx.transaction.create({
      data: { walletId: walletUSD.id, categoryId: category.id, transferId: t.id, amount: 10, type: 'EXPENSE', description: 'Transfer to Mono' }
    });
    await tx.transaction.create({
      data: { walletId: walletUAH.id, categoryId: category.id, transferId: t.id, amount: 440, type: 'INCOME', description: 'Transfer from Family' }
    });

    await tx.wallet.update({ where: { id: walletUSD.id }, data: { balance: { decrement: 10 } } });
    await tx.wallet.update({ where: { id: walletUAH.id }, data: { balance: { increment: 440 } } });

    return t;
  });

  let wUSD = await prisma.wallet.findUnique({ where: { id: walletUSD.id } });
  let wUAH = await prisma.wallet.findUnique({ where: { id: walletUAH.id } });
  console.log(`Balances. USD: ${wUSD.balance}, UAH: ${wUAH.balance}`);

  // 2. Edit the EXPENSE side transaction ($10 -> $1)
  const txUSD = await prisma.transaction.findFirst({ where: { transferId: transfer.id, type: 'EXPENSE' } });
  console.log(`Step 2: Editing USD transaction ${txUSD.id} ($10 -> $1)`);

  // Mimic Controller PUT /transactions/:id
  const reqBody = {
      walletId: walletUSD.id,
      categoryId: category.id,
      amount: 1,
      type: 'EXPENSE',
      description: 'Transfer to Mono (Edited)'
  };

  // Run the logic from transactionController.ts
  await prisma.$transaction(async (tx) => {
      const oldTransaction = await tx.transaction.findUnique({ 
          where: { id: txUSD.id },
          include: { wallet: true } // This is what the controller does
      });
      const data = reqBody;

      // START COPIED LOGIC
      if (oldTransaction.transferId) {
        const transferRecord = await tx.transfer.findUnique({
          where: { id: oldTransaction.transferId },
          include: { transactions: true },
        });

        if (transferRecord) {
          const otherTransaction = transferRecord.transactions.find(t => t.id !== oldTransaction.id);
          
          if (otherTransaction) {
            console.log(`Found other transaction: ${otherTransaction.id}, current amount: ${otherTransaction.amount}`);
            
            // Reverse old balances
            const oldRevert = oldTransaction.type === 'INCOME' ? -oldTransaction.amount : oldTransaction.amount;
            await tx.wallet.update({
              where: { id: oldTransaction.walletId },
              data: { balance: { increment: oldRevert } },
            });

            const otherOldRevert = otherTransaction.type === 'INCOME' ? -otherTransaction.amount : otherTransaction.amount;
            await tx.wallet.update({
              where: { id: otherTransaction.walletId },
              data: { balance: { increment: otherOldRevert } },
            });

            // Calculate new
            let newSourceAmount = transferRecord.sourceAmount;
            let newTargetAmount = transferRecord.targetAmount;

            if (oldTransaction.type === 'EXPENSE') {
              newSourceAmount = data.amount;
              newTargetAmount = data.amount * transferRecord.exchangeRate;
            } else {
              newTargetAmount = data.amount;
              newSourceAmount = data.amount / transferRecord.exchangeRate;
            }
            
            console.log(`New amounts - Source: ${newSourceAmount}, Target: ${newTargetAmount}`);

            // Update Transfer
            await tx.transfer.update({
              where: { id: transferRecord.id },
              data: {
                sourceAmount: newSourceAmount,
                targetAmount: newTargetAmount,
                description: data.description,
                sourceWalletId: oldTransaction.type === 'EXPENSE' ? data.walletId : undefined,
                targetWalletId: oldTransaction.type === 'INCOME' ? data.walletId : undefined,
              },
            });

            // Update transactions
            await tx.transaction.update({
              where: { id: oldTransaction.id },
              data: { ...data }
            });

            await tx.transaction.update({
              where: { id: otherTransaction.id },
              data: {
                amount: oldTransaction.type === 'EXPENSE' ? newTargetAmount : newSourceAmount,
                description: data.description,
              },
            });

            // Apply new balances
            await tx.wallet.update({
              where: { id: data.walletId },
              data: { balance: { increment: data.type === 'INCOME' ? data.amount : -data.amount } },
            });

            const otherNewAmount = oldTransaction.type === 'EXPENSE' ? newTargetAmount : newSourceAmount;
            await tx.wallet.update({
              where: { id: otherTransaction.walletId },
              data: { balance: { increment: otherTransaction.type === 'INCOME' ? otherNewAmount : -otherNewAmount } },
            });
            
            console.log('Update logic finished inside transaction');
          } else {
              console.log('Other transaction NOT found');
          }
        } else {
            console.log('Transfer record NOT found');
        }
      } else {
          console.log('TransferId NOT found on oldTransaction');
      }
      // END COPIED LOGIC
  });

  wUSD = await prisma.wallet.findUnique({ where: { id: walletUSD.id } });
  wUAH = await prisma.wallet.findUnique({ where: { id: walletUAH.id } });
  console.log(`Final Balances. USD: ${wUSD.balance} (Expected 999), UAH: ${wUAH.balance} (Expected 5044)`);

  const finalTransfers = await prisma.transfer.findUnique({ where: { id: transfer.id }, include: { transactions: true } });
  console.log(`Transfer record: srcAmt=${finalTransfers.sourceAmount}, tgtAmt=${finalTransfers.targetAmount}`);
  for (const t of finalTransfers.transactions) {
      console.log(`Transaction ${t.type}: amount=${t.amount}, desc=${t.description}`);
  }

  // Cleanup
  await prisma.transaction.deleteMany({ where: { transferId: transfer.id } });
  await prisma.transfer.delete({ where: { id: transfer.id } });
  await prisma.wallet.delete({ where: { id: walletUSD.id } });
  await prisma.wallet.delete({ where: { id: walletUAH.id } });
  console.log('--- Verification Complete ---');
}

verify().catch(console.error).finally(() => prisma.$disconnect());
