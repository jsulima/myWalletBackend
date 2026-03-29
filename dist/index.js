"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const walletRoutes_1 = __importDefault(require("./routes/walletRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const transactionRoutes_1 = __importDefault(require("./routes/transactionRoutes"));
const budgetRoutes_1 = __importDefault(require("./routes/budgetRoutes"));
const savingRoutes_1 = __importDefault(require("./routes/savingRoutes"));
const creditRoutes_1 = __importDefault(require("./routes/creditRoutes"));
const transferRoutes_1 = __importDefault(require("./routes/transferRoutes"));
const currencyRoutes_1 = __importDefault(require("./routes/currencyRoutes"));
// Middlewares
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/wallets', walletRoutes_1.default);
app.use('/api/categories', categoryRoutes_1.default);
app.use('/api/transactions', transactionRoutes_1.default);
app.use('/api/budgets', budgetRoutes_1.default);
app.use('/api/savings', savingRoutes_1.default);
app.use('/api/credits', creditRoutes_1.default);
app.use('/api/transfers', transferRoutes_1.default);
app.use('/api/currency', currencyRoutes_1.default);
// Basic route
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'myWallet API is running!' });
});
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
