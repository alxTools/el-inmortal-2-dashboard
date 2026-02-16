const mysql = require('mysql2/promise');
require('dotenv').config();

// MySQL Configuration
const DB_CONFIG = {
    host: process.env.DB_HOST || 'db.artistaviral.com',
    user: process.env.DB_USER || 'ailex',
    password: process.env.DB_PASSWORD || 'soyesmalandro.2',
    database: process.env.DB_NAME || 'artistaviral',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // SSL configuration for remote connections (required by many MySQL hosts)
    ssl: {
        rejectUnauthorized: false  // Allow self-signed certificates
    }
};

let pool = null;
let connectionTested = false;

// Get or create connection pool
async function getPool() {
    if (!pool) {
        try {
            pool = mysql.createPool(DB_CONFIG);
            
            // Test connection
            if (!connectionTested) {
                const [rows] = await pool.execute('SELECT 1 as test');
                console.log('✅ MySQL connected successfully');
                connectionTested = true;
            }
        } catch (err) {
            console.error('❌ MySQL Connection Error:', err.message);
            console.error('Config:', {
                host: DB_CONFIG.host,
                user: DB_CONFIG.user,
                database: DB_CONFIG.database,
                // Don't log password
            });
            throw err;
        }
    }
    return pool;
}

// Execute query
async function query(sql, params = []) {
    const pool = await getPool();
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('❌ MySQL Query Error:', error);
        throw error;
    }
}

// Get single row
async function getOne(sql, params = []) {
    const results = await query(sql, params);
    return results[0] || null;
}

// Get all rows
async function getAll(sql, params = []) {
    return await query(sql, params);
}

// Run insert/update/delete
async function run(sql, params = []) {
    const result = await query(sql, params);
    return {
        lastID: result.insertId,
        changes: result.affectedRows
    };
}

