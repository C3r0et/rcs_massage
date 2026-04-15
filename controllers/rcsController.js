const db = require('../config/db');

exports.sendMessage = async (req, res) => {
    const { recipient, recipients, message, session_id, employee_id } = req.body;

    let recipientList = [];
    if (recipients && Array.isArray(recipients) && recipients.length > 0) {
        recipientList = recipients;
    } else if (recipient) {
        recipientList = [recipient];
    } else {
        return res.status(400).json({ error: 'recipient atau recipients wajib diisi!' });
    }

    if (!message) {
        return res.status(400).json({ error: 'message wajib diisi!' });
    }

    // Tentukan session_id target:
    // 1. Pakai session_id eksplisit jika ada
    // 2. Auto-select sesi aktif milik employee_id tertentu
    // 3. Null = akan diambil sesi mana saja yang aktif
    let targetSessionId = session_id || null;

    if (!targetSessionId && employee_id) {
        const [sessions] = await db.query(
            "SELECT id FROM rcs_sessions WHERE employee_id = ? AND status = 'active' LIMIT 1",
            [employee_id]
        ).catch(() => [[]]);
        if (sessions.length > 0) targetSessionId = sessions[0].id;
    }

    try {
        const insertedIds = [];
        for (const phone of recipientList) {
            const [result] = await db.query(
                'INSERT INTO rcs_messages (session_id, recipient, message_content, status) VALUES (?, ?, ?, ?)',
                [targetSessionId, phone.trim(), message, 'pending']
            );
            insertedIds.push(result.insertId);
        }

        res.status(200).json({
            success: true,
            message: `${insertedIds.length} pesan berhasil masuk antrean.`,
            message_ids: insertedIds,
            session_id: targetSessionId,
            message_id: insertedIds.length === 1 ? insertedIds[0] : undefined
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Terjadi kesalahan sistem.' });
    }
};

// Endpoint ini bisa dipanggil oleh HP Android (Python script / app) untuk mengecek pesan yang harus dikirim
exports.getPendingMessages = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM rcs_messages WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10");
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil antrean.' });
    }
};

exports.webhookStatus = async (req, res) => {
    // Dipanggil oleh Gateway (HP Android) untuk memperbarui status ("sent", "delivered", "failed")
    const { message_id, new_status, provider_info } = req.body;

    if (!message_id || !new_status) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    try {
        await db.query(
            'UPDATE rcs_messages SET status = ?, provider_response = ? WHERE id = ?',
            [new_status, JSON.stringify(provider_info || {}), message_id]
        );
        res.json({ success: true, message: 'Status diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getMessages = async (req, res) => {
    // Dipanggil oleh frontend Dashboard AutoCall
    try {
        const [rows] = await db.query('SELECT * FROM rcs_messages ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data riwayat pesan' });
    }
};

exports.getStats = async (req, res) => {
    // Dipanggil oleh frontend Dashboard AutoCall untuk analytics chart
    try {
        const [rows] = await db.query(`
            SELECT status, COUNT(*) as count 
            FROM rcs_messages 
            GROUP BY status
        `);
        const stats = rows.reduce((acc, curr) => {
            acc[curr.status] = curr.count;
            return acc;
        }, {});
        
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data statistik' });
    }
};

const os = require('os');

exports.getSystemStats = async (req, res) => {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsagePercent = ((usedMem / totalMem) * 100).toFixed(1);

        // Simple CPU load average over 1 min (works best on Unix, on Windows it might be 0, but let's provide cpus info)
        const cpus = os.cpus();
        
        res.json({
            success: true,
            memory: {
                total_mb: Math.round(totalMem / 1024 / 1024),
                used_mb: Math.round(usedMem / 1024 / 1024),
                percent: parseFloat(memoryUsagePercent)
            },
            cpu: {
                cores: cpus.length,
                model: cpus[0].model
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil metrik sistem' });
    }
};
