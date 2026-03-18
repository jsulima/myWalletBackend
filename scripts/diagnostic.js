
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const logFile = '/tmp/prisma_diagnostic.log';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
}

async function check() {
  try {
    log('--- Starting Prisma Diagnostic ---');
    
    // 1. Check User
    const user = await prisma.user.findFirst();
    if (!user) {
      log('ERROR: No user found in DB');
      return;
    }
    log(`Using User ID: ${user.id}`);

    // 2. Test the exact query used in the controller
    log('Testing getTransactions query...');
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { wallet: { userId: user.id } },
          { AND: [{ targetWalletId: { not: null } }, { targetWallet: { userId: user.id } }] }
        ]
      },
      select: {
        id: true,
        type: true,
        walletId: true,
        targetWalletId: true,
      },
      take: 5
    });
    log(`Query Success! Found ${transactions.length} sample transactions.`);

    // 3. Check for TRANSFER transactions with missing targetWalletId
    log('Checking for invalid TRANSFER records...');
    const invalidTransfers = await prisma.transaction.findMany({
      where: {
        type: 'TRANSFER',
        targetWalletId: null
      }
    });
    if (invalidTransfers.length > 0) {
        log(`WARNING: Found ${invalidTransfers.length} TRANSFER records with NULL targetWalletId!`);
    } else {
        log('All TRANSFER records have targetWalletId.');
    }

    log('--- Diagnostic Complete ---');
  } catch (error) {
    log(`CRITICAL ERROR: ${error.stack || error}`);
  } finally {
    await prisma.$disconnect();
  }
}

check();
