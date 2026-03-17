# LXC Setup Guide for myWallet

This guide provides step-by-step instructions for setting up the **myWallet** application (Frontend, Backend, and PostgreSQL) inside a Linux LXC container (e.g., Ubuntu/Debian).

## 1. Prerequisites

- An existing LXC container with root or sudo access.
- Port 5173 (Frontend) and 4000 (Backend) open or proxied.

## 2. Install System Dependencies

Update the package list and install Node.js (v18+), PostgreSQL, and Git.

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (v18+ recommended)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Git and build essentials
sudo apt install -y git build-essential
```

## 3. Database Selection

Start PostgreSQL and create the database for myWallet.

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Switch to postgres user and create database
sudo -i -u postgres psql -c "CREATE DATABASE mywallet;"
sudo -i -u postgres psql -c "CREATE USER walletuser WITH PASSWORD 'your_secure_password';"
sudo -i -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mywallet TO walletuser;"
```

## 4. Clone and Setup Backend

```bash
git clone https://github.com/yourusername/myWallet.git /opt/myWallet
cd /opt/myWallet/myWalletBackend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set:
# DATABASE_URL="postgresql://walletuser:your_secure_password@localhost:5432/mywallet"
# JWT_SECRET="your_random_secret_here"
# PORT=4000

# Push schema to database
npx prisma db push
```

## 5. Clone and Setup Frontend

```bash
cd /opt/myWallet/myWallet

# Install dependencies
npm install

# Point frontend to backend API (if needed, check src/app/services/api.ts)
# By default it points to localhost:4000
```

## 6. Running with a Process Manager (PM2)

To keep the application running in the background:

```bash
sudo npm install -g pm2

# Start Backend
cd /opt/myWallet/myWalletBackend
pm2 start src/index.ts --interpreter tsx --name wallet-api

# Start Frontend (Dev mode)
cd /opt/myWallet/myWallet
pm2 start "npm run dev -- --host" --name wallet-ui

# Save PM2 state
pm2 save
pm2 startup
```

## 7. Direct Access

Once running, access the app at:
- **Frontend**: `http://<container-ip>:5173`
- **Backend**: `http://<container-ip>:4000`

> [!TIP]
> If you are accessing from outside the host, ensure your LXC network configuration allows traffic to these ports.
