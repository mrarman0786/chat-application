/**
 * ============================================
 * DATABASE CONNECTION MODULE
 * ============================================
 * 
 * This module creates and exports a MySQL connection pool.
 * Using a pool instead of single connection provides:
 * - Better performance through connection reuse
 * - Automatic connection management
 * - Connection limit handling
 * 
 * VIVA EXPLANATION:
 * - We use mysql2/promise for async/await support
 * - Connection pooling is essential for scalability
 * - Prepared statements prevent SQL injection
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
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',      // Database host
    port: process.env.DB_PORT || 3306,             // Database port
    user: process.env.DB_USER || 'root',           // Database username
    password: process.env.DB_PASSWORD || '',        // Database password
    database: process.env.DB_NAME || 'chat_app_db', // Database name
    
    // Pool configuration
    waitForConnections: true,    // Wait for available connection if pool is exhausted
    connectionLimit: 10,         // Maximum number of connections in pool
    queueLimit: 0,               // Unlimited queue (0 = no limit)
    
    // Enable prepared statements for security
    namedPlaceholders: true,
    
    // Connection timeout settings
    connectTimeout: 10000,       // 10 seconds connection timeout
});

/**
 * Test database connection
 * Called on server startup to verify database is accessible
 */
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully!');
        console.log(`   📁 Database: ${process.env.DB_NAME}`);
        console.log(`   🖥️  Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
        connection.release(); // Always release connection back to pool
        return true;
    } catch (error) {
        console.error('❌ Database connection failed!');
        console.error(`   Error: ${error.message}`);
        console.error('   Please check your database configuration in .env file');
        return false;
    }
}

/**
 * Execute a query with prepared statements
 * This is the main function used throughout the application
 * 
 * @param {string} sql - SQL query with placeholders
 * @param {array} params - Parameters to replace placeholders
 * @returns {Promise<array>} Query results
 * 
 * VIVA EXPLANATION:
 * Prepared statements prevent SQL injection by separating
 * the query structure from the data values.
 */
async function query(sql, params = []) {
    try {
        const [results] = await pool.execute(sql, params);
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
