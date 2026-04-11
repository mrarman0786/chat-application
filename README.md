# 💬 Real-Time Chat Application

A full-featured real-time chat system with private messaging, AI chatbot, file sharing, and user profiles — built with Node.js, Express, Socket.IO, and MySQL.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Express](https://img.shields.io/badge/Express-4.18-blue)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-purple)
![MySQL](https://img.shields.io/badge/MySQL-8.0-orange)

---

## ✨ Features

- **User Authentication** — Registration, login/logout, session-based auth with bcrypt password hashing
- **Global Chat** — Real-time messaging with mood tags, topic filters, and anonymous mode
- **Private Messaging** — 1-to-1 encrypted chat rooms with seen/delivered status
- **AI Chatbot** — Built-in assistant with slash commands, math, summarization, coding help, and more
- **File Sharing** — Upload and share images, videos, and documents via Cloudinary
- **User Profiles** — Customizable avatars with cloud storage
- **Typing Indicators** — Real-time feedback in both global and private chats
- **Online Status** — Live user presence tracking with last-seen timestamps
- **Admin Controls** — Reveal anonymous message senders (first user = admin)
- **Modern UI** — Dark theme with glassmorphism, responsive design, and smooth animations

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **Backend** | Node.js, Express.js |
| **Real-Time** | Socket.IO |
| **Database** | MySQL with mysql2 |
| **Authentication** | express-session, bcryptjs |
| **File Storage** | Cloudinary, Multer |
| **Dev Tools** | Nodemon, dotenv |

---

## 📁 Project Structure

```
chat-app/
├── server/
│   ├── server.js              # Express entry point
│   ├── socket.js              # Socket.IO event handlers
│   ├── db.js                  # MySQL connection pool
│   ├── auth.js                # Auth utilities & middleware
│   ├── session.js             # Session configuration
│   ├── config/
│   │   └── cloudinary.js      # Cloudinary & Multer setup
│   └── routes/
│       ├── authRoutes.js      # Login, register, logout
│       ├── chatRoutes.js      # Global chat & stats
│       ├── privateChatRoutes.js # Private messaging
│       ├── aiRoutes.js        # AI chatbot
│       └── uploadRoutes.js    # Avatar & file uploads
│
├── public/
│   ├── index.html             # Login / Register page
│   ├── chat.html              # Chat interface
│   ├── css/style.css          # Styles
│   └── js/
│       ├── auth.js            # Frontend auth logic
│       └── chat.js            # Frontend chat logic
│
├── database/
│   └── schema.sql             # Full database schema
│
├── .env.example               # Environment variable template
├── railway.json               # Railway deployment config
├── package.json               # Dependencies & scripts
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8.0+

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/mrarman0786/chat-application.git
   cd chat-application
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   ```bash
   mysql -u root -p < database/schema.sql
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your MySQL credentials, session secret, and Cloudinary keys
   ```

5. **Start the server**
   ```bash
   npm run dev    # Development (auto-reload)
   npm start      # Production
   ```

6. **Open** `http://localhost:3000`

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/check` | Check auth status |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/messages` | Message history (with pagination & topic filter) |
| GET | `/api/chat/user` | Current user info |
| GET | `/api/chat/stats` | Chat statistics |
| POST | `/api/chat/summarize` | AI summary of messages |

### Private Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chats/create-private` | Create/get private chat |
| GET | `/api/chats/my-chats` | List user's chats |
| GET | `/api/chats/:chatId/messages` | Chat messages |

### Uploads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload/avatar` | Upload profile picture |
| POST | `/api/upload/file` | Upload file for chat |

---

## ⚡ Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `chat message` | ↔ | Global chat message |
| `send-private-message` | → | Private message |
| `receive-private-message` | ← | Receive private message |
| `send-ai-message` | → | Message to AI chatbot |
| `receive-ai-message` | ← | AI response |
| `typing` / `stop typing` | ↔ | Typing indicators |
| `online-users` | ← | Online users list |
| `messages-seen` | ↔ | Read receipts |

---

## 🚂 Deployment (Railway)

This project is configured for Railway deployment. See `.env.example` for the full environment variable reference.

1. Push to GitHub
2. Create a Railway project → Deploy from GitHub
3. Add a MySQL service (env vars are auto-injected)
4. Set `NODE_ENV`, `SESSION_SECRET`, and Cloudinary keys in Variables
5. Run `database/schema.sql` in Railway's MySQL query tab
6. Deploy!

---

## 🔒 Security

- Password hashing with bcrypt (10 salt rounds)
- Session-based auth with httpOnly, secure, sameSite cookies
- SQL injection prevention via prepared statements
- Input validation on all endpoints
- Proxy-aware session config for production

---

## 📝 License

MIT

---

**Built with ❤️ using Node.js, Socket.IO & MySQL**
