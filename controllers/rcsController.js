const db = require('../config/db');

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let p = String(phone).trim().replace(/[^\d+]/g, ''); // Ambil angka dan +
    if (p.startsWith('+')) p = p.substring(1);
    if (p.startsWith('0')) {
        p = '62' + p.substring(1);
    } else if (p.startsWith('8')) {
        p = '62' + p;
    }
    // Jika hanya angka 62 saja atau pendek, biarkan apa adanya (mungkin error)
    return p;
}

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
            const normalized = normalizePhoneNumber(phone);
            const [result] = await db.query(
                'INSERT INTO rcs_messages (session_id, employee_id, recipient, message_content, status) VALUES (?, ?, ?, ?, ?)',
                [targetSessionId, employee_id || null, normalized, message, 'pending']
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
    try {
        const { recipient, employee_id, status, limit, offset, all } = req.query;
        let query = 'SELECT * FROM rcs_messages';
        const params = [];
        const conditions = [];

        if (recipient) {
            conditions.push('recipient LIKE ?');
            params.push(`%${recipient}%`);
        }
        if (employee_id) {
            conditions.push('employee_id LIKE ?');
            params.push(`%${employee_id}%`);
        }
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY created_at DESC';

        // Jika 'all' ada, jangan beri limit (untuk export excel)
        if (!all) {
            const l = parseInt(limit) || 10;
            const o = parseInt(offset) || 0;
            query += ' LIMIT ? OFFSET ?';
            params.push(l, o);
        }

        const [rows] = await db.query(query, params);

        // Ambil total count untuk pagination (jika bukan export)
        let totalCount = 0;
        if (!all) {
            let countQuery = 'SELECT COUNT(*) as count FROM rcs_messages';
            if (conditions.length > 0) countQuery += ' WHERE ' + conditions.join(' AND ');
            const [countRes] = await db.query(countQuery, params.slice(0, conditions.length));
            totalCount = countRes[0].count;
        }

        res.json({ 
            success: true, 
            data: rows,
            pagination: !all ? {
                total: totalCount,
                limit: parseInt(limit) || 10,
                offset: parseInt(offset) || 0
            } : undefined
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil data riwayat pesan' });
    }
};

exports.getStats = async (req, res) => {
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

        // Ambil Top 5 Karyawan paling aktif
        const [employeeRows] = await db.query(`
            SELECT employee_id, COUNT(*) as count 
            FROM rcs_messages 
            WHERE employee_id IS NOT NULL 
            GROUP BY employee_id 
            ORDER BY count DESC 
            LIMIT 5
        `);
        
        res.json({ 
            success: true, 
            stats,
            employees: employeeRows 
        });
    } catch (err) {
        console.error(err);
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
