import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const p = new PrismaClient();
const API_URL = 'http://localhost:4000/api';
let token = '';

async function test() {
  const user = await p.user.findFirst();
  if (!user) return console.log('No user');

  const email = 'test_delcr_' + Date.now() + '@example.com';
  await fetch(API_URL + '/auth/register', { 
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'password', name: 'Tester' }) 
  });
  
  const login = await fetch(API_URL + '/auth/login', { 
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'password' }) 
  }).then(r => r.json());
  
  token = login.token;

  const req = (path: string, method = 'GET', body?: any) => fetch(API_URL + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json());

  // create credit
  const credit = await req('/credits', 'POST', { name: 'Test Del Credit', totalAmount: 500, remainingAmount: 500, interestRate: 0, monthlyPayment: 50, dueDate: new Date().toISOString(), currency: 'USD' });
  console.log('Created credit:', credit.id);

  // delete credit
  const delRes = await req(`/credits/${credit.id}`, 'DELETE');
  console.log('Delete res:', delRes);
}

test().catch(console.error).finally(() => p.$disconnect());
