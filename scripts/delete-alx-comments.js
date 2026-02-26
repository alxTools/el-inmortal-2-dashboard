const mysql = require('mysql2/promise');

async function deleteAlxComments() {
  const pool = mysql.createPool({
    host: 'db.artistaviral.com',
    user: 'ailex',
    password: 'soyesmalandro.2',
    database: 'artistaviral'
  });
  
  try {
    // Borrar comentarios de alx
    const [result] = await pool.execute(
      "DELETE FROM landing_comments WHERE user_name LIKE ? OR user_email LIKE ?",
      ['%alx%', '%alx%']
    );
    console.log(`✅ Eliminados ${result.affectedRows} comentarios de alx`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

deleteAlxComments();