// Initialize database tables
async function initializeTables() {
    try {
        console.log('🔄 Initializing MySQL tables...');
        
        // Step 1: Drop existing tables if they exist (clean slate)
        console.log('  🗑️ Cleaning existing tables...');
        const dropTables = [
            'track_composers', 'track_artists', 'splitsheets', 'content_calendar',
            'activity_log', 'checklist_items', 'tracks', 'producers', 
            'composers', 'artists', 'album_info'
        ];
        
        for (const tableName of dropTables) {
            try {
                await query(`DROP TABLE IF EXISTS ${tableName}`);
                console.log(`    Dropped: ${tableName}`);
            } catch (dropErr) {
                console.log(`    (Table ${tableName} did not exist)`);
            }
        }
        
        // Step 2: Create base tables (no foreign keys)
        console.log('  📦 Creating base tables...');
        
        const baseTables = [
            {
                name: 'tracks',
                sql: `CREATE TABLE tracks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    track_number INT NOT NULL UNIQUE,
                    title VARCHAR(255) NOT NULL,
                    producer_id INT,
                    recording_date DATE,
                    duration VARCHAR(20),
                    lyrics LONGTEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    splitsheet_sent BOOLEAN DEFAULT 0,
                    splitsheet_confirmed BOOLEAN DEFAULT 0,
                    content_count INT DEFAULT 0,
                    track_type VARCHAR(50) DEFAULT 'album',
                    is_single BOOLEAN DEFAULT 0,
                    is_primary BOOLEAN DEFAULT 0,
                    features VARCHAR(255),
                    file_path VARCHAR(500),
                    audio_file_path VARCHAR(500),
                    audio_file_type VARCHAR(50),
                    cover_image_path VARCHAR(500),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'album_info',
                sql: `CREATE TABLE album_info (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) DEFAULT 'El Inmortal 2',
                    artist VARCHAR(255) DEFAULT 'Galante el Emperador',
                    cover_image_path VARCHAR(500),
                    release_date DATE,
                    status VARCHAR(50) DEFAULT 'upcoming',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'producers',
                sql: `CREATE TABLE producers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    legal_name VARCHAR(255),
                    email VARCHAR(255) NOT NULL UNIQUE,
                    phone VARCHAR(50),
                    address TEXT,
                    split_percentage VARCHAR(50) DEFAULT '50/50',
                    status VARCHAR(50) DEFAULT 'active',
                    avatar_path VARCHAR(500),
                    avatar_crop_data JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'composers',
                sql: `CREATE TABLE composers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255),
                    phone VARCHAR(50),
                    avatar_path VARCHAR(500),
                    avatar_crop_data JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'artists',
                sql: `CREATE TABLE artists (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255),
                    phone VARCHAR(50),
                    avatar_path VARCHAR(500),
                    avatar_crop_data JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'checklist_items',
                sql: `CREATE TABLE checklist_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    category VARCHAR(100) NOT NULL,
                    item_text TEXT NOT NULL,
                    priority VARCHAR(50) DEFAULT 'normal',
                    completed BOOLEAN DEFAULT 0,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME
                )`
            },
            {
                name: 'activity_log',
                sql: `CREATE TABLE activity_log (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    action VARCHAR(100) NOT NULL,
                    entity_type VARCHAR(100),
                    entity_id INT,
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            }
        ];

        for (const table of baseTables) {
            try {
                await query(table.sql);
                console.log(`    ✅ ${table.name}`);
            } catch (tableErr) {
                console.error(`    ❌ Error creating ${table.name}:`, tableErr.message);
                throw tableErr;
            }
        }
        
        // Step 3: Create junction tables with foreign keys
        console.log('  🔗 Creating junction tables...');
        
        const junctionTables = [
            {
                name: 'track_composers',
                sql: `CREATE TABLE track_composers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    track_id INT NOT NULL,
                    composer_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                    FOREIGN KEY (composer_id) REFERENCES composers(id) ON DELETE CASCADE
                )`
            },
            {
                name: 'track_artists',
                sql: `CREATE TABLE track_artists (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    track_id INT NOT NULL,
                    artist_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
                )`
            },
            {
                name: 'splitsheets',
                sql: `CREATE TABLE splitsheets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    track_id INT NOT NULL,
                    producer_id INT NOT NULL,
                    artist_percentage INT DEFAULT 50,
                    producer_percentage INT DEFAULT 50,
                    document_path VARCHAR(500),
                    sent_date DATETIME,
                    confirmed_date DATETIME,
                    status VARCHAR(50) DEFAULT 'pending',
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                    FOREIGN KEY (producer_id) REFERENCES producers(id) ON DELETE CASCADE
                )`
            },
            {
                name: 'content_calendar',
                sql: `CREATE TABLE content_calendar (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    day_number INT NOT NULL,
                    date DATE NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    content_type VARCHAR(100) NOT NULL,
                    platform VARCHAR(100) NOT NULL,
                    description TEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    completed BOOLEAN DEFAULT 0,
                    track_id INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL
                )`
            }
        ];

        for (const table of junctionTables) {
            try {
                await query(table.sql);
                console.log(`    ✅ ${table.name}`);
            } catch (tableErr) {
                console.error(`    ❌ Error creating ${table.name}:`, tableErr.message);
                throw tableErr;
            }
        }

        console.log('✅ All MySQL tables initialized');
    } catch (err) {
        console.error('❌ Error initializing tables:', err.message);
        throw err;
    }
}

// Data for El Inmortal 2 album
const fs = require('fs');
const path = require('path');

// Dropbox paths for album content
const DROPBOX_BASE = 'C:/Users/AlexSerrano/Dropbox/GALANTE_CONTENT/El Inmortal 2';
const LETRAS_PATH = path.join(DROPBOX_BASE, 'letras');
const MASTERED_PATH = path.join(DROPBOX_BASE, 'ALBUM MASTERED');

