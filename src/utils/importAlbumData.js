const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../../database/el_inmortal_2.db');
const LETRAS_PATH = 'C:\\Users\\AlexSerrano\\Dropbox\\GALANTE_CONTENT\\El Inmortal 2\\letras';

// Database connection
const db = new sqlite3.Database(DB_PATH);

// Track data extracted from filenames and lyrics
const albumTracks = [
    {
        track_number: 1,
        title: "Si El Mundo Se Acabara",
        filename: "01 Galante El Emperador - Si El Mundo Se Acabara [LETRA] - Prod By Yow Fade & ALX.md",
        producers: "Yow Fade & ALX",
        file_mastered: "01 Galante El Emperador - Si El Mundo Se Acabara - Prod By Yow Fade & ALX.wav"
    },
    {
        track_number: 2,
        title: "Toda Para Mi 2",
        filename: "02 Galante El Emperador - Toda Para Mi 2 [LETRA] - Prod By Askenax, Anthony The Producer & ALX.md",
        producers: "Askenax, Anthony The Producer & ALX",
        file_mastered: "02 Galante El Emperador - Toda Para Mi 2 - Prod By Askenax, Anthony The Producer & ALX.wav"
    },
    {
        track_number: 3,
        title: "Dime Ahora Remix (Ft. Genio La Musa, Killatonez)",
        filename: "03 Galante El Emperador Ft. Genio La Musa, Killatonez - Dime Ahora Remix [LETRA] - Prod By Askenax, Yow Fade & ALX.md",
        producers: "Askenax, Yow Fade & ALX",
        file_mastered: "03 Galante El Emperador Ft. Genio La Musa, Killatonez - Dime Ahora Remix - Prod By Askenax, Yow Fade & ALX.wav",
        features: "Genio La Musa, Killatonez"
    },
    {
        track_number: 4,
        title: "Pa Buscarte (Ft. Tiana Estebanez)",
        filename: "04 Galante El Emperador  Ft Tiana Estebanez - Pa Buscarte [LETRA] - Prod By Anthony The Producer & ALX.md",
        producers: "Anthony The Producer & ALX",
        file_mastered: "04 Galante El Emperador Ft. Tiana Estebanez - Pa Buscarte - Prod By Anthony The Producer & ALX.wav",
        features: "Tiana Estebanez"
    },
    {
        track_number: 5,
        title: "Come Calla",
        filename: "05 Galante El Emperador - Come Calla [LETRA] - Prod By Yow Fade, Bryan LMDE & ALX copy.md",
        producers: "Yow Fade, Bryan LMDE & ALX",
        file_mastered: "05 Galante El Emperador - Come Calla - Prod By Yow Fade, Bryan LMDE & ALX copy.wav"
    },
    {
        track_number: 6,
        title: "Ya Te Mudaste",
        filename: "06 Galante El Emperador -Ya Te Mudaste [LETRA]- Prod By Askenax & ALX.md",
        producers: "Askenax & ALX",
        file_mastered: "06 Galante El Emperador - Ya Te Mudaste - Prod By Askenax & ALX.wav"
    },
    {
        track_number: 7,
        title: "Si Te Vuelvo A Ver (Ft. Bayriton)",
        filename: "07 Galante El Emperador - Si Te Vuelvo A Ver Ft Bayriton [LETRA]- Prod By Wutti, Melody & ALX.md",
        producers: "Wutti, Melody & ALX",
        file_mastered: "07 Galante El Emperador - Si Te Vuelvo A Ver Ft Bayriton - Prod By Wutti, Melody & ALX.wav",
        features: "Bayriton"
    },
    {
        track_number: 8,
        title: "Mi Tentacion (Ft. Dilox)",
        filename: "08 Galante El Emperador  Ft Dilox - Mi Tentacion [LETRA]- Prod By Anthony The Producer & ALX.md",
        producers: "Anthony The Producer & ALX",
        file_mastered: "08 Galante El Emperador  Ft Dilox - Mi Tentacion - Prod By Anthony The Producer & ALX.wav",
        features: "Dilox"
    },
    {
        track_number: 9,
        title: "Casi Algo",
        filename: "09 Galante El Emperador - Casi Algo [LETRA]- Prod By Anthony The Producer & ALX.md",
        producers: "Anthony The Producer & ALX",
        file_mastered: "09 Galante El Emperador - Casi Algo - Prod By Anthony The Producer & ALX.wav"
    },
    {
        track_number: 10,
        title: "Cuenta Fantasma (Ft. Dixon Versatil)",
        filename: "10 Galante El Emperador Ft Dixon Versatil - Cuenta Fantasma [LETRA]- Prod By Music Zone & ALX.md",
        producers: "Music Zone & ALX",
        file_mastered: "10 Galante El Emperador Ft Dixon Versatil - Cuenta Fantasma - Prod By Music Zone & ALX.wav",
        features: "Dixon Versatil"
    },
    {
        track_number: 11,
        title: "Inaceptable (Ft. Manny Eztilo)",
        filename: "11 Galante El Emperador - Inaceptable Ft Manny Eztilo  [LETRA]- Prod By Anthony The Producer & ALX.md",
        producers: "Anthony The Producer & ALX",
        file_mastered: "11 Galante El Emperador - Inaceptable Ft Manny Eztilo - Prod By Anthony The Producer & ALX.wav",
        features: "Manny Eztilo"
    },
    {
        track_number: 12,
        title: "No Se Que Somos",
        filename: "12  Galante El Emperador - No Se Que Somos LETRA]- Prod By Wutti & ALX.md",
        producers: "Wutti & ALX",
        file_mastered: "12  Galante El Emperador - No Se Que Somos - Prod By Wutti & ALX.wav"
    },
    {
        track_number: 13,
        title: "No Te Enamores (Ft. LaDeLaJotaa)",
        filename: "13 Galante El Emperador Ft. LaDeLaJotaa- No Te Enamores [LETRA] - Prod By Askenax, Wutti & ALX.md",
        producers: "Askenax, Wutti & ALX",
        file_mastered: "13 Galante El Emperador Ft. LaDeLaJotaa- No Te Enamores - Prod By Askenax, Wutti & ALX.md.wav",
        features: "LaDeLaJotaa"
    },
    {
        track_number: 14,
        title: "Siguele",
        filename: "14 Galante El Emperador - Siguele LETRA]- Prod By Anthony The Producer & ALX.md",
        producers: "Anthony The Producer & ALX",
        file_mastered: "14 Galante El Emperador - Siguele - Prod By Anthony The Producer & ALX.wav"
    },
    {
        track_number: 15,
        title: "No Me Quieres Entender (Ft. Lenny Low)",
        filename: "15  Galante El Emperador Ft Lenny Low - No Me Quieres Entender  [LETRA]- Prod By DMT Level & ALX.md",
        producers: "DMT Level & ALX",
        file_mastered: "15  Galante El Emperador Ft Lenny Low - No Me Quieres Entender - Prod By DMT Level & ALX.wav",
        features: "Lenny Low"
    },
    {
        track_number: 16,
        title: "Sigo En La Mia (Ft. Daizak)",
        filename: "16  Galante El Emperador Ft Daizak - Sigo En La Mia LETRA] - Prod By Wutti & ALX.md",
        producers: "Wutti & ALX",
        file_mastered: "16  Galante El Emperador Ft Daizak - Sigo En La Mia - Prod By Wutti & ALX.wav",
        features: "Daizak"
    },
    {
        track_number: 17,
        title: "En La Nave (Ft. Sota One)",
        filename: "17  Galante El Emperador Ft Sota One - En La Nave LETRA] - Prod By Wutti & ALX.md",
        producers: "Wutti & ALX",
        file_mastered: "17  Galante El Emperador Ft Sota One - En La Nave - Prod By Wutti & ALX.wav",
        features: "Sota One"
    },
    {
        track_number: 18,
        title: "Tu Pirata (Ft. Pablo Nick)",
        filename: "18  Galante El Emperador Ft Pablo Nick - Tu Pirata [LETRA] - Prod By UBeats & ALX.md",
        producers: "UBeats & ALX",
        file_mastered: "18 Galante El Emperador Ft Pablonick - Tu Pirata - Prod By UBeats & ALX.wav",
        features: "Pablo Nick"
    },
    {
        track_number: 19,
        title: "Al Que Se Meta Remix (Ft. Joe Yncio)",
        filename: "19 Galante El Emperador Ft. Joe Yncio - Al Que Se Meta Remix [LETRA] - Prod By Yeizel  & ALX.md",
        producers: "Yeizel & ALX",
        file_mastered: "19 Galante El Emperador Ft. Joe Yncio - Al Que Se Meta Remix - Prod By Yeizel  & ALX.wav",
        features: "Joe Yncio"
    },
    {
        track_number: 20,
        title: "Pa Chingal",
        filename: "20 Galante El Emperador  - Pa Chingal  [LETRA] - Prod By Wutti  & ALX.md",
        producers: "Wutti & ALX",
        file_mastered: "20 Galante El Emperador  - Pa Chingal - Prod By Wutti  & ALX.wav"
    },
    {
        track_number: 21,
        title: "Las Eleven",
        filename: "21 Galante El Emperador  - Las Eleven  [LETRA] - Prod By Wutti  & ALX.md",
        producers: "Wutti & ALX",
        file_mastered: "21 Galante El Emperador  - Las Eleven - Prod By Wutti  & ALX.wav"
    }
];

