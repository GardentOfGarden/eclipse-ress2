let currentUser = null;
let currentToken = null;

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
            currentToken = data.token;
            
            localStorage.setItem('eclipse_user', JSON.stringify(currentUser));
            localStorage.setItem('eclipse_token', currentToken);
            
            document.getElementById('userWelcome').textContent = `Welcome, ${currentUser.username}`;
            document.getElementById('sidebarUsername').textContent = currentUser.username;
            document.getElementById('sidebarRole').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
            document.getElementById('currentBalance').textContent = `$${currentUser.balance.toLocaleString()}`;
            
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboard').style.display = 'flex';
            
            loadDashboard();
            loadApplications();
            setupNavigation();
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    currentUser = null;
    currentToken = null;
    localStorage.removeItem('eclipse_user');
    localStorage.removeItem('eclipse_token');
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('loginForm').reset();
});

document.getElementById('mobileToggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.add('active');
});

document.getElementById('mobileClose').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.remove('active');
});

document.getElementById('createAppBtn').addEventListener('click', () => {
    document.getElementById('createAppModal').classList.add('active');
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
            
            document.querySelector('.sidebar').classList.remove('active');
        });
    });
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(`page-${pageName}`).classList.add('active');
    document.getElementById('pageTitle').textContent = document.querySelector(`[data-page="${pageName}"] span`).textContent;
    
    if (pageName === 'applications') {
        loadApplications();
    } else if (pageName === 'licenses') {
        loadApplicationsForSelect('appSelectLicense');
        loadLicenses();
    } else if (pageName === 'generate') {
        loadApplicationsForSelect('appSelectGenerate');
    }
}

async function loadDashboard() {
    if (!currentUser) return;

    try {
        const response = await fetch('/api/dashboard', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        const data = await response.json();

        document.getElementById('totalKeys').textContent = data.totalKeys.toLocaleString();
        document.getElementById('activeLicenses').textContent = data.activeKeys.toLocaleString();
        document.getElementById('onlineUsers').textContent = data.onlineUsers.toLocaleString();
        document.getElementById('totalApplications').textContent = data.totalApplications.toLocaleString();
        document.getElementById('healthScore').textContent = data.healthScore;
        document.getElementById('conversionRate').textContent = data.conversionRate;
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

async function loadApplications() {
    try {
        const response = await fetch('/api/applications', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        const apps = await response.json();

        const appsGrid = document.getElementById('appsGrid');
        appsGrid.innerHTML = '';

        apps.forEach(app => {
            const appCard = document.createElement('div');
            appCard.className = 'app-card';
            appCard.innerHTML = `
                <h3>${app.name}</h3>
                <p>Application ID: ${app.id}</p>
                <div class="app-secret">
                    <strong>Secret:</strong> ${app.secret}
                </div>
                <div class="app-actions">
                    <button class="btn-secondary" onclick="viewAppDetails(${app.id})">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                </div>
            `;
            appsGrid.appendChild(appCard);
        });
    } catch (error) {
        console.error('Failed to load applications:', error);
    }
}

async function loadApplicationsForSelect(selectId) {
    try {
        const response = await fetch('/api/applications', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        const apps = await response.json();

        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">Select Application</option>';
        
        apps.forEach(app => {
            const option = document.createElement('option');
            option.value = app.id;
            option.textContent = app.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load applications for select:', error);
    }
}

async function loadLicenses() {
    const appId = document.getElementById('appSelectLicense').value;
    if (!appId) return;

    try {
        const response = await fetch(`/api/application/${appId}/licenses`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        const licenses = await response.json();

        const licensesTable = document.getElementById('licensesTable');
        licensesTable.innerHTML = '';

        const headerRow = document.createElement('div');
        headerRow.className = 'license-row header';
        headerRow.innerHTML = `
            <div>License Key</div>
            <div>Status</div>
            <div>Created</div>
            <div>Expires</div>
            <div>Last Login</div>
        `;
        licensesTable.appendChild(headerRow);

        licenses.forEach(license => {
            const licenseRow = document.createElement('div');
            licenseRow.className = 'license-row';
            licenseRow.innerHTML = `
                <div class="license-key">${license.license_key}</div>
                <div class="license-status status-${license.status}">${license.status.toUpperCase()}</div>
                <div>${new Date(license.created_at).toLocaleDateString()}</div>
                <div>${new Date(license.expires_at).toLocaleDateString()}</div>
                <div>${license.last_login ? new Date(license.last_login).toLocaleDateString() : 'Never'}</div>
            `;
            licensesTable.appendChild(licenseRow);
        });
    } catch (error) {
        console.error('Failed to load licenses:', error);
    }
}

async function generateLicenseKey() {
    const appId = document.getElementById('appSelectGenerate').value;
    const duration = parseInt(document.getElementById('keyDuration').value);

    if (!appId) {
        alert('Please select an application');
        return;
    }

    try {
        const response = await fetch(`/api/application/${appId}/generate-key`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                duration: duration
            })
        });

        const data = await response.json();

        if (data.success) {
            const generatedKey = document.getElementById('generatedKey');
            generatedKey.innerHTML = `
                <h4>License Key Generated Successfully!</h4>
                <div class="key">${data.licenseKey}</div>
                <p>Expires: ${new Date(data.expiresAt).toLocaleDateString()}</p>
            `;
            generatedKey.style.display = 'block';
            
            loadDashboard();
        } else {
            alert('Failed to generate key: ' + data.error);
        }
    } catch (error) {
        alert('Failed to generate key: ' + error.message);
    }
}

async function banLicenseKey() {
    const licenseKey = document.getElementById('banLicenseKey').value;
    const reason = document.getElementById('banReason').value;

    if (!licenseKey) {
        alert('Please enter a license key');
        return;
    }

    const appId = prompt('Enter Application ID for this license:');
    if (!appId) return;

    try {
        const response = await fetch(`/api/application/${appId}/ban`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                licenseKey: licenseKey,
                reason: reason
            })
        });

        const data = await response.json();

        if (data.success) {
            alert('License banned successfully');
            document.getElementById('banLicenseKey').value = '';
            document.getElementById('banReason').value = '';
        } else {
            alert('Failed to ban license: ' + data.error);
        }
    } catch (error) {
        alert('Failed to ban license: ' + error.message);
    }
}

function createApplication() {
    const appName = document.getElementById('appName').value;

    if (!appName) {
        alert('Please enter application name');
        return;
    }

    fetch('/api/create-app', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ name: appName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeModal('createAppModal');
            loadApplications();
            document.getElementById('appName').value = '';
        } else {
            alert('Failed to create application: ' + data.error);
        }
    })
    .catch(error => {
        alert('Failed to create application: ' + error.message);
    });
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function viewAppDetails(appId) {
    alert(`Application details for ID: ${appId}\n\nIntegration examples available in documentation.`);
}

document.getElementById('appSelectLicense').addEventListener('change', loadLicenses);

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('eclipse_user');
    const savedToken = localStorage.getItem('eclipse_token');
    
    if (savedUser && savedToken) {
        currentUser = JSON.parse(savedUser);
        currentToken = savedToken;
        
        document.getElementById('userWelcome').textContent = `Welcome, ${currentUser.username}`;
        document.getElementById('sidebarUsername').textContent = currentUser.username;
        document.getElementById('sidebarRole').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
        document.getElementById('currentBalance').textContent = `$${currentUser.balance.toLocaleString()}`;
        
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
        
        loadDashboard();
        loadApplications();
        setupNavigation();
    }
});

setInterval(() => {
    if (currentUser) {
        loadDashboard();
    }
}, 30000);
