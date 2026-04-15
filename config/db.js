const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDB() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Berhasil terhubung ke MySQL database:', process.env.DB_NAME);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS rcs_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id VARCHAR(36) NULL,
                recipient VARCHAR(20) NOT NULL,
                message_content TEXT NOT NULL,
                status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
                provider_response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Tambah kolom session_id jika belum ada (upgrade dari versi lama)
        await connection.query(`
            ALTER TABLE rcs_messages ADD COLUMN IF NOT EXISTS session_id VARCHAR(36) NULL AFTER id
        `).catch(() => {}); // Abaikan jika sudah ada
        console.log('✅ Tabel rcs_messages siap');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS rcs_screening (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone_number VARCHAR(20) NOT NULL UNIQUE,
                is_rcs_capable TINYINT(1) DEFAULT NULL,
                status ENUM('pending', 'done', 'failed') DEFAULT 'pending',
                checked_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_status (status)
            )
        `);
        console.log('✅ Tabel rcs_screening siap');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS rcs_sessions (
                id VARCHAR(36) PRIMARY KEY,
                employee_id VARCHAR(50) NOT NULL,
                label VARCHAR(100) DEFAULT 'Sesi RCS',
                phone_number VARCHAR(20) NULL,
                status ENUM('pending_qr', 'active', 'disconnected', 'error') DEFAULT 'pending_qr',
                qr_image LONGTEXT NULL,
                qr_updated_at TIMESTAMP NULL,
                session_path VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP NULL,
                INDEX idx_employee (employee_id),
                INDEX idx_status (status)
            )
        `);
        console.log('✅ Tabel rcs_sessions siap');

        connection.release();
    } catch (err) {
        console.error('❌ Gagal koneksi ke database:', err.message);
    }
}

initDB();

module.exports = pool;
