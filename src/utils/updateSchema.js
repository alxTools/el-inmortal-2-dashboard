const { getDatabase } = require('../config/database');

console.log('🗄️  Actualizando schema de base de datos para archivos...\n');

const db = getDatabase();

// Add new columns to tracks table
const alterTableQueries = [
    `ALTER TABLE tracks ADD COLUMN track_type TEXT DEFAULT 'album'`,
    `ALTER TABLE tracks ADD COLUMN is_single BOOLEAN DEFAULT 0`,
    `ALTER TABLE tracks ADD COLUMN is_primary BOOLEAN DEFAULT 0`,
    `ALTER TABLE tracks ADD COLUMN features TEXT`,
    `ALTER TABLE tracks ADD COLUMN audio_file_path TEXT`,
    `ALTER TABLE tracks ADD COLUMN audio_file_type TEXT`,
    `ALTER TABLE tracks ADD COLUMN cover_image_path TEXT`
];

let completed = 0;
let errors = 0;

alterTableQueries.forEach((query, index) => {
    db.run(query, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log(`  ℹ️  Columna ${index + 1} ya existe`);
            } else {
                console.log(`  ⚠️  Error en columna ${index + 1}: ${err.message}`);
                errors++;
            }
        } else {
            console.log(`  ✅ Columna ${index + 1} agregada`);
            completed++;
        }
        
        if (index === alterTableQueries.length - 1) {
            // Create album_info table
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
            `, (err) => {
                if (err) {
                    console.log(`  ⚠️  Error creando tabla album_info: ${err.message}`);
                } else {
                    console.log(`  ✅ Tabla album_info creada/verificada`);
                }
                
                console.log(`\n📊 Resumen:`);
                console.log(`  ✅ ${completed} columnas nuevas agregadas`);
                console.log(`  ⚠️  ${errors} errores (probablemente columnas ya existen)`);
                console.log(`\n🎉 Schema actualizado!`);
                
                db.close();
            });
        }
    });
});