const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../database/el_inmortal_2.db');
const LETRAS_PATH = 'C:/Users/AlexSerrano/Dropbox/GALANTE_CONTENT/El Inmortal 2/letras';
const MASTERED_PATH = 'C:/Users/AlexSerrano/Dropbox/GALANTE_CONTENT/El Inmortal 2/ALBUM MASTERED';

// Track data with file mappings
const albumTracks = [
    { track_number: 1, title: "Si El Mundo Se Acabara", producers: "Yow Fade & ALX", features: null, 
      lyrics_file: "01 Galante El Emperador - Si El Mundo Se Acabara [LETRA] - Prod By Yow Fade & ALX.md",
      audio_file: "01 Galante El Emperador - Si El Mundo Se Acabara - Prod By Yow Fade & ALX.wav" },
    { track_number: 2, title: "Toda Para Mi 2", producers: "Askenax, Anthony The Producer & ALX", features: null,
      lyrics_file: "02 Galante El Emperador - Toda Para Mi 2 [LETRA] - Prod By Askenax, Anthony The Producer & ALX.md",
      audio_file: "02 Galante El Emperador - Toda Para Mi 2 - Prod By Askenax, Anthony The Producer & ALX.wav" },
    { track_number: 3, title: "Dime Ahora Remix", producers: "Askenax, Yow Fade & ALX", features: "Genio La Musa, Killatonez",
      lyrics_file: "03 Galante El Emperador Ft. Genio La Musa, Killatonez - Dime Ahora Remix [LETRA] - Prod By Askenax, Yow Fade & ALX.md",
      audio_file: "03 Galante El Emperador Ft. Genio La Musa, Killatonez - Dime Ahora Remix - Prod By Askenax, Yow Fade & ALX.wav" },
    { track_number: 4, title: "Pa Buscarte", producers: "Anthony The Producer & ALX", features: "Tiana Estebanez",
      lyrics_file: "04 Galante El Emperador  Ft Tiana Estebanez - Pa Buscarte [LETRA] - Prod By Anthony The Producer & ALX.md",
      audio_file: "04 Galante El Emperador Ft. Tiana Estebanez - Pa Buscarte - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 5, title: "Come Calla", producers: "Yow Fade, Bryan LMDE & ALX", features: null,
      lyrics_file: "05 Galante El Emperador - Come Calla [LETRA] - Prod By Yow Fade, Bryan LMDE & ALX copy.md",
      audio_file: "05 Galante El Emperador - Come Calla - Prod By Yow Fade, Bryan LMDE & ALX copy.wav" },
    { track_number: 6, title: "Ya Te Mudaste", producers: "Askenax & ALX", features: null,
      lyrics_file: "06 Galante El Emperador -Ya Te Mudaste [LETRA]- Prod By Askenax & ALX.md",
      audio_file: "06 Galante El Emperador - Ya Te Mudaste - Prod By Askenax & ALX.wav" },
    { track_number: 7, title: "Si Te Vuelvo A Ver", producers: "Wutti, Melody & ALX", features: "Bayriton",
      lyrics_file: "07 Galante El Emperador - Si Te Vuelvo A Ver Ft Bayriton [LETRA]- Prod By Wutti, Melody & ALX.md",
      audio_file: "07 Galante El Emperador - Si Te Vuelvo A Ver Ft Bayriton - Prod By Wutti, Melody & ALX.wav" },
    { track_number: 8, title: "Mi Tentacion", producers: "Anthony The Producer & ALX", features: "Dilox",
      lyrics_file: "08 Galante El Emperador  Ft Dilox - Mi Tentacion [LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "08 Galante El Emperador  Ft Dilox - Mi Tentacion - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 9, title: "Casi Algo", producers: "Anthony The Producer & ALX", features: null,
      lyrics_file: "09 Galante El Emperador - Casi Algo [LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "09 Galante El Emperador - Casi Algo - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 10, title: "Cuenta Fantasma", producers: "Music Zone & ALX", features: "Dixon Versatil",
      lyrics_file: "10 Galante El Emperador Ft Dixon Versatil - Cuenta Fantasma [LETRA]- Prod By Music Zone & ALX.md",
      audio_file: "10 Galante El Emperador Ft Dixon Versatil - Cuenta Fantasma - Prod By Music Zone & ALX.wav" },
    { track_number: 11, title: "Inaceptable", producers: "Anthony The Producer & ALX", features: "Manny Eztilo",
      lyrics_file: "11 Galante El Emperador - Inaceptable Ft Manny Eztilo  [LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "11 Galante El Emperador - Inaceptable Ft Manny Eztilo - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 12, title: "No Se Que Somos", producers: "Wutti & ALX", features: null,
      lyrics_file: "12  Galante El Emperador - No Se Que Somos LETRA]- Prod By Wutti & ALX.md",
      audio_file: "12  Galante El Emperador - No Se Que Somos - Prod By Wutti & ALX.wav" },
    { track_number: 13, title: "No Te Enamores", producers: "Askenax, Wutti & ALX", features: "LaDeLaJotaa",
      lyrics_file: "13 Galante El Emperador Ft. LaDeLaJotaa- No Te Enamores [LETRA] - Prod By Askenax, Wutti & ALX.md",
      audio_file: "13 Galante El Emperador Ft. LaDeLaJotaa- No Te Enamores - Prod By Askenax, Wutti & ALX.md.wav" },
    { track_number: 14, title: "Siguele", producers: "Anthony The Producer & ALX", features: null,
      lyrics_file: "14 Galante El Emperador - Siguele LETRA]- Prod By Anthony The Producer & ALX.md",
      audio_file: "14 Galante El Emperador - Siguele - Prod By Anthony The Producer & ALX.wav" },
    { track_number: 15, title: "No Me Quieres Entender", producers: "DMT Level & ALX", features: "Lenny Low",
      lyrics_file: "15  Galante El Emperador Ft Lenny Low - No Me Quieres Entender  [LETRA]- Prod By DMT Level & ALX.md",
      audio_file: "15  Galante El Emperador Ft Lenny Low - No Me Quieres Entender - Prod By DMT Level & ALX.wav" },
    { track_number: 16, title: "Sigo En La Mia", producers: "Wutti & ALX", features: "Daizak",
      lyrics_file: "16  Galante El Emperador Ft Daizak - Sigo En La Mia LETRA] - Prod By Wutti & ALX.md",
      audio_file: "16  Galante El Emperador Ft Daizak - Sigo En La Mia - Prod By Wutti & ALX.wav" },
    { track_number: 17, title: "En La Nave", producers: "Wutti & ALX", features: "Sota One",
      lyrics_file: "17  Galante El Emperador Ft Sota One - En La Nave LETRA] - Prod By Wutti & ALX.md",
      audio_file: "17  Galante El Emperador Ft Sota One - En La Nave - Prod By Wutti & ALX.wav" },
    { track_number: 18, title: "Tu Pirata", producers: "UBeats & ALX", features: "Pablo Nick",
      lyrics_file: "18  Galante El Emperador Ft Pablo Nick - Tu Pirata [LETRA] - Prod By UBeats & ALX.md",
      audio_file: "18 Galante El Emperador Ft Pablonick - Tu Pirata - Prod By UBeats & ALX.wav" },
    { track_number: 19, title: "Al Que Se Meta Remix", producers: "Yeizel & ALX", features: "Joe Yncio",
      lyrics_file: "19 Galante El Emperador Ft. Joe Yncio - Al Que Se Meta Remix [LETRA] - Prod By Yeizel  & ALX.md",
      audio_file: "19 Galante El Emperador Ft. Joe Yncio - Al Que Se Meta Remix - Prod By Yeizel  & ALX.wav" },
    { track_number: 20, title: "Pa Chingal", producers: "Wutti & ALX", features: null,
      lyrics_file: "20 Galante El Emperador  - Pa Chingal  [LETRA] - Prod By Wutti  & ALX.md",
      audio_file: "20 Galante El Emperador  - Pa Chingal - Prod By Wutti  & ALX.wav" },
    { track_number: 21, title: "Las Eleven", producers: "Wutti & ALX", features: null,
      lyrics_file: "21 Galante El Emperador  - Las Eleven  [LETRA] - Prod By Wutti  & ALX.md",
      audio_file: "21 Galante El Emperador  - Las Eleven - Prod By Wutti  & ALX.wav" }
];

