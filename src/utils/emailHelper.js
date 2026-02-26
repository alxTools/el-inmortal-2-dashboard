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
 * @param {string} options.magicToken - Token mágico para desbloquear
 * @param {number} options.userId - ID del usuario
 */
async function sendWelcomeEmail({ to, name, country, magicToken, userId }) {
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

        // Crear magic link (usar /ei2/unlock porque el landing router está montado en /ei2)
        const baseUrl = process.env.BASE_URL || 'https://ei2.galantealx.com';
        const magicLink = magicToken ? `${baseUrl}/ei2/unlock?token=${magicToken}` : `${baseUrl}/ei2`;
        
        // Crear contenido del email
        const subject = `🎵 Bienvenido a El Inmortal 2 - Verifica tu email para desbloquear`;
        
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
                                    <img src="https://ei2.galantealx.com/images/galante_signature.png" alt="Galante el Emperador" style="max-width:180px;height:auto;margin-bottom:15px;" />
                                    <h1 style="color:#facc15;font-size:32px;margin:0;font-weight:bold;letter-spacing:2px;">EL INMORTAL 2</h1>
                                    <p style="color:#e2e8f0;margin:10px 0 0 0;font-size:16px;">Galante el Emperador</p>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding:40px 30px;">
                                    <h2 style="color:#ffffff;font-size:24px;margin:0 0 20px 0;">¡Hola ${name || 'Fan'}! 🎵</h2>
                                    
                                    <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                                        ¡Gracias por registrarte! Estás a un paso de acceder a <strong style="color:#facc15;">El Inmortal 2</strong>, el nuevo álbum de Galante el Emperador con 21 temas que están rompiendo la escena del reggaeton.
                                    </p>
                                    
                                    <div style="background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3);border-radius:12px;padding:25px;margin:25px 0;text-align:center;">
                                        <p style="color:#facc15;font-size:18px;margin:0 0 15px 0;font-weight:bold;">📧 Confirma tu email</p>
                                        <p style="color:#94a3b8;font-size:14px;margin:0 0 15px 0;">Haz clic en el botón de abajo para verificar tu email y desbloquear el acceso completo:</p>
                                        <a href="${magicLink}" 
                                           style="display:inline-block;background:linear-gradient(135deg,#facc15,#fbbf24);color:#0f172a;text-decoration:none;padding:15px 30px;border-radius:50px;font-weight:bold;font-size:16px;">
                                             🔓 Verificar Email y Desbloquear Acceso
                                        </a>
                                        <p style="color:#64748b;font-size:12px;margin:15px 0 0 0;">O copia este link:<br>${magicLink}</p>
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

/**
 * Envía email de oferta de Mini-Disc (30 min después del registro)
 * @param {Object} options
 * @param {string} options.to - Email del destinatario
 * @param {string} options.name - Nombre del destinatario
 * @param {string} options.country - País del destinatario
 * @param {number} options.userId - ID del usuario
 */
async function sendMiniDiscOfferEmail({ to, name, country, userId }) {
    try {
        const tenantId = process.env.MS_GRAPH_TENANT_ID;
        const clientId = process.env.MS_GRAPH_CLIENT_ID;
        const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
        const senderUser = process.env.MS_GRAPH_SENDER_USER || 'info@galantealx.com';

        if (!tenantId || !clientId || !clientSecret) {
            console.log('[Email] Microsoft Graph no configurado, saltando envío de email Mini-Disc');
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

        // Generar token de seguridad para el checkout
        const checkoutToken = Buffer.from(`${userId}:${Date.now()}`).toString('base64');
        const checkoutUrl = `https://ei2.galantealx.com/landing/checkout?email=${encodeURIComponent(to)}&token=${checkoutToken}`;

        // Crear contenido del email persuasivo
        const subject = `💿 Tu Mini-Disc de El Inmortal 2 te espera (Edición Limitada)`;
        
        const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Mini-Disc El Inmortal 2 - Edición Limitada</title>
        </head>
        <body style="margin:0;padding:0;background-color:#060b15;font-family:Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, #060b15 0%, #0f172a 100%);">
                <tr>
                    <td align="center" style="padding:40px 20px;">
                        <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(15,23,42,0.95);border-radius:20px;overflow:hidden;border:1px solid rgba(250,204,21,0.3);">
                            <!-- Header -->
                            <tr>
                                <td style="background:linear-gradient(135deg, rgba(250,204,21,0.2), rgba(15,23,42,0.8));padding:40px 30px;text-align:center;border-bottom:2px solid rgba(250,204,21,0.5);">
                                    <div style="font-size:48px;margin-bottom:15px;">💿</div>
                                    <h1 style="color:#facc15;font-size:28px;margin:0;font-weight:bold;letter-spacing:2px;">EDICIÓN LIMITADA</h1>
                                    <p style="color:#e2e8f0;margin:10px 0 0 0;font-size:16px;">Mini-Disc de Colección - El Inmortal 2</p>
                                </td>
                            </tr>
                            
                            <!-- Urgencia -->
                            <tr>
                                <td style="background:rgba(239,68,68,0.15);padding:15px;text-align:center;border-bottom:1px solid rgba(239,68,68,0.3);">
                                    <p style="color:#fca5a5;margin:0;font-size:14px;font-weight:bold;">
                                        ⚠️ Solo quedan 38 unidades de 500 disponibles
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding:40px 30px;">
                                    <h2 style="color:#ffffff;font-size:22px;margin:0 0 20px 0;">Hey ${name || 'Fan'}! 👋</h2>
                                    
                                    <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                                        Hace 30 minutos desbloqueaste <strong style="color:#facc15;">El Inmortal 2</strong> y ya estás disfrutando de las 21 canciones. 
                                        Pero hay algo más que quiero compartir contigo...
                                    </p>
                                    
                                    <p style="color:#e2e8f0;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                                        <strong>¿Recuerdas los minidiscs?</strong> Esa época dorada cuando la música era tangible, cuando tenías algo físico que conectaría contigo para siempre. 
                                    </p>
                                    
                                    <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 25px 0;">
                                        He creado algo especial: una <strong style="color:#facc15;">edición limitada de 500 Mini-Discs firmados</strong> de "El Inmortal 2". Cada uno es único, numerado, y lleva mi firma personal.
                                    </p>
                                    
                                    <!-- Producto -->
                                    <div style="background:rgba(15,23,42,0.8);border:2px solid rgba(250,204,21,0.3);border-radius:16px;padding:30px;margin:25px 0;text-align:center;">
                                        <div style="font-size:64px;margin-bottom:15px;">💿</div>
                                        <h3 style="color:#facc15;font-size:24px;margin:0 0 15px 0;">Mini-Disc Firmado - $15</h3>
                                        
                                        <ul style="color:#94a3b8;font-size:15px;line-height:1.8;text-align:left;display:inline-block;margin:0 0 20px 0;padding-left:20px;">
                                            <li>✨ Firmado personalmente por mí</li>
                                            <li>📱 <strong>Tecnología NFC integrada</strong> - Toca con tu celular y desbloquea contenido exclusivo</li>
                                            <li>🎁 Sticker exclusivo de El Inmortal 2 incluido</li>
                                            <li>📦 Envío gratis a ${country || 'tu país'}</li>
                                            <li>🔒 Numerado (1-500) - Cada uno es único</li>
                                        </ul>
                                        
                                        <div style="background:rgba(250,204,21,0.1);border-radius:10px;padding:15px;margin:20px 0;">
                                            <p style="color:#facc15;font-size:14px;margin:0;font-weight:bold;">
                                                🎵 Al tocar el NFC con tu celular, accederás a:<br>
                                                Wallpapers exclusivos • Behind the scenes • Linktree VIP
                                            </p>
                                        </div>
                                        
                                        <a href="${checkoutUrl}" 
                                           style="display:inline-block;background:linear-gradient(135deg,#facc15,#fbbf24);color:#0f172a;text-decoration:none;padding:18px 40px;border-radius:50px;font-weight:bold;font-size:18px;margin-top:10px;box-shadow:0 4px 15px rgba(250,204,21,0.3);">
                                            🔒 Reservar Mi Mini-Disc Ahora
                                        </a>
                                        
                                        <p style="color:#64748b;font-size:12px;margin:15px 0 0 0;">
                                            Pagos seguros vía PayPal • Envío en 3-5 días hábiles
                                        </p>
                                    </div>
                                    
                                    <!-- Social Proof -->
                                    <div style="background:rgba(34,197,94,0.1);border-left:4px solid #22c55e;padding:20px;margin:25px 0;border-radius:0 10px 10px 0;">
                                        <p style="color:#86efac;font-size:15px;margin:0;line-height:1.6;">
                                            <strong>🔥 462 fans ya reservaron el suyo</strong><br>
                                            "No pensé que un minidisc pudiera significar tanto. Tocarlo y escuchar la música es otra experiencia." - Carlos M., México
                                        </p>
                                    </div>
                                    
                                    <!-- Escasez -->
                                    <div style="text-align:center;margin:25px 0;">
                                        <p style="color:#fca5a5;font-size:18px;margin:0;font-weight:bold;">
                                            ⏰ Solo 38 unidades restantes
                                        </p>
                                        <p style="color:#94a3b8;font-size:14px;margin:10px 0 0 0;">
                                            Una vez que se acaben, no habrá reimpresión. Esta es tu oportunidad.
                                        </p>
                                    </div>
                                    
                                    <!-- Garantía -->
                                    <div style="background:rgba(15,23,42,0.6);border-radius:10px;padding:20px;margin:25px 0;text-align:center;">
                                        <p style="color:#94a3b8;font-size:14px;margin:0;">
                                            ✅ <strong>Garantía de devolución:</strong> Si no quedas 100% satisfecho, te devolvemos tu dinero. Sin preguntas.
                                        </p>
                                    </div>
                                    
                                    <!-- CTA Final -->
                                    <div style="text-align:center;margin:30px 0;">
                                        <a href="${checkoutUrl}" 
                                           style="display:inline-block;background:linear-gradient(135deg,#facc15,#fbbf24);color:#0f172a;text-decoration:none;padding:18px 40px;border-radius:50px;font-weight:bold;font-size:18px;margin:10px;box-shadow:0 4px 15px rgba(250,204,21,0.3);">
                                            💿 Sí, Quiero Mi Mini-Disc - $15
                                        </a>
                                    </div>
                                    
                                    <p style="color:#64748b;font-size:14px;margin:30px 0 0 0;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;text-align:center;">
                                        ¿Preguntas? Responde a este email o escríbenos a info@galantealx.com
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
                                        Recibiste este email porque te registraste en El Inmortal 2.<br>
                                        <a href="https://galantealx.com/unsubscribe" style="color:#64748b;text-decoration:underline;">Darte de baja</a>
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
            console.error('[Email] Error enviando email Mini-Disc:', sendErr);
            throw new Error('send_failed');
        }

        console.log('[Email] Email de Mini-Disc enviado exitosamente a:', to);
        return { success: true, to };

    } catch (error) {
        console.error('[Email] Error en sendMiniDiscOfferEmail:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Envía email de confirmación de compra del Mini-Disc
 * @param {Object} options
 * @param {string} options.to - Email del destinatario
 * @param {string} options.name - Nombre del destinatario
 * @param {string} options.orderId - ID de la orden de PayPal
 * @param {string} options.amount - Monto pagado
 * @param {string} options.nfcCode - Código NFC único
 * @param {string} options.nfcLink - Link NFC
 */
async function sendMiniDiscConfirmationEmail({ to, name, orderId, amount, nfcCode, nfcLink }) {
    try {
        const tenantId = process.env.MS_GRAPH_TENANT_ID;
        const clientId = process.env.MS_GRAPH_CLIENT_ID;
        const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
        const senderUser = process.env.MS_GRAPH_SENDER_USER || 'info@galantealx.com';

        if (!tenantId || !clientId || !clientSecret) {
            console.log('[Email] Microsoft Graph no configurado');
            return { success: false, skipped: true, reason: 'not_configured' };
        }

        // Obtener token
        const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
        const form = new FormData();
        form.set('grant_type', 'client_credentials');
        form.set('client_id', clientId);
        form.set('client_secret', clientSecret);
        form.set('scope', 'https://graph.microsoft.com/.default');

        const tokenRes = await fetch(tokenUrl, { method: 'POST', body: form });
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        const subject = `🎉 ¡Confirmado! Tu Mini-Disc de El Inmortal 2 está en camino`;
        
        const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Confirmación de Compra - Mini-Disc</title>
        </head>
        <body style="margin:0;padding:0;background-color:#060b15;font-family:Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, #060b15 0%, #0f172a 100%);">
                <tr>
                    <td align="center" style="padding:40px 20px;">
                        <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(15,23,42,0.95);border-radius:20px;overflow:hidden;border:1px solid rgba(34,197,94,0.3);">
                            <!-- Header -->
                            <tr>
                                <td style="background:linear-gradient(135deg, rgba(34,197,94,0.2), rgba(15,23,42,0.8));padding:40px 30px;text-align:center;border-bottom:2px solid rgba(34,197,94,0.5);">
                                    <div style="font-size:64px;margin-bottom:15px;">🎉</div>
                                    <h1 style="color:#22c55e;font-size:28px;margin:0;font-weight:bold;letter-spacing:2px;">¡COMPRA CONFIRMADA!</h1>
                                    <p style="color:#e2e8f0;margin:10px 0 0 0;font-size:16px;">Tu Mini-Disc de El Inmortal 2</p>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding:40px 30px;">
                                    <h2 style="color:#ffffff;font-size:22px;margin:0 0 20px 0;">¡Gracias ${name || 'Fan'}! 💿</h2>
                                    
                                    <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
                                        Tu pago de <strong style="color:#22c55e;">$${amount}</strong> ha sido procesado exitosamente. 
                                        Tu Mini-Disc firmado está siendo preparado con mucho cariño.
                                    </p>
                                    
                                    <!-- Detalles de la orden -->
                                    <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:25px;margin:25px 0;">
                                        <h3 style="color:#facc15;font-size:18px;margin:0 0 15px 0;">Detalles de tu orden:</h3>
                                        <p style="color:#94a3b8;font-size:14px;margin:5px 0;">
                                            <strong>Orden #:</strong> ${orderId}<br>
                                            <strong>Producto:</strong> Mini-Disc Firmado - El Inmortal 2<br>
                                            <strong>Total:</strong> $${amount}<br>
                                            <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}
                                        </p>
                                    </div>
                                    
                                    <!-- Código NFC -->
                                    <div style="background:linear-gradient(135deg,rgba(250,204,21,0.15),rgba(250,204,21,0.05));border:2px solid rgba(250,204,21,0.4);border-radius:16px;padding:30px;margin:25px 0;text-align:center;">
                                        <div style="font-size:48px;margin-bottom:15px;">📱</div>
                                        <h3 style="color:#facc15;font-size:20px;margin:0 0 15px 0;">Tu Código NFC Exclusivo</h3>
                                        <p style="color:#94a3b8;font-size:14px;margin:0 0 20px 0;line-height:1.6;">
                                            Cuando recibas tu Mini-Disc, simplemente <strong>tócalo con tu celular</strong> para desbloquear contenido exclusivo.
                                        </p>
                                        <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:15px;display:inline-block;">
                                            <p style="color:#facc15;font-size:24px;margin:0;font-family:monospace;font-weight:bold;letter-spacing:2px;">
                                                ${nfcCode}
                                            </p>
                                        </div>
                                        <p style="color:#64748b;font-size:12px;margin:15px 0 0 0;">
                                            O visita: <a href="${nfcLink}" style="color:#facc15;text-decoration:none;">${nfcLink}</a>
                                        </p>
                                    </div>
                                    
                                    <!-- Qué sigue -->
                                    <div style="background:rgba(34,197,94,0.1);border-left:4px solid #22c55e;padding:20px;margin:25px 0;border-radius:0 10px 10px 0;">
                                        <h4 style="color:#22c55e;font-size:16px;margin:0 0 10px 0;">📦 ¿Qué sigue?</h4>
                                        <ul style="color:#94a3b8;font-size:14px;margin:0;padding-left:20px;line-height:1.8;">
                                            <li>Tu Mini-Disc será firmado personalmente en las próximas 24-48 horas</li>
                                            <li>Recibirás un email con el número de tracking cuando sea enviado</li>
                                            <li>Tiempo estimado de entrega: 3-5 días hábiles</li>
                                            <li>El sticker exclusivo va incluido en el paquete</li>
                                        </ul>
                                    </div>
                                    
                                    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:25px 0;text-align:center;">
                                        Gracias por ser parte de esta historia. <strong style="color:#facc15;">Eres uno de los 500 fanáticos privilegiados</strong> que tendrán este pedazo de historia en sus manos.
                                    </p>
                                    
                                    <p style="color:#64748b;font-size:14px;margin:30px 0 0 0;border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;text-align:center;">
                                        ¿Preguntas sobre tu orden? Responde a este email.<br>
                                        Orden #: ${orderId}
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
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `;

        const emailPayload = {
            message: {
                subject: subject,
                body: { contentType: 'HTML', content: htmlBody },
                toRecipients: [{ emailAddress: { address: to } }]
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
            throw new Error('send_failed');
        }

        console.log('[Email] Email de confirmación enviado a:', to);
        return { success: true, to };

    } catch (error) {
        console.error('[Email] Error en sendMiniDiscConfirmationEmail:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWelcomeEmail,
    sendMiniDiscOfferEmail,
    sendMiniDiscConfirmationEmail,
    sendWebhookToN8N
};
