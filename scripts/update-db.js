const mysql = require('mysql2/promise');

async function updateDB() {
  const pool = mysql.createPool({
    host: 'db.artistaviral.com',
    user: 'ailex',
    password: 'soyesmalandro.2',
    database: 'artistaviral'
  });
  
  try {
    // Avatar columns (existing)
    await pool.execute('ALTER TABLE producers ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500)');
    await pool.execute('ALTER TABLE producers ADD COLUMN IF NOT EXISTS avatar_crop_data JSON');
    console.log('Producers updated');
    
    await pool.execute('ALTER TABLE composers ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500)');
    await pool.execute('ALTER TABLE composers ADD COLUMN IF NOT EXISTS avatar_crop_data JSON');
    console.log('Composers updated');
    
    await pool.execute('ALTER TABLE artists ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500)');
    await pool.execute('ALTER TABLE artists ADD COLUMN IF NOT EXISTS avatar_crop_data JSON');
    console.log('Artists updated');
    
    // ROLES SYSTEM - Users table
    await pool.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role ENUM('super_admin', 'admin', 'fan') DEFAULT 'fan'`);
    console.log('Users.role added');
    
    // Update existing admin users to 'admin' role
    await pool.execute(`UPDATE users SET role = 'admin' WHERE role IS NULL OR role = 'fan'`);
    console.log('Existing users updated to admin role');
    
    // Public/Private flags
    await pool.execute(`ALTER TABLE album_info ADD COLUMN IF NOT EXISTS is_public TINYINT(1) DEFAULT 1`);
    console.log('Album_info.is_public added');
    
    await pool.execute(`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_public TINYINT(1) DEFAULT 1`);
    console.log('Tracks.is_public added');
    
    // Landing leads - add email verification
    await pool.execute(`ALTER TABLE landing_email_leads ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) DEFAULT 0`);
    await pool.execute(`ALTER TABLE landing_email_leads ADD COLUMN IF NOT EXISTS magic_token VARCHAR(255)`);
    await pool.execute(`ALTER TABLE landing_email_leads ADD COLUMN IF NOT EXISTS plays_count INT DEFAULT 0`);
    console.log('Landing_email_leads columns added');
    
    // Track plays table for analytics
    await pool.execute(`CREATE TABLE IF NOT EXISTS track_plays (
      id INT AUTO_INCREMENT PRIMARY KEY,
      track_id INT NOT NULL,
      user_id INT NULL,
      lead_id INT NULL,
      played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      play_duration INT DEFAULT 0,
      completed TINYINT(1) DEFAULT 0,
      INDEX idx_track_id (track_id),
      INDEX idx_user_id (user_id),
      INDEX idx_played_at (played_at)
    )`);
    console.log('Track_plays table created');
    
    console.log('✅ Database updated successfully');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

updateDB();
