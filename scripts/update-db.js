const mysql = require('mysql2/promise');

async function updateDB() {
  const pool = mysql.createPool({
    host: 'db.artistaviral.com',
    user: 'ailex',
    password: 'soyesmalandro.2',
    database: 'artistaviral'
  });
  
  try {
    await pool.execute('ALTER TABLE producers ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500)');
    await pool.execute('ALTER TABLE producers ADD COLUMN IF NOT EXISTS avatar_crop_data JSON');
    console.log('Producers updated');
    
    await pool.execute('ALTER TABLE composers ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500)');
    await pool.execute('ALTER TABLE composers ADD COLUMN IF NOT EXISTS avatar_crop_data JSON');
    console.log('Composers updated');
    
    await pool.execute('ALTER TABLE artists ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500)');
    await pool.execute('ALTER TABLE artists ADD COLUMN IF NOT EXISTS avatar_crop_data JSON');
    console.log('Artists updated');
    
    console.log('Database updated');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

updateDB();
