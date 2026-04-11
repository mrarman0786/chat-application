-- ============================================
-- REAL-TIME CHAT APPLICATION DATABASE SCHEMA
-- ============================================
-- This file creates the database and tables required
-- for the chat application. Run this file in MySQL
-- before starting the application.
-- ============================================

-- Create the database
CREATE DATABASE IF NOT EXISTS chat_app_db;

-- Use the database
USE chat_app_db;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(500) DEFAULT '',
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- CHATS TABLE
-- ============================================
-- Stores chat rooms: private (1-to-1), group, or global
-- ============================================
CREATE TABLE IF NOT EXISTS chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_type ENUM('private','group','global') NOT NULL DEFAULT 'private',
    name VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- CHAT PARTICIPANTS TABLE
-- ============================================
-- Many-to-many relationship between chats and users
-- For private chats: exactly 2 participants
-- ============================================
CREATE TABLE IF NOT EXISTS chat_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_participant (chat_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- PRIVATE MESSAGES TABLE
-- ============================================
-- Messages within specific chat rooms (private/group)
-- ============================================
CREATE TABLE IF NOT EXISTS private_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id INT NOT NULL,
    sender_id INT NULL,
    sender_username VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    mood ENUM('happy','sad','angry','calm','excited') DEFAULT 'happy',
    topics VARCHAR(500) DEFAULT '',
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_ai BOOLEAN DEFAULT FALSE,
    is_seen BOOLEAN DEFAULT FALSE,
    message_type ENUM('text','image','video','file') DEFAULT 'text',
    file_url VARCHAR(500) DEFAULT NULL,
    file_name VARCHAR(255) DEFAULT NULL,
    file_size INT DEFAULT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_pm_chat_id ON private_messages(chat_id);
CREATE INDEX idx_pm_timestamp ON private_messages(timestamp);
CREATE INDEX idx_pm_sender ON private_messages(sender_id);

-- ============================================
-- GLOBAL MESSAGES TABLE (existing)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    username VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    mood ENUM('happy','sad','angry','calm','excited') DEFAULT 'happy',
    topics VARCHAR(500) DEFAULT '',
    is_anonymous BOOLEAN DEFAULT FALSE,
    message_type ENUM('text','image','video','file') DEFAULT 'text',
    file_url VARCHAR(500) DEFAULT NULL,
    file_name VARCHAR(255) DEFAULT NULL,
    file_size INT DEFAULT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_mood ON messages(mood);

-- ============================================
-- MIGRATION FOR EXISTING DATABASES
-- ============================================
-- Run these if you already have the old tables:
--
-- ALTER TABLE users ADD COLUMN avatar VARCHAR(500) DEFAULT '';
-- ALTER TABLE users ADD COLUMN is_online BOOLEAN DEFAULT FALSE;
-- ALTER TABLE users ADD COLUMN last_seen TIMESTAMP NULL;
-- ALTER TABLE messages ADD COLUMN message_type ENUM('text','image','video','file') DEFAULT 'text';
-- ALTER TABLE messages ADD COLUMN file_url VARCHAR(500) DEFAULT NULL;
-- ALTER TABLE messages ADD COLUMN file_name VARCHAR(255) DEFAULT NULL;
-- ALTER TABLE messages ADD COLUMN file_size INT DEFAULT NULL;
-- ALTER TABLE private_messages ADD COLUMN message_type ENUM('text','image','video','file') DEFAULT 'text';
-- ALTER TABLE private_messages ADD COLUMN file_url VARCHAR(500) DEFAULT NULL;
-- ALTER TABLE private_messages ADD COLUMN file_name VARCHAR(255) DEFAULT NULL;
-- ALTER TABLE private_messages ADD COLUMN file_size INT DEFAULT NULL;
