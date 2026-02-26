#!/usr/bin/env node

/**
 * FFmpeg Loop Generator
 * Analiza archivos de audio y extrae loops usando FFmpeg
 */

const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

// Directorio de salida para loops
const LOOPS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'loops');

// Asegurar que existe el directorio
if (!fs.existsSync(LOOPS_DIR)) {
    fs.mkdirSync(LOOPS_DIR, { recursive: true });
    console.log(`[FFmpeg] Directorio de loops creado: ${LOOPS_DIR}`);
}

/**
 * Detecta onsets (picos de energía) usando FFmpeg
 * @param {string} audioFile - Ruta al archivo de audio
 * @returns {Promise<number[]>} - Array de timestamps de onsets
 */
async function detectOnsets(audioFile) {
    try {
        // Usar FFmpeg con silencedetect para encontrar cambios de energía
        const { stdout } = await execPromise(
            `ffmpeg -i "${audioFile}" -af "silencedetect=noise=-50dB:d=0.5" -f null - 2>&1`,
            { timeout: 60000 }
        );
        
        // Parsear salida para encontrar silencios y detectar cambios
        const silenceStarts = [];
        const silenceEnds = [];
        
        const lines = stdout.split('\n');
        for (const line of lines) {
            if (line.includes('silence_start:')) {
                const match = line.match(/silence_start:\s*([\d.]+)/);
                if (match) silenceStarts.push(parseFloat(match[1]));
            }
            if (line.includes('silence_end:')) {
                const match = line.match(/silence_end:\s*([\d.]+)/);
                if (match) silenceEnds.push(parseFloat(match[1]));
            }
        }
        
        // Los onsets están entre los finales de silencio y los inicios
        const onsets = [];
        for (let i = 0; i < silenceEnds.length; i++) {
            onsets.push(silenceEnds[i]);
        }
        
        console.log(`[FFmpeg] Detectados ${onsets.length} onsets`);
        return onsets;
        
    } catch (error) {
        console.error('[FFmpeg] Error detectando onsets:', error.message);
        return [];
    }
}

/**
 * Obtiene la duración del audio usando FFmpeg
 * @param {string} audioFile - Ruta al archivo de audio
 * @returns {Promise<number>} - Duración en segundos
 */
