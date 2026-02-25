#!/usr/bin/env node
/**
 * Script para probar la conexión con Notion
 * Uso: node test-notion.js
 */

require('dotenv').config();
const { isNotionConfigured, syncAllUsersToNotion, getNotionStats } = require('../src/utils/notionHelper');

async function testNotion() {
    console.log('🔍 Probando conexión con Notion...\n');

    // 1. Verificar configuración
    console.log('1. Verificando configuración...');
    const configured = isNotionConfigured();
    
    if (!configured) {
        console.log('❌ Notion NO está configurado');
        console.log('   Verifica que tengas:');
        console.log('   - NOTION_TOKEN en .env');
        console.log('   - NOTION_DATABASE_ID en .env');
        console.log('   - NOTION_SYNC_ENABLED=true');
        return;
    }
    
    console.log('✅ Notion está configurado');
    console.log(`   Token: ${process.env.NOTION_TOKEN?.substring(0, 10)}...`);
    console.log(`   Database ID: ${process.env.NOTION_DATABASE_ID?.substring(0, 10)}...`);
    console.log(`   Sync Enabled: ${process.env.NOTION_SYNC_ENABLED}`);
    console.log(`   Sync on Register: ${process.env.NOTION_SYNC_ON_REGISTER}`);
    console.log(`   Sync on Purchase: ${process.env.NOTION_SYNC_ON_PURCHASE}`);
    
    // 2. Probar obtener estadísticas
    console.log('\n2. Probando conexión a la base de datos...');
    const stats = await getNotionStats();
    
    if (stats.success) {
        console.log('✅ Conexión exitosa');
        console.log(`   Total de páginas: ${stats.stats.total}`);
        console.log('   Por paso:');
        Object.entries(stats.stats.byStep).forEach(([step, count]) => {
            console.log(`     - ${step}: ${count}`);
        });
    } else {
        console.log('❌ Error conectando a Notion:');
        console.log(`   ${stats.error}`);
        console.log('\nPosibles causas:');
        console.log('   - Token incorrecto');
        console.log('   - Database ID incorrecto');
        console.log('   - Base de datos no compartida con la integración');
        return;
    }

    // 3. Preguntar si quiere sincronizar todos
    console.log('\n3. Sincronización');
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    readline.question('¿Quieres sincronizar TODOS los usuarios ahora? (s/n): ', async (answer) => {
        if (answer.toLowerCase() === 's') {
            console.log('\n⏳ Sincronizando usuarios...');
            const result = await syncAllUsersToNotion();
            
            if (result.success) {
                console.log('\n✅ Sincronización completada');
                console.log(`   Total: ${result.total}`);
                console.log(`   Creados: ${result.created}`);
                console.log(`   Actualizados: ${result.updated}`);
                console.log(`   Errores: ${result.errors}`);
            } else {
                console.log('\n❌ Error en sincronización:');
                console.log(`   ${result.error}`);
            }
        } else {
            console.log('\n⏭️  Sincronización omitida');
        }

        console.log('\n✨ Test completado');
        readline.close();
        process.exit(0);
    });
}

testNotion();
