const { run, getOne } = require('../src/config/database');

console.log('🎵 Agregando columna audio_description a tracks...\n');

async function migrate() {
    try {
        // Intentar agregar la columna directamente
        try {
            await run(`ALTER TABLE tracks ADD COLUMN audio_description TEXT`);
            console.log('✅ Columna audio_description agregada exitosamente');
        } catch (err) {
            if (err.message.includes('Duplicate column') || 
                err.message.includes('already exists') ||
                err.message.includes('duplicate column')) {
                console.log('ℹ️  La columna audio_description ya existe');
            } else {
                throw err;
            }
        }
        
        console.log('\n🎉 Migración completada!');
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    }
}

migrate();