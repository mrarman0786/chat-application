/**
 * ============================================
 * DATABASE CONNECTION MODULE
 * ============================================
 *
 * Creates and exports a MySQL connection pool.
 * Supports Railway, MYSQL_URL, and custom DB_* env vars.
 *
 * ============================================
 */

// Import mysql2 with promise support for async/await
const mysql = require('mysql2/promise');

// Load environment variables
require('dotenv').config();

/**
 * Create a connection pool to the MySQL database
 * Pool manages multiple connections efficiently
 */
// Build connection config — Prioritize individual variables for Railway stability
const useIndividualVars = process.env.MYSQLHOST || process.env.MYSQL_HOST || process.env.DB_HOST;

const dbConfig = useIndividualVars
    ? {
        host: process.env.MYSQLHOST || process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.MYSQLPORT || process.env.MYSQL_PORT || process.env.DB_PORT || '3306'),
        user: process.env.MYSQLUSER || process.env.MYSQL_USER || process.env.DB_USER || 'root',
        password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
        database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'chat_app_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        namedPlaceholders: true,
        connectTimeout: 10000,
    }
    : (process.env.MYSQL_URL ? {
        uri: process.env.MYSQL_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        namedPlaceholders: true,
        connectTimeout: 10000,
    } : {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: 'chat_app_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        namedPlaceholders: true,
        connectTimeout: 10000,
    });

const pool = mysql.createPool(dbConfig);

/**
 * Test database connection
 * Called on server startup to verify database is accessible
 */
