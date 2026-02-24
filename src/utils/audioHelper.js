const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

let ffmpegAvailable = null;

/**
 * Verifica si ffmpeg está instalado en el sistema
 * @returns {Promise<boolean>}
 */
async function isFfmpegAvailable() {
    if (ffmpegAvailable !== null) {
        return ffmpegAvailable;
    }
    
    try {
        await execPromise('ffmpeg -version');
        ffmpegAvailable = true;
        console.log('[AudioHelper] ✅ ffmpeg está disponible');
    } catch (error) {
        ffmpegAvailable = false;
        console.warn('[AudioHelper] ⚠️ ffmpeg no está instalado. La duración no se extraerá automáticamente.');
        console.warn('[AudioHelper] Para instalar ffmpeg:');
        console.warn('  Windows: choco install ffmpeg');
        console.warn('  macOS: brew install ffmpeg');
        console.warn('  Linux: sudo apt-get install ffmpeg');
    }
    
    return ffmpegAvailable;
}

/**
 * Extrae metadatos completos del audio usando ffprobe
 * @param {string} filePath - Ruta completa al archivo de audio
 * @returns {Promise<object>} - Metadatos del audio
 */
async function getAudioMetadata(filePath) {
    const available = await isFfmpegAvailable();
    if (!available) {
        throw new Error('ffmpeg no está instalado');
    }
    
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.error('[AudioMetadata] Error analyzing file:', err.message);
                reject(err);
                return;
            }
            
            const format = metadata.format;
            const streams = metadata.streams;
            const audioStream = streams.find(s => s.codec_type === 'audio');
            
            if (!audioStream) {
                reject(new Error('No audio stream found'));
                return;
            }
            
            const result = {
                // Información básica
                duration: format.duration,
                durationFormatted: formatDuration(format.duration),
                bitrate: format.bit_rate ? Math.round(format.bit_rate / 1000) + ' kbps' : 'Unknown',
                size: format.size ? (format.size / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown',
                format: format.format_name,
                
                // Información técnica del audio
                codec: audioStream.codec_name,
                sampleRate: audioStream.sample_rate ? audioStream.sample_rate + ' Hz' : 'Unknown',
                channels: audioStream.channels,
                channelLayout: audioStream.channel_layout || 'Unknown',
                
                // Análisis estimado (ffmpeg no da BPM directamente, pero podemos inferir)
                // Estos valores serán aproximados
                loudness: audioStream.tags?.REPLAYGAIN_TRACK_GAIN || 'No data',
            };
            
            console.log(`[AudioMetadata] Analyzed: ${path.basename(filePath)}`);
            resolve(result);
        });
    });
}

/**
 * Genera una descripción poética/hermosa del audio usando OpenAI
 * @param {object} metadata - Metadatos del audio
 * @param {string} trackTitle - Título del track
 * @param {string} producer - Productor
 * @returns {Promise<string>} - Descripción generada
 */
async function generateAudioDescription(metadata, trackTitle, producer) {
    try {
        const prompt = `Eres un experto en música urbana y reggaetón. Analiza este track y escribe una descripción POÉTICA, VIVIDA y EMOCIONANTE que haga que los fans sientan el ritmo antes de escucharlo.

DATOS DEL TRACK:
- Título: "${trackTitle}"
- Productor: ${producer || 'Desconocido'}
- Duración: ${metadata.durationFormatted}
- Formato: ${metadata.codec}
- Sample Rate: ${metadata.sampleRate}
- Canales: ${metadata.channels === 2 ? 'Stereo' : metadata.channels + ' canales'}

ESCRIBE una descripción de 3-4 párrafos que:
1. Capture la VIBRA y ENERGÍA del track
2. Use lenguaje sensorial (imagina los sonidos, el bounce, los drums)
3. Sea emocionante para fans de reggaetón
4. Incluya elementos técnicos sutiles (sin ser aburrido)
5. Termine con una frase que invite a escuchar

El estilo debe ser:
- Apasionado y urbano
- Como si un DJ experto lo estuviera presentando
- Lleno de sabor latino
- Que haga sentir el perreo 🔥

NO uses listas ni bullets. Escribe en prosa fluida y hermosa.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Eres un experto en música urbana latina. Escribes descripciones que hacen vibrar a la gente. Tu estilo es poético, urbano y lleno de pasión.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.8,
            max_tokens: 500
        });

        const description = response.choices[0].message.content.trim();
        console.log(`[AudioDescription] Generated description for: ${trackTitle}`);
        return description;
        
    } catch (error) {
        console.error('[AudioDescription] Error generating description:', error.message);
        // Fallback description
        return `🎵 **${trackTitle}**

Un track de ${metadata.durationFormatted} minutos producido por ${producer || 'el equipo de El Inmortal 2'}. 

Audio en formato ${metadata.codec} con calidad ${metadata.sampleRate}. Preparado para sonar fuerte en todos los sistemas. 🔥`;
    }
}

/**
 * Analiza completamente un archivo de audio y genera descripción
 * @param {string} filePath - Ruta completa al archivo
 * @param {string} trackTitle - Título del track
 * @param {string} producer - Productor
 * @returns {Promise<object>} - { metadata, description }
 */
async function analyzeAndDescribeAudio(filePath, trackTitle, producer) {
    console.log(`[AudioAnalysis] Starting analysis for: ${trackTitle}`);
    
    try {
        // 1. Extraer metadatos
        const metadata = await getAudioMetadata(filePath);
        
        // 2. Generar descripción con OpenAI
        const description = await generateAudioDescription(metadata, trackTitle, producer);
        
        console.log(`[AudioAnalysis] ✅ Analysis complete for: ${trackTitle}`);
        
        return {
            metadata,
            description,
            duration: metadata.durationFormatted
        };
        
    } catch (error) {
        console.error(`[AudioAnalysis] ❌ Error analyzing ${trackTitle}:`, error.message);
        throw error;
    }
}

/**
 * Formatea segundos a formato MM:SS
 * @param {number} seconds - Segundos totales
 * @returns {string} - Formato MM:SS
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extrae solo la duración (para compatibilidad)
 * @param {string} filePath - Ruta completa al archivo de audio
 * @returns {Promise<string>} - Duración en formato MM:SS
 */
async function getAudioDuration(filePath) {
    const metadata = await getAudioMetadata(filePath);
    return metadata.durationFormatted;
}

module.exports = {
    getAudioMetadata,
    getAudioDuration,
    generateAudioDescription,
    analyzeAndDescribeAudio,
    formatDuration,
    isFfmpegAvailable
};