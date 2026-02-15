const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

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

async function initializeTables() {
    const db = getDatabase();
    
    // Helper function to run SQL with promises
    const runSQL = (sql) => {
        return new Promise((resolve, reject) => {
            db.run(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    };
    
    try {
        // Tracks table with file support
        await runSQL(`
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
                track_type TEXT DEFAULT 'album',
                is_single BOOLEAN DEFAULT 0,
                is_primary BOOLEAN DEFAULT 0,
                features TEXT,
                file_path TEXT,
                audio_file_path TEXT,
                audio_file_type TEXT,
                cover_image_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (producer_id) REFERENCES producers(id)
            )
        `);

        // Album info table
        await runSQL(`
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
        await runSQL(`
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

        // Composers table
        await runSQL(`
            CREATE TABLE IF NOT EXISTS composers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Artists table
        await runSQL(`
            CREATE TABLE IF NOT EXISTS artists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Track-Composers junction table
        await runSQL(`
            CREATE TABLE IF NOT EXISTS track_composers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                composer_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (track_id) REFERENCES tracks(id),
                FOREIGN KEY (composer_id) REFERENCES composers(id)
            )
        `);

        // Track-Artists junction table
        await runSQL(`
            CREATE TABLE IF NOT EXISTS track_artists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                artist_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (track_id) REFERENCES tracks(id),
                FOREIGN KEY (artist_id) REFERENCES artists(id)
            )
        `);

        // Splitsheets table
        await runSQL(`
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
        await runSQL(`
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
        await runSQL(`
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
        await runSQL(`
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
    } catch (err) {
        console.error('❌ Error initializing tables:', err.message);
        throw err;
    }
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

const fs = require('fs');
const path = require('path');

// Dropbox paths for album content
const DROPBOX_BASE = 'C:/Users/AlexSerrano/Dropbox/GALANTE_CONTENT/El Inmortal 2';
const LETRAS_PATH = path.join(DROPBOX_BASE, 'letras');
const MASTERED_PATH = path.join(DROPBOX_BASE, 'ALBUM MASTERED');

// Data for El Inmortal 2 album with Dropbox paths
const albumData = {
    tracks: [
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
    ],
    
    checklistItems: [
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
    ]
};

async function seedInitialData() {
    const db = getDatabase();
    
    const runSQL = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    };
    
    const getOne = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    };
    
    try {
        // Check if data already exists
        const existingTracks = await getOne('SELECT COUNT(*) as count FROM tracks');
        if (existingTracks && existingTracks.count > 0) {
            console.log('ℹ️  Database already has data, skipping seed');
            return;
        }
        
        console.log('🌱 Seeding initial data for El Inmortal 2...');
        
        // Extract unique producers
        const uniqueProducers = new Set();
        albumData.tracks.forEach(track => {
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
                const result = await runSQL(
                    'INSERT INTO producers (name, email, split_percentage) VALUES (?, ?, ?)',
                    [producerName, `${producerName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`, '50/50']
                );
                producerMap[producerName] = result.lastID;
                console.log(`  ✅ Producer: ${producerName}`);
            }
        }
        
        // Seed tracks with lyrics and audio paths
        for (const track of albumData.tracks) {
            const primaryProducer = track.producers.split(/,\s*&\s*|\s*&\s*|,\s*/)[0].trim();
            const producerId = producerMap[primaryProducer] || null;
            
            // Read lyrics from Dropbox file
            let lyrics = '';
            const lyricsFilePath = path.join(LETRAS_PATH, track.lyrics_file);
            try {
                if (fs.existsSync(lyricsFilePath)) {
                    lyrics = fs.readFileSync(lyricsFilePath, 'utf8');
                    console.log(`  📝 Lyrics loaded for track ${track.track_number}`);
                } else {
                    console.log(`  ⚠️  Lyrics file not found: ${track.lyrics_file}`);
                }
            } catch (err) {
                console.log(`  ⚠️  Error reading lyrics for track ${track.track_number}: ${err.message}`);
            }
            
            // Store Dropbox path for audio file
            const audioFilePath = path.join(MASTERED_PATH, track.audio_file);
            
            await runSQL(
                `INSERT INTO tracks (track_number, title, producer_id, features, lyrics, audio_file_path, audio_file_type, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [track.track_number, track.title, producerId, track.features, lyrics, audioFilePath, 'Master', 'completed']
            );
            console.log(`  ✅ Track ${track.track_number}: ${track.title}`);
        }
        
        // Seed checklist items
        for (const item of albumData.checklistItems) {
            await runSQL(
                'INSERT INTO checklist_items (category, item_text, priority) VALUES (?, ?, ?)',
                [item.category, item.item_text, item.priority]
            );
        }
        console.log(`  ✅ ${albumData.checklistItems.length} checklist items`);
        
        console.log('🎉 Database seeding completed!');
    } catch (err) {
        console.error('❌ Error seeding database:', err.message);
    }
}

module.exports = {
    getDatabase,
    closeDatabase,
    initializeTables,
    seedInitialData
};