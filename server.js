const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'eclipse-super-secret-key-2024';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./eclipse.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        owner_id TEXT,
        secret TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        email TEXT,
        balance REAL DEFAULT 0,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE,
        application_id INTEGER,
        user_id INTEGER,
        hwid TEXT,
        status TEXT DEFAULT 'active',
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        last_login DATETIME,
        FOREIGN KEY(application_id) REFERENCES applications(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT,
        hwid TEXT,
        ip TEXT,
        reason TEXT,
        banned_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(banned_by) REFERENCES users(id)
    )`);

    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (row.count === 0) {
            const adminPassword = bcrypt.hashSync('admin123', 10);
            db.run('INSERT INTO users (username, password, email, balance, role) VALUES (?, ?, ?, ?, ?)', 
                ['admin', adminPassword, 'admin@eclipse.com', 10000, 'admin']);
            
            const appSecret = uuidv4();
            db.run('INSERT INTO applications (name, owner_id, secret) VALUES (?, ?, ?)',
                ['My First App', 'admin', appSecret]);
        }
    });
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({ 
                success: true, 
                user: { 
                    id: user.id, 
                    username: user.username,
                    email: user.email,
                    balance: user.balance,
                    role: user.role
                },
                token
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.get('/api/applications', authenticateToken, (req, res) => {
    db.all('SELECT * FROM applications WHERE owner_id = ?', [req.user.username], (err, apps) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(apps);
    });
});

app.post('/api/create-app', authenticateToken, (req, res) => {
    const { name } = req.body;
    const secret = uuidv4();

    db.run('INSERT INTO applications (name, owner_id, secret) VALUES (?, ?, ?)',
        [name, req.user.username, secret],
        function(err) {
            if (err) return res.status(500).json({ error: 'Application name already exists' });
            
            res.json({ 
                success: true, 
                application: {
                    id: this.lastID,
                    name: name,
                    secret: secret
                }
            });
        }
    );
});

app.post('/api/application/:appId/ban', authenticateToken, (req, res) => {
    const { licenseKey, hwid, ip, reason } = req.body;
    const appId = req.params.appId;

    db.run('INSERT INTO bans (license_key, hwid, ip, reason, banned_by) VALUES (?, ?, ?, ?, ?)',
        [licenseKey, hwid, ip, reason, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to ban' });
            
            db.run('UPDATE licenses SET status = "banned" WHERE license_key = ? AND application_id = ?',
                [licenseKey, appId]);
            
            res.json({ success: true });
        }
    );
});

app.post('/api/application/:appId/generate-key', authenticateToken, (req, res) => {
    const appId = req.params.appId;
    const { duration, note } = req.body;
    
    const licenseKey = `ECL-${uuidv4().toUpperCase().replace(/-/g, '').substring(0, 12)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (duration || 30));

    db.run(
        'INSERT INTO licenses (license_key, application_id, user_id, expires_at) VALUES (?, ?, ?, ?)',
        [licenseKey, appId, req.user.id, expiresAt.toISOString()],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to generate key' });
            
            res.json({ 
                success: true, 
                licenseKey,
                expiresAt: expiresAt.toISOString()
            });
        }
    );
});

app.get('/api/application/:appId/licenses', authenticateToken, (req, res) => {
    const appId = req.params.appId;
    
    db.all(
        `SELECT l.*, a.name as app_name 
         FROM licenses l 
         JOIN applications a ON l.application_id = a.id 
         WHERE l.application_id = ? AND a.owner_id = ? 
         ORDER BY l.created_at DESC`,
        [appId, req.user.username],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        }
    );
});

app.post('/api/application/:appId/validate', (req, res) => {
    const appId = req.params.appId;
    const { licenseKey, hwid, ip } = req.body;

    db.get(
        `SELECT l.*, a.secret, b.id as ban_id 
         FROM licenses l 
         JOIN applications a ON l.application_id = a.id 
         LEFT JOIN bans b ON l.license_key = b.license_key OR l.hwid = b.hwid
         WHERE l.license_key = ? AND l.application_id = ?`,
        [licenseKey, appId],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            if (!result) return res.json({ success: false, message: 'Invalid license' });
            if (result.ban_id) return res.json({ success: false, message: 'License banned' });

            const now = new Date();
            const expiresAt = new Date(result.expires_at);
            
            if (now > expiresAt) {
                db.run('UPDATE licenses SET status = "expired" WHERE id = ?', [result.id]);
                return res.json({ success: false, message: 'License expired' });
            }

            db.run('UPDATE licenses SET last_login = CURRENT_TIMESTAMP, hwid = ?, ip = ? WHERE id = ?',
                [hwid, ip, result.id]);

            res.json({ 
                success: true,
                message: 'License valid',
                data: {
                    license: result.license_key,
                    expires: result.expires_at,
                    created: result.created_at
                }
            });
        }
    );
});

app.get('/api/dashboard', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get('SELECT COUNT(*) as totalKeys FROM licenses WHERE user_id = ?', [userId], (err, keys) => {
        db.get('SELECT COUNT(*) as activeKeys FROM licenses WHERE user_id = ? AND status = "active"', [userId], (err, active) => {
            db.get('SELECT COUNT(*) as onlineUsers FROM licenses WHERE user_id = ? AND status = "active"', [userId], (err, online) => {
                db.get('SELECT COUNT(*) as totalApps FROM applications WHERE owner_id = ?', [req.user.username], (err, apps) => {
                    res.json({
                        totalKeys: keys.totalKeys,
                        activeKeys: active.activeKeys,
                        onlineUsers: online.onlineUsers,
                        totalApplications: apps.totalApps,
                        availableLicenses: active.activeKeys,
                        conversionRate: "86.5%",
                        healthScore: "92%"
                    });
                });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Eclipse Auth System running on port ${PORT}`);
});
