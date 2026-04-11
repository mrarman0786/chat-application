# 💬 Real-Time Chat Application

A production-ready real-time web-based chat communication system built with Node.js, Express, Socket.IO, and MySQL.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Express](https://img.shields.io/badge/Express-4.18-blue)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-purple)
![MySQL](https://img.shields.io/badge/MySQL-8.0-orange)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Folder Structure](#-folder-structure)
- [Database Setup](#-database-setup)
- [How to Run](#-how-to-run)
- [Architecture Overview](#-architecture-overview)
- [API Endpoints](#-api-endpoints)
- [Real-Time Events](#-real-time-events)
- [Security Features](#-security-features)
- [Screenshots](#-screenshots)
- [Future Scope](#-future-scope)

---

## ✨ Features

- **User Authentication**
  - Secure registration with email validation
  - Session-based login (not JWT)
  - Password hashing with bcrypt
  - Protected routes with middleware

- **Real-Time Messaging**
  - Instant message delivery via WebSocket
  - No page refresh required
  - User join/leave notifications
  - Typing indicators

- **Message Persistence**
  - All messages saved to MySQL database
  - Message history loaded on join
  - Timestamps for all messages

- **Modern UI**
  - Dark theme with glassmorphism effects
  - Responsive design for all devices
  - Smooth animations and transitions
  - Auto-scroll to latest messages

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **Backend** | Node.js, Express.js |
| **Real-Time** | Socket.IO |
| **Database** | MySQL with mysql2 |
| **Authentication** | express-session, bcrypt |
| **Dev Tools** | Nodemon, dotenv |

---

## 📁 Folder Structure

```
chat-app/
│
├── server/                    # Backend code
│   ├── server.js              # Main Express server
│   ├── socket.js              # Socket.IO logic
│   ├── db.js                  # Database connection
│   ├── auth.js                # Authentication utilities
│   ├── session.js             # Session configuration
│   └── routes/
│       ├── authRoutes.js      # Auth API endpoints
│       └── chatRoutes.js      # Chat API endpoints
│
├── public/                    # Frontend code
│   ├── index.html             # Login/Register page
│   ├── chat.html              # Chat interface
│   ├── css/
│   │   └── style.css          # Styles
│   └── js/
│       ├── auth.js            # Auth logic
│       └── chat.js            # Chat logic
│
├── database/
│   └── schema.sql             # Database schema
│
├── .env                       # Environment variables
├── package.json               # Dependencies
└── README.md                  # This file
```

---

## 🗄 Database Setup

### 1. Install MySQL
Make sure MySQL is installed and running on your system.

### 2. Create Database and Tables

Connect to MySQL and run the schema:

```bash
mysql -u root -p < database/schema.sql
```

Or manually run in MySQL:

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS chat_app_db;
USE chat_app_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    username VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

### 3. Configure Environment Variables

Edit the `.env` file with your MySQL credentials:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=chat_app_db
SESSION_SECRET=your_secret_key_here
```

---

## 🚀 How to Run

### Prerequisites
- Node.js 14+ installed
- MySQL 8.0+ installed and running
- Git (optional)

### Step-by-Step

1. **Navigate to project directory**
   ```bash
   cd chat-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up database** (see Database Setup above)

4. **Configure environment variables** (edit `.env`)

5. **Start the server**
   ```bash
   # Development mode (with auto-reload)
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## 🏗 Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│     Browser     │◄───────►│   Express.js     │
│  (HTML/CSS/JS)  │  HTTP   │     Server       │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         │ WebSocket                 │
         │ (Socket.IO)               │
         ▼                           ▼
┌─────────────────┐         ┌──────────────────┐
│   Socket.IO     │◄───────►│     MySQL        │
│    Server       │   SQL   │    Database      │
└─────────────────┘         └──────────────────┘
```

### Data Flow

1. **Registration/Login**:
   - User submits form → Express validates → bcrypt hashes password → MySQL stores user
   - Session created → Cookie sent to browser

2. **Real-Time Messaging**:
   - User sends message → Socket.IO emits → Server saves to MySQL → Broadcasts to all

3. **Message History**:
   - User connects → API fetches from MySQL → Returns last 50 messages

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/auth/check` | Check auth status |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/messages` | Get message history |
| GET | `/api/chat/user` | Get current user info |

---

## ⚡ Real-Time Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `chat message` | `{ message: string }` | Send a message |
| `typing` | - | User started typing |
| `stop typing` | - | User stopped typing |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `chat message` | `{ id, username, message, timestamp }` | New message |
| `user joined` | `{ username, timestamp }` | User joined |
| `user left` | `{ username, timestamp }` | User left |
| `welcome` | `{ message, username }` | Welcome message |
| `user typing` | `{ username }` | Someone is typing |

---

## 🔒 Security Features

| Feature | Implementation |
|---------|----------------|
| Password Hashing | bcrypt with 10 salt rounds |
| Session Security | httpOnly cookies, secure in production |
| SQL Injection Prevention | Prepared statements (mysql2) |
| XSS Prevention | HTML escaping on client |
| CSRF Protection | SameSite cookie attribute |
| Input Validation | Server-side validation on all inputs |

---

## 📸 Screenshots

### Login Page
*Dark themed login interface with glassmorphism effects*

### Chat Room
*Real-time messaging with user notifications*

> Add your screenshots here after running the application

---

## 🔮 Future Scope

- [ ] Private messaging (1-to-1 chat)
- [ ] Multiple chat rooms
- [ ] File/image sharing
- [ ] Message reactions (emojis)
- [ ] User profiles with avatars
- [ ] Message search functionality
- [ ] Read receipts
- [ ] Push notifications
- [ ] Admin panel for moderation
- [ ] Message encryption (end-to-end)

---

## 📝 License

This project is licensed under the MIT License.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

**Built with ❤️ for learning and demonstration purposes**
