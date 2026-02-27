const mysql = require('mysql2/promise');

async function addRandomPlays() {
  const pool = mysql.createPool({
    host: 'db.artistaviral.com',
    user: 'ailex',
    password: 'soyesmalandro.2',
    database: 'artistaviral'
  });
  
  try {
    // Obtener los IDs de los tracks
    const [tracks] = await pool.execute('SELECT id FROM tracks WHERE is_public = 1 LIMIT 21');
    
    if (tracks.length === 0) {
      console.log('❌ No tracks found');
      return;
    }
    
    console.log(`🎵 Found ${tracks.length} tracks`);
    console.log('🎲 Generating 1000 random plays...\n');
    
    // Generar 1000 plays aleatorios
    const totalPlays = 1000;
    const playsPerTrack = Math.floor(totalPlays / tracks.length);
    const remainder = totalPlays % tracks.length;
    
    let insertedCount = 0;
    
    // Distribuir plays aleatoriamente
    for (let i = 0; i < totalPlays; i++) {
      // Seleccionar track aleatorio
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
      
      // Generar fecha aleatoria en los últimos 30 días
      const randomDate = new Date();
      randomDate.setDate(randomDate.getDate() - Math.floor(Math.random() * 30));
      randomDate.setHours(Math.floor(Math.random() * 24));
      randomDate.setMinutes(Math.floor(Math.random() * 60));
      
      // Insertar play
      await pool.execute(
        'INSERT INTO track_plays (track_id, played_at, play_duration, completed) VALUES (?, ?, ?, ?)',
        [randomTrack.id, randomDate, 180 + Math.floor(Math.random() * 120), 1]
      );
      
      insertedCount++;
      
      if (insertedCount % 100 === 0) {
        console.log(`  ✅ ${insertedCount} plays inserted...`);
      }
    }
    
    console.log(`\n✅ Total: ${insertedCount} plays added!`);
    
    // Mostrar distribución
    const [distribution] = await pool.execute(`
      SELECT t.track_number, t.title, COUNT(tp.id) as play_count
      FROM tracks t
      LEFT JOIN track_plays tp ON t.id = tp.track_id
      WHERE t.is_public = 1
      GROUP BY t.id
      ORDER BY play_count DESC
      LIMIT 10
    `);
    
    console.log('\n📊 Top 10 tracks:');
    distribution.forEach((row, idx) => {
      console.log(`  ${idx + 1}. Track ${row.track_number}: ${row.play_count} plays`);
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

addRandomPlays();