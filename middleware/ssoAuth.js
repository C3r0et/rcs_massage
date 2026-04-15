const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

// Buka koneksi ke 'audit_logs' terlepas dari DB utama RCS
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: 'audit_logs', 
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});

exports.protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });

    try {
        // Cek Daftar Hitam
        const [blacklisted] = await pool.query('SELECT * FROM token_blacklist WHERE token = ?', [token]);
        if (blacklisted.length > 0) {
             return res.status(401).json({ success: false, message: 'Sesi akun telah diakhiri (Revoked). Silakan login ulang.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

// Middleware tambahan untuk memblokir Non-IT
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `Akses ditolak. Layar ini hanya untuk Tim IT.` 
            });
        }
        next();
    };
};
