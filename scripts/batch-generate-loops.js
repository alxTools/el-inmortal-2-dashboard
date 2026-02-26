#!/usr/bin/env node

/**
 * Batch Loop Generator
 * Procesa todos los tracks con audio y genera loops
 */

const path = require('path');
const fs = require('fs');
const { generateLoopsHybrid } = require('./generate-loops-hybrid');
const { getAll } = require('../src/config/database');

// Directorios
const AUDIO_DIR = path.join(__dirname, '..', 'public', 'uploads', 'audio');
const LOOPS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'loops');

/**
 * Obtiene todos los tracks con archivos de audio
 */
async function getTracksWithAudio() {
    try {
        const tracks = await getAll(`
            SELECT id, title, audio_file_path 
            FROM tracks 
            WHERE audio_file_path IS NOT NULL 
              AND audio_file_path != ''
            ORDER BY track_number ASC
        `);
        
        // Mapear a archivos locales si existen
        return tracks.map(track => {
            // Intentar encontrar archivo en uploads/audio
            const possiblePaths = [
                track.audio_file_path,
                path.join(AUDIO_DIR, path.basename(track.audio_file_path)),
                path.join(AUDIO_DIR, `track_${track.id}.wav`),
                path.join(AUDIO_DIR, `track_${track.id}.mp3`),
            ];
            
            const foundPath = possiblePaths.find(p => fs.existsSync(p));
            
            return {
                id: track.id,
                title: track.title,
                audioPath: foundPath || null
            };
        }).filter(t => t.audioPath !== null);
        
    } catch (error) {
        console.error('[Batch] Error obteniendo tracks:', error.message);
        return [];
    }
}

/**
 * Escanea el directorio de audio para encontrar archivos
 */
function scanAudioDirectory() {
    try {
        if (!fs.existsSync(AUDIO_DIR)) {
            console.log(`[Batch] Directorio de audio no existe: ${AUDIO_DIR}`);
            return [];
        }
        
        const files = fs.readdirSync(AUDIO_DIR)
            .filter(f => f.match(/\.(wav|mp3|flac|m4a)$/i))
            .map(f => ({
                filename: f,
                path: path.join(AUDIO_DIR, f),
                // Intentar extraer track ID del nombre
                trackId: f.match(/track[_-]?(\d+)/i)?.[1] || null
            }));
        
        return files;
        
    } catch (error) {
        console.error('[Batch] Error escaneando directorio:', error.message);
        return [];
    }
}

/**
 * Procesa todos los tracks en batch
 */
async function processAllTracks(options = {}) {
    const {
        force = false,        // Regenerar loops existentes
        specificTrack = null, // Procesar solo un track específico
        dryRun = false        // No generar archivos, solo mostrar qué se haría
    } = options;
    
    console.log('🎵 BATCH LOOP GENERATOR');
    console.log('=' .repeat(60));
    console.log(`Opciones: force=${force}, dryRun=${dryRun}`);
    console.log('');
    
    // Asegurar directorio de loops
    if (!fs.existsSync(LOOPS_DIR) && !dryRun) {
        fs.mkdirSync(LOOPS_DIR, { recursive: true });
    }
    
    let tracksToProcess = [];
    
    // Obtener tracks de la base de datos o del directorio
    if (specificTrack) {
        // Buscar track específico
        const dbTracks = await getTracksWithAudio();
        const track = dbTracks.find(t => t.id == specificTrack || t.title.includes(specificTrack));
        
        if (track) {
            tracksToProcess = [track];
        } else {
            // Buscar en directorio
            const dirFiles = scanAudioDirectory();
            const file = dirFiles.find(f => f.trackId == specificTrack || f.filename.includes(specificTrack));
            
            if (file) {
                tracksToProcess = [{
                    id: file.trackId || 'unknown',
                    title: file.filename,
                    audioPath: file.path
                }];
            }
        }
    } else {
        // Obtener todos los tracks
        tracksToProcess = await getTracksWithAudio();
        
        // Si no hay tracks en DB, escanear directorio
        if (tracksToProcess.length === 0) {
            const dirFiles = scanAudioDirectory();
            tracksToProcess = dirFiles.map((f, idx) => ({
                id: f.trackId || (idx + 1),
                title: f.filename,
                audioPath: f.path
            }));
        }
    }
    
    console.log(`[Batch] ${tracksToProcess.length} tracks encontrados para procesar`);
    console.log('');
    
    if (tracksToProcess.length === 0) {
        console.log('⚠️  No se encontraron tracks con audio');
        return { success: false, reason: 'no_tracks_found' };
    }
    
    // Filtrar tracks que ya tienen loops (a menos que force=true)
    const tracksNeedingProcessing = tracksToProcess.filter(track => {
        if (force) return true;
        
        // Verificar si ya existen 4 loops
        const existingLoops = [];
        for (let i = 1; i <= 4; i++) {
            const loopPath = path.join(LOOPS_DIR, `track_${track.id}_loop_${i}.wav`);
            if (fs.existsSync(loopPath)) {
                existingLoops.push(loopPath);
            }
        }
        
        if (existingLoops.length >= 4) {
            console.log(`[Batch] Track ${track.id} ya tiene ${existingLoops.length} loops, omitiendo`);
            return false;
        }
        
        return true;
    });
    
    console.log(`[Batch] ${tracksNeedingProcessing.length} tracks necesitan procesamiento`);
    console.log('');
    
    if (tracksNeedingProcessing.length === 0) {
        console.log('✅ Todos los tracks ya tienen loops generados');
        return { success: true, processed: 0, total: tracksToProcess.length };
    }
    
    if (dryRun) {
        console.log('🔍 DRY RUN - No se generarán archivos');
        console.log('Tracks a procesar:');
        tracksNeedingProcessing.forEach(t => {
            console.log(`  - ${t.id}: ${t.title} (${t.audioPath})`);
        });
        return { success: true, dryRun: true, wouldProcess: tracksNeedingProcessing.length };
    }
    
    // Procesar tracks
    const results = {
        success: [],
        failed: [],
        totalLoops: 0
    };
    
    for (let i = 0; i < tracksNeedingProcessing.length; i++) {
        const track = tracksNeedingProcessing[i];
        
        console.log(`\n[${i + 1}/${tracksNeedingProcessing.length}] Procesando: ${track.title}`);
        console.log('-'.repeat(60));
        
        try {
            const result = await generateLoopsHybrid(track.audioPath, track.id);
            
            if (result.success) {
                results.success.push({
                    trackId: track.id,
                    title: track.title,
                    loops: result.count,
                    method: result.method
                });
                results.totalLoops += result.count;
                
                console.log(`✅ Éxito: ${result.count} loops generados (${result.method})`);
            } else {
                results.failed.push({
                    trackId: track.id,
                    title: track.title,
                    error: result.error
                });
                console.error(`❌ Error: ${result.error}`);
            }
            
        } catch (error) {
            results.failed.push({
                trackId: track.id,
                title: track.title,
                error: error.message
            });
            console.error(`❌ Error fatal: ${error.message}`);
        }
        
        // Pequeña pausa entre tracks para no saturar
        if (i < tracksNeedingProcessing.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // Resumen
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN');
    console.log('='.repeat(60));
    console.log(`Total tracks procesados: ${tracksNeedingProcessing.length}`);
    console.log(`Exitosos: ${results.success.length}`);
    console.log(`Fallidos: ${results.failed.length}`);
    console.log(`Total loops generados: ${results.totalLoops}`);
    
    if (results.failed.length > 0) {
        console.log('\n❌ Tracks fallidos:');
        results.failed.forEach(f => {
            console.log(`  - ${f.trackId}: ${f.title} (${f.error})`);
        });
    }
    
    return {
        success: results.failed.length === 0,
        processed: tracksNeedingProcessing.length,
        successful: results.success.length,
        failed: results.failed.length,
        totalLoops: results.totalLoops,
        failures: results.failed
    };
}

// Si se ejecuta directamente
if (require.main === module) {
    const args = process.argv.slice(2);
    
    // Parsear argumentos
    const options = {
        force: args.includes('--force') || args.includes('-f'),
        dryRun: args.includes('--dry-run') || args.includes('-d'),
        specificTrack: null
    };
    
    // Buscar track específico
    const trackArg = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));
    if (trackArg) {
        options.specificTrack = trackArg;
    }
    
    // Mostrar ayuda
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Uso: node batch-generate-loops.js [opciones] [track-id|track-name]');
        console.log('');
        console.log('Opciones:');
        console.log('  --force, -f        Regenerar loops existentes');
        console.log('  --dry-run, -d      Mostrar qué se haría sin generar archivos');
        console.log('  --help, -h         Mostrar esta ayuda');
        console.log('');
        console.log('Ejemplos:');
        console.log('  node batch-generate-loops.js              # Procesar todos los tracks');
        console.log('  node batch-generate-loops.js 123          # Procesar track específico');
        console.log('  node batch-generate-loops.js --force      # Regenerar todos');
        console.log('  node batch-generate-loops.js --dry-run    # Ver qué se procesaría');
        process.exit(0);
    }
    
    processAllTracks(options)
        .then(result => {
            console.log('\n✨ Proceso completado');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Error fatal:', error);
            process.exit(1);
        });
}

module.exports = {
    processAllTracks,
    getTracksWithAudio,
    scanAudioDirectory
};