async function testConnection() {
    // Log resolved config for debugging
    const resolvedHost = process.env.MYSQLHOST || process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost';
    const resolvedPort = process.env.MYSQLPORT || process.env.MYSQL_PORT || process.env.DB_PORT || '3306';
    const resolvedUser = process.env.MYSQLUSER || process.env.MYSQL_USER || process.env.DB_USER || 'root';
    const resolvedDb = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'chat_app_db';
    const usingUrl = !!process.env.MYSQL_URL;

    console.log('📊 Database Configuration:');
    if (usingUrl) {
        console.log('   Using MYSQL_URL connection string');
    } else {
        console.log(`   Host: ${resolvedHost}`);
        console.log(`   Port: ${resolvedPort}`);
        console.log(`   User: ${resolvedUser}`);
        console.log(`   Database: ${resolvedDb}`);
    }

    let retries = 5;
    while (retries > 0) {
        try {
            console.log(`⏳ Attempting database connection (${6 - retries}/5)...`);
            const connection = await pool.getConnection();
            
            console.log('✅ Database connected successfully!');

            // Initialize database schema automatically to prevent missing columns on prod
            try {
                // Ensure users table exists
                await connection.query(`
                    CREATE TABLE IF NOT EXISTS users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(50) NOT NULL UNIQUE,
                        email VARCHAR(100) NOT NULL UNIQUE,
                        password VARCHAR(255) NOT NULL,
                        avatar VARCHAR(500) DEFAULT '',
                        public_key TEXT,
                        is_online BOOLEAN DEFAULT FALSE,
                        last_seen TIMESTAMP NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);

                // Migrations for users table
                const [userCols] = await connection.query("SHOW COLUMNS FROM users");
                const colNames = userCols.map(c => c.Field);
                if (!colNames.includes('public_key')) await connection.query("ALTER TABLE users ADD COLUMN public_key TEXT");
                if (!colNames.includes('avatar')) await connection.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(500) DEFAULT ''");
                if (!colNames.includes('is_online')) await connection.query("ALTER TABLE users ADD COLUMN is_online BOOLEAN DEFAULT FALSE");
                if (!colNames.includes('last_seen')) await connection.query("ALTER TABLE users ADD COLUMN last_seen TIMESTAMP NULL");

                // Ensure chats table exists
                await connection.query(`
                    CREATE TABLE IF NOT EXISTS chats (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        chat_type ENUM('private','group','global','room') NOT NULL DEFAULT 'private',
                        name VARCHAR(100) NULL,
                        room_code VARCHAR(8) UNIQUE NULL,
                        room_status ENUM('active','closed','expired') NOT NULL DEFAULT 'active',
                        expires_at TIMESTAMP NULL,
                        closed_at TIMESTAMP NULL,
                        created_by INT NULL,
                        max_participants INT NOT NULL DEFAULT 10,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);

                // Migrations for chats table / room sessions
                const [chatCols] = await connection.query("SHOW COLUMNS FROM chats");
                const chatColNames = chatCols.map(c => c.Field);
                if (!chatColNames.includes('room_code')) await connection.query("ALTER TABLE chats ADD COLUMN room_code VARCHAR(8) UNIQUE NULL");
                if (!chatColNames.includes('room_status')) await connection.query("ALTER TABLE chats ADD COLUMN room_status ENUM('active','closed','expired') NOT NULL DEFAULT 'active'");
                if (!chatColNames.includes('expires_at')) await connection.query("ALTER TABLE chats ADD COLUMN expires_at TIMESTAMP NULL");
                if (!chatColNames.includes('closed_at')) await connection.query("ALTER TABLE chats ADD COLUMN closed_at TIMESTAMP NULL");
                if (!chatColNames.includes('created_by')) await connection.query("ALTER TABLE chats ADD COLUMN created_by INT NULL");
                if (!chatColNames.includes('max_participants')) await connection.query("ALTER TABLE chats ADD COLUMN max_participants INT NOT NULL DEFAULT 10");
                await connection.query("ALTER TABLE chats MODIFY COLUMN chat_type ENUM('private','group','global','room') NOT NULL DEFAULT 'private'");
                await connection.query("ALTER TABLE chats MODIFY COLUMN room_status ENUM('active','closed','expired') NOT NULL DEFAULT 'active'");

                // Ensure chat_participants table exists
                await connection.query(`
                    CREATE TABLE IF NOT EXISTS chat_participants (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        chat_id INT NOT NULL,
                        user_id INT NOT NULL,
                        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        UNIQUE KEY unique_participant (chat_id, user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);

                // Ensure private_messages table exists
                await connection.query(`
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
                        is_burn BOOLEAN DEFAULT FALSE,
                        message_type ENUM('text','image','video','file') DEFAULT 'text',
                        file_url VARCHAR(500) DEFAULT NULL,
                        file_name VARCHAR(255) DEFAULT NULL,
                        file_size INT DEFAULT NULL,
                        reply_to_id INT DEFAULT NULL,
                        forwarded_from VARCHAR(100) DEFAULT NULL,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
                        FOREIGN KEY (reply_to_id) REFERENCES private_messages(id) ON DELETE SET NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);

                // Ensure global messages table exists
                await connection.query(`
                    CREATE TABLE IF NOT EXISTS messages (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        username VARCHAR(50) NOT NULL,
                        message TEXT NOT NULL,
                        mood ENUM('happy','sad','angry','calm','excited') DEFAULT 'happy',
                        topics VARCHAR(500) DEFAULT '',
                        is_anonymous BOOLEAN DEFAULT FALSE,
                        is_burn BOOLEAN DEFAULT FALSE,
                        message_type ENUM('text','image','video','file') DEFAULT 'text',
                        file_url VARCHAR(500) DEFAULT NULL,
                        file_name VARCHAR(255) DEFAULT NULL,
                        file_size INT DEFAULT NULL,
                        reply_to_id INT DEFAULT NULL,
                        forwarded_from VARCHAR(100) DEFAULT NULL,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);

                // Check and add is_burn column to private_messages if it's missing
                const [pmCols] = await connection.query("SHOW COLUMNS FROM private_messages LIKE 'is_burn'");
                if (pmCols.length === 0) {
                    await connection.query("ALTER TABLE private_messages ADD COLUMN is_burn BOOLEAN DEFAULT FALSE");
                }

                // Check if is_burn column exists in messages
                const [columnsM] = await connection.query("SHOW COLUMNS FROM messages LIKE 'is_burn'");
                if (columnsM.length === 0) {
                    await connection.query("ALTER TABLE messages ADD COLUMN is_burn BOOLEAN DEFAULT FALSE");
                }

                // Check if is_burn column exists in private_messages
                const [columnsPM] = await connection.query("SHOW COLUMNS FROM private_messages LIKE 'is_burn'");
                if (columnsPM.length === 0) {
                    await connection.query("ALTER TABLE private_messages ADD COLUMN is_burn BOOLEAN DEFAULT FALSE");
                }

                // Ensure reactions table exists
                await connection.query(`
                    CREATE TABLE IF NOT EXISTS reactions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        message_id INT NOT NULL,
                        chat_id INT NOT NULL,
                        user_id INT NOT NULL,
                        emoji VARCHAR(50) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_reaction (message_id, user_id, emoji)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);

            } catch (schemaErr) {
                console.error('⚠️ Could not verify/update database schema:', schemaErr.message);
                // Don't crash the server, just log the warning
            }

            connection.release();
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            retries -= 1;
            if (retries > 0) {
                console.log(`⏳ Retrying in 3 seconds...`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }

    console.error('❌ All database connection attempts failed.');
    console.error('   Make sure MySQL is running and env vars are set correctly.');
    return false;
}

/**
 * Execute a query with prepared statements
 * @param {string} sql - SQL query with placeholders
 * @param {array} params - Parameters to replace placeholders
 * @returns {Promise<array>} Query results
 */
async function query(sql, params = []) {
    try {
        const [results] = await pool.query(sql, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error.message);
        throw error;
    }
}

// Export pool and helper functions
module.exports = {
    pool,
    query,
    testConnection
};
