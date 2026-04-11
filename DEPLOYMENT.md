# 🚀 Deployment Guide - Chat Application

Complete step-by-step guide to deploy your chat app online.

---

## Option A: Railway (Recommended - Easiest)

Railway provides free Node.js + MySQL hosting.

### Step 1: Create GitHub Repository

```bash
# Navigate to project
cd C:\Users\ARMAN\.gemini\antigravity\scratch\chat-app

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Chat Application"
```

Then push to GitHub:
1. Go to [github.com](https://github.com) → Create New Repository
2. Name it `chat-app`
3. Follow GitHub's instructions to push existing code

### Step 2: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click **"Start a New Project"**
3. Sign up with GitHub

### Step 3: Deploy from GitHub

1. Click **"Deploy from GitHub repo"**
2. Select your `chat-app` repository
3. Railway will auto-detect Node.js

### Step 4: Add MySQL Database

1. In Railway dashboard, click **"+ New"**
2. Select **"Database"** → **"MySQL"**
3. Wait for database to provision

### Step 5: Connect Database

1. Click on your MySQL service
2. Go to **"Variables"** tab
3. Copy these values:
   - `MYSQL_HOST`
   - `MYSQL_PORT`
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`
   - `MYSQL_DATABASE`

### Step 6: Set Environment Variables

1. Click on your Node.js service
2. Go to **"Variables"** tab
3. Add these variables:

```
PORT=3000
NODE_ENV=production
DB_HOST=${{MySQL.MYSQL_HOST}}
DB_PORT=${{MySQL.MYSQL_PORT}}
DB_USER=${{MySQL.MYSQL_USER}}
DB_PASSWORD=${{MySQL.MYSQL_PASSWORD}}
DB_NAME=${{MySQL.MYSQL_DATABASE}}
SESSION_SECRET=your-random-64-character-secret-key-here
COOKIE_MAX_AGE=86400000
```

### Step 7: Initialize Database

1. In Railway, click on MySQL service
2. Go to **"Query"** tab
3. Run the SQL from `database/schema.sql` (create tables)

### Step 8: Deploy!

1. Railway auto-deploys on every git push
2. Click **"Settings"** → **"Generate Domain"**
3. Your app is live! 🎉

---

## Option B: Render + PlanetScale (Free)

### Step 1: Setup PlanetScale (MySQL)

1. Go to [planetscale.com](https://planetscale.com)
2. Create account → Create Database
3. Name: `chat-app-db`
4. Get connection string

### Step 2: Setup Render (Node.js)

1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repo
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

### Step 3: Add Environment Variables

In Render dashboard, add all env variables from Step 6 above.

---

## Option C: Heroku

### Step 1: Install Heroku CLI

```bash
# Windows (using npm)
npm install -g heroku
```

### Step 2: Login & Create App

```bash
heroku login
cd chat-app
heroku create your-chat-app-name
```

### Step 3: Add MySQL

```bash
heroku addons:create jawsdb:kitefin
```

### Step 4: Set Environment Variables

```bash
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your-secret-key
```

### Step 5: Deploy

```bash
git push heroku main
```

---

## 🔒 Security Checklist Before Deploying

- [ ] Change `SESSION_SECRET` to a random 64-character string
- [ ] Set `NODE_ENV=production`
- [ ] Never commit `.env` file (use `.gitignore`)
- [ ] Use strong database password

---

## 🧪 Test Your Deployment

1. Open your deployed URL
2. Register a new account
3. Login
4. Send a test message
5. Open another browser/incognito → Test real-time messaging

---

**Need help with a specific step? Just ask!**
