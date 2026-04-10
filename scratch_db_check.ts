import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Transactions:', JSON.stringify(transactions, null, 2));
  const credits = await prisma.credit.findMany();
  console.log('Credits:', JSON.stringify(credits, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
