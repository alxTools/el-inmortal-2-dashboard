const mysql = require('mysql2/promise');

async function addLoopsTable() {
  const pool = mysql.createPool({
    host: 'db.artistaviral.com',
    user: 'ailex',
    password: 'soyesmalandro.2',
    database: 'artistaviral'
  });
  
  try {
    // Crear tabla de loops
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS loops (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        duration INT DEFAULT 0,
        thumbnail_path VARCHAR(500),
        is_active TINYINT(1) DEFAULT 1,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_is_active (is_active)
      )
    `);
    console.log('✅ Tabla loops creada');
    
    // Crear tabla de videos generados
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS fan_videos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lead_id INT,
        user_id INT,
        loop_id INT NOT NULL,
        user_photo_path VARCHAR(500) NOT NULL,
        video_path VARCHAR(500),
        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        INDEX idx_status (status),
        INDEX idx_lead_id (lead_id)
      )
    `);
    console.log('✅ Tabla fan_videos creada');
    
    console.log('✅ Database schema actualizado para Fan Generator');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addLoopsTable();