const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const AUDIO_DIR = path.join(__dirname, '../public/uploads/audio');
const LANDING_AUDIO_DIR = path.join(__dirname, '../public/uploads/audio/landing');

async function convertWavToMp3() {
    console.log('🎵 Iniciando conversión de WAV a MP3 para landing...\n');
    
    // Crear directorio de landing si no existe
    if (!fs.existsSync(LANDING_AUDIO_DIR)) {
        fs.mkdirSync(LANDING_AUDIO_DIR, { recursive: true });
        console.log('✅ Directorio landing creado');
    }
    
    // Obtener todos los archivos WAV
    const files = fs.readdirSync(AUDIO_DIR);
    const wavFiles = files.filter(f => f.endsWith('.wav') && !f.includes('_landing'));
    
    console.log(`📁 Encontrados ${wavFiles.length} archivos WAV\n`);
    
    let converted = 0;
    let failed = 0;
    
    for (const file of wavFiles) {
        const wavPath = path.join(AUDIO_DIR, file);
        const mp3FileName = file.replace('.wav', '_landing.mp3');
        const mp3Path = path.join(LANDING_AUDIO_DIR, mp3FileName);
        
        // Verificar si ya existe
        if (fs.existsSync(mp3Path)) {
            console.log(`⏭️  Saltando ${file} (ya existe)`);
            continue;
        }
        
        console.log(`🔄 Convirtiendo: ${file}`);
        
        try {
            // Usar ffmpeg para convertir a MP3 (192kbps para buena calidad pero archivo pequeño)
            await execPromise(
                `"${process.env.FFMPEG_PATH || 'ffmpeg'}" -i "${wavPath}" -codec:a libmp3lame -q:a 2 "${mp3Path}" -y`,
                { timeout: 120000 }
            );
            
            const originalSize = (fs.statSync(wavPath).size / 1024 / 1024).toFixed(1);
            const newSize = (fs.statSync(mp3Path).size / 1024 / 1024).toFixed(1);
            
            console.log(`   ✅ ${originalSize}MB → ${newSize}MB (${((1 - newSize/originalSize) * 100).toFixed(0)}% reducción)`);
            converted++;
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            failed++;
        }
    }
    
    console.log(`\n📊 Resumen:`);
    console.log(`   ✅ Convertidos: ${converted}`);
    console.log(`   ❌ Fallidos: ${failed}`);
    console.log(`   ⏭️  Existentes: ${wavFiles.length - converted - failed}`);
    console.log(`\n💡 Los archivos MP3 están en: ${LANDING_AUDIO_DIR}`);
}

convertWavToMp3().catch(console.error);