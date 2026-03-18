const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  console.log('--- Starting Budget Data Migration (Raw SQL Mode) ---');
  
  // Use raw SQL to bypass Prisma Client's non-nullable validation
  const budgets = await prisma.$queryRaw`SELECT id, month, year, "startDate" FROM "Budget"`;
  console.log(`Found ${budgets.length} budgets to check.`);

  let migratedCount = 0;
  for (const budget of budgets) {
    if (budget.month && budget.year && !budget.startDate) {
      const startDate = new Date(Date.UTC(budget.year, budget.month - 1, 1));
      const endDate = new Date(Date.UTC(budget.year, budget.month, 0, 23, 59, 59, 999));

      await prisma.$executeRaw`
        UPDATE "Budget" 
        SET "startDate" = ${startDate}, 
            "endDate" = ${endDate}, 
            "status" = 'ACTIVE'
        WHERE id = ${budget.id}
      `;
      console.log(`  Migrated budget ${budget.id}: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      migratedCount++;
    }
  }

  console.log(`--- Migration Complete. ${migratedCount} budgets updated. ---`);
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
