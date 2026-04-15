const API_BASE = '/api';

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const dashboardWrapper = document.getElementById('dashboard-wrapper');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

const sPending = document.getElementById('stat-pending');
const sSent = document.getElementById('stat-sent');
const sDelivered = document.getElementById('stat-delivered');
const sFailed = document.getElementById('stat-failed');

const tbodySessions = document.getElementById('sessions-tbody');
const tbodyMessages = document.getElementById('messages-tbody');
const totalMsgsBadge = document.getElementById('total-msgs-badge');

const navItems = document.querySelectorAll('.nav-item:not(#logout-btn)');
const viewOverview = document.getElementById('view-overview');
const viewSessions = document.getElementById('view-sessions');
const viewBlast = document.getElementById('view-blast');
const viewDocs = document.getElementById('view-docs');
const viewHardware = document.getElementById('view-hardware');

let pollInterval;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('rcs_admin_token');
    if (token) {
        showDashboard();
        fetchData();
        startPolling();
    } else {
        loginOverlay.classList.remove('hidden');
    }
});

// Auth Logic
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const res = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('rcs_admin_token', data.token);
            showDashboard();
            fetchData();
            startPolling();
        } else {
            loginError.innerText = data.error || 'Login failed';
        }
    } catch (err) {
        loginError.innerText = 'Network Error. Is server running?';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('rcs_admin_token');
    clearInterval(pollInterval);
    dashboardWrapper.classList.add('hidden');
    loginOverlay.classList.remove('hidden');
});

// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        const targetView = item.dataset.target;
        
        const bottomGrid = document.querySelector('.bottom-grid');
        
        
        if (targetView === 'overview') {
            viewOverview.style.display = 'grid';
            viewHardware.style.display = 'flex';
            viewSessions.style.display = 'flex';
            viewBlast.style.display = 'flex';
            viewDocs.style.display = 'none';
            bottomGrid.style.gridTemplateColumns = '1fr 1fr';
        } else if (targetView === 'sessions') {
            viewOverview.style.display = 'none';
            viewHardware.style.display = 'none';
            viewSessions.style.display = 'flex';
            viewBlast.style.display = 'none';
            viewDocs.style.display = 'none';
            bottomGrid.style.gridTemplateColumns = '1fr';
        } else if (targetView === 'blast') {
            viewOverview.style.display = 'none';
            viewHardware.style.display = 'none';
            viewSessions.style.display = 'none';
            viewBlast.style.display = 'flex';
            viewDocs.style.display = 'none';
            bottomGrid.style.gridTemplateColumns = '1fr';
        } else if (targetView === 'docs') {
            viewOverview.style.display = 'none';
            viewHardware.style.display = 'none';
            viewSessions.style.display = 'none';
            viewBlast.style.display = 'none';
            viewDocs.style.display = 'flex';
            bottomGrid.style.gridTemplateColumns = '1fr';
        }
    });
});

function showDashboard() {
    loginOverlay.classList.add('hidden');
    dashboardWrapper.classList.remove('hidden');
}

// Data Fetching Logic
function getHeaders() {
    return {
        'Authorization': `Bearer ${localStorage.getItem('rcs_admin_token')}`
    };
}

async function fetchData() {
    fetchStats();
    fetchSystem();
    fetchSessions();
    fetchMessages();
}

function startPolling() {
    pollInterval = setInterval(fetchData, 5000);
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/admin/rcs/stats`, { headers: getHeaders() });
        if (res.status === 401) return logoutBtn.click();
        const data = await res.json();
        
        if (data.success && data.stats) {
            sPending.innerText = data.stats.pending || 0;
            sSent.innerText = data.stats.sent || 0;
            sDelivered.innerText = (data.stats.delivered || 0) + (data.stats.read || 0);
            sFailed.innerText = data.stats.failed || 0;
        }
    } catch (e) {}
}

async function fetchSystem() {
    try {
        const res = await fetch(`${API_BASE}/admin/system`, { headers: getHeaders() });
        const data = await res.json();
        
        if (data.success && data.memory) {
            document.getElementById('ram-text').innerText = `${data.memory.used_mb} MB / ${data.memory.total_mb} MB`;
            document.getElementById('ram-percent').innerText = `${data.memory.percent}%`;
            
            const pBar = document.getElementById('ram-progress');
            pBar.style.width = `${data.memory.percent}%`;
            
            // Ubah warna merah jika mendekati batas (misal > 85%)
            if(data.memory.percent > 85) pBar.style.background = 'var(--danger)';
            else if(data.memory.percent > 65) pBar.style.background = 'var(--warning)';
            else pBar.style.background = 'var(--accent)';
            
            document.getElementById('cpu-model').innerText = data.cpu.model;
            document.getElementById('cpu-cores').innerText = `${data.cpu.cores} CPU Cores`;
        }
    } catch (e) {}
}

async function fetchSessions() {
    try {
        const res = await fetch(`${API_BASE}/admin/sessions`, { headers: getHeaders() });
        const data = await res.json();
        
        if (data.success && data.data) {
            tbodySessions.innerHTML = '';
            data.data.forEach(s => {
                const tr = document.createElement('tr');
                let actionHtml = '';
                if (s.status === 'pending_qr') {
                    actionHtml += `<button onclick="window.openQrModal('${s.id}')" class="action-link" style="color:var(--accent); border:1px solid currentColor; padding:2px 8px; border-radius:4px; background:none; cursor:pointer;" title="Buka QR di Modal"><i class="ri-qr-code-line"></i> View QR</button>`;
                }
                
                // Tambahkan tombol disconnect & hapus untuk semua status
                if (s.status !== 'disconnected') {
                    actionHtml += ` <button onclick="window.disconnectSession('${s.id}')" class="action-link" style="color:var(--warning); border:1px solid currentColor; padding:2px 8px; border-radius:4px; background:none; cursor:pointer; margin-left:8px;" title="Putus Sesi (Tetap ada di log)"><i class="ri-plugs-line"></i> Disconnect</button>`;
                }
                actionHtml += ` <button onclick="window.deleteSession('${s.id}')" class="action-link" style="color:var(--danger); border:1px solid currentColor; padding:2px 8px; border-radius:4px; background:none; cursor:pointer; margin-left:8px;" title="Hapus Permanen Sesi"><i class="ri-delete-bin-line"></i> Hapus</button>`;
                
                tr.innerHTML = `
                    <td><strong>${s.employee_id}</strong></td>
                    <td>${s.label || 'Sesi RCS'}</td>
                    <td>${s.phone_number || '-'}</td>
                    <td><span class="status-badge status-${s.status}">${s.status.replace('_', ' ').toUpperCase()}</span></td>
                    <td>${actionHtml}</td>
                `;
                tbodySessions.appendChild(tr);
            });
        }
    } catch (e) {}
}

async function fetchMessages() {
    try {
        const res = await fetch(`${API_BASE}/admin/rcs/messages`, { headers: getHeaders() });
        const data = await res.json();
        
        if (data.success && data.data) {
            tbodyMessages.innerHTML = '';
            totalMsgsBadge.innerText = `${data.data.length} total`;
            
            // Show only last 10 messages
            data.data.slice(0, 10).forEach(m => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${m.recipient}</td>
                    <td><span style="opacity:0.8; font-size:13px">${m.message_content.substring(0, 30)}${m.message_content.length > 30 ? '...' : ''}</span></td>
                    <td><span class="status-badge status-${m.status}">${m.status.toUpperCase()}</span></td>
                `;
                tbodyMessages.appendChild(tr);
            });
        }
    } catch (e) {}
}