// Track data with file mappings
const albumTracks = [
    { track_number: 1, title: "Si El Mundo Se Acabara", producers: "Yow Fade & ALX", features: null, 
      lyrics_file: "01 Galante El Emperador - Si El Mundo Se Acabara [LETRA] - Prod By Yow Fade & ALX.md",
      audio_file: "01 Galante El Emperador - Si El Mundo Se Acabara - Prod By Yow Fade & ALX.wav" },
    { track_number: 2, title: "Toda Para Mi 2", producers: "Askenax, Anthony The Producer & ALX", features: null,
      lyrics_file: "02 Galante El Emperador - Toda Para Mi 2 [LETRA] - Prod By Askenax, Anthony The Producer & ALX.md",
      audio_file: "02 Galante El Emperador - Toda Para Mi 2 - Prod By Askenax, Anthony The Producer & ALX.wav" },
    { track_number: 3, title: "Dime Ahora Remix", producers: "Askenax, Yow Fade & ALX", features: "Genio La Musa, Killatonez",
      lyrics_file: "03 Galante El Emperador Ft. Genio La Musa, Killatonez - Dime Ahora Remix [LETRA] - Prod By Askenax, Yow Fade & ALX.md",
      audio_file: "03 Galante El Emperador Ft. Genio La Musa, Killatonez - Dime Ahora Remix - Prod By Askenax, Yow Fade & ALX.wav" },
    { track_number: 4, title: "Pa Buscarte", producers: "Anthony The Producer & ALX", features: "Tiana Estebanez",
      lyrics_file: "04 Galante El Emperador  Ft Tiana Estebanez - Pa Buscarte [LETRA] - Prod By Anthony The Producer & ALX.md",
      audio_file: "04 Galante El Emperador Ft. Tiana Estebanez - Pa Buscarte - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 5, title: "Come Calla", producers: "Yow Fade, Bryan LMDE & ALX", features: null,
      lyrics_file: "05 Galante El Emperador - Come Calla [LETRA] - Prod By Yow Fade, Bryan LMDE & ALX copy.md",
      audio_file: "05 Galante El Emperador - Come Calla - Prod By Yow Fade, Bryan LMDE & ALX copy.wav" },
    { track_number: 6, title: "Ya Te Mudaste", producers: "Askenax & ALX", features: null,
      lyrics_file: "06 Galante El Emperador -Ya Te Mudaste [LETRA]- Prod By Askenax & ALX.md",
      audio_file: "06 Galante El Emperador - Ya Te Mudaste - Prod By Askenax & ALX.wav" },
    { track_number: 7, title: "Si Te Vuelvo A Ver", producers: "Wutti, Melody & ALX", features: "Bayriton",
      lyrics_file: "07 Galante El Emperador - Si Te Vuelvo A Ver Ft Bayriton [LETRA]- Prod By Wutti, Melody & ALX.md",
      audio_file: "07 Galante El Emperador - Si Te Vuelvo A Ver Ft Bayriton - Prod By Wutti, Melody & ALX.wav" },
    { track_number: 8, title: "Mi Tentacion", producers: "Anthony The Producer & ALX", features: "Dilox",
      lyrics_file: "08 Galante El Emperador  Ft Dilox - Mi Tentacion [LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "08 Galante El Emperador  Ft Dilox - Mi Tentacion - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 9, title: "Casi Algo", producers: "Anthony The Producer & ALX", features: null,
      lyrics_file: "09 Galante El Emperador - Casi Algo [LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "09 Galante El Emperador - Casi Algo - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 10, title: "Cuenta Fantasma", producers: "Music Zone & ALX", features: "Dixon Versatil",
      lyrics_file: "10 Galante El Emperador Ft Dixon Versatil - Cuenta Fantasma [LETRA]- Prod By Music Zone & ALX.md",
      audio_file: "10 Galante El Emperador Ft Dixon Versatil - Cuenta Fantasma - Prod By Music Zone & ALX.wav" },
    { track_number: 11, title: "Inaceptable", producers: "Anthony The Producer & ALX", features: "Manny Eztilo",
      lyrics_file: "11 Galante El Emperador - Inaceptable Ft Manny Eztilo  [LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "11 Galante El Emperador - Inaceptable Ft Manny Eztilo - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 12, title: "No Se Que Somos", producers: "Wutti & ALX", features: null,
      lyrics_file: "12  Galante El Emperador - No Se Que Somos LETRA]- Prod By Wutti & ALX.md",
      audio_file: "12  Galante El Emperador - No Se Que Somos - Prod By Wutti & ALX.wav" },
    { track_number: 13, title: "No Te Enamores", producers: "Askenax, Wutti & ALX", features: "LaDeLaJotaa",
      lyrics_file: "13 Galante El Emperador Ft. LaDeLaJotaa- No Te Enamores [LETRA] - Prod By Askenax, Wutti & ALX.md",
      audio_file: "13 Galante El Emperador Ft. LaDeLaJotaa- No Te Enamores - Prod By Askenax, Wutti & ALX.md.wav" },
    { track_number: 14, title: "Siguele", producers: "Anthony The Producer & ALX", features: null,
      lyrics_file: "14 Galante El Emperador - Siguele LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "14 Galante El Emperador - Siguele - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 15, title: "No Me Quieres Entender", producers: "DMT Level & ALX", features: "Lenny Low",
      lyrics_file: "15  Galante El Emperador Ft Lenny Low - No Me Quieres Entender  [LETRA]- Prod By DMT Level & ALX.md",
      audio_file: "15  Galante El Emperador Ft Lenny Low - No Me Quieres Entender - Prod By DMT Level & ALX.wav" },
    { track_number: 16, title: "Sigo En La Mia", producers: "Wutti & ALX", features: "Daizak",
      lyrics_file: "16  Galante El Emperador Ft Daizak - Sigo En La Mia LETRA] - Prod By Wutti & ALX.md",
      audio_file: "16  Galante El Emperador Ft Daizak - Sigo En La Mia - Prod By Wutti & ALX.wav" },
    { track_number: 17, title: "En La Nave", producers: "Wutti & ALX", features: "Sota One",
      lyrics_file: "17  Galante El Emperador Ft Sota One - En La Nave LETRA] - Prod By Wutti & ALX.md",
      audio_file: "17  Galante El Emperador Ft Sota One - En La Nave - Prod By Wutti & ALX.wav" },
    { track_number: 18, title: "Tu Pirata", producers: "UBeats & ALX", features: "Pablo Nick",
      lyrics_file: "18  Galante El Emperador Ft Pablo Nick - Tu Pirata [LETRA] - Prod By UBeats & ALX.md",
      audio_file: "18 Galante El Emperador Ft Pablonick - Tu Pirata - Prod By UBeats & ALX.wav" },
    { track_number: 19, title: "Al Que Se Meta Remix", producers: "Yeizel & ALX", features: "Joe Yncio",
      lyrics_file: "19 Galante El Emperador Ft. Joe Yncio - Al Que Se Meta Remix [LETRA] - Prod By Yeizel  & ALX.md",
      audio_file: "19 Galante El Emperador Ft. Joe Yncio - Al Que Se Meta Remix - Prod By Yeizel  & ALX.wav" },
    { track_number: 20, title: "Pa Chingal", producers: "Wutti & ALX", features: null,
      lyrics_file: "20 Galante El Emperador  - Pa Chingal  [LETRA] - Prod By Wutti  & ALX.md",
      audio_file: "20 Galante El Emperador  - Pa Chingal - Prod By Wutti  & ALX.wav" },
    { track_number: 21, title: "Las Eleven", producers: "Wutti & ALX", features: null,
      lyrics_file: "21 Galante El Emperador  - Las Eleven  [LETRA] - Prod By Wutti  & ALX.md",
      audio_file: "21 Galante El Emperador  - Las Eleven - Prod By Wutti  & ALX.wav" }
];

