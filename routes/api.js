const express = require('express');
const router = express.Router();
const rcsController = require('../controllers/rcsController');
const screeningController = require('../controllers/screeningController');
const sessionController = require('../controllers/sessionController');
const authController = require('../controllers/authController');

const ssoAuth = require('../middleware/ssoAuth');

// Auth
router.post('/admin/login', authController.login);
router.get('/admin/me', ssoAuth.protect, authController.getCurrentUser);

// ====== SESI / MULTI-ACCOUNT ======
router.post('/sessions', ssoAuth.protect, sessionController.createSession);
router.get('/sessions', ssoAuth.protect, sessionController.getMySessions);
router.get('/admin/sessions', ssoAuth.protect, sessionController.getAdminSessions);
router.get('/sessions/:id/qr', ssoAuth.protect, sessionController.getQRCode);
router.get('/sessions/:id/qr/image', sessionController.getQRImage); // Tanpa auth agar bisa di-embed sebagai <img src>
router.get('/sessions/:id/qr/view', sessionController.getQRHtml); // Halaman HTML untuk scan (Auto-refresh)
router.get('/sessions/:id/status', ssoAuth.protect, sessionController.getSessionStatus);
router.delete('/sessions/:id', ssoAuth.protect, sessionController.deleteSession);
router.post('/sessions/:id/disconnect', ssoAuth.protect, sessionController.disconnectSession);

// ====== GATEWAY ======
router.get('/rcs/pending', rcsController.getPendingMessages);
router.post('/rcs/webhook', rcsController.webhookStatus);

// ====== OPERASIONAL ======
router.post('/rcs/send', rcsController.sendMessage);

// ====== SCREENING ======
router.post('/rcs/screen', screeningController.submitScreening);
router.get('/rcs/screen/pending', screeningController.getPendingScreening);
router.post('/rcs/screen/result', screeningController.updateScreeningResult);
router.get('/rcs/screen/results', screeningController.getScreeningResults);

// ====== DASHBOARD ======
const itOnly = ssoAuth.authorize('SPV_IT', 'STAFF_IT', 'STAFF_IT_HELPER');

router.get('/admin/rcs/messages', ssoAuth.protect, itOnly, rcsController.getMessages);
router.get('/admin/rcs/stats', ssoAuth.protect, itOnly, rcsController.getStats);
router.get('/admin/system', ssoAuth.protect, itOnly, rcsController.getSystemStats);


module.exports = router;
