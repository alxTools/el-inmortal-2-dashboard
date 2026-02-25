// Script para exportar datos de usuarios a CSV para Notion
const { getAll } = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * Determina en qué paso del funnel está el usuario
 */
function getFunnelStep(user) {
    if (user.package_shipped) {
        return {
            step: '7 - Enviado',
            status: 'Completado',
            emoji: '📦'
        };
    }
    
    if (user.paypal_payment_status === 'captured') {
        return {
            step: '6 - Comprado',
            status: 'Pago Confirmado',
            emoji: '✅'
        };
    }
    
    if (user.paypal_order_id && !user.paypal_payment_status) {
        return {
            step: '5 - Checkout Iniciado',
            status: 'En Proceso',
            emoji: '💳'
        };
    }
    
    if (user.nfc_unique_code) {
        return {
            step: '4 - NFC Generado',
            status: 'Preparando',
            emoji: '📱'
        };
    }
    
    if (user.interested_in_minidisc) {
        return {
            step: '3 - Interesado',
            status: 'Hot Lead',
            emoji: '🔥'
        };
    }
    
    if (user.minidisc_email_sent) {
        return {
            step: '2 - Email Enviado',
            status: 'Esperando',
            emoji: '📧'
        };
    }
    
    return {
        step: '1 - Registrado',
        status: 'Nuevo',
        emoji: '🆕'
    };
}

/**
 * Exporta todos los usuarios a CSV
 */
async function exportToCSV() {
    try {
        console.log('📊 Exportando datos de usuarios...');
        
        const users = await getAll(`
            SELECT 
                id,
                email,
                full_name,
                country,
                created_at,
                interested_in_minidisc,
                paypal_order_id,
                paypal_payment_status,
                paypal_payer_email,
                minidisc_email_sent,
                minidisc_email_sent_at,
                nfc_unique_code,
                nfc_link,
                package_shipped,
                tracking_number,
                source_label,
                ip_address
            FROM landing_email_leads
            ORDER BY created_at DESC
        `);
        
        // Headers CSV
        const headers = [
            'ID',
            'Email',
            'Nombre',
            'País',
            'Fecha Registro',
            'Paso Funnel',
            'Estado',
            'Email Mini-Disc Enviado',
            'Fecha Email',
            'Interesado en Mini-Disc',
            'PayPal Order ID',
            'Estado Pago',
            'Email Pagador',
            'Código NFC',
            'Link NFC',
            'Enviado',
            'Tracking',
            'Source',
            'IP'
        ];
        
        // Rows
        const rows = users.map(user => {
            const funnel = getFunnelStep(user);
            return [
                user.id,
                user.email,
                user.full_name || '',
                user.country || '',
                user.created_at,
                funnel.step,
                funnel.status,
                user.minidisc_email_sent ? 'Sí' : 'No',
                user.minidisc_email_sent_at || '',
                user.interested_in_minidisc ? 'Sí' : 'No',
                user.paypal_order_id || '',
                user.paypal_payment_status || '',
                user.paypal_payer_email || '',
                user.nfc_unique_code || '',
                user.nfc_link || '',
                user.package_shipped ? 'Sí' : 'No',
                user.tracking_number || '',
                user.source_label,
                user.ip_address || ''
            ];
        });
        
        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        // Save file
        const exportDir = path.join(__dirname, '../../exports');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
        
        const filename = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
        const filepath = path.join(exportDir, filename);
        
        fs.writeFileSync(filepath, csvContent, 'utf8');
        
        console.log(`✅ Exportación completada: ${filepath}`);
        console.log(`📈 Total usuarios: ${users.length}`);
        
        // Statistics
        const stats = {
            total: users.length,
            byStep: {}
        };
        
        users.forEach(user => {
            const step = getFunnelStep(user).step;
            stats.byStep[step] = (stats.byStep[step] || 0) + 1;
        });
        
        console.log('\n📊 Estadísticas por paso:');
        Object.entries(stats.byStep).forEach(([step, count]) => {
            console.log(`   ${step}: ${count}`);
        });
        
        return {
            success: true,
            filename,
            filepath,
            totalUsers: users.length,
            stats
        };
        
    } catch (error) {
        console.error('❌ Error exportando:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Exporta a JSON (para integraciones API)
 */
async function exportToJSON() {
    try {
        const users = await getAll(`
            SELECT * FROM landing_email_leads
            ORDER BY created_at DESC
        `);
        
        const data = users.map(user => ({
            ...user,
            funnel: getFunnelStep(user)
        }));
        
        const exportDir = path.join(__dirname, '../../exports');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
        
        const filename = `users_export_${new Date().toISOString().split('T')[0]}.json`;
        const filepath = path.join(exportDir, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
        
        console.log(`✅ JSON exportado: ${filepath}`);
        
        return {
            success: true,
            filename,
            filepath,
            totalUsers: users.length
        };
        
    } catch (error) {
        console.error('❌ Error exportando JSON:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run export if called directly
if (require.main === module) {
    (async () => {
        await exportToCSV();
        await exportToJSON();
        process.exit(0);
    })();
}

module.exports = {
    exportToCSV,
    exportToJSON,
    getFunnelStep
};
