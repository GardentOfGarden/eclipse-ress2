let currentUser = null;

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            document.getElementById('sidebarUsername').textContent = currentUser.username;
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboard').style.display = 'flex';
            loadStats();
            loadApps();
            setupNavigation();
        } else {
            alert('Login failed: ' + data.error);
        }
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    currentUser = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('loginForm').reset();
});

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            const pageName = item.getAttribute('data-page');
            showPage(pageName);
        });
    });
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(`page-${pageName}`).classList.add('active');
    document.getElementById('pageTitle').textContent = document.querySelector(`[data-page="${pageName}"] span`).textContent;
    
    if (pageName === 'apps') {
        loadApps();
    } else if (pageName === 'keys') {
        loadAppsForSelect();
        loadKeys();
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        if (data.success) {
            document.getElementById('statTotalKeys').textContent = data.stats.totalKeys;
            document.getElementById('statActiveKeys').textContent = data.stats.activeKeys;
            document.getElementById('statTotalApps').textContent = data.stats.totalApps;
            document.getElementById('statOnlineUsers').textContent = data.stats.onlineUsers;
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadApps() {
    try {
        const response = await fetch('/api/apps');
        const data = await response.json();

        if (data.success) {
            const appsList = document.getElementById('appsList');
            appsList.innerHTML = '';

            data.apps.forEach(app => {
                const appCard = document.createElement('div');
                appCard.className = 'app-card';
                appCard.innerHTML = `
                    <h3>${app.name}</h3>
                    <p><strong>Owner ID:</strong> ${app.owner_id}</p>
                    <p><strong>Version:</strong> ${app.version}</p>
                    <div class="app-secret">
                        <strong>Secret:</strong> ${app.secret}
                    </div>
                    <p><strong>App ID:</strong> ${app.id}</p>
                `;
                appsList.appendChild(appCard);
            });
        }
    } catch (error) {
        console.error('Failed to load apps:', error);
    }
}

async function loadAppsForSelect() {
    try {
        const response = await fetch('/api/apps');
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('appSelect');
            select.innerHTML = '<option value="">Select Application</option>';
            
            data.apps.forEach(app => {
                const option = document.createElement('option');
                option.value = app.id;
                option.textContent = app.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load apps for select:', error);
    }
}

async function loadKeys() {
    const appId = document.getElementById('appSelect').value;
    if (!appId) {
        document.getElementById('keysList').innerHTML = '<p>Select an application to view keys</p>';
        return;
    }

    try {
        const response = await fetch(`/api/keys/${appId}`);
        const data = await response.json();

        if (data.success) {
            const keysList = document.getElementById('keysList');
            keysList.innerHTML = '';

            data.keys.forEach(key => {
                const keyCard = document.createElement('div');
                keyCard.className = 'key-card';
                keyCard.innerHTML = `
                    <h3>${key.license_key}</h3>
                    <p><strong>Status:</strong> <span class="key-status status-${key.status}">${key.status}</span></p>
                    <p><strong>Created:</strong> ${new Date(key.created_at).toLocaleDateString()}</p>
                    <p><strong>Expires:</strong> ${new Date(key.expires_at).toLocaleDateString()}</p>
                    ${key.hwid ? `<p><strong>HWID:</strong> ${key.hwid}</p>` : ''}
                    ${key.last_login ? `<p><strong>Last Login:</strong> ${new Date(key.last_login).toLocaleString()}</p>` : ''}
                `;
                keysList.appendChild(keyCard);
            });
        }
    } catch (error) {
        console.error('Failed to load keys:', error);
    }
}

function showCreateAppModal() {
    document.getElementById('createAppModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

async function createApp() {
    const name = document.getElementById('appName').value;
    const version = document.getElementById('appVersion').value;

    if (!name) {
        alert('Please enter app name');
        return;
    }

    try {
        const response = await fetch('/api/app/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                version: version,
                ownerid: currentUser.username
            })
        });

        const data = await response.json();

        if (data.success) {
            closeModal('createAppModal');
            document.getElementById('appName').value = '';
            document.getElementById('appVersion').value = '1.0';
            loadApps();
            loadStats();
            alert('Application created successfully!');
        } else {
            alert('Failed to create app: ' + data.error);
        }
    } catch (error) {
        alert('Failed to create app: ' + error.message);
    }
}

async function generateKey() {
    const appId = document.getElementById('appSelect').value;

    if (!appId) {
        alert('Please select an application');
        return;
    }

    try {
        const response = await fetch('/api/key/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                app_id: appId,
                duration: 30
            })
        });

        const data = await response.json();

        if (data.success) {
            alert(`Key generated successfully!\n\nKey: ${data.key}\nExpires: ${new Date(data.expires).toLocaleDateString()}`);
            loadKeys();
            loadStats();
        } else {
            alert('Failed to generate key: ' + data.error);
        }
    } catch (error) {
        alert('Failed to generate key: ' + error.message);
    }
}

async function banKey() {
    const licenseKey = document.getElementById('banKey').value;
    const reason = document.getElementById('banReason').value;

    if (!licenseKey) {
        alert('Please enter license key');
        return;
    }

    try {
        const response = await fetch('/api/key/ban', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                license_key: licenseKey,
                reason: reason || 'No reason provided'
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('Key banned successfully');
            document.getElementById('banKey').value = '';
            document.getElementById('banReason').value = '';
            loadStats();
        } else {
            alert('Failed to ban key: ' + data.error);
        }
    } catch (error) {
        alert('Failed to ban key: ' + error.message);
    }
}

document.getElementById('appSelect').addEventListener('change', loadKeys);

// Auto-refresh stats every 30 seconds
setInterval(loadStats, 30000);
