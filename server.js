require('dotenv').config();
const express = require('express');
const cors = require('cors');

const apiRoutes = require('./routes/api');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Limit dinaikkan untuk base64 QR image

// Load routes
app.use('/api', apiRoutes);

// Servis statis untuk Dashboard Admin
const path = require('path');
app.use('/dashboard', express.static(path.join(__dirname, 'public/dashboard')));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});

app.get('/', (req, res) => {
    res.send('RCS Messaging Backend siap.');
});

app.listen(PORT, async () => {
    console.log(`🚀 RCS Server berjalan di port ${PORT}`);

    // Inisialisasi SessionManager: Pulihkan semua sesi aktif dari database
    try {
        const SessionManager = require('./SessionManager');
        await SessionManager.initialize();
    } catch (err) {
        console.error('❌ Gagal menginisialisasi SessionManager:', err.message);
    }
});
