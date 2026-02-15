const { getDatabase } = require('../config/database');

console.log('🎵📝👥 Agregando tablas de Compositores y Artistas...\n');

const db = getDatabase();

const queries = [
    // Tabla de Compositores
    `CREATE TABLE IF NOT EXISTS composers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        legal_name TEXT,
        email TEXT,
        phone TEXT,
        publisher TEXT,
        PRO_affiliation TEXT,
        IPI_number TEXT,
        split_percentage TEXT DEFAULT '50/50',
        notes TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Tabla de Artistas/Features
    `CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        legal_name TEXT,
        email TEXT,
        phone TEXT,
        artist_type TEXT DEFAULT 'featured',
        record_label TEXT,
        management TEXT,
        social_media TEXT,
        notes TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Tabla de relación Tracks-Compositores
    `CREATE TABLE IF NOT EXISTS track_composers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        composer_id INTEGER NOT NULL,
        split_percentage TEXT DEFAULT '50/50',
        role TEXT DEFAULT 'composer',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (track_id) REFERENCES tracks(id),
        FOREIGN KEY (composer_id) REFERENCES composers(id)
    )`,
    
    // Tabla de relación Tracks-Artistas
    `CREATE TABLE IF NOT EXISTS track_artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,
        role TEXT DEFAULT 'featured',
        verse_order INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (track_id) REFERENCES tracks(id),
        FOREIGN KEY (artist_id) REFERENCES artists(id)
    )`,
    
    // Agregar columna composer_id a tracks
    `ALTER TABLE tracks ADD COLUMN composer_id INTEGER`,
    
    // Agregar columna primary_artist_id a tracks
    `ALTER TABLE tracks ADD COLUMN primary_artist_id INTEGER`
];

let completed = 0;
let errors = 0;

queries.forEach((query, index) => {
    db.run(query, (err) => {
        if (err) {
            if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
                console.log(`  ℹ️  Query ${index + 1} ya existe`);
            } else {
                console.log(`  ⚠️  Error en query ${index + 1}: ${err.message}`);
                errors++;
            }
        } else {
            console.log(`  ✅ Query ${index + 1} ejecutada`);
            completed++;
        }
        
        if (index === queries.length - 1) {
            console.log(`\n📊 Resumen:`);
            console.log(`  ✅ ${completed} queries nuevas`);
            console.log(`  ⚠️  ${errors} errores`);
            console.log(`\n🎉 Tablas de Compositores y Artistas listas!`);
            
            db.close();
        }
    });
});