const db = require('../config/db');

// POST /api/rcs/screen
// Terima daftar nomor, masukkan ke antrean screening
exports.submitScreening = async (req, res) => {
    const { numbers } = req.body;

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'Field "numbers" wajib berupa array dan tidak boleh kosong.' });
    }

    try {
        let queued = 0;
        let skipped = 0;

        for (const phone of numbers) {
            const cleaned = phone.trim();
            // Gunakan INSERT IGNORE agar nomor yang sudah ada tidak error (unik per nomor)
            const [result] = await db.query(
                `INSERT IGNORE INTO rcs_screening (phone_number, status) VALUES (?, 'pending')`,
                [cleaned]
            );
            if (result.affectedRows > 0) {
                queued++;
            } else {
                // Nomor sudah ada, reset ke pending untuk dicek ulang
                await db.query(
                    `UPDATE rcs_screening SET status = 'pending', is_rcs_capable = NULL WHERE phone_number = ?`,
                    [cleaned]
                );
                queued++;
                skipped++;
            }
        }

        res.json({
            success: true,
            message: `${queued} nomor masuk antrean screening.`,
            total: numbers.length
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Terjadi kesalahan saat memasukkan antrean screening.' });
    }
};

// GET /api/rcs/screen/pending
// Dipanggil oleh browser_gateway untuk mengambil nomor yang perlu dicek
exports.getPendingScreening = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM rcs_screening WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil antrean screening.' });
    }
};

// POST /api/rcs/screen/result
// Dipanggil oleh browser_gateway setelah memeriksa nomor
exports.updateScreeningResult = async (req, res) => {
    const { phone_number, is_rcs_capable } = req.body;

    if (!phone_number || is_rcs_capable === undefined) {
        return res.status(400).json({ error: 'phone_number dan is_rcs_capable wajib diisi.' });
    }

    try {
        await db.query(
            `UPDATE rcs_screening 
             SET is_rcs_capable = ?, status = 'done', checked_at = NOW() 
             WHERE phone_number = ?`,
            [is_rcs_capable ? 1 : 0, phone_number]
        );
        res.json({ success: true, message: 'Hasil screening disimpan.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal menyimpan hasil screening.' });
    }
};

// GET /api/rcs/screen/results
// Ambil semua hasil screening untuk dashboard
exports.getScreeningResults = async (req, res) => {
    try {
        const { status, capable } = req.query;
        let query = 'SELECT * FROM rcs_screening';
        const params = [];
        const conditions = [];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (capable !== undefined) {
            conditions.push('is_rcs_capable = ?');
            params.push(parseInt(capable));
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY checked_at DESC';

        const [rows] = await db.query(query, params);

        // Hitung ringkasan
        const [summary] = await db.query(`
            SELECT 
                COUNT(*) AS total,
                SUM(is_rcs_capable = 1) AS rcs_capable,
                SUM(is_rcs_capable = 0) AS sms_only,
                SUM(status = 'pending') AS pending
            FROM rcs_screening
        `);

        res.json({
            success: true,
            summary: summary[0],
            data: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengambil hasil screening.' });
    }
};
