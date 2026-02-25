/**
 * Notion API Helper
 * Sincroniza usuarios y su progreso en el funnel a una base de datos de Notion
 */

// Usar fetch nativo de Node.js 18+
let fetch = globalThis.fetch;

if (!fetch) {
    try {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
    } catch (e) {
        console.error('[Notion] No se pudo cargar fetch:', e);
    }
}

const NOTION_API_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

/**
 * Verifica si Notion está configurado
 */
function isNotionConfigured() {
    return !!(
        process.env.NOTION_TOKEN &&
        process.env.NOTION_DATABASE_ID &&
        process.env.NOTION_SYNC_ENABLED === 'true'
    );
}

/**
 * Determina en qué paso del funnel está el usuario
 */
function getFunnelStep(user) {
    if (user.package_shipped) {
        return {
            step: '7 - Enviado',
            status: 'Completado',
            emoji: '📦',
            stepNumber: 7
        };
    }
    
    if (user.paypal_payment_status === 'captured') {
        return {
            step: '6 - Comprado',
            status: 'Pago Confirmado',
            emoji: '✅',
            stepNumber: 6
        };
    }
    
    if (user.paypal_order_id && !user.paypal_payment_status) {
        return {
            step: '5 - Checkout Iniciado',
            status: 'En Proceso',
            emoji: '💳',
            stepNumber: 5
        };
    }
    
    if (user.nfc_unique_code) {
        return {
            step: '4 - NFC Generado',
            status: 'Preparando',
            emoji: '📱',
            stepNumber: 4
        };
    }
    
    if (user.interested_in_minidisc) {
        return {
            step: '3 - Interesado',
            status: 'Hot Lead',
            emoji: '🔥',
            stepNumber: 3
        };
    }
    
    if (user.minidisc_email_sent) {
        return {
            step: '2 - Email Enviado',
            status: 'Esperando',
            emoji: '📧',
            stepNumber: 2
        };
    }
    
    return {
        step: '1 - Registrado',
        status: 'Nuevo',
        emoji: '🆕',
        stepNumber: 1
    };
}

/**
 * Crea o actualiza un usuario en Notion
 * @param {Object} user - Datos del usuario
 * @returns {Promise<Object>}
 */
async function syncUserToNotion(user) {
    if (!isNotionConfigured()) {
        return { success: false, skipped: true, reason: 'not_configured' };
    }

    try {
        const funnel = getFunnelStep(user);
        const token = process.env.NOTION_TOKEN;
        const databaseId = process.env.NOTION_DATABASE_ID;

        // Preparar propiedades para Notion
        const properties = {
            'ID': {
                number: user.id
            },
            'Email': {
                email: user.email
            },
            'Nombre': {
                title: [
                    {
                        text: {
                            content: user.full_name || 'Sin nombre'
                        }
                    }
                ]
            },
            'País': {
                select: {
                    name: user.country || 'Desconocido'
                }
            },
            'Fecha Registro': {
                date: {
                    start: user.created_at
                }
            },
            'Paso Funnel': {
                select: {
                    name: funnel.step
                }
            },
            'Estado': {
                select: {
                    name: funnel.status
                }
            },
            'Email Mini-Disc': {
                checkbox: !!user.minidisc_email_sent
            },
            'Fecha Email': user.minidisc_email_sent_at ? {
                date: {
                    start: user.minidisc_email_sent_at
                }
            } : null,
            'Interesado': {
                checkbox: !!user.interested_in_minidisc
            },
            'PayPal Order ID': user.paypal_order_id ? {
                rich_text: [
                    {
                        text: {
                            content: user.paypal_order_id
                        }
                    }
                ]
            } : null,
            'Estado Pago': user.paypal_payment_status ? {
                select: {
                    name: user.paypal_payment_status
                }
            } : null,
            'Código NFC': user.nfc_unique_code ? {
                rich_text: [
                    {
                        text: {
                            content: user.nfc_unique_code
                        }
                    }
                ]
            } : null,
            'Link NFC': user.nfc_link ? {
                url: user.nfc_link
            } : null,
            'Enviado': {
                checkbox: !!user.package_shipped
            },
            'Tracking': user.tracking_number ? {
                rich_text: [
                    {
                        text: {
                            content: user.tracking_number
                        }
                    }
                ]
            } : null
        };

        // Eliminar propiedades null
        Object.keys(properties).forEach(key => {
            if (properties[key] === null) {
                delete properties[key];
            }
        });

        // Buscar si el usuario ya existe en Notion
        const existingPage = await findUserInNotion(user.id);

        let response;
        if (existingPage) {
            // Actualizar página existente
            response = await fetch(`${NOTION_API_URL}/pages/${existingPage.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': NOTION_VERSION
                },
                body: JSON.stringify({
                    properties: properties
                })
            });
        } else {
            // Crear nueva página
            response = await fetch(`${NOTION_API_URL}/pages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': NOTION_VERSION
                },
                body: JSON.stringify({
                    parent: {
                        database_id: databaseId
                    },
                    properties: properties
                })
            });
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Notion API error');
        }

        const result = await response.json();

        console.log(`[Notion] Usuario ${user.email} ${existingPage ? 'actualizado' : 'creado'} exitosamente`);
        
        return {
            success: true,
            pageId: result.id,
            action: existingPage ? 'updated' : 'created',
            url: result.url
        };

    } catch (error) {
        console.error('[Notion] Error sincronizando usuario:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Busca un usuario en Notion por ID
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>}
 */
async function findUserInNotion(userId) {
    if (!isNotionConfigured()) {
        return null;
    }

    try {
        const token = process.env.NOTION_TOKEN;
        const databaseId = process.env.NOTION_DATABASE_ID;

        const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Notion-Version': NOTION_VERSION
            },
            body: JSON.stringify({
                filter: {
                    property: 'ID',
                    number: {
                        equals: userId
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to query Notion database');
        }

        const data = await response.json();
        
        return data.results && data.results.length > 0 ? data.results[0] : null;

    } catch (error) {
        console.error('[Notion] Error buscando usuario:', error);
        return null;
    }
}

/**
 * Sincroniza todos los usuarios a Notion (bulk)
 * @returns {Promise<Object>}
 */
async function syncAllUsersToNotion() {
    if (!isNotionConfigured()) {
        return { success: false, skipped: true, reason: 'not_configured' };
    }

    try {
        const { getAll } = require('../config/database');
        
        const users = await getAll(`
            SELECT * FROM landing_email_leads
            ORDER BY created_at DESC
        `);

        console.log(`[Notion] Sincronizando ${users.length} usuarios...`);

        let created = 0;
        let updated = 0;
        let errors = 0;

        for (const user of users) {
            const result = await syncUserToNotion(user);
            
            if (result.success) {
                if (result.action === 'created') {
                    created++;
                } else {
                    updated++;
                }
            } else {
                errors++;
            }

            // Delay para no saturar la API de Notion (3 requests por segundo)
            await new Promise(resolve => setTimeout(resolve, 350));
        }

        console.log(`[Notion] Sincronización completada: ${created} creados, ${updated} actualizados, ${errors} errores`);

        return {
            success: true,
            total: users.length,
            created,
            updated,
            errors
        };

    } catch (error) {
        console.error('[Notion] Error en sincronización masiva:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Obtiene estadísticas de la base de datos de Notion
 * @returns {Promise<Object>}
 */
async function getNotionStats() {
    if (!isNotionConfigured()) {
        return { success: false, skipped: true, reason: 'not_configured' };
    }

    try {
        const token = process.env.NOTION_TOKEN;
        const databaseId = process.env.NOTION_DATABASE_ID;

        const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Notion-Version': NOTION_VERSION
            }
        });

        if (!response.ok) {
            throw new Error('Failed to query Notion database');
        }

        const data = await response.json();
        
        const stats = {
            total: data.results.length,
            byStep: {}
        };

        data.results.forEach(page => {
            const step = page.properties['Paso Funnel']?.select?.name || 'Unknown';
            stats.byStep[step] = (stats.byStep[step] || 0) + 1;
        });

        return {
            success: true,
            stats
        };

    } catch (error) {
        console.error('[Notion] Error obteniendo estadísticas:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Crea la estructura de la base de datos en Notion
 * (Esta función es para documentación - la base debe crearse manualmente)
 */
function getDatabaseSchema() {
    return {
        title: [
            {
                type: 'text',
                text: {
                    content: 'El Inmortal 2 - User Tracking'
                }
            }
        ],
        properties: {
            'ID': {
                number: {}
            },
            'Nombre': {
                title: {}
            },
            'Email': {
                email: {}
            },
            'País': {
                select: {
                    options: []
                }
            },
            'Fecha Registro': {
                date: {}
            },
            'Paso Funnel': {
                select: {
                    options: [
                        { name: '1 - Registrado', color: 'blue' },
                        { name: '2 - Email Enviado', color: 'yellow' },
                        { name: '3 - Interesado', color: 'orange' },
                        { name: '4 - NFC Generado', color: 'purple' },
                        { name: '5 - Checkout Iniciado', color: 'blue' },
                        { name: '6 - Comprado', color: 'green' },
                        { name: '7 - Enviado', color: 'gray' }
                    ]
                }
            },
            'Estado': {
                select: {
                    options: [
                        { name: 'Nuevo', color: 'blue' },
                        { name: 'Esperando', color: 'yellow' },
                        { name: 'Hot Lead', color: 'orange' },
                        { name: 'Preparando', color: 'purple' },
                        { name: 'En Proceso', color: 'blue' },
                        { name: 'Pago Confirmado', color: 'green' },
                        { name: 'Completado', color: 'gray' }
                    ]
                }
            },
            'Email Mini-Disc': {
                checkbox: {}
            },
            'Fecha Email': {
                date: {}
            },
            'Interesado': {
                checkbox: {}
            },
            'PayPal Order ID': {
                rich_text: {}
            },
            'Estado Pago': {
                select: {
                    options: [
                        { name: 'created', color: 'gray' },
                        { name: 'approved', color: 'yellow' },
                        { name: 'captured', color: 'green' },
                        { name: 'failed', color: 'red' }
                    ]
                }
            },
            'Código NFC': {
                rich_text: {}
            },
            'Link NFC': {
                url: {}
            },
            'Enviado': {
                checkbox: {}
            },
            'Tracking': {
                rich_text: {}
            }
        }
    };
}

module.exports = {
    isNotionConfigured,
    syncUserToNotion,
    syncAllUsersToNotion,
    findUserInNotion,
    getNotionStats,
    getFunnelStep,
    getDatabaseSchema
};
