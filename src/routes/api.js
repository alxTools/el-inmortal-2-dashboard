const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { downloadFromDropbox, cleanupTempFile: cleanupDropboxTemp, isDropboxPath, convertToDropboxPath } = require('../utils/dropboxHelper');
const { downloadFromDrive, cleanupTempFile: cleanupDriveTemp, isGoogleDrivePath } = require('../utils/googleDriveHelper');
const { getLatestUpdates } = require('../utils/statusUpdates');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Helper function to convert audio to MP3 using ffmpeg
async function convertToMp3(inputPath, outputPath) {
    try {
        console.log(`[FFmpeg] Converting ${inputPath} to MP3...`);
        // Convert to MP3 with 128k bitrate (good quality, smaller size)
        // -ar 44100 sets sample rate, -ac 2 sets stereo
        const command = `ffmpeg -i "${inputPath}" -codec:a libmp3lame -q:a 4 -ar 44100 -ac 2 -y "${outputPath}"`;
        const { stdout, stderr } = await execAsync(command);
        
        if (stderr && stderr.includes('Error')) {
            throw new Error(`FFmpeg error: ${stderr}`);
        }
        
        // Check output file size
        const stats = fs.statSync(outputPath);
        console.log(`[FFmpeg] Conversion complete. Output size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        return outputPath;
    } catch (error) {
        console.error('[FFmpeg] Conversion failed:', error);
        throw error;
    }
}

// Helper function to log activity
async function logActivity(action, entityType, entityId, details) {
    try {
        await run(
            `INSERT INTO activity_log (action, entity_type, entity_id, details) 
             VALUES (?, ?, ?, ?)`,
            [action, entityType, entityId, details]
        );
    } catch (err) {
        console.error('Error logging activity:', err);
    }
}

// GET dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await getOne(`
            SELECT 
                COUNT(*) as total_tracks,
                SUM(CASE WHEN splitsheet_sent = 1 THEN 1 ELSE 0 END) as splitsheets_sent,
                SUM(CASE WHEN splitsheet_confirmed = 1 THEN 1 ELSE 0 END) as splitsheets_confirmed,
                SUM(content_count) as total_content
            FROM tracks
        `);

        const producerResult = await getOne('SELECT COUNT(*) as count FROM producers');
        const producerCount = producerResult?.count || 0;

        const checklistStats = await getOne(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN priority = 'urgent' AND completed = 0 THEN 1 ELSE 0 END) as urgent
            FROM checklist_items
        `);

        res.json({
            tracks: {
                total: stats?.total_tracks || 0,
                target: 21
            },
            splitsheets: {
                sent: stats?.splitsheets_sent || 0,
                confirmed: stats?.splitsheets_confirmed || 0,
                pending: (stats?.total_tracks || 0) - (stats?.splitsheets_confirmed || 0)
            },
            content: {
                total: stats?.total_content || 0,
                target: 63
            },
            producers: producerCount || 0,
            checklist: checklistStats
        });
    } catch (error) {
        console.error('API Stats Error:', error);
        res.status(500).json({ error: 'Error fetching stats' });
    }
});

// GET all tracks
router.get('/tracks', async (req, res) => {
    try {
        const tracks = await getAll(`
            SELECT t.*, p.name as producer_name, p.email as producer_email
            FROM tracks t
            LEFT JOIN producers p ON t.producer_id = p.id
            ORDER BY t.track_number
        `);

        res.json(tracks || []);
    } catch (error) {
        console.error('API Tracks Error:', error);
        res.status(500).json({ error: 'Error fetching tracks' });
    }
});

// GET all producers
router.get('/producers', async (req, res) => {
    try {
        const producers = await getAll(`
            SELECT p.*, COUNT(t.id) as track_count
            FROM producers p
            LEFT JOIN tracks t ON p.id = t.producer_id
            GROUP BY p.id
            ORDER BY p.name
        `);

        res.json(producers || []);
    } catch (error) {
        console.error('API Producers Error:', error);
        res.status(500).json({ error: 'Error fetching producers' });
    }
});

