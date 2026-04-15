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
// Build connection config — supports Railway env vars, MYSQL_URL, and custom DB_* vars
const dbConfig = process.env.MYSQL_URL
    ? {
        uri: process.env.MYSQL_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        namedPlaceholders: true,
        connectTimeout: 10000,
    }
    : {
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
    };

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
                        is_online BOOLEAN DEFAULT FALSE,
                        last_seen TIMESTAMP NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);

                // Check and add avatar column if it's missing (e.g. older Railway instances)
                const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'avatar'");
                if (cols.length === 0) {
                    await connection.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(500) DEFAULT ''");
                    console.log('✅ Added missing avatar column to users table');
                }

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
