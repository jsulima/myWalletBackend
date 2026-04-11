import { PrismaClient, TransactionType, BudgetStatus, SubscriptionStatus, SubscriptionFrequency } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'dev_test@test.com';
  const password = 'pass123';
  const name = 'Dev Tester';

  console.log(`Starting seeding for user: ${email}...`);

  // 1. Cleanup existing data for this user if it exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log('Cleaning up existing data for user...');
    const userId = existingUser.id;
    await prisma.transaction.deleteMany({ where: { wallet: { userId } } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.budgetPeriod.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.savingGoal.deleteMany({ where: { userId } });
    await prisma.credit.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }

  // 2. Create User
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      language: 'en'
    }
  });
  const userId = user.id;
  console.log(`User created with ID: ${userId}`);

  // 3. Create Categories (15)
  const categoryData = [
    { name: 'Salary', type: TransactionType.INCOME, icon: 'Wallet', color: '#10b981' },
    { name: 'Freelance', type: TransactionType.INCOME, icon: 'Briefcase', color: '#3b82f6' },
    { name: 'Gifts', type: TransactionType.INCOME, icon: 'Gift', color: '#f59e0b' },
    { name: 'Rent', type: TransactionType.EXPENSE, icon: 'Home', color: '#ef4444' },
    { name: 'Groceries', type: TransactionType.EXPENSE, icon: 'ShoppingCart', color: '#f97316' },
    { name: 'Restaurants', type: TransactionType.EXPENSE, icon: 'Coffee', color: '#8b5cf6' },
    { name: 'Transport', type: TransactionType.EXPENSE, icon: 'Truck', color: '#06b6d4' },
    { name: 'Entertainment', type: TransactionType.EXPENSE, icon: 'Film', color: '#ec4899' },
    { name: 'Shopping', type: TransactionType.EXPENSE, icon: 'ShoppingBag', color: '#d946ef' },
    { name: 'Health', type: TransactionType.EXPENSE, icon: 'Heart', color: '#14b8a6' },
    { name: 'Utilities', type: TransactionType.EXPENSE, icon: 'Zap', color: '#fbbf24' },
    { name: 'Subscriptions', type: TransactionType.EXPENSE, icon: 'Repeat', color: '#6366f1' },
    { name: 'Education', type: TransactionType.EXPENSE, icon: 'BookOpen', color: '#2dd4bf' },
    { name: 'Travel', type: TransactionType.EXPENSE, icon: 'Plane', color: '#f43f5e' },
    { name: 'Other', type: TransactionType.EXPENSE, icon: 'Tag', color: '#6b7280' },
  ];

  const categories = await Promise.all(
    categoryData.map(cat => prisma.category.create({ data: { ...cat, userId } }))
  );
  console.log('15 Categories created.');

  // 4. Create Wallets (4)
  const walletData = [
    { name: 'Main Bank', balance: 5000, currency: 'USD', order: 1 },
    { name: 'Cash', balance: 500, currency: 'USD', order: 2 },
    { name: 'Savings Card', balance: 12000, currency: 'USD', order: 3 },
    { name: 'Credit Card', balance: 2000, currency: 'USD', order: 4 },
  ];

  const wallets = await Promise.all(
    walletData.map(w => prisma.wallet.create({ data: { ...w, userId } }))
  );
  console.log('4 Wallets created.');

  // 5. Create Budget Periods
  // Reference date: April 11, 2026
  const now = new Date('2026-04-11T12:00:00Z');
  
  const periods = [
    { name: 'December 2025', status: BudgetStatus.FINISHED, start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-31T23:59:59Z') },
    { name: 'January 2026', status: BudgetStatus.FINISHED, start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-31T23:59:59Z') },
    { name: 'February 2026', status: BudgetStatus.FINISHED, start: new Date('2026-02-01T00:00:00Z'), end: new Date('2026-02-28T23:59:59Z') },
    { name: 'March 2026', status: BudgetStatus.FINISHED, start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-31T23:59:59Z') },
    { name: 'April 2026', status: BudgetStatus.ACTIVE, start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') },
    { name: 'May 2026', status: BudgetStatus.DRAFT, start: new Date('2026-05-01T00:00:00Z'), end: new Date('2026-05-31T23:59:59Z') },
  ];

  const createdPeriods = await Promise.all(
    periods.map(p => prisma.budgetPeriod.create({
      data: {
        userId,
        name: p.name,
        status: p.status,
        startDate: p.start,
        endDate: p.end
      }
    }))
  );
  console.log('6 Budget Periods created (4 Finished, 1 Active, 1 Draft).');

  // 6. Create Budgets for each period
  const expenseCategories = categories.filter(c => c.type === TransactionType.EXPENSE);
  
  for (const period of createdPeriods) {
    for (const cat of expenseCategories) {
      // Random limit between 100 and 1000
      const limit = Math.floor(Math.random() * 900) + 100;
      await prisma.budget.create({
        data: {
          userId,
          categoryId: cat.id,
          periodId: period.id,
          limit,
          startDate: period.startDate,
          endDate: period.endDate,
          status: period.status,
          currency: 'USD'
        }
      });
    }
  }
  console.log('Budgets created for all periods and expense categories.');

  // 7. Create Transactions (~150)
  console.log('Generating ~150 transactions...');
  const finishedPeriods = createdPeriods.filter(p => p.status === BudgetStatus.FINISHED || p.status === BudgetStatus.ACTIVE);
  
  let transactionCount = 0;
  for (const period of finishedPeriods) {
    // Generate ~25-30 transactions per period
    const numToCreate = Math.floor(Math.random() * 10) + 25;
    
    for (let i = 0; i < numToCreate; i++) {
      const isIncome = Math.random() > 0.8; // 20% income, 80% expense
      const possibleCats = categories.filter(c => c.type === (isIncome ? TransactionType.INCOME : TransactionType.EXPENSE));
      const category = possibleCats[Math.floor(Math.random() * possibleCats.length)];
      const wallet = wallets[Math.floor(Math.random() * wallets.length)];
      
      const amount = isIncome 
        ? Math.floor(Math.random() * 2000) + 500 
        : Math.floor(Math.random() * 150) + 5;
      
      // Random date within period
      const start = period.startDate.getTime();
      const end = period.endDate.getTime();
      const randomDate = new Date(start + Math.random() * (end - start));

      await prisma.transaction.create({
        data: {
          walletId: wallet.id,
          categoryId: category.id,
          amount,
          type: category.name === 'Transfer' ? TransactionType.TRANSFER : category.type,
          date: randomDate,
          description: `Test ${category.name} transaction`,
        }
      });
      transactionCount++;
    }
  }
  console.log(`${transactionCount} Transactions created.`);

  // 8. Create Subscriptions (5)
  const subCategory = categories.find(c => c.name === 'Subscriptions') || categories[0];
  const subData = [
    { name: 'Netflix', amount: 15.99, frequency: SubscriptionFrequency.MONTHLY },
    { name: 'Spotify', amount: 9.99, frequency: SubscriptionFrequency.MONTHLY },
    { name: 'iCloud', amount: 2.99, frequency: SubscriptionFrequency.MONTHLY },
    { name: 'Internet', amount: 60.00, frequency: SubscriptionFrequency.MONTHLY },
    { name: 'Gym', amount: 45.00, frequency: SubscriptionFrequency.MONTHLY },
  ];

  await Promise.all(
    subData.map(sub => prisma.subscription.create({
      data: {
        userId,
        categoryId: subCategory.id,
        walletId: wallets[0].id,
        name: sub.name,
        amount: sub.amount,
        frequency: sub.frequency,
        status: SubscriptionStatus.ACTIVE,
        nextPaymentDate: new Date('2026-05-01T10:00:00Z'),
        currency: 'USD'
      }
    }))
  );
  console.log('5 Active Subscriptions created.');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
