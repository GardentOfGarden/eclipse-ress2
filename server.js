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

const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE,
        user_id INTEGER,
        program_language TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        hwid TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT,
        amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (username, password, balance) VALUES (?, ?, ?)', ['admin', adminPassword, 10000]);
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
                    balance: user.balance 
                } 
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.post('/api/generate-key', (req, res) => {
    const { userId, programLanguage, duration } = req.body;
    
    const licenseKey = `ECLIPSE-${uuidv4().toUpperCase().replace(/-/g, '').substring(0, 16)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (duration || 30));

    db.run(
        'INSERT INTO licenses (license_key, user_id, program_language, expires_at) VALUES (?, ?, ?, ?)',
        [licenseKey, userId, programLanguage, expiresAt.toISOString()],
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

app.post('/api/validate-key', (req, res) => {
    const { licenseKey, hwid } = req.body;
    
    db.get(
        'SELECT * FROM licenses WHERE license_key = ? AND status = "active"',
        [licenseKey],
        (err, license) => {
            if (err) return res.status(500).json({ valid: false });
            if (!license) return res.json({ valid: false });

            const now = new Date();
            const expiresAt = new Date(license.expires_at);
            
            if (now > expiresAt) {
                db.run('UPDATE licenses SET status = "expired" WHERE id = ?', [license.id]);
                return res.json({ valid: false });
            }

            if (!license.hwid) {
                db.run('UPDATE licenses SET hwid = ? WHERE id = ?', [hwid, license.id]);
            } else if (license.hwid !== hwid) {
                return res.json({ valid: false });
            }

            res.json({ 
                valid: true,
                language: license.program_language,
                expiresAt: license.expires_at
            });
        }
    );
});

app.get('/api/dashboard', (req, res) => {
    const userId = req.query.userId;

    db.get('SELECT COUNT(*) as totalKeys FROM licenses WHERE user_id = ?', [userId], (err, keys) => {
        db.get('SELECT COUNT(*) as activeKeys FROM licenses WHERE user_id = ? AND status = "active"', [userId], (err, active) => {
            db.get('SELECT SUM(amount) as totalSales FROM sales WHERE license_key IN (SELECT license_key FROM licenses WHERE user_id = ?)', [userId], (err, sales) => {
                db.get('SELECT COUNT(*) as onlineUsers FROM licenses WHERE user_id = ? AND status = "active"', [userId], (err, online) => {
                    res.json({
                        totalKeys: keys.totalKeys,
                        activeKeys: active.activeKeys,
                        totalSales: sales.totalSales || 0,
                        onlineUsers: online.onlineUsers,
                        availableLicenses: active.activeKeys,
                        conversionRate: "86.5%",
                        healthScore: "90%"
                    });
                });
            });
        });
    });
});

app.get('/api/keys', (req, res) => {
    const userId = req.query.userId;
    
    db.all(
        'SELECT license_key, program_language, status, created_at, expires_at FROM licenses WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        }
    );
});

app.listen(PORT, () => {
    console.log(`Eclipse server running on port ${PORT}`);
});
