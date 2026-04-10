import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const p = new PrismaClient();
const API_URL = 'http://localhost:4000/api';
let token = '';

async function test() {
  const user = await p.user.findFirst();
  if (!user) return console.log('No user');

  const email = 'test_update_sync_' + Date.now() + '@example.com';
  const res = await fetch(API_URL + '/auth/register', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ email, password: 'password', name: 'Tester' }) 
  }).then(r => r.json()).catch(() => null);
  
  const login = await fetch(API_URL + '/auth/login', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ email, password: 'password' }) 
  }).then(r => r.json());
  
  token = login.token;

  const req = (path: string, method = 'GET', body?: any) => fetch(API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json());

  // create wallet
  const wallet = await req('/wallets', 'POST', { name: 'Test Wallet', balance: 1000, currency: 'USD' });
  const category = await req('/categories', 'POST', { name: 'Test Cat', type: 'EXPENSE' });
  const credit = await req('/credits', 'POST', { name: 'Test Credit', totalAmount: 500, remainingAmount: 500, interestRate: 0, monthlyPayment: 50, dueDate: new Date().toISOString(), currency: 'USD' });

  // pay credit
  const payRes = await req(`/credits/${credit.id}/pay`, 'POST', {
    walletId: wallet.id,
    categoryId: category.id,
    amount: 100
  });

  const txId = payRes.transaction.id;
  const credits1 = await req('/credits');
  console.log('After pay:', credits1.find((c:any) => c.id === credit.id).remainingAmount);

  // update tx
  await req(`/transactions/${txId}`, 'PUT', {
    walletId: wallet.id,
    categoryId: category.id,
    amount: 150,
    type: 'EXPENSE'
  });

  const credits2 = await req('/credits');
  console.log('After update:', credits2.find((c:any) => c.id === credit.id).remainingAmount);

  // delete tx
  await req(`/transactions/${txId}`, 'DELETE');
  const credits3 = await req('/credits');
  console.log('After delete:', credits3.find((c:any) => c.id === credit.id).remainingAmount);
}

test().catch(console.error).finally(() => p.$disconnect());
