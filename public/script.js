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
            document.getElementById('userWelcome').textContent = `Welcome, ${currentUser.username}`;
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboard').style.display = 'flex';
            loadDashboard();
            loadKeys();
        } else {
            alert(data.error);
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

async function loadDashboard() {
    if (!currentUser) return;

    try {
        const response = await fetch(`/api/dashboard?userId=${currentUser.id}`);
        const data = await response.json();

        document.getElementById('totalSales').textContent = `$${data.totalSales.toLocaleString()}`;
        document.getElementById('availableLicenses').textContent = data.availableLicenses.toLocaleString();
        document.getElementById('directKeys').textContent = data.totalKeys.toLocaleString();
        document.getElementById('onlineUsers').textContent = data.onlineUsers.toLocaleString();
        document.getElementById('conversionRate').textContent = data.conversionRate;
        document.getElementById('healthScore').textContent = data.healthScore;
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

async function loadKeys() {
    if (!currentUser) return;

    try {
        const response = await fetch(`/api/keys?userId=${currentUser.id}`);
        const keys = await response.json();

        const keysList = document.getElementById('keysList');
        keysList.innerHTML = '';

        keys.slice(0, 5).forEach(key => {
            const keyElement = document.createElement('div');
            keyElement.className = 'key-item';
            keyElement.innerHTML = `
                <div class="key-info">
                    <div class="key-value">${key.license_key}</div>
                    <div class="key-meta">
                        ${key.program_language.toUpperCase()} • 
                        Created: ${new Date(key.created_at).toLocaleDateString()} • 
                        Expires: ${new Date(key.expires_at).toLocaleDateString()}
                    </div>
                </div>
                <div class="key-status status-${key.status}">${key.status.toUpperCase()}</div>
            `;
            keysList.appendChild(keyElement);
        });
    } catch (error) {
        console.error('Failed to load keys:', error);
    }
}

async function generateKey() {
    if (!currentUser) return;

    const programLanguage = document.getElementById('programLanguage').value;
    const duration = parseInt(document.getElementById('keyDuration').value);

    try {
        const response = await fetch('/api/generate-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUser.id,
                programLanguage,
                duration
            })
        });

        const data = await response.json();

        if (data.success) {
            alert(`Key generated successfully!\n\nKey: ${data.licenseKey}\nExpires: ${new Date(data.expiresAt).toLocaleDateString()}`);
            loadDashboard();
            loadKeys();
        } else {
            alert('Failed to generate key');
        }
    } catch (error) {
        alert('Failed to generate key: ' + error.message);
    }
}

function showAddBalance() {
    alert('Balance system will be integrated with your payment processor.');
}

setInterval(() => {
    if (currentUser) {
        loadDashboard();
    }
}, 30000);
