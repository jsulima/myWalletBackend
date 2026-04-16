import { prisma } from './utils/db';
import { recalculateSubscriptionNextPaymentDate } from './controllers/subscriptionController';

async function fixAll() {
    console.log("Starting full subscription nextPaymentDate recalculation...");
    
    const subscriptions = await prisma.subscription.findMany();
    console.log(`Found ${subscriptions.length} subscriptions.`);
    
    for (const sub of subscriptions) {
        console.log(`Recalculating for: ${sub.name} (ID: ${sub.id})`);
        await recalculateSubscriptionNextPaymentDate(prisma, sub.id);
    }
    
    console.log("✅ Done! All subscription dates have been synced with their latest payment history.");
    process.exit(0);
}

fixAll().catch(err => {
    console.error(err);
    process.exit(1);
});
