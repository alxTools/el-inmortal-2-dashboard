// Usar fetch nativo de Node.js 18+ o node-fetch como fallback
let fetch = globalThis.fetch;
let FormData = globalThis.FormData;

if (!fetch) {
    try {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
        FormData = nodeFetch.FormData || require('form-data');
    } catch (e) {
        console.error('[Email] No se pudo cargar node-fetch:', e);
    }
}

/**
 * Envía email de bienvenida usando Microsoft Graph API
 * @param {Object} options
 * @param {string} options.to - Email del destinatario
 * @param {string} options.name - Nombre del destinatario
 * @param {string} options.country - País del destinatario
 */
async function sendWelcomeEmail({ to, name, country }) {
    try {
        const tenantId = process.env.MS_GRAPH_TENANT_ID;
        const clientId = process.env.MS_GRAPH_CLIENT_ID;
        const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
        const senderUser = process.env.MS_GRAPH_SENDER_USER || 'info@galantealx.com';

        if (!tenantId || !clientId || !clientSecret) {
            console.log('[Email] Microsoft Graph no configurado, saltando envío de email');
            return { success: false, skipped: true, reason: 'not_configured' };
        }

        // Obtener token de acceso
        const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
        const form = new FormData();
        form.set('grant_type', 'client_credentials');
        form.set('client_id', clientId);
        form.set('client_secret', clientSecret);
        form.set('scope', 'https://graph.microsoft.com/.default');

        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            body: form
        });

        if (!tokenRes.ok) {
            const tokenErr = await tokenRes.text();
            console.error('[Email] Error obteniendo token:', tokenErr);
            throw new Error('auth_failed');
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        // Crear contenido del email
        const subject = `🎵 Bienvenido a El Inmortal 2 - Acceso Exclusivo Desbloqueado`;
        
        const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bienvenido a El Inmortal 2</title>
        </head>
        <body style="margin:0;padding:0;background-color:#060b15;font-family:Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, #060b15 0%, #0f172a 100%);">
                <tr>
                    <td align="center" style="padding:40px 20px;">
                        <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(15,23,42,0.95);border-radius:20px;overflow:hidden;border:1px solid rgba(250,204,21,0.3);">
                            <!-- Header -->
                            <tr>
                                <td style="background:linear-gradient(135deg, rgba(250,204,21,0.2), rgba(15,23,42,0.8));padding:40px 30px;text-align:center;border-bottom:2px solid rgba(250,204,21,0.5);">
                                    <h1 style="color:#facc15;font-size:32px;margin:0;font-weight:bold;letter-spacing:2px;">EL INMORTAL 2</h1>
                                    <p style="color:#e2e8f0;margin:10px 0 0 0;font-size:16px;">Galante el Emperador</p>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding:40px 30px;">
                                    <h2 style="color:#ffffff;font-size:24px;margin:0 0 20px 0;">¡Hola ${name || 'Fan'}! 🎵</h2>
                                    
                                    <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                                        ¡Gracias por registrarte! Ahora tienes acceso exclusivo a <strong style="color:#facc15;">El Inmortal 2</strong>, el nuevo álbum de Galante el Emperador con 21 temas que están rompiendo la escena del reggaeton.
                                    </p>
                                    
                                    <div style="background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:12px;padding:25px;margin:25px 0;text-align:center;">
                                        <p style="color:#facc15;font-size:18px;margin:0 0 15px 0;font-weight:bold;">🔓 Tu acceso está desbloqueado</p>
                                        <a href="https://galantealx.com/ei2" 
                                           style="display:inline-block;background:linear-gradient(135deg,#facc15,#fbbf24);color:#0f172a;text-decoration:none;padding:15px 30px;border-radius:50px;font-weight:bold;font-size:16px;">
                                            🎧 Escuchar el Álbum Ahora
                                        </a>
                                    </div>
                                    
                                    <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:20px 0;">
                                        <strong style="color:#ffffff;">Lo que incluye tu registro:</strong><br>
                                        ✅ Acceso al tracklist completo (21 canciones)<br>
                                        ✅ Reproductor exclusivo del álbum<br>
                                        ✅ Noticias y lanzamientos prioritarios<br>
                                        ✅ Contenido exclusivo de Galante
                                    </p>
                                    
                                    <p style="color:#64748b;font-size:14px;margin:30px 0 0 0;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;">
                                        📍 Registrado desde: ${country || 'Desconocido'}<br>
                                        📅 Fecha: ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background:rgba(15,23,42,0.8);padding:30px;text-align:center;border-top:1px solid rgba(255,255,255,0.1);">
                                    <p style="color:#64748b;font-size:13px;margin:0;">
                                        © 2026 Galante el Emperador. Todos los derechos reservados.<br>
                                        <a href="https://galantealx.com" style="color:#facc15;text-decoration:none;">galantealx.com</a>
                                    </p>
                                    
                                    <p style="color:#475569;font-size:12px;margin:15px 0 0 0;">
                                        Si no te registraste, puedes ignorar este email.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `;

        // Enviar email
        const emailPayload = {
            message: {
                subject: subject,
                body: {
                    contentType: 'HTML',
                    content: htmlBody
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: to
                        }
                    }
                ]
            }
        };

        const sendRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderUser)}/sendMail`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(emailPayload)
            }
        );

        if (!sendRes.ok) {
            const sendErr = await sendRes.text();
            console.error('[Email] Error enviando email:', sendErr);
            throw new Error('send_failed');
        }

        console.log('[Email] Email de bienvenida enviado exitosamente a:', to);
        return { success: true, to };

    } catch (error) {
        console.error('[Email] Error en sendWelcomeEmail:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Envía webhook a n8n cuando un usuario se registra
 * @param {Object} userData
 */
async function sendWebhookToN8N(userData) {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.log('[Webhook] n8n no configurado, saltando webhook');
        return { success: false, skipped: true, reason: 'not_configured' };
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event: 'landing_subscription',
                timestamp: new Date().toISOString(),
                data: userData
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('[Webhook] Webhook enviado exitosamente a n8n');
        return { success: true };
    } catch (error) {
        console.error('[Webhook] Error enviando webhook:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWelcomeEmail,
    sendWebhookToN8N
};
