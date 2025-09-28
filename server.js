const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./eclipse.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        owner_id TEXT,
        secret TEXT,
        version TEXT DEFAULT '1.0',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        email TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE,
        app_id INTEGER,
        user_id INTEGER,
        hwid TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        last_login DATETIME,
        FOREIGN KEY(app_id) REFERENCES apps(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT,
        hwid TEXT,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (row.count === 0) {
            const adminPassword = bcrypt.hashSync('admin123', 10);
            db.run('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)', 
                ['admin', adminPassword, 'admin@eclipse.com', 'admin']);
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/1.3/', (req, res) => {
    const { type, appname, ownerid, key, hwid } = req.body;

    if (type === 'register') {
        db.get('SELECT * FROM apps WHERE name = ? AND owner_id = ?', [appname, ownerid], (err, app) => {
            if (err) return res.json({ success: false, message: 'Database error' });
            if (!app) return res.json({ success: false, message: 'Application not found' });

            db.get(`SELECT l.*, b.id as ban_id 
                   FROM licenses l 
                   LEFT JOIN bans b ON l.license_key = b.license_key OR l.hwid = b.hwid
                   WHERE l.license_key = ? AND l.app_id = ?`, 
                   [key, app.id], (err, license) => {
                if (err) return res.json({ success: false, message: 'Database error' });
                if (!license) return res.json({ success: false, message: 'Invalid license' });
                if (license.ban_id) return res.json({ success: false, message: 'License banned' });

                const now = new Date();
                const expiresAt = new Date(license.expires_at);
                
                if (now > expiresAt) {
                    db.run('UPDATE licenses SET status = "expired" WHERE id = ?', [license.id]);
                    return res.json({ success: false, message: 'License expired' });
                }

                if (!license.hwid) {
                    db.run('UPDATE licenses SET hwid = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?', 
                           [hwid, license.id]);
                } else if (license.hwid !== hwid) {
                    return res.json({ success: false, message: 'HWID mismatch' });
                } else {
                    db.run('UPDATE licenses SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [license.id]);
                }

                res.json({ 
                    success: true,
                    message: 'Successfully registered',
                    info: {
                        username: license.license_key,
                        expires: license.expires_at,
                        created: license.created_at
                    }
                });
            });
        });
    } else {
        res.json({ success: false, message: 'Invalid type' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        if (bcrypt.compareSync(password, user.password)) {
            res.json({ 
                success: true, 
                user: { 
                    id: user.id, 
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.post('/api/app/create', (req, res) => {
    const { name, version } = req.body;
    const ownerid = req.body.ownerid || 'admin';
    const secret = uuidv4();

    db.run('INSERT INTO apps (name, owner_id, secret, version) VALUES (?, ?, ?, ?)',
        [name, ownerid, secret, version],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: 'App name already exists' });
            
            res.json({ 
                success: true, 
                app: {
                    id: this.lastID,
                    name: name,
                    ownerid: ownerid,
                    secret: secret,
                    version: version
                }
            });
        }
    );
});

app.post('/api/key/generate', (req, res) => {
    const { app_id, duration } = req.body;
    
    const licenseKey = `ECL-${uuidv4().toUpperCase().replace(/-/g, '').substring(0, 12)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (duration || 30));

    db.run(
        'INSERT INTO licenses (license_key, app_id, expires_at) VALUES (?, ?, ?)',
        [licenseKey, app_id, expiresAt.toISOString()],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: 'Failed to generate key' });
            
            res.json({ 
                success: true, 
                key: licenseKey,
                expires: expiresAt.toISOString()
            });
        }
    );
});

app.post('/api/key/ban', (req, res) => {
    const { license_key, reason } = req.body;

    db.run('INSERT INTO bans (license_key, reason) VALUES (?, ?)',
        [license_key, reason],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: 'Failed to ban' });
            
            db.run('UPDATE licenses SET status = "banned" WHERE license_key = ?', [license_key]);
            res.json({ success: true });
        }
    );
});

app.get('/api/apps', (req, res) => {
    db.all('SELECT * FROM apps', (err, apps) => {
        if (err) return res.status(500).json({ success: false, error: 'Database error' });
        res.json({ success: true, apps: apps });
    });
});

app.get('/api/keys/:app_id', (req, res) => {
    const app_id = req.params.app_id;
    
    db.all(
        `SELECT l.*, a.name as app_name 
         FROM licenses l 
         JOIN apps a ON l.app_id = a.id 
         WHERE l.app_id = ? 
         ORDER BY l.created_at DESC`,
        [app_id],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: 'Database error' });
            res.json({ success: true, keys: rows });
        }
    );
});

app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as totalKeys FROM licenses', (err, keys) => {
        db.get('SELECT COUNT(*) as activeKeys FROM licenses WHERE status = "active"', (err, active) => {
            db.get('SELECT COUNT(*) as totalApps FROM apps', (err, apps) => {
                db.get('SELECT COUNT(*) as onlineUsers FROM licenses WHERE last_login > datetime("now", "-5 minutes")', (err, online) => {
                    res.json({
                        success: true,
                        stats: {
                            totalKeys: keys.totalKeys,
                            activeKeys: active.activeKeys,
                            totalApps: apps.totalApps,
                            onlineUsers: online.onlineUsers
                        }
                    });
                });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Eclipse Auth System running on port ${PORT}`);
});
