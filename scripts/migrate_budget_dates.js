
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log('--- Starting Budget Data Migration ---');
  
  const budgets = await prisma.budget.findMany();
  console.log(`Found ${budgets.length} budgets to migrate.`);

  for (const budget of budgets) {
    if (budget.month && budget.year && !budget.startDate) {
      const startDate = new Date(Date.UTC(budget.year, budget.month - 1, 1));
      const endDate = new Date(Date.UTC(budget.year, budget.month, 0, 23, 59, 59, 999));

      await prisma.budget.update({
        where: { id: budget.id },
        data: {
          startDate,
          endDate,
          status: 'ACTIVE'
        }
      });
      console.log(`  Migrated budget ${budget.id}: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    }
  }

  console.log('--- Migration Complete ---');
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
