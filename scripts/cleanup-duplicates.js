const fs = require('fs');
const path = require('path');

const LANDING_DIR = path.join(__dirname, '../public/uploads/audio/landing');

console.log('🧹 Limpiando duplicados en landing...\n');

const files = fs.readdirSync(LANDING_DIR);
const mp3Files = files.filter(f => f.endsWith('_landing.mp3'));

// Agrupar por número de track (el número después del primer _)
const trackGroups = {};

mp3Files.forEach(file => {
    // Buscar el número de track en formato: 1771..._01_Nombre
    const match = file.match(/^\d+_(\d+)_/);
    if (match) {
        const trackNum = match[1].padStart(2, '0');
        if (!trackGroups[trackNum]) {
            trackGroups[trackNum] = [];
        }
        trackGroups[trackNum].push(file);
    }
});

let deleted = 0;
let kept = 0;

Object.entries(trackGroups).forEach(([trackNum, files]) => {
    if (files.length > 1) {
        // Ordenar por timestamp (más reciente primero)
        files.sort((a, b) => {
            const timestampA = parseInt(a.match(/^(\d+)_/)?.[1] || '0');
            const timestampB = parseInt(b.match(/^(\d+)_/)?.[1] || '0');
            return timestampB - timestampA;
        });
        
        console.log(`Track ${trackNum}: ${files.length} versiones`);
        console.log(`  ✅ Manteniendo: ${files[0]}`);
        
        // Eliminar los demás
        files.slice(1).forEach(file => {
            fs.unlinkSync(path.join(LANDING_DIR, file));
            console.log(`  🗑️  Eliminado: ${file}`);
            deleted++;
        });
        kept++;
    } else {
        kept++;
    }
});

console.log(`\n📊 Resumen:`);
console.log(`   ✅ Mantenidos: ${kept}`);
console.log(`   🗑️  Eliminados: ${deleted}`);
console.log(`   📁 Total: ${kept + deleted}`);