async function getAudioDuration(audioFile) {
    try {
        const { stdout } = await execPromise(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`,
            { timeout: 30000 }
        );
        
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) ? 0 : duration;
        
    } catch (error) {
        console.error('[FFmpeg] Error obteniendo duración:', error.message);
        return 0;
    }
}

/**
 * Detecta períodos de silencio para evitar
 * @param {string} audioFile - Ruta al archivo de audio
 * @returns {Promise<Array>} - Array de períodos de silencio {start, end}
 */
async function detectSilences(audioFile) {
    try {
        const { stdout } = await execPromise(
            `ffmpeg -i "${audioFile}" -af "silencedetect=noise=-40dB:d=2.0" -f null - 2>&1`,
            { timeout: 60000 }
        );
        
        const silences = [];
        const lines = stdout.split('\n');
        let currentSilence = null;
        
        for (const line of lines) {
            if (line.includes('silence_start:')) {
                const match = line.match(/silence_start:\s*([\d.]+)/);
                if (match) {
                    currentSilence = { start: parseFloat(match[1]) };
                }
            }
            if (line.includes('silence_end:') && currentSilence) {
                const match = line.match(/silence_end:\s*([\d.]+)/);
                if (match) {
                    currentSilence.end = parseFloat(match[1]);
                    silences.push(currentSilence);
                    currentSilence = null;
                }
            }
        }
        
        console.log(`[FFmpeg] Detectados ${silences.length} períodos de silencio`);
        return silences;
        
    } catch (error) {
        console.error('[FFmpeg] Error detectando silencios:', error.message);
        return [];
    }
}

/**
 * Selecciona los mejores segmentos para loops
 * @param {number} duration - Duración total del audio
 * @param {number[]} onsets - Array de onsets
 * @param {Array} silences - Array de silencios
 * @returns {Array} - Array de segmentos {start, end, confidence}
 */
function selectBestSegments(duration, onsets, silences) {
    const segments = [];
    const loopDuration = 15; // segundos
    const minGap = 30; // mínimo 30 segundos entre loops
    
    // Si no hay onsets, dividir el audio en 4 partes iguales
    if (onsets.length === 0) {
        const quarter = duration / 5;
        for (let i = 1; i <= 4; i++) {
            const start = quarter * i - (loopDuration / 2);
            if (start >= 0 && start + loopDuration <= duration) {
                segments.push({
                    start: start,
                    end: start + loopDuration,
                    confidence: 0.5
                });
            }
        }
        return segments;
    }
    
    // Calcular "energía" en cada onset (simulado por densidad de onsets cercanos)
    const scoredOnsets = onsets.map((onset, idx) => {
        let score = 1;
        // Bonus por cercanía a otros onsets (ritmo consistente)
        for (let i = Math.max(0, idx - 3); i < Math.min(onsets.length, idx + 3); i++) {
            if (i !== idx) {
                const gap = Math.abs(onsets[i] - onset);
                if (gap > 0.5 && gap < 2.0) {
                    score += 0.3;
                }
            }
        }
        return { onset, score };
    });
    
    // Ordenar por score
    scoredOnsets.sort((a, b) => b.score - a.score);
    
    // Seleccionar mejores onsets con separación mínima
    const selectedOnsets = [];
    for (const { onset, score } of scoredOnsets) {
        // Verificar que no esté en un período de silencio
        const inSilence = silences.some(s => onset >= s.start && onset <= s.end);
        if (inSilence) continue;
        
        // Verificar separación mínima
        const tooClose = selectedOnsets.some(o => Math.abs(o - onset) < minGap);
        if (tooClose) continue;
        
        selectedOnsets.push(onset);
        
        if (selectedOnsets.length >= 4) break;
    }
    
    // Crear segmentos
    for (const onset of selectedOnsets) {
        const start = Math.max(0, onset);
        const end = Math.min(duration, start + loopDuration);
        
        if (end - start >= 10) { // Mínimo 10 segundos
            segments.push({
                start,
                end,
                confidence: 0.7
            });
        }
    }
    
    // Si no tenemos suficientes segmentos, añadir aleatorios distribuidos
    while (segments.length < 4) {
        const randomStart = Math.random() * (duration - loopDuration);
        const inExisting = segments.some(s => 
            Math.abs(s.start - randomStart) < minGap
        );
        
        if (!inExisting) {
            segments.push({
                start: randomStart,
                end: randomStart + loopDuration,
                confidence: 0.4
            });
        }
    }
    
    // Ordenar por posición temporal
    segments.sort((a, b) => a.start - b.start);
    
    return segments.slice(0, 4);
}

/**
 * Extrae un segmento de audio a un archivo
 * @param {string} audioFile - Archivo fuente
 * @param {number} start - Inicio en segundos
 * @param {number} end - Fin en segundos
 * @param {string} outputFile - Archivo de salida
 */
async function extractSegment(audioFile, start, end, outputFile) {
    try {
        const duration = end - start;
        
        await execPromise(
            `ffmpeg -i "${audioFile}" -ss ${start} -t ${duration} -c copy -y "${outputFile}"`,
            { timeout: 30000 }
        );
        
        return true;
        
    } catch (error) {
        console.error(`[FFmpeg] Error extrayendo segmento:`, error.message);
        return false;
    }
}

/**
 * Función principal: analiza y extrae loops de un audio
 * @param {string} audioFile - Ruta al archivo de audio
 * @param {number|string} trackId - ID del track
 * @returns {Promise<Object>} - Resultado de la extracción
 */
async function analyzeAndExtractLoops(audioFile, trackId) {
    console.log(`[FFmpeg] Analizando: ${path.basename(audioFile)}`);
    
    try {
        // Verificar que existe el archivo
        if (!fs.existsSync(audioFile)) {
            throw new Error(`Archivo no encontrado: ${audioFile}`);
        }
        
        // Obtener duración
        const duration = await getAudioDuration(audioFile);
        console.log(`[FFmpeg] Duración: ${duration.toFixed(2)}s`);
        
        if (duration < 60) {
            console.log('[FFmpeg] Audio muy corto, omitiendo análisis complejo');
            return { success: false, reason: 'audio_too_short' };
        }
        
        // Detectar características
        const [onsets, silences] = await Promise.all([
            detectOnsets(audioFile),
            detectSilences(audioFile)
        ]);
        
        // Seleccionar mejores segmentos
        const segments = selectBestSegments(duration, onsets, silences);
        console.log(`[FFmpeg] Seleccionados ${segments.length} segmentos`);
        
        // Extraer cada segmento
        const extractedLoops = [];
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const outputFile = path.join(LOOPS_DIR, `track_${trackId}_loop_${i + 1}.wav`);
            
            console.log(`[FFmpeg] Extrayendo loop ${i + 1}: ${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s`);
            
            const success = await extractSegment(audioFile, segment.start, segment.end, outputFile);
            
            if (success) {
                extractedLoops.push({
                    index: i + 1,
                    start: segment.start,
                    end: segment.end,
                    file: outputFile,
                    confidence: segment.confidence
                });
            }
        }
        
        console.log(`[FFmpeg] ✅ Extraídos ${extractedLoops.length} loops exitosamente`);
        
        return {
            success: true,
            trackId,
            loops: extractedLoops,
            method: 'ffmpeg'
        };
        
    } catch (error) {
        console.error('[FFmpeg] Error en análisis:', error.message);
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
        console.log('Uso: node generate-loops-ffmpeg.js <audio-file> <track-id>');
        process.exit(1);
    }
    
    const [audioFile, trackId] = args;
    
    analyzeAndExtractLoops(audioFile, trackId)
        .then(result => {
            console.log('\nResultado:', JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Error fatal:', error);
            process.exit(1);
        });
}

module.exports = {
    analyzeAndExtractLoops,
    detectOnsets,
    detectSilences,
    selectBestSegments
};