// GET countdown data
router.get('/countdown', (req, res) => {
    // Puerto Rico time is AST (UTC-4) year-round.
    // We store target dates as PR local midnight and convert to UTC for accurate diffs.
    const prDateToUtc = (year, month, day, hour = 0, minute = 0, second = 0) => {
        return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, second));
    };

    const launchDate = prDateToUtc(2026, 2, 17, 0, 0, 0);
    const now = new Date();
    
    const dailyTimers = {
        'tm2': prDateToUtc(2026, 2, 15, 0, 0, 0),
        'tm1': prDateToUtc(2026, 2, 16, 0, 0, 0),
        't0': prDateToUtc(2026, 2, 17, 0, 0, 0),
        't1': prDateToUtc(2026, 2, 18, 0, 0, 0),
        't7': prDateToUtc(2026, 2, 24, 0, 0, 0),
        't21': prDateToUtc(2026, 3, 10, 0, 0, 0)
    };

    const timers = {};
    for (const [key, date] of Object.entries(dailyTimers)) {
        const diff = date - now;
        timers[key] = {
            days: Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24))),
            hours: Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))),
            minutes: Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))),
            seconds: Math.max(0, Math.floor((diff % (1000 * 60)) / 1000)),
            isActive: diff <= 0 && diff > -86400000,
            isPast: diff <= -86400000
        };
    }

    res.json({
        launchDate: launchDate,
        currentTime: now,
        daysUntilLaunch: Math.ceil((launchDate - now) / (1000 * 60 * 60 * 24)),
        timers: timers
    });
});

// GET status updates for voice announcements
router.get('/status-updates', async (req, res) => {
    try {
        const afterId = Number(req.query.afterId || 0) || 0;
        const limit = Number(req.query.limit || 5) || 5;
        const updates = await getLatestUpdates({ afterId, limit });

        res.json({
            updates: updates || [],
            latestId: updates && updates.length ? updates[0].id : afterId
        });
    } catch (error) {
        console.error('API Status Updates Error:', error);
        res.status(500).json({ error: 'Error fetching status updates' });
    }
});

// POST update track status
router.post('/tracks/:id/status', async (req, res) => {
    try {
        const trackId = req.params.id;
        const { field, value } = req.body;

        const validFields = ['splitsheet_sent', 'splitsheet_confirmed', 'status'];
        if (!validFields.includes(field)) {
            return res.status(400).json({ error: 'Invalid field' });
        }

        await run(
            `UPDATE tracks SET ${field} = ? WHERE id = ?`,
            [value, trackId]
        );

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        console.error('API Update Error:', error);
        res.status(500).json({ error: 'Error updating track' });
    }
});

// GET checklist items
router.get('/checklist', async (req, res) => {
    try {
        const items = await getAll(`
            SELECT * FROM checklist_items
            ORDER BY 
                CASE priority 
                    WHEN 'urgent' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'normal' THEN 3 
                    ELSE 4 
                END,
                created_at DESC
        `);

        res.json(items || []);
    } catch (error) {
        console.error('API Checklist Error:', error);
        res.status(500).json({ error: 'Error fetching checklist' });
    }
});

// POST toggle checklist item
router.post('/checklist/:id/toggle', async (req, res) => {
    try {
        const itemId = req.params.id;
        
        console.log(`[API] Toggling checklist item ${itemId}`);

        // Get current state first
        const currentItem = await getOne('SELECT completed FROM checklist_items WHERE id = ?', [itemId]);
        
        if (!currentItem) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        const newState = currentItem.completed === 1 ? 0 : 1;

        await run(
            `UPDATE checklist_items 
             SET completed = ?,
                 completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
             WHERE id = ?`,
            [newState, newState, itemId]
        );

        console.log(`[API] Item ${itemId} toggled to ${newState === 1 ? 'completed' : 'pending'}`);
        res.json({ 
            success: true, 
            message: 'Item toggled',
            id: itemId,
            completed: newState === 1
        });
    } catch (error) {
        console.error('API Toggle Error:', error);
        res.status(500).json({ error: 'Error toggling item' });
    }
});

