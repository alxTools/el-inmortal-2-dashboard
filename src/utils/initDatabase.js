const { getDatabase, initializeTables } = require('../config/database');

console.log('🗄️  Initializing database...\n');

try {
    const db = getDatabase();
    initializeTables();
    
    console.log('\n✅ Database initialized successfully!');
    console.log('\n📊 Tables created:');
    console.log('  - tracks');
    console.log('  - producers');
    console.log('  - splitsheets');
    console.log('  - content_calendar');
    console.log('  - checklist_items');
    console.log('  - activity_log');
    console.log('  - sessions (for authentication)');
    
    process.exit(0);
} catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
}