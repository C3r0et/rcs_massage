const axios = require('axios');

// Fungsi Jembatan (Proxy) ke Server SSO Pusat di Port 4000
exports.login = async (req, res) => {
    const { employee_id, password } = req.body;
    
    try {
        // Alihkan HTTP request ke SSO Utama
        const ssoResponse = await axios.post('https://sso-auth.sahabatsakinah.id/api/auth/login', {
            employee_id: employee_id || req.body.username, // mendukung 'username' untuk kompatibilitas FE lama
            password: password
        });

        const dataSSO = ssoResponse.data;

        // --- LAYER 1 SECURITY VERIFICATION ---
        // Pastikan hanya role IT yang disepakati yang boleh menelan token tersebut masuk ke dashboard RCS
        const allowedRoles = ['SPV_IT', 'STAFF_IT', 'STAFF_IT_HELPER'];
        
        if (!dataSSO.user || !allowedRoles.includes(dataSSO.user.role)) {
            // PENTING: Jangan bocorkan token ke FE jika rolnya bukan IT!
            return res.status(403).json({ 
                success: false, 
                error: `Akses ditolak. Jabatan Anda (${dataSSO.user?.role || 'Unknown'}) tidak diizinkan mengakses Dashboard Aplikasi ini.` 
            });
        }

        // Semuanya lolos! Kembalikan ke Frontend Dashboard dengan struktur yang mereka inginkan
        res.json({
            success: true,
            token: dataSSO.token,
            user: dataSSO.user
        });

    } catch (err) {
        console.error('❌ SSO Proxy Error:', err.message);
        // Jika password di SSO salah / IP ke rate limiter, SSO akan mengembalikan error 401/429
        if (err.response) {
            return res.status(err.response.status).json(err.response.data);
        }
        res.status(503).json({ 
            success: false, 
            error: 'Tidak dapat menghubungi Layanan SSO Pusat',
            details: err.message,
            code: err.code 
        });
    }
};

// Fungsi me untuk Dashboard
exports.getCurrentUser = (req, res) => {
    if (req.user) {
        res.json({ success: true, user: req.user });
    } else {
        res.status(401).json({ success: false, error: 'Unauthorized' });
    }
};
