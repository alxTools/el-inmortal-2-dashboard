const mysql = require('mysql2/promise');

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = 'artistaviral' AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].count > 0;
}

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = 'artistaviral' AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].count > 0;
}

async function updateDB() {
  const pool = mysql.createPool({
    host: 'db.artistaviral.com',
    user: 'ailex',
    password: 'soyesmalandro.2',
    database: 'artistaviral'
  });
  
  try {
    // Check and add columns safely
    
    // ROLES SYSTEM - Users table
    if (!await columnExists(pool, 'users', 'role')) {
      await pool.execute(`ALTER TABLE users ADD COLUMN role ENUM('super_admin', 'admin', 'fan') DEFAULT 'fan'`);
      console.log('✅ Users.role added');
    } else {
      console.log('ℹ️ Users.role already exists');
    }
    
    // Update existing users to 'admin' role (except keep fans as fans)
    await pool.execute(`UPDATE users SET role = 'admin' WHERE role IS NULL`);
    console.log('✅ Existing users without role updated to admin');
    
    // Public/Private flags for albums
    if (!await columnExists(pool, 'album_info', 'is_public')) {
      await pool.execute(`ALTER TABLE album_info ADD COLUMN is_public TINYINT(1) DEFAULT 1`);
      console.log('✅ Album_info.is_public added');
    } else {
      console.log('ℹ️ Album_info.is_public already exists');
    }
    
    // Public/Private flags for tracks
    if (!await columnExists(pool, 'tracks', 'is_public')) {
      await pool.execute(`ALTER TABLE tracks ADD COLUMN is_public TINYINT(1) DEFAULT 1`);
      console.log('✅ Tracks.is_public added');
    } else {
      console.log('ℹ️ Tracks.is_public already exists');
    }
    
    // Landing leads - add email verification
    if (!await columnExists(pool, 'landing_email_leads', 'email_verified')) {
      await pool.execute(`ALTER TABLE landing_email_leads ADD COLUMN email_verified TINYINT(1) DEFAULT 0`);
      console.log('✅ Landing_email_leads.email_verified added');
    }
    
    if (!await columnExists(pool, 'landing_email_leads', 'magic_token')) {
      await pool.execute(`ALTER TABLE landing_email_leads ADD COLUMN magic_token VARCHAR(255)`);
      console.log('✅ Landing_email_leads.magic_token added');
    }
    
    if (!await columnExists(pool, 'landing_email_leads', 'plays_count')) {
      await pool.execute(`ALTER TABLE landing_email_leads ADD COLUMN plays_count INT DEFAULT 0`);
      console.log('✅ Landing_email_leads.plays_count added');
    }
    
    // Track plays table for analytics
    if (!await tableExists(pool, 'track_plays')) {
      await pool.execute(`CREATE TABLE track_plays (
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
      console.log('✅ Track_plays table created');
    } else {
      console.log('ℹ️ Track_plays table already exists');
    }
    
    // Landing comments table
    if (!await tableExists(pool, 'landing_comments')) {
      await pool.execute(`CREATE TABLE landing_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lead_id INT NULL,
        user_id INT NULL,
        user_name VARCHAR(255) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_approved TINYINT(1) DEFAULT 1,
        INDEX idx_lead_id (lead_id),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )`);
      console.log('✅ Landing_comments table created');
    } else {
      console.log('ℹ️ Landing_comments table already exists');
    }
    
    // Landing reactions table (para sistema de recompensas)
    if (!await tableExists(pool, 'landing_reactions')) {
      await pool.execute(`CREATE TABLE landing_reactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lead_id INT NULL,
        user_id INT NULL,
        track_id INT NOT NULL,
        track_number INT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        reaction TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lead_id (lead_id),
        INDEX idx_user_id (user_id),
        INDEX idx_track_id (track_id),
        INDEX idx_created_at (created_at)
      )`);
      console.log('✅ Landing_reactions table created');
    } else {
      console.log('ℹ️ Landing_reactions table already exists');
    }
    
    console.log('✅ Database schema updated successfully');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateDB();