// Fitur tambahan: Menghapus / Disconnect Sesi
window.deleteSession = async function(id) {
    if (!confirm('Peringatan: Apakah Anda yakin ingin memutus & menghapus sesi Google Messages ini selamanya?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/sessions/${id}`, {
            method: 'DELETE',
            // Gunakan token SSO admin
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('rcs_admin_token')}`
            }
        });
        const data = await res.json();
        if (data.success || res.ok) {
            // Refresh tabel seketika
            fetchSessions(); 
        } else {
            alert(data.message || data.error || 'Gagal menghapus sesi');
        }
    } catch (e) {
        alert('Terjadi kesalahan jaringan saat mencoba menghapus.');
    }
};

// Fitur tambahan: Memutus Sesi (Hanya disconnect)
window.disconnectSession = async function(id) {
    if (!confirm('Apakah Anda yakin ingin memutus (disconnect) sesi Google Messages ini? Data akan tetap tercatat di tabel.')) return;
    
    try {
        const res = await fetch(`${API_BASE}/sessions/${id}/disconnect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('rcs_admin_token')}`
            }
        });
        const data = await res.json();
        if (data.success || res.ok) {
            fetchSessions(); 
        } else {
            alert(data.message || data.error || 'Gagal memutus sesi');
        }
    } catch (e) {
        alert('Terjadi kesalahan jaringan saat mencoba disconnect.');
    }
};

// Fitur tambahan: Membuat Sesi Baru dan Buka Modal QR
window.createSession = async function() {
    const label = prompt("Masukkan identitas sesi baru (misal: RCS Marketing):");
    if (!label) return;

    try {
        const res = await fetch(`${API_BASE}/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('rcs_admin_token')}`
            },
            body: JSON.stringify({ label })
        });
        const data = await res.json();
        if (data.success) {
            fetchSessions();
            window.openQrModal(data.session_id);
        } else {
            alert(data.message || data.error || 'Gagal membuat sesi');
        }
    } catch (e) {
        alert('Terjadi kesalahan jaringan rcs_massage');
    }
};

let qrRefreshInterval;

window.openQrModal = function(sessionId) {
    const qrOverlay = document.getElementById('qr-overlay');
    const qrImg = document.getElementById('qr-modal-img');
    qrOverlay.classList.remove('hidden');
    
    // Tampilkan gambar loading sementara (opsional)
    qrImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23fff8e1"/><text x="100" y="100" font-size="20" text-anchor="middle" dominant-baseline="central">Menyiapkan QR...</text></svg>';

    // Hentikan interval lama jika ada
    if (qrRefreshInterval) clearInterval(qrRefreshInterval);

    qrRefreshInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/sessions/${sessionId}/qr`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('rcs_admin_token')}` }
            });
            const data = await res.json();
            
            if (data.status === 'active') {
                // Jika sukses nyambung, AUTO-CLOSE modal!
                window.closeQrModal();
                // Opsional: Langsung kabari user
                // alert('Scan Berhasil! Sesi sekarang sudah Aktif ✅');
            } else if (data.qr_image) {
                // Render gambar mentah base64
                qrImg.src = `data:image/png;base64,${data.qr_image}`;
            }
        } catch(e) {}
    }, 2000);
};

window.closeQrModal = function() {
    const qrOverlay = document.getElementById('qr-overlay');
    qrOverlay.classList.add('hidden');
    clearInterval(qrRefreshInterval);
    fetchSessions(); // update session status table (in case it became 'active')
};
