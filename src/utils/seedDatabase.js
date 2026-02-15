const { getDatabase } = require('../config/database');

console.log('🌱 Seeding database with sample data...\n');

const db = getDatabase();

// Sample producers
const producers = [
    { name: 'Productor Master', legal_name: 'Juan Producciones', email: 'producer1@email.com', split_percentage: '50/50' },
    { name: 'Beat Maker Pro', legal_name: 'Pedro Beats', email: 'producer2@email.com', split_percentage: '60/40' },
    { name: 'Sound Engineer', legal_name: 'María Audio', email: 'producer3@email.com', split_percentage: '50/50' }
];

// Sample tracks
const tracks = [
    { track_number: 1, title: 'Intro Imperial', producer_id: 1, recording_date: '2026-01-15', duration: '2:34' },
    { track_number: 2, title: 'El Inmortal', producer_id: 1, recording_date: '2026-01-16', duration: '3:45' },
    { track_number: 3, title: 'Calle y Gloria', producer_id: 2, recording_date: '2026-01-18', duration: '3:12' }
];

// Sample checklist items
const checklistItems = [
    { category: 'Urgente', item_text: 'Enviar splitsheets a todos los productores', priority: 'urgent' },
    { category: 'Urgente', item_text: 'Confirmar recepción de splitsheets', priority: 'urgent' },
    { category: 'Distribución', item_text: 'Verificar distribución digital configurada', priority: 'high' },
    { category: 'Marketing', item_text: 'Actualizar perfiles de redes sociales', priority: 'normal' }
];

// Insert producers
producers.forEach(producer => {
    db.run(`
        INSERT OR IGNORE INTO producers (name, legal_name, email, split_percentage)
        VALUES (?, ?, ?, ?)
    `, [producer.name, producer.legal_name, producer.email, producer.split_percentage]);
});

// Insert tracks
tracks.forEach(track => {
    db.run(`
        INSERT OR IGNORE INTO tracks (track_number, title, producer_id, recording_date, duration)
        VALUES (?, ?, ?, ?, ?)
    `, [track.track_number, track.title, track.producer_id, track.recording_date, track.duration]);
});

// Insert checklist items
checklistItems.forEach(item => {
    db.run(`
        INSERT OR IGNORE INTO checklist_items (category, item_text, priority)
        VALUES (?, ?, ?)
    `, [item.category, item.item_text, item.priority]);
});

console.log('✅ Sample data inserted:');
console.log(`  - ${producers.length} producers`);
console.log(`  - ${tracks.length} tracks`);
console.log(`  - ${checklistItems.length} checklist items`);
console.log('\n🎉 Database seeded successfully!');

process.exit(0);