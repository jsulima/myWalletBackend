# myWallet Backend API

A secure Node.js & Express REST API for the myWallet personal finance application.

## Features

- 🔐 **JWT Authentication** - Secure user registration and login
- 💼 **Wallet Management** - CRUD operations for multiple user wallets
- 💸 **Transaction Engine** - Automated balance updates and reversal logic
- 📁 **Categories** - Custom transaction categories with icons and colors
- 📊 **Budgets & Savings** - Monthly budget tracking and goal management
- 🛡️ **Ownership Guard** - Data isolation per user via middleware

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Prisma** - ORM for database management
- **PostgreSQL** - Relational database
- **JWT** - Secure authentication
- **Zod** - Schema validation
- **Helmet/CORS** - Security headers

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL instance running
- `npm` or `yarn`

### Installation

1. **Clone and Navigate**
   ```bash
   cd myWalletBackend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root directory:
   ```env
   PORT=4000
   DATABASE_URL="postgresql://user:password@localhost:5432/mywallet"
   JWT_SECRET="your_secure_secret_here"
   ```

4. **Initialize Database**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

5. **Start Dev Server**
   ```bash
   npm run dev
   ```
   The API will be available at `http://localhost:4000`.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and get JWT |
| GET | `/api/wallets` | Get user wallets |
| POST | `/api/transactions` | Create transaction (updates balance) |
| DELETE | `/api/transactions/:id` | Delete transaction (reverts balance) |
| GET | `/api/categories` | Get transaction categories |

## Project Structure

```
myWalletBackend/
├── src/
│   ├── controllers/    # Request handlers & logic
│   ├── middlewares/    # Auth and security
│   ├── routes/         # Express router definitions
│   ├── utils/          # DB & shared helpers
│   └── index.ts        # Entry point
├── prisma/             # Schema & migrations
└── .env                # Configuration
```

## License

Private / Proprietary.