// POST transcribe lyrics from audio using OpenAI Whisper
router.post('/tracks/:id/transcribe', async (req, res) => {
    let tempFilePath = null;
    let tempFileToCleanup = null;
    let convertedFilePath = null;
    let source = 'local';
    
    try {
        const trackId = req.params.id;
        
        console.log(`[API] Starting transcription for track ${trackId}`);

        // Get track info
        const track = await getOne('SELECT * FROM tracks WHERE id = ?', [trackId]);
        
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }
        
        if (!track.audio_file_path) {
            return res.status(400).json({ error: 'No audio file available for transcription' });
        }

        let audioPath = track.audio_file_path;

        // Check if it's a Google Drive path
        if (isGoogleDrivePath(audioPath)) {
            console.log(`[API] Detected Google Drive path: ${audioPath}`);
            try {
                tempFilePath = await downloadFromDrive(audioPath);
                audioPath = tempFilePath;
                tempFileToCleanup = tempFilePath;
                source = 'gdrive';
                console.log(`[API] Downloaded from Google Drive: ${audioPath}`);
            } catch (driveError) {
                console.error('[API] Google Drive download failed:', driveError);
                return res.status(404).json({ 
                    error: 'Failed to download from Google Drive',
                    details: driveError.message
                });
            }
        }
        // Check if it's a Dropbox path
        else if (isDropboxPath(audioPath)) {
            console.log(`[API] Detected Dropbox path: ${audioPath}`);
            try {
                const dropboxPath = convertToDropboxPath(audioPath);
                tempFilePath = await downloadFromDropbox(dropboxPath);
                audioPath = tempFilePath;
                tempFileToCleanup = tempFilePath;
                source = 'dropbox';
                console.log(`[API] Downloaded from Dropbox: ${audioPath}`);
            } catch (dropboxError) {
                console.error('[API] Dropbox download failed:', dropboxError);
                return res.status(404).json({ 
                    error: 'Failed to download from Dropbox',
                    details: dropboxError.message
                });
            }
        }
        // Check if it's a server-local path (starts with /uploads/)
        else if (audioPath.startsWith('/uploads/')) {
            // Build full path from public directory
            // Use process.cwd() to get the app root directory
            const appRoot = process.cwd();
            audioPath = path.join(appRoot, 'public', audioPath);
            console.log(`[API] Using local server file: ${audioPath}`);
        }

        // Check if file exists locally
        if (!fs.existsSync(audioPath)) {
            console.log(`[API] File not found at: ${audioPath}`);
            return res.status(404).json({ 
                error: 'Audio file not found on server',
                path: audioPath,
                note: 'Files may be lost after redeploy on free tier. Consider using Google Drive or Dropbox storage.'
            });
        }

        console.log(`[API] Using audio from ${source}: ${audioPath}`);

        // Check file size and convert to MP3 if too large (OpenAI limit is 25MB)
        const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
        let convertedFilePath = null;
        
        try {
            const stats = fs.statSync(audioPath);
            console.log(`[API] File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            
            if (stats.size > MAX_FILE_SIZE) {
                console.log(`[API] File too large (${(stats.size / 1024 / 1024).toFixed(2)} MB), converting to MP3...`);
                const tempDir = path.join(process.cwd(), 'temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                convertedFilePath = path.join(tempDir, `converted_${Date.now()}.mp3`);
                await convertToMp3(audioPath, convertedFilePath);
                audioPath = convertedFilePath;
                console.log(`[API] Using converted MP3: ${audioPath}`);
            }
        } catch (sizeError) {
            console.error('[API] Error checking file size:', sizeError);
            // Continue with original file if size check fails
        }

        try {
            // Call OpenAI Whisper API
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: 'whisper-1',
                language: 'es', // Spanish
                response_format: 'text'
            });

            console.log(`[API] Transcription received, length: ${transcription.length}`);

            // Update the database with transcribed lyrics
            await run(
                'UPDATE tracks SET lyrics = ? WHERE id = ?',
                [transcription, trackId]
            );

            console.log(`[API] Lyrics saved to database for track ${trackId}`);

            // Log activity
            await logActivity('LYRICS_TRANSCRIBE', 'track', trackId, 
                `Letra transcrita desde ${source} (${transcription.length} caracteres)`);

            res.json({ 
                success: true, 
                message: `Transcription completed successfully (source: ${source})`,
                lyrics: transcription,
                trackTitle: track.title,
                trackId: trackId,
                source: source
            });

        } catch (openaiError) {
            console.error('[API] OpenAI Whisper Error:', openaiError);
            res.status(500).json({ 
                error: 'Error transcribing with OpenAI',
                details: openaiError.message
            });
        }

    } catch (error) {
        console.error('[API] Transcribe Error:', error);
        res.status(500).json({ error: 'Error transcribing track' });
    } finally {
        // Clean up temporary files
        if (tempFileToCleanup) {
            if (source === 'gdrive') {
                cleanupDriveTemp(tempFileToCleanup);
            } else if (source === 'dropbox') {
                cleanupDropboxTemp(tempFileToCleanup);
            }
        }
        
        // Clean up converted MP3 file
        if (convertedFilePath && fs.existsSync(convertedFilePath)) {
            try {
                fs.unlinkSync(convertedFilePath);
                console.log(`[API] Cleaned up converted file: ${convertedFilePath}`);
            } catch (cleanupError) {
                console.error('[API] Error cleaning up converted file:', cleanupError);
            }
        }
    }
});

// POST generate lyrics for all tracks in album that don't have lyrics
router.post('/albums/:id/generate-lyrics', async (req, res) => {
    try {
        const albumId = req.params.id;
        
        console.log(`[API] Starting batch lyrics generation for album ${albumId}`);
        
        // Get all tracks in album without lyrics but with audio
        const tracks = await getAll(
            `SELECT id, track_number, title, audio_file_path, lyrics 
             FROM tracks 
             WHERE album_id = ? AND audio_file_path IS NOT NULL 
             AND (lyrics IS NULL OR lyrics = '' OR LENGTH(TRIM(lyrics)) < 50)
             ORDER BY track_number`,
            [albumId]
        );
        
        if (tracks.length === 0) {
            return res.json({
                success: true,
                message: 'Todos los temas ya tienen letras generadas',
                processed: 0,
                tracks: []
            });
        }
        
        console.log(`[API] Found ${tracks.length} tracks without lyrics`);
        
        const results = [];
        const MAX_FILE_SIZE = 25 * 1024 * 1024;
        
        for (const track of tracks) {
            console.log(`[API] Processing track ${track.track_number}: ${track.title}`);
            
            try {
                let audioPath = track.audio_file_path;
                let tempFileToCleanup = null;
                let convertedFilePath = null;
                
                // Handle Dropbox paths
                if (isDropboxPath(audioPath)) {
                    try {
                        const dropboxPath = convertToDropboxPath(audioPath);
                        const tempFilePath = await downloadFromDropbox(dropboxPath);
                        audioPath = tempFilePath;
                        tempFileToCleanup = tempFilePath;
                    } catch (err) {
                        console.error(`[API] Failed to download from Dropbox for track ${track.id}:`, err);
                        results.push({
                            trackId: track.id,
                            title: track.title,
                            status: 'error',
                            error: 'Failed to download from Dropbox'
                        });
                        continue;
                    }
                }
                
                // Convert to local path if needed
                if (audioPath.startsWith('/uploads/')) {
                    const appRoot = process.cwd();
                    audioPath = path.join(appRoot, 'public', audioPath);
                }
                
                if (!fs.existsSync(audioPath)) {
                    console.log(`[API] Audio file not found: ${audioPath}`);
                    results.push({
                        trackId: track.id,
                        title: track.title,
                        status: 'error',
                        error: 'Audio file not found'
                    });
                    continue;
                }
                
                // Check file size and convert if needed
                try {
                    const stats = fs.statSync(audioPath);
                    if (stats.size > MAX_FILE_SIZE) {
                        const tempDir = path.join(process.cwd(), 'temp');
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true });
                        }
                        convertedFilePath = path.join(tempDir, `converted_${Date.now()}_${track.id}.mp3`);
                        await convertToMp3(audioPath, convertedFilePath);
                        audioPath = convertedFilePath;
                    }
                } catch (err) {
                    console.error(`[API] Size check error for track ${track.id}:`, err);
                }
                
                // Transcribe with OpenAI Whisper
                const transcription = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(audioPath),
                    model: 'whisper-1',
                    language: 'es',
                    response_format: 'text'
                });
                
                // Format the lyrics with proper structure
                const formattedLyrics = formatLyrics(transcription);
                
                // Save to database
                await run('UPDATE tracks SET lyrics = ? WHERE id = ?', [formattedLyrics, track.id]);
                
                // Log activity
                await logActivity('LYRICS_GENERATE', 'track', track.id, 
                    `Letra generada automáticamente para track ${track.track_number} (${formattedLyrics.length} caracteres)`);
                
                results.push({
                    trackId: track.id,
                    trackNumber: track.track_number,
                    title: track.title,
                    status: 'success',
                    lyricsLength: formattedLyrics.length
                });
                
                console.log(`[API] ✓ Track ${track.track_number} completed`);
                
                // Cleanup temp files
                if (tempFileToCleanup) {
                    cleanupDropboxTemp(tempFileToCleanup);
                }
                if (convertedFilePath && fs.existsSync(convertedFilePath)) {
                    fs.unlinkSync(convertedFilePath);
                }
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`[API] Error processing track ${track.id}:`, error);
                results.push({
                    trackId: track.id,
                    title: track.title,
                    status: 'error',
                    error: error.message
                });
            }
        }
        
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        res.json({
            success: true,
            message: `Generación completada: ${successCount} exitosos, ${errorCount} errores`,
            processed: tracks.length,
            successful: successCount,
            errors: errorCount,
            results: results
        });
        
    } catch (error) {
        console.error('[API] Batch lyrics generation error:', error);
        res.status(500).json({
            error: 'Error generando letras en batch',
            details: error.message
        });
    }
});

// Helper function to format lyrics with proper structure
function formatLyrics(rawText) {
    if (!rawText || rawText.trim().length === 0) {
        return '';
    }
    
    // Split into lines
    let lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) {
        return '';
    }
    
    const formatted = [];
    let currentSection = '';
    let lineCount = 0;
    
    // Detect if first lines look like an intro (short, repeated, or spoken style)
    const firstFewLines = lines.slice(0, 3).join(' ').toLowerCase();
    const looksLikeIntro = firstFewLines.includes('yeah') || 
                          firstFewLines.includes('ey') || 
                          firstFewLines.includes('listen') ||
                          lines[0].length < 20;
    
    // Process first few lines as Intro if detected
    let startIndex = 0;
    if (looksLikeIntro && lines.length > 4) {
        formatted.push('[Intro]');
        let introLines = 0;
        for (let i = 0; i < lines.length && introLines < 4; i++) {
            if (lines[i].length < 30 || lines[i].match(/^(yeah|ey|oh|listen|ok|okay)/i)) {
                formatted.push(lines[i]);
                startIndex = i + 1;
                introLines++;
            } else {
                break;
            }
        }
        formatted.push('');
    }
    
    // Process remaining lines
    let inCoro = false;
    let inVerso = false;
    let blankLines = 0;
    
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip empty lines
        if (line.length === 0) {
            blankLines++;
            continue;
        }
        
        // Detect coro patterns (repeated lines, shorter lines)
        const isShortLine = line.length < 25;
        const isRepeated = i > 0 && lines.slice(0, i).some(l => l.toLowerCase() === line.toLowerCase());
        const looksLikeCoro = isShortLine || isRepeated;
        
        // Section transitions based on blank lines and patterns
        if (blankLines >= 1 && !inCoro && looksLikeCoro) {
            formatted.push('');
            formatted.push('[Coro]');
            inCoro = true;
            inVerso = false;
        } else if (blankLines >= 1 && inCoro && !looksLikeCoro) {
            formatted.push('');
            formatted.push('[Verso]');
            inCoro = false;
            inVerso = true;
        } else if (blankLines >= 2 && !inVerso && !inCoro) {
            formatted.push('');
            formatted.push('[Verso]');
            inVerso = true;
        }
        
        formatted.push(line);
        blankLines = 0;
    }
    
    // Add outro if last lines look like outro
    const lastLines = lines.slice(-3);
    const looksLikeOutro = lastLines.some(l => l.length < 15 || l.match(/^(yeah|ey|oh)/i));
    if (looksLikeOutro && formatted.length > 0) {
        formatted.push('');
        formatted.push('[Outro]');
        lastLines.forEach(l => formatted.push(l));
    }
    
    return formatted.join('\n');
}

module.exports = router;
