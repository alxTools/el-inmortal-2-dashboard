/**
 * Sistema de Notificaciones Sociales (Social Proof)
 * Muestra notificaciones falsas pero realistas de compras recientes
 */

(function() {
    'use strict';

    // Pool de notificaciones
    const notifications = [
        { name: 'Juan', country: 'México', action: 'reservó', product: 'su Mini-Disc', time: 'hace 2 min' },
        { name: 'María', country: 'España', action: 'compró', product: 'su Mini-Disc', time: 'hace 5 min' },
        { name: 'Carlos', country: 'Argentina', action: 'obtuvo', product: 'su Mini-Disc', time: 'justo ahora' },
        { name: 'Ana', country: 'Colombia', action: 'reservó', product: 'su Mini-Disc', time: 'hace 1 min' },
        { name: 'Pedro', country: 'Chile', action: 'compró', product: 'su Mini-Disc', time: 'hace 3 min' },
        { name: 'Laura', country: 'Perú', action: 'reservó', product: 'su Mini-Disc', time: 'hace 4 min' },
        { name: 'Diego', country: 'Ecuador', action: 'obtuvo', product: 'su Mini-Disc', time: 'hace 30 seg' },
        { name: 'Sofía', country: 'Uruguay', action: 'reservó', product: 'su Mini-Disc', time: 'hace 2 min' },
        { name: 'Miguel', country: 'Venezuela', action: 'compró', product: 'su Mini-Disc', time: 'hace 6 min' },
        { name: 'Valentina', country: 'Brasil', action: 'reservó', product: 'su Mini-Disc', time: 'hace 1 min' },
        { name: 'Andrés', country: 'Puerto Rico', action: 'obtuvo', product: 'su Mini-Disc', time: 'justo ahora' },
        { name: 'Camila', country: 'República Dominicana', action: 'compró', product: 'su Mini-Disc', time: 'hace 3 min' },
        { name: 'Lucas', country: 'Guatemala', action: 'reservó', product: 'su Mini-Disc', time: 'hace 5 min' },
        { name: 'Isabella', country: 'Costa Rica', action: 'obtuvo', product: 'su Mini-Disc', time: 'hace 2 min' },
        { name: 'Mateo', country: 'Panamá', action: 'reservó', product: 'su Mini-Disc', time: 'hace 4 min' },
        { name: 'Emma', country: 'Honduras', action: 'compró', product: 'su Mini-Disc', time: 'hace 1 min' },
        { name: 'Daniel', country: 'El Salvador', action: 'reservó', product: 'su Mini-Disc', time: 'hace 3 min' },
        { name: 'Lucía', country: 'Nicaragua', action: 'obtuvo', product: 'su Mini-Disc', time: 'justo ahora' },
        { name: 'Alejandro', country: 'Bolivia', action: 'compró', product: 'su Mini-Disc', time: 'hace 2 min' },
        { name: 'Mariana', country: 'Paraguay', action: 'reservó', product: 'su Mini-Disc', time: 'hace 5 min' }
    ];

    // Avatares aleatorios (usando iniciales)
    const getAvatar = (name) => {
        const colors = ['#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const initial = name.charAt(0).toUpperCase();
        return { color, initial };
    };

    // Crear el contenedor de notificaciones
    const createContainer = () => {
        const container = document.createElement('div');
        container.id = 'social-notifications';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
        return container;
    };

    // Crear una notificación
    const createNotification = (data) => {
        const avatar = getAvatar(data.name);
        const notification = document.createElement('div');
        notification.className = 'social-notification';
        notification.style.cssText = `
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(250, 204, 21, 0.3);
            border-radius: 12px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease forwards;
            max-width: 320px;
            pointer-events: auto;
            backdrop-filter: blur(10px);
        `;

        notification.innerHTML = `
            <div style="
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: ${avatar.color};
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: #0f172a;
                font-size: 16px;
                flex-shrink: 0;
            ">
                ${avatar.initial}
            </div>
            <div style="flex: 1;">
                <p style="margin: 0; color: #e2e8f0; font-size: 13px; line-height: 1.4;">
                    <strong style="color: #facc15;">${data.name}</strong> de ${data.country}
                    <br>
                    <span style="color: #94a3b8;">${data.action} ${data.product} ${data.time}</span>
                </p>
            </div>
            <div style="color: #22c55e; font-size: 18px;">✓</div>
        `;

        return notification;
    };

    // Agregar estilos CSS
    const addStyles = () => {
        if (document.getElementById('social-notification-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'social-notification-styles';
        styles.textContent = `
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            @keyframes slideOut {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(100px);
                }
            }

            .social-notification.hiding {
                animation: slideOut 0.3s ease forwards;
            }

            @media (max-width: 480px) {
                #social-notifications {
                    left: 10px;
                    right: 10px;
                    bottom: 10px;
                }

                .social-notification {
                    max-width: 100% !important;
                }
            }
        `;
        document.head.appendChild(styles);
    };

    // Variable para controlar si está activo
    let isActive = false;
    let container = null;
    let isPaused = false; // Pausar cuando hay audio reproduciéndose

    // Escuchar eventos del reproductor de audio
    const setupAudioListeners = () => {
        // Evento global para cuando el audio comienza a reproducirse
        document.addEventListener('audio-playing', () => {
            isPaused = true;
            console.log('[Social Notifications] Pausado - audio reproduciéndose');
        });

        // Evento global para cuando el audio se pausa
        document.addEventListener('audio-paused', () => {
            isPaused = false;
            console.log('[Social Notifications] Reanudado - audio pausado');
        });

        // También detectar elementos de audio directamente
        const checkAudioElements = () => {
            const audios = document.querySelectorAll('audio');
            let anyPlaying = false;
            audios.forEach(audio => {
                if (!audio.paused && !audio.ended) {
                    anyPlaying = true;
                }
            });
            isPaused = anyPlaying;
        };

        // Verificar cada segundo
        setInterval(checkAudioElements, 1000);
    };

    // Mostrar una notificación
    const showNotification = () => {
        if (!isActive || !container || isPaused) return;

        // Seleccionar notificación aleatoria
        const data = notifications[Math.floor(Math.random() * notifications.length)];
        
        // Crear y mostrar
        const notification = createNotification(data);
        container.appendChild(notification);

        // Eliminar después de 5 segundos
        setTimeout(() => {
            notification.classList.add('hiding');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);

        // Limitar a máximo 2 notificaciones visibles
        const visibleNotifications = container.querySelectorAll('.social-notification');
        if (visibleNotifications.length > 2) {
            const oldest = visibleNotifications[0];
            oldest.classList.add('hiding');
            setTimeout(() => {
                if (oldest.parentNode) {
                    oldest.parentNode.removeChild(oldest);
                }
            }, 300);
        }
    };

    // Iniciar el sistema
    const init = () => {
        if (isActive) return;

        addStyles();
        container = createContainer();
        isActive = true;

        // Configurar listeners de audio
        setupAudioListeners();

        // Mostrar primera notificación después de 3 segundos
        setTimeout(showNotification, 3000);

        // Programar notificaciones aleatorias cada 8-12 segundos
        const scheduleNext = () => {
            if (!isActive) return;
            
            const delay = Math.floor(Math.random() * 4000) + 8000; // 8-12 segundos
            setTimeout(() => {
                if (isActive) {
                    showNotification();
                    scheduleNext();
                }
            }, delay);
        };

        scheduleNext();

        console.log('[Social Notifications] Sistema iniciado');
    };

    // Detener el sistema
    const stop = () => {
        isActive = false;
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
        container = null;
        console.log('[Social Notifications] Sistema detenido');
    };

    // Exponer API global
    window.SocialNotifications = {
        init,
        stop,
        show: showNotification,
        isActive: () => isActive
    };

    // Auto-iniciar si estamos en la página de landing
    if (window.location.pathname.includes('/ei2') || window.location.pathname.includes('/landing')) {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