const db = new sqlite3.Database(DB_PATH);

async function importData() {
    console.log('🎵🎤👑 IMPORTANDO EL INMORTAL 2 CON LETRAS Y AUDIO 👑🎤🎵\n');
    
    try {
        // Clear existing track data
        console.log('🗑️  Limpiando datos existentes...');
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM tracks', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('  ✅ Tabla tracks limpiada\n');
        
        // Extract unique producers
        const uniqueProducers = new Set();
        albumTracks.forEach(track => {
            const producers = track.producers.split(/,\s*&\s*|\s*&\s*|,\s*/);
            producers.forEach(p => uniqueProducers.add(p.trim()));
        });
        
        // Get or create producers
        console.log('🎧 Verificando productores...');
        const producerMap = {};
        
        for (const producerName of uniqueProducers) {
            const producerId = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM producers WHERE name = ?', [producerName], (err, row) => {
                    if (err) {
                        reject(err);
                    } else if (row) {
                        resolve(row.id);
                    } else {
                        db.run(
                            'INSERT INTO producers (name, email, split_percentage) VALUES (?, ?, ?)',
                            [producerName, `${producerName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`, '50/50'],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.lastID);
                            }
                        );
                    }
                });
            });
            producerMap[producerName] = producerId;
        }
        console.log(`  ✅ ${Object.keys(producerMap).length} productores listos\n`);
        
        // Import tracks with lyrics and audio paths
        console.log('🎵 Importando temas con letras y audio...');
        let lyricsCount = 0;
        
        for (const track of albumTracks) {
            // Read lyrics from Dropbox
            let lyrics = '';
            const lyricsPath = path.join(LETRAS_PATH, track.lyrics_file);
            
            try {
                if (fs.existsSync(lyricsPath)) {
                    lyrics = fs.readFileSync(lyricsPath, 'utf8');
                    lyricsCount++;
                    console.log(`  📝 ${track.track_number}. ${track.title} - Letra cargada (${lyrics.length} chars)`);
                } else {
                    console.log(`  ⚠️  ${track.track_number}. ${track.title} - Sin letra`);
                }
            } catch (err) {
                console.log(`  ⚠️  ${track.track_number}. ${track.title} - Error: ${err.message}`);
            }
            
            // Get primary producer
            const primaryProducer = track.producers.split(/,\s*&\s*|\s*&\s*|,\s*/)[0].trim();
            const producerId = producerMap[primaryProducer] || null;
            
            // Store Dropbox path for audio
            const audioPath = path.join(MASTERED_PATH, track.audio_file);
            
            // Insert track with lyrics and audio path
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO tracks (track_number, title, producer_id, features, lyrics, audio_file_path, audio_file_type, status) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [track.track_number, track.title, producerId, track.features, lyrics, audioPath, 'Master', 'completed'],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
        
        console.log(`\n  ✅ ${albumTracks.length} temas importados`);
        console.log(`  📝 ${lyricsCount} letras cargadas desde Dropbox`);
        console.log(`  🎵 21 archivos de audio referenciados`);
        
        console.log('\n🎉🎉🎉 IMPORTACIÓN COMPLETADA! 🎉🎉🎉\n');
        console.log('📊 Resumen:');
        console.log(`  🎵 21 temas importados con letras y audio`);
        console.log(`  📝 ${lyricsCount} letras desde Dropbox`);
        console.log(`  🎧 ${Object.keys(producerMap).length} productores`);
        console.log('\n💡 Las letras se leyeron desde:');
        console.log(`   ${LETRAS_PATH}`);
        console.log('\n💡 Los audios están en:');
        console.log(`   ${MASTERED_PATH}`);
        
    } catch (error) {
        console.error('❌ Error durante la importación:', error);
    } finally {
        db.close();
    }
}

// Run import
importData();