const albumChecklist = [
    // Track-specific items
    { category: 'Distribución', item_text: 'Upload tracks to distributor', priority: 'urgent' },
    { category: 'Metadata', item_text: 'Verify all track metadata', priority: 'high' },
    { category: 'Contenido', item_text: 'Create lyric videos for all tracks', priority: 'normal' },
    { category: 'Marketing', item_text: 'Create Instagram Reels content', priority: 'normal' },
    { category: 'Marketing', item_text: 'Create TikTok content', priority: 'normal' },
    { category: 'Planificación', item_text: 'Add all tracks to content calendar', priority: 'normal' },
    { category: 'Diseño', item_text: 'Design cover art for all tracks', priority: 'normal' },
    { category: 'Contenido', item_text: 'Create Spotify Canvas for tracks', priority: 'low' },
    
    // General items
    { category: 'Urgente', item_text: 'Finalizar artwork del álbum', priority: 'urgent' },
    { category: 'Urgente', item_text: 'Enviar splitsheets a todos los productores', priority: 'urgent' },
    { category: 'Urgente', item_text: 'Confirmar recepción de todos los splitsheets', priority: 'urgent' },
    { category: 'Marketing', item_text: 'Configurar pre-save links', priority: 'high' },
    { category: 'Marketing', item_text: 'Actualizar perfiles de redes sociales', priority: 'high' },
    { category: 'Marketing', item_text: 'Preparar press kit', priority: 'high' },
    { category: 'Planificación', item_text: 'Crear calendario de contenido completo', priority: 'high' },
    { category: 'Distribución', item_text: 'Verificar distribución en todas las plataformas', priority: 'high' },
    { category: 'Marketing', item_text: 'Programar posts para día del lanzamiento', priority: 'high' },
    { category: 'Marketing', item_text: 'Enviar email a lista de fans', priority: 'normal' },
    { category: 'Marketing', item_text: 'Crear playlist de lanzamiento en Spotify', priority: 'normal' },
    { category: 'PR', item_text: 'Contactar blogs y medios', priority: 'normal' },
    { category: 'Ventas', item_text: 'Preparar merch (si aplica)', priority: 'low' },
    { category: 'Eventos', item_text: 'Planificar live/stream de lanzamiento', priority: 'normal' }
];

// Seed initial data
async function seedInitialData() {
    try {
        // Check if data already exists
        const existingTracks = await getOne('SELECT COUNT(*) as count FROM tracks');
        if (existingTracks && existingTracks.count > 0) {
            console.log('ℹ️ Database already has data, skipping seed');
            return;
        }
        
        console.log('🌱 Seeding initial data for El Inmortal 2...');
        
        // Extract unique producers
        const uniqueProducers = new Set();
        albumTracks.forEach(track => {
            const producers = track.producers.split(/,\s*&\s*|\s*&\s*|,\s*/);
            producers.forEach(p => uniqueProducers.add(p.trim()));
        });
        
        // Seed producers
        const producerMap = {};
        for (const producerName of uniqueProducers) {
            const existing = await getOne('SELECT id FROM producers WHERE name = ?', [producerName]);
            if (existing) {
                producerMap[producerName] = existing.id;
            } else {
                const result = await run(
                    'INSERT INTO producers (name, email, split_percentage) VALUES (?, ?, ?)',
                    [producerName, `${producerName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`, '50/50']
                );
                producerMap[producerName] = result.lastID;
                console.log(`  ✅ Producer: ${producerName}`);
            }
        }
        
        // Seed tracks with lyrics and audio paths
        for (const track of albumTracks) {
            const primaryProducer = track.producers.split(/,\s*&\s*|\s*&\s*|,\s*/)[0].trim();
            const producerId = producerMap[primaryProducer] || null;
            
            // Read lyrics from Dropbox file
            let lyrics = '';
            const lyricsFilePath = path.join(LETRAS_PATH, track.lyrics_file);
            try {
                if (fs.existsSync(lyricsFilePath)) {
                    lyrics = fs.readFileSync(lyricsFilePath, 'utf8');
                }
            } catch (err) {
                console.log(`  ⚠️ Error reading lyrics for track ${track.track_number}: ${err.message}`);
            }
            
            // Store Dropbox path for audio file
            const audioFilePath = path.join(MASTERED_PATH, track.audio_file);
            
            await run(
                `INSERT INTO tracks (track_number, title, producer_id, features, lyrics, audio_file_path, audio_file_type, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [track.track_number, track.title, producerId, track.features, lyrics, audioFilePath, 'Master', 'completed']
            );
            console.log(`  ✅ Track ${track.track_number}: ${track.title}`);
        }
        
        // Seed checklist items
        for (const item of albumChecklist) {
            await run(
                'INSERT INTO checklist_items (category, item_text, priority) VALUES (?, ?, ?)',
                [item.category, item.item_text, item.priority]
            );
        }
        console.log(`  ✅ ${albumChecklist.length} checklist items`);
        
        console.log('🎉 Database seeding completed!');
    } catch (err) {
        console.error('❌ Error seeding database:', err.message);
    }
}

module.exports = {
    getPool,
    query,
    getOne,
    getAll,
    run,
    initializeTables,
    seedInitialData
};
