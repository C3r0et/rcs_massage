const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('../config/db');
const SessionManager = require('../SessionManager');

// POST /api/sessions
// Buat sesi baru (Frontend harus kirim JWT dengan employee_id)
exports.createSession = async (req, res) => {
    const { label } = req.body;
    // Untuk kemudahan baca di Dashboard, mari prioritaskan field string: username atau employee_id
    const employeeId = req.user?.username || req.user?.employee_id || req.user?.id;

    if (!employeeId) {
        return res.status(401).json({ error: 'Token tidak valid atau tidak mengandung employee_id.' });
    }

    const sessionId = uuidv4();
    const sessionPath = path.resolve(__dirname, '../sessions', sessionId);

    try {
        await SessionManager.createSession(sessionId, employeeId, label || 'Sesi RCS', sessionPath);

        res.json({
            success: true,
            message: 'Sesi dibuat. Silakan scan QR Code di endpoint /qr.',
            session_id: sessionId,
            qr_url: `/api/sessions/${sessionId}/qr`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal membuat sesi.' });
    }
};

// GET /api/sessions
// Daftar semua sesi milik employee yang login
exports.getMySessions = async (req, res) => {
    const employeeId = req.user?.username || req.user?.employee_id || req.user?.id;
    try {
        const [rows] = await db.query(
            "SELECT id, label, phone_number, status, created_at, last_active FROM rcs_sessions WHERE employee_id = ? ORDER BY created_at DESC",
            [employeeId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil daftar sesi.' });
    }
};

// GET /api/admin/sessions
// Daftar semua sesi untuk keperluan dashboard admin
exports.getAdminSessions = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, employee_id, label, phone_number, status, created_at, last_active FROM rcs_sessions ORDER BY created_at DESC"
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil daftar sesi admin.' });
    }
};

// GET /api/sessions/:id/qr
// Ambil QR Code terbaru sebagai base64 image (untuk polling frontend)
exports.getQRCode = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            "SELECT status, qr_image, qr_updated_at, error_info FROM rcs_sessions WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
        }

        const session = rows[0];

        if (session.status === 'active') {
            return res.json({ success: true, status: 'active', qr_image: null });
        }

        if (session.status === 'error') {
            return res.json({ success: false, status: 'error', message: 'Gagal menjalankan browser.', error_info: session.error_info });
        }

        if (!session.qr_image) {
            return res.json({ success: true, status: 'pending_qr', qr_image: null, message: 'QR belum tersedia, tunggu sebentar...' });
        }

        res.json({
            success: true,
            status: session.status,
            qr_image: session.qr_image, // base64 PNG
            qr_updated_at: session.qr_updated_at
        });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil QR Code.' });
    }
};

// GET /api/sessions/:id/qr/image
// Kembalikan QR Code sebagai gambar PNG langsung (untuk Postman & <img src="...">)
exports.getQRImage = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            "SELECT status, qr_image, error_info FROM rcs_sessions WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).send('Sesi tidak ditemukan.');
        }

        const session = rows[0];

        if (session.status === 'active') {
            // Jika sudah aktif, kirim gambar centang hijau sederhana (SVG)
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
                <rect width="200" height="200" fill="#e8f5e9" rx="12"/>
                <text x="100" y="100" font-size="60" text-anchor="middle" dominant-baseline="central">✅</text>
                <text x="100" y="155" font-size="14" text-anchor="middle" fill="#388e3c">Sesi Aktif</text>
            </svg>`);
        }

        if (session.status === 'error') {
            // Jika error, kirim gambar silang merah
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
                <rect width="200" height="200" fill="#ffebee" rx="12"/>
                <text x="100" y="100" font-size="60" text-anchor="middle" dominant-baseline="central">❌</text>
                <text x="100" y="155" font-size="14" text-anchor="middle" fill="#c62828">Browser Error</text>
            </svg>`);
        }

        if (!session.qr_image) {
            // QR belum siap
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
                <rect width="200" height="200" fill="#fff8e1" rx="12"/>
                <text x="100" y="100" font-size="50" text-anchor="middle" dominant-baseline="central">⏳</text>
                <text x="100" y="155" font-size="13" text-anchor="middle" fill="#f57f17">Menunggu QR...</text>
            </svg>`);
        }

        // Kembalikan gambar PNG dari base64
        const imageBuffer = Buffer.from(session.qr_image, 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache, no-store'); // Agar selalu fresh
        res.send(imageBuffer);

    } catch (err) {
        res.status(500).send('Gagal mengambil QR Code.');
    }
};

// GET /api/sessions/:id/qr/view
// Kembalikan halaman HTML utuh berisi gambar QR yang otomatis auto-refresh. 
// Berguna untuk dibuka di browser agar ukurannya pas dan warnanya terjamin kontras.
exports.getQRHtml = async (req, res) => {
    const { id } = req.params;
    
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <!-- Auto refresh halaman setiap 2 detik agar QR tidak kadaluwarsa -->
        <meta http-equiv="refresh" content="2">
        <title>Scan QR Code RCS</title>
        <style>
            body {
                background-color: #f5f5f5;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                font-family: Arial, sans-serif;
            }
            .qr-container {
                background-color: white;
                padding: 30px;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            img {
                max-width: 300px;
                border: 1px solid #eee;
            }
            h2 { color: #333; margin-bottom: 10px; }
            p { color: #666; font-size: 14px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="qr-container">
            <h2>Scan & Pair Device</h2>
            <img src="/api/sessions/${id}/qr/image" alt="QR Code" />
            <p>Buka Google Messages di HP Anda<br>Pilih <strong>Device pairing</strong> lalu scan QR ini.</p>
            <p style="font-size: 11px; color: #999; margin-top: 15px;">Refresh otomatis setiap 2 detik</p>
        </div>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};
exports.getSessionStatus = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            "SELECT id, label, phone_number, status, last_active, error_info FROM rcs_sessions WHERE id = ?",
            [id]
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Gagal cek status sesi.' });
    }
};

// DELETE /api/sessions/:id
// Hapus sesi permanen
exports.deleteSession = async (req, res) => {
    const { id } = req.params;
    const employeeId = req.user?.username || req.user?.employee_id || req.user?.id;

    try {
        // Validasi kepemilikan sesi (ATAU berikan akses bebas jika ia adalah Tim IT/Admin)
        const [rows] = await db.query("SELECT employee_id FROM rcs_sessions WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
        
        const allowedAdmins = ['SPV_IT', 'STAFF_IT', 'STAFF_IT_HELPER', 'admin'];
        const isOwner = rows[0].employee_id === String(employeeId);
        const isAdmin = allowedAdmins.includes(req.user?.role);
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Anda bukan pemilik sesi ini, atau bukan Tim IT. Anda tidak berhak menghapus sesi ini.' });
        }

        await SessionManager.destroySession(id); // Hapus permanen
        res.json({ success: true, message: 'Sesi berhasil dihapus secara permanen.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal menghapus sesi.' });
    }
};

// POST /api/sessions/:id/disconnect
// Putus sesi (tetap di database)
exports.disconnectSession = async (req, res) => {
    const { id } = req.params;
    const employeeId = req.user?.username || req.user?.employee_id || req.user?.id;

    try {
        // Validasi kepemilikan sesi (ATAU berikan akses bebas jika ia adalah Tim IT/Admin)
        const [rows] = await db.query("SELECT employee_id FROM rcs_sessions WHERE id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
        
        const allowedAdmins = ['SPV_IT', 'STAFF_IT', 'STAFF_IT_HELPER', 'admin'];
        const isOwner = rows[0].employee_id === String(employeeId);
        const isAdmin = allowedAdmins.includes(req.user?.role);
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        await SessionManager.terminateSession(id); // Putus saja
        res.json({ success: true, message: 'Sesi berhasil diputuskan.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal memutus sesi.' });
    }
};
