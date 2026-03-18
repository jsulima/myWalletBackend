const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAgileBudget() {
  console.log('--- Starting Agile Budget Integration Test ---');

  try {
    // 1. Get or create a test user
    let user = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: 'test@example.com', password: 'password123', name: 'Test User' }
      });
    }

    // 2. Setup Wallet & Category
    const wallet = await prisma.wallet.findFirst({ where: { userId: user.id } }) || await prisma.wallet.create({
      data: { name: 'Test Wallet', balance: 1000, currency: 'USD', userId: user.id }
    });

    const category = await prisma.category.findFirst({ where: { name: 'Test Food' } }) || await prisma.category.create({
      data: { name: 'Test Food', type: 'EXPENSE', color: '#ff0000', icon: 'utensils' }
    });

    // 3. Clear existing test data for this specific user/wallet
    await prisma.budget.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { walletId: wallet.id } });
    
    console.log('Setup complete: User, Wallet, and Category ready.');

    // 4. Create a Budget for a custom period: 10th to 15th of current month
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 10, 0, 0, 0));
    const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 15, 23, 59, 59));

    const budget = await prisma.budget.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        limit: 100,
        startDate,
        endDate,
        status: 'ACTIVE'
      }
    });
    console.log(`Created ACTIVE budget for period: ${startDate.toISOString()} - ${endDate.toISOString()}`);

    // 5. Create Transactions
    // T1: Inside budget period (12th)
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        categoryId: category.id,
        amount: 30,
        type: 'EXPENSE',
        date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 12, 10, 0, 0)),
        description: 'Lunch inside budget'
      }
    });

    // T2: Outside budget period (20th)
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        categoryId: category.id,
        amount: 50,
        type: 'EXPENSE',
        date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 20, 10, 0, 0)),
        description: 'Dinner outside budget'
      }
    });

    console.log('Created transactions: one inside, one outside the budget period.');

    // 6. Verify spending (this logic mimics what the frontend does)
    const transactions = await prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        categoryId: category.id,
        type: 'EXPENSE',
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
    console.log(`Verification: Total Spent in period = ${totalSpent}`);

    if (totalSpent === 30) {
      console.log('✅ SUCCESS: Only the transaction inside the date range was counted.');
    } else {
      console.error(`❌ FAILURE: Expected 30, but got ${totalSpent}`);
    }

    // 7. Test Draft Status
    await prisma.budget.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        limit: 500,
        startDate: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)),
        endDate: new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 28)),
        status: 'DRAFT'
      }
    });
    console.log('Created DRAFT budget for next month.');

    const budgets = await prisma.budget.findMany({ where: { userId: user.id } });
    const draftCount = budgets.filter(b => b.status === 'DRAFT').length;
    const activeCount = budgets.filter(b => b.status === 'ACTIVE').length;

    console.log(`Status Check: ${activeCount} Active, ${draftCount} Draft.`);
    if (activeCount === 1 && draftCount === 1) {
      console.log('✅ SUCCESS: Status states are correctly stored.');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
    console.log('--- Test Complete ---');
  }
}

testAgileBudget();
