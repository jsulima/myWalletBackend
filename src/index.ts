import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

import authRoutes from './routes/authRoutes';
import walletRoutes from './routes/walletRoutes';
import categoryRoutes from './routes/categoryRoutes';
import transactionRoutes from './routes/transactionRoutes';
import budgetRoutes from './routes/budgetRoutes';
import savingRoutes from './routes/savingRoutes';
import creditRoutes from './routes/creditRoutes';

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/savings', savingRoutes);
app.use('/api/credits', creditRoutes);

// Basic route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'myWallet API is running!' });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