// Extract unique producers
const uniqueProducers = new Set();
albumTracks.forEach(track => {
    const producers = track.producers.split(/,\s*&\s*|\s*&\s*|,\s*/);
    producers.forEach(p => uniqueProducers.add(p.trim()));
});

async function importData() {
    console.log('🎵🎤👑 IMPORTANDO EL INMORTAL 2 👑🎤🎵\n');
    
    try {
        // Step 1: Update database schema to add track_type field
        console.log('📊 Actualizando schema de base de datos...');
        await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE tracks ADD COLUMN track_type TEXT DEFAULT 'album'`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.log('  ℹ️  Columna track_type ya existe o error:', err.message);
                }
                resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE tracks ADD COLUMN is_single BOOLEAN DEFAULT 0`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.log('  ℹ️  Columna is_single ya existe o error:', err.message);
                }
                resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE tracks ADD COLUMN is_primary BOOLEAN DEFAULT 0`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.log('  ℹ️  Columna is_primary ya existe o error:', err.message);
                }
                resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE tracks ADD COLUMN features TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.log('  ℹ️  Columna features ya existe o error:', err.message);
                }
                resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE tracks ADD COLUMN file_path TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.log('  ℹ️  Columna file_path ya existe o error:', err.message);
                }
                resolve();
            });
        });
        
        console.log('  ✅ Schema actualizado\n');
        
        // Step 2: Import producers
        console.log('🎧 Importando productores...');
        const producerMap = {};
        
        for (const producerName of uniqueProducers) {
            const producerId = await new Promise((resolve, reject) => {
                // First check if producer exists
                db.get('SELECT id FROM producers WHERE name = ?', [producerName], (err, row) => {
                    if (err) {
                        reject(err);
                    } else if (row) {
                        // Producer exists
                        resolve(row.id);
                    } else {
                        // Insert new producer
                        db.run(
                            'INSERT INTO producers (name, email, split_percentage) VALUES (?, ?, ?)',
                            [producerName, `${producerName.toLowerCase().replace(/\s+/g, '.')}@email.com`, '50/50'],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.lastID);
                            }
                        );
                    }
                });
            });
            producerMap[producerName] = producerId;
            console.log(`  ✅ ${producerName} (ID: ${producerId})`);
        }
        console.log(`  📊 Total: ${Object.keys(producerMap).length} productores\n`);
        
        // Step 3: Import tracks with lyrics
        console.log('🎵 Importando temas y letras...');
        let importedCount = 0;
        let lyricsFound = 0;
        
        for (const track of albumTracks) {
            // Try to read lyrics file
            let lyrics = '';
            const lyricsPath = path.join(LETRAS_PATH, track.filename);
            
            try {
                if (fs.existsSync(lyricsPath)) {
                    lyrics = fs.readFileSync(lyricsPath, 'utf8');
                    lyricsFound++;
                    console.log(`  📝 ${track.track_number}. ${track.title} - Letra cargada`);
                } else {
                    console.log(`  ⚠️  ${track.track_number}. ${track.title} - Sin letra`);
                }
            } catch (err) {
                console.log(`  ⚠️  ${track.track_number}. ${track.title} - Error leyendo letra: ${err.message}`);
            }
            
            // Get primary producer (first one listed)
            const primaryProducer = track.producers.split(/,\s*&\s*|\s*&\s*|,\s*/)[0].trim();
            const producerId = producerMap[primaryProducer] || null;
            
            // Insert or update track
            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO tracks 
                    (track_number, title, producer_id, lyrics, features, file_path, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(track_number) DO UPDATE SET
                    title = excluded.title,
                    producer_id = excluded.producer_id,
                    lyrics = excluded.lyrics,
                    features = excluded.features,
                    file_path = excluded.file_path,
                    updated_at = CURRENT_TIMESTAMP
                `, [
                    track.track_number,
                    track.title,
                    producerId,
                    lyrics,
                    track.features || null,
                    track.file_mastered,
                    'completed'
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            importedCount++;
        }
        
        console.log(`  ✅ ${importedCount} temas importados`);
        console.log(`  📝 ${lyricsFound} letras cargadas\n`);
        
        // Step 4: Create checklist items for each track
        console.log('✅ Creando checklists para cada tema...');
        let checklistCount = 0;
        
        for (const track of albumTracks) {
            const trackChecklist = [
                { text: `Upload "${track.title}" to distributor`, category: 'Distribución', priority: 'urgent' },
                { text: `Verify metadata for "${track.title}"`, category: 'Metadata', priority: 'high' },
                { text: `Create lyric video for "${track.title}"`, category: 'Contenido', priority: 'normal' },
                { text: `Create Instagram Reel for "${track.title}"`, category: 'Marketing', priority: 'normal' },
                { text: `Create TikTok for "${track.title}"`, category: 'Marketing', priority: 'normal' },
                { text: `Add "${track.title}" to content calendar`, category: 'Planificación', priority: 'normal' },
                { text: `Design cover art for "${track.title}"`, category: 'Diseño', priority: 'normal' },
                { text: `Create Spotify Canvas for "${track.title}"`, category: 'Contenido', priority: 'low' }
            ];
            
            for (const item of trackChecklist) {
                await new Promise((resolve, reject) => {
                    db.run(`
                        INSERT OR IGNORE INTO checklist_items (category, item_text, priority)
                        VALUES (?, ?, ?)
                    `, [item.category, item.text, item.priority], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                checklistCount++;
            }
        }
        
        console.log(`  ✅ ${checklistCount} tareas creadas\n`);
        
        // Step 5: Create general checklist items
        console.log('📋 Creando checklists generales...');
        const generalChecklist = [
            { text: 'Finalizar artwork del álbum', category: 'Urgente', priority: 'urgent' },
            { text: 'Enviar splitsheets a todos los productores', category: 'Urgente', priority: 'urgent' },
            { text: 'Confirmar recepción de todos los splitsheets', category: 'Urgente', priority: 'urgent' },
            { text: 'Configurar pre-save links', category: 'Marketing', priority: 'high' },
            { text: 'Actualizar perfiles de redes sociales', category: 'Marketing', priority: 'high' },
            { text: 'Preparar press kit', category: 'Marketing', priority: 'high' },
            { text: 'Crear calendario de contenido completo', category: 'Planificación', priority: 'high' },
            { text: 'Verificar distribución en todas las plataformas', category: 'Distribución', priority: 'high' },
            { text: 'Programar posts para día del lanzamiento', category: 'Marketing', priority: 'high' },
            { text: 'Enviar email a lista de fans', category: 'Marketing', priority: 'normal' },
            { text: 'Crear playlist de lanzamiento en Spotify', category: 'Marketing', priority: 'normal' },
            { text: 'Contactar blogs y medios', category: 'PR', priority: 'normal' },
            { text: 'Preparar merch (si aplica)', category: 'Ventas', priority: 'low' },
            { text: 'Planificar live/stream de lanzamiento', category: 'Eventos', priority: 'normal' }
        ];
        
        for (const item of generalChecklist) {
            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT OR IGNORE INTO checklist_items (category, item_text, priority)
                    VALUES (?, ?, ?)
                `, [item.category, item.text, item.priority], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        
        console.log(`  ✅ ${generalChecklist.length} tareas generales creadas\n`);
        
        console.log('🎉🎉🎉 IMPORTACIÓN COMPLETADA EXITOSAMENTE! 🎉🎉🎉\n');
        console.log('📊 Resumen:');
        console.log(`  🎵 ${importedCount} temas importados`);
        console.log(`  📝 ${lyricsFound} letras cargadas`);
        console.log(`  🎧 ${Object.keys(producerMap).length} productores`);
        console.log(`  ✅ ${checklistCount + generalChecklist.length} tareas en checklist\n`);
        console.log('🚀 Listo para usar en: http://localhost:3000');
        
    } catch (error) {
        console.error('❌ Error durante la importación:', error);
    } finally {
        db.close();
    }
}

// Run import
importData();