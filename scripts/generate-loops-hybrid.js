#!/usr/bin/env node

/**
 * Hybrid Loop Generator
 * Combina FFmpeg y Essentia para generar loops de alta calidad
 * Intenta Essentia primero, fallback a FFmpeg
 */

const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const { analyzeAndExtractLoops } = require('./generate-loops-ffmpeg');

const execPromise = util.promisify(exec);

// Directorios
const LOOPS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'loops');
const AUDIO_DIR = path.join(__dirname, '..', 'public', 'uploads', 'audio');

// Asegurar directorio de loops
if (!fs.existsSync(LOOPS_DIR)) {
    fs.mkdirSync(LOOPS_DIR, { recursive: true });
}

/**
 * Ejecuta el script de Python de Essentia
 * @param {string} audioFile - Ruta al archivo de audio
 * @param {string} trackId - ID del track
 * @returns {Promise<Object>} - Resultado del análisis
 */
async function runEssentiaAnalysis(audioFile, trackId) {
    try {
        const scriptPath = path.join(__dirname, 'generate-loops-essentia.py');
        
        // Verificar que existe Python y Essentia
        const { stdout } = await execPromise(
            `python "${scriptPath}" "${audioFile}" "${trackId}"`,
            { timeout: 120000 }
        );
        
        // Parsear JSON de la salida
        const lines = stdout.split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('{'));
        
        if (jsonLine) {
            return JSON.parse(jsonLine);
        }
        
        return { success: false, error: 'No JSON output from Essentia' };
        
    } catch (error) {
        console.log('[Hybrid] Essentia falló, usando fallback:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Extrae un segmento de audio usando FFmpeg
 * @param {string} audioFile - Archivo fuente
 * @param {number} start - Inicio en segundos
 * @param {number} duration - Duración en segundos
 * @param {string} outputFile - Archivo de salida
 */
async function extractSegment(audioFile, start, duration, outputFile) {
    try {
        await execPromise(
            `ffmpeg -i "${audioFile}" -ss ${start} -t ${duration} -c copy -y "${outputFile}"`,
            { timeout: 30000 }
        );
        return true;
    } catch (error) {
        console.error(`[Hybrid] Error extrayendo:`, error.message);
        return false;
    }
}

/**
 * Genera loops usando el método híbrido
 * @param {string} audioFile - Ruta al archivo de audio
 * @param {number|string} trackId - ID del track
 * @returns {Promise<Object>} - Resultado
 */
async function generateLoopsHybrid(audioFile, trackId) {
    console.log(`\n🎵 [Hybrid] Procesando track ${trackId}: ${path.basename(audioFile)}`);
    console.log('=' .repeat(60));
    
    try {
        // Verificar archivo
        if (!fs.existsSync(audioFile)) {
            throw new Error(`Archivo no encontrado: ${audioFile}`);
        }
        
        let segments = [];
        let method = 'unknown';
        
        // Intento 1: Essentia (más preciso musicalmente)
        console.log('[Hybrid] Intentando análisis con Essentia...');
        const essentiaResult = await runEssentiaAnalysis(audioFile, trackId);
        
        if (essentiaResult.success && essentiaResult.segments && essentiaResult.segments.length >= 4) {
            console.log('[Hybrid] ✅ Essentia exitoso');
            segments = essentiaResult.segments;
            method = 'essentia';
        } else {
            // Intento 2: FFmpeg (fallback)
            console.log('[Hybrid] ⚠️  Essentia no disponible o insuficiente, usando FFmpeg...');
            const ffmpegResult = await analyzeAndExtractLoops(audioFile, trackId);
            
            if (ffmpegResult.success && ffmpegResult.loops) {
                segments = ffmpegResult.loops.map(l => ({
                    start: l.start,
                    end: l.end,
                    confidence: l.confidence
                }));
                method = 'ffmpeg';
            } else {
                throw new Error('Ambos métodos de análisis fallaron');
            }
        }
        
        // Extraer los segmentos a archivos
        console.log(`[Hybrid] Extrayendo ${segments.length} loops...`);
        const extractedLoops = [];
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const outputFile = path.join(LOOPS_DIR, `track_${trackId}_loop_${i + 1}.wav`);
            
            // Verificar si ya existe
            if (fs.existsSync(outputFile)) {
                console.log(`[Hybrid] Loop ${i + 1} ya existe, omitiendo`);
                extractedLoops.push({
                    index: i + 1,
                    file: outputFile,
                    exists: true
                });
                continue;
            }
            
            const success = await extractSegment(
                audioFile, 
                segment.start, 
                segment.end - segment.start, 
                outputFile
            );
            
            if (success) {
                extractedLoops.push({
                    index: i + 1,
                    start: segment.start,
                    end: segment.end,
                    file: outputFile,
                    confidence: segment.confidence || 0.5
                });
                console.log(`[Hybrid] ✅ Loop ${i + 1} extraído: ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s`);
            } else {
                console.error(`[Hybrid] ❌ Error extrayendo loop ${i + 1}`);
            }
        }
        
        console.log(`\n✅ [Hybrid] Completado: ${extractedLoops.length} loops generados`);
        console.log(`   Método usado: ${method}`);
        
        return {
            success: true,
            trackId,
            method,
            loops: extractedLoops,
            count: extractedLoops.length
        };
        
    } catch (error) {
        console.error('[Hybrid] ❌ Error:', error.message);
        return {
            success: false,
            error: error.message,
            trackId
        };
    }
}

// Si se ejecuta directamente
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Uso: node generate-loops-hybrid.js <audio-file> <track-id>');
        console.log('');
        console.log('Ejemplo:');
        console.log('  node generate-loops-hybrid.js "../public/uploads/audio/song.wav" 123');
        process.exit(1);
    }
    
    const [audioFile, trackId] = args;
    
    generateLoopsHybrid(audioFile, trackId)
        .then(result => {
            console.log('\n📊 Resultado:');
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Error fatal:', error);
            process.exit(1);
        });
}

module.exports = {
    generateLoopsHybrid,
    runEssentiaAnalysis
};
