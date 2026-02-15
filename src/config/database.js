const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../../database/el_inmortal_2.db');

let db = null;

function getDatabase() {
    if (!db) {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('✅ Connected to SQLite database');
                initializeTables();
            }
        });
    }
    return db;
}

function initializeTables() {
    const db = getDatabase();
    
    // Tracks table with file support
    db.run(`
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_number INTEGER NOT NULL UNIQUE,
            title TEXT NOT NULL,
            producer_id INTEGER,
            recording_date DATE,
            duration TEXT,
            lyrics TEXT,
            status TEXT DEFAULT 'pending',
            splitsheet_sent BOOLEAN DEFAULT 0,
            splitsheet_confirmed BOOLEAN DEFAULT 0,
            content_count INTEGER DEFAULT 0,
            
            -- Track type fields
            track_type TEXT DEFAULT 'album',
            is_single BOOLEAN DEFAULT 0,
            is_primary BOOLEAN DEFAULT 0,
            features TEXT,
            
            -- File fields
            file_path TEXT,
            audio_file_path TEXT,
            audio_file_type TEXT,
            cover_image_path TEXT,
            
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (producer_id) REFERENCES producers(id)
        )
    `);

    // Album info table for cover image
    db.run(`
        CREATE TABLE IF NOT EXISTS album_info (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT DEFAULT 'El Inmortal 2',
            artist TEXT DEFAULT 'Galante el Emperador',
            cover_image_path TEXT,
            release_date DATE,
            status TEXT DEFAULT 'upcoming',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Producers table
    db.run(`
        CREATE TABLE IF NOT EXISTS producers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            legal_name TEXT,
            email TEXT NOT NULL UNIQUE,
            phone TEXT,
            address TEXT,
            split_percentage TEXT DEFAULT '50/50',
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Splitsheets table
    db.run(`
        CREATE TABLE IF NOT EXISTS splitsheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL,
            producer_id INTEGER NOT NULL,
            artist_percentage INTEGER DEFAULT 50,
            producer_percentage INTEGER DEFAULT 50,
            document_path TEXT,
            sent_date DATETIME,
            confirmed_date DATETIME,
            status TEXT DEFAULT 'pending',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (track_id) REFERENCES tracks(id),
            FOREIGN KEY (producer_id) REFERENCES producers(id)
        )
    `);

    // Content calendar table
    db.run(`
        CREATE TABLE IF NOT EXISTS content_calendar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day_number INTEGER NOT NULL,
            date DATE NOT NULL,
            title TEXT NOT NULL,
            content_type TEXT NOT NULL,
            platform TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'pending',
            completed BOOLEAN DEFAULT 0,
            track_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (track_id) REFERENCES tracks(id)
        )
    `);

    // Checklist items table
    db.run(`
        CREATE TABLE IF NOT EXISTS checklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            item_text TEXT NOT NULL,
            priority TEXT DEFAULT 'normal',
            completed BOOLEAN DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
        )
    `);

    // Activity log table
    db.run(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,
            user_id INTEGER,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('✅ Database tables initialized');
}

function closeDatabase() {
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('✅ Database connection closed');
            }
        });
        db = null;
    }
}

// Handle process termination
process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});

module.exports = {
    getDatabase,
    closeDatabase,
    initializeTables
};