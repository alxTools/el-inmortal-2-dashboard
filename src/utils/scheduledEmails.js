const schedule = require('node-schedule');
const { sendMiniDiscOfferEmail } = require('./emailHelper');
const { getOne, run } = require('../config/database');

// Almacena los jobs programados en memoria
const scheduledJobs = new Map();

/**
 * Programa el envío del email de Mini-Disc para 30 minutos después del registro
 * @param {number} userId - ID del usuario en la base de datos
 * @param {string} email - Email del destinatario
 * @param {Object} userData - Datos del usuario (nombre, país, etc.)
 */
async function scheduleMiniDiscEmail(userId, email, userData) {
    try {
        // Calcular la fecha de envío (30 minutos desde ahora)
        const sendTime = new Date(Date.now() + 30 * 60 * 1000); // +30 minutos
        
        console.log(`[Scheduler] Programando email Mini-Disc para ${email} a las ${sendTime.toISOString()}`);
        
        // Crear el job
        const job = schedule.scheduleJob(sendTime, async () => {
            try {
                console.log(`[Scheduler] Ejecutando envío de email Mini-Disc para ${email}`);
                
                // Verificar que no se haya enviado ya
                const existing = await getOne(
                    'SELECT minidisc_email_sent FROM landing_email_leads WHERE id = ?',
                    [userId]
                );
                
                if (existing?.minidisc_email_sent) {
                    console.log(`[Scheduler] Email ya enviado anteriormente a ${email}, saltando...`);
                    return;
                }
                
                // Enviar el email
                const result = await sendMiniDiscOfferEmail({
                    to: email,
                    name: userData.fullName,
                    country: userData.country,
                    userId: userId
                });
                
                if (result.success) {
                    // Marcar como enviado en la base de datos
                    await run(
                        `UPDATE landing_email_leads 
                         SET minidisc_email_sent = 1, minidisc_email_sent_at = ? 
                         WHERE id = ?`,
                        [new Date().toISOString(), userId]
                    );
                    
                    console.log(`[Scheduler] ✅ Email Mini-Disc enviado exitosamente a ${email}`);
                } else {
                    console.error(`[Scheduler] ❌ Error enviando email a ${email}:`, result.error);
                }
                
                // Eliminar el job de la memoria
                scheduledJobs.delete(userId);
                
            } catch (error) {
                console.error(`[Scheduler] Error en job programado para ${email}:`, error);
            }
        });
        
        // Guardar referencia al job
        scheduledJobs.set(userId, job);
        
        console.log(`[Scheduler] ✅ Job programado exitosamente para ${email}`);
        return { success: true, scheduledTime: sendTime };
        
    } catch (error) {
        console.error('[Scheduler] Error programando email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Cancela un email programado
 * @param {number} userId - ID del usuario
 */
function cancelScheduledEmail(userId) {
    const job = scheduledJobs.get(userId);
    if (job) {
        job.cancel();
        scheduledJobs.delete(userId);
        console.log(`[Scheduler] Job cancelado para usuario ${userId}`);
        return true;
    }
    return false;
}

/**
 * Reprograma emails pendientes al iniciar el servidor
 * (útil si el servidor se reinicia)
 */
async function reschedulePendingEmails() {
    try {
        console.log('[Scheduler] Verificando emails pendientes...');
        
        // Buscar usuarios registrados hace menos de 30 min que no han recibido el email
        const pendingUsers = await getAll(
            `SELECT id, email, full_name, country, created_at 
             FROM landing_email_leads 
             WHERE minidisc_email_sent = 0 
             AND datetime(created_at) > datetime('now', '-30 minutes')
             ORDER BY created_at DESC`
        );
        
        console.log(`[Scheduler] Encontrados ${pendingUsers.length} emails pendientes`);
        
        for (const user of pendingUsers) {
            const registeredTime = new Date(user.created_at).getTime();
            const now = Date.now();
            const elapsed = now - registeredTime;
            const remaining = 30 * 60 * 1000 - elapsed; // 30 min en ms
            
            if (remaining > 0) {
                // Aún no han pasado 30 min, reprogramar
                const sendTime = new Date(now + remaining);
                
                const job = schedule.scheduleJob(sendTime, async () => {
                    await sendMiniDiscOfferEmail({
                        to: user.email,
                        name: user.full_name,
                        country: user.country,
                        userId: user.id
                    });
                    
                    await run(
                        `UPDATE landing_email_leads 
                         SET minidisc_email_sent = 1, minidisc_email_sent_at = ? 
                         WHERE id = ?`,
                        [new Date().toISOString(), user.id]
                    );
                    
                    scheduledJobs.delete(user.id);
                });
                
                scheduledJobs.set(user.id, job);
                console.log(`[Scheduler] Reprogramado email para ${user.email} en ${Math.round(remaining/1000/60)} minutos`);
            } else {
                // Ya pasaron 30 min, enviar inmediatamente
                console.log(`[Scheduler] Enviando email inmediatamente a ${user.email} (retrasado)`);
                
                await sendMiniDiscOfferEmail({
                    to: user.email,
                    name: user.full_name,
                    country: user.country,
                    userId: user.id
                });
                
                await run(
                    `UPDATE landing_email_leads 
                     SET minidisc_email_sent = 1, minidisc_email_sent_at = ? 
                     WHERE id = ?`,
                    [new Date().toISOString(), user.id]
                );
            }
        }
        
        console.log('[Scheduler] ✅ Reprogramación completada');
        
    } catch (error) {
        console.error('[Scheduler] Error reprogramando emails:', error);
    }
}

/**
 * Obtiene el estado de los jobs programados
 */
function getScheduledJobsStatus() {
    return {
        totalScheduled: scheduledJobs.size,
        jobs: Array.from(scheduledJobs.entries()).map(([userId, job]) => ({
            userId,
            nextRun: job.nextInvocation()
        }))
    };
}

module.exports = {
    scheduleMiniDiscEmail,
    cancelScheduledEmail,
    reschedulePendingEmails,
    getScheduledJobsStatus
};
