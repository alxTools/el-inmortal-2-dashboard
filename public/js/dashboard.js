// Dashboard JavaScript - Enhanced Edition

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all features
    initializeRevealAnimations();
    initializeParallaxEffect();
    initializeNavbarScroll();
    initializeQuickLinkAnimations();
    initializeTableRowEffects();
    
    // Auto-update stats every 30 seconds
    setInterval(updateStats, 30000);
    
    // Initial load
    updateStats();
    
    // Setup hourly reminder alert
    setupHourlyAlert();
    
    // Add keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Initialize tooltip system
    initializeTooltips();
});

// Reveal animations on scroll
function initializeRevealAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.reveal').forEach(el => {
        el.style.animationPlayState = 'paused';
        observer.observe(el);
    });
}

// Parallax effect for header
function initializeParallaxEffect() {
    const header = document.querySelector('.header');
    if (!header) return;
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * 0.3;
        header.style.transform = `translateY(${rate}px)`;
    }, { passive: true });
}

// Navbar scroll effect
function initializeNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
        
        lastScroll = currentScroll;
    }, { passive: true });
}

// Quick links hover animations
function initializeQuickLinkAnimations() {
    const quickLinks = document.querySelectorAll('.quick-link');
    
    quickLinks.forEach(link => {
        link.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px) scale(1.02)';
        });
        
        link.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
}

// Table row hover effects
function initializeTableRowEffects() {
    const tableRows = document.querySelectorAll('.tracks-table tbody tr');
    
    tableRows.forEach(row => {
        row.addEventListener('mouseenter', function() {
            this.style.background = 'rgba(255, 215, 0, 0.08)';
        });
        
        row.addEventListener('mouseleave', function() {
            this.style.background = '';
        });
    });
}

// Tooltip system
function initializeTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    
    tooltipElements.forEach(el => {
        el.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'custom-tooltip';
            tooltip.textContent = this.getAttribute('data-tooltip');
            document.body.appendChild(tooltip);
            
            const rect = this.getBoundingClientRect();
            tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
            tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
            
            setTimeout(() => tooltip.classList.add('show'), 10);
        });
        
        el.addEventListener('mouseleave', function() {
            const tooltip = document.querySelector('.custom-tooltip');
            if (tooltip) {
                tooltip.classList.remove('show');
                setTimeout(() => tooltip.remove(), 300);
            }
        });
    });
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K for quick search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            showQuickSearch();
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

// Quick search modal
function showQuickSearch() {
    const modal = document.createElement('div');
    modal.className = 'quick-search-modal';
    modal.innerHTML = `
        <div class="quick-search-overlay"></div>
        <div class="quick-search-container">
            <input type="text" placeholder="Buscar..." autofocus>
            <div class="quick-search-results"></div>
        </div>
    `;
    document.body.appendChild(modal);
    
    setTimeout(() => modal.classList.add('active'), 10);
    
    modal.querySelector('.quick-search-overlay').addEventListener('click', () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    });
}

// Close all modals
function closeAllModals() {
    document.querySelectorAll('.modal, .quick-search-modal').forEach(modal => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    });
}

// Setup voice alert every hour (hora por hora)
function setupHourlyAlert() {
    const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
    
    console.log('🔔 Alerta de voz cada hora activada (hora por hora)');
    
    // Check if speech synthesis is available
    if (!('speechSynthesis' in window)) {
        console.warn('⚠️ Speech synthesis no soportado en este navegador');
        return;
    }
    
    // Calculate time until next hour
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const timeUntilNextHour = nextHour - now;
    
    console.log(`⏰ Próximo anuncio en: ${Math.round(timeUntilNextHour / 1000 / 60)} minutos`);
    
    // First announcement at the next exact hour
    setTimeout(function() {
        speakStatusUpdate();
        // Then every hour after that
        setInterval(function() {
            speakStatusUpdate();
        }, ONE_HOUR);
    }, timeUntilNextHour);
}

// Speak current time using Web Speech API (12-hour format)
function speakCurrentTime() {
    try {
        const now = new Date();
        const hours24 = now.getHours();
        const minutes = now.getMinutes();
        
        // Convert to 12-hour format
        const ampm = hours24 >= 12 ? 'PM' : 'AM';
        const hours12 = hours24 % 12 || 12;
        
        // Format time in Spanish (12-hour format only)
        let timeText = '';
        if (minutes === 0) {
            timeText = 'Son las ' + hours12 + ' en punto';
        } else if (minutes < 10) {
            timeText = 'Son las ' + hours12 + ' con ' + minutes + ' minutos';
        } else {
            timeText = 'Son las ' + hours12 + ' y ' + minutes;
        }
        
        // Create speech message with AM/PM
        const message = timeText + ' ' + ampm;
        
        // Create speech utterance
        const utterance = new SpeechSynthesisUtterance(message);
        
        // Configure voice
        utterance.lang = 'es-ES'; // Spanish (Spain)
        utterance.rate = 0.9; // Slightly slower for clarity
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Try to find a Spanish FEMALE voice
        const voices = window.speechSynthesis.getVoices();
        // Buscar voces femeninas españolas (Monica, Helena, etc.)
        const femaleSpanishVoices = voices.filter(voice => 
            voice.lang.startsWith('es') && 
            (voice.name.includes('Monica') || 
             voice.name.includes('Helena') || 
             voice.name.includes('Carmen') ||
             voice.name.includes('Female') ||
             voice.name.includes('Mujer') ||
             voice.name.includes('Femenina') ||
             voice.name.includes('Google español'))
        );
        
        if (femaleSpanishVoices.length > 0) {
            utterance.voice = femaleSpanishVoices[0];
        } else {
            // Fallback a cualquier voz española
            const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
            if (spanishVoice) {
                utterance.voice = spanishVoice;
            }
        }
        
        // Speak
        window.speechSynthesis.speak(utterance);
        
        console.log('🔊 Hora anunciada:', message);
    } catch (error) {
        console.error('Error speaking time:', error);
    }
}

async function speakStatusUpdate() {
    try {
        const lastId = Number(localStorage.getItem('lastStatusUpdateId') || 0) || 0;
        const response = await fetch(`/api/status-updates?afterId=${lastId}&limit=1`);
        const payload = await response.json();
        const update = payload.updates && payload.updates.length ? payload.updates[0] : null;

        if (!update) {
            speakCurrentTime();
            return;
        }

        localStorage.setItem('lastStatusUpdateId', String(update.id));

        const now = new Date();
        const hours24 = now.getHours();
        const minutes = now.getMinutes();
        const hours12 = hours24 % 12 || 12;
        const ampm = hours24 >= 12 ? 'PM' : 'AM';

        const timePrefix = minutes === 0
            ? `Son las ${hours12} en punto ${ampm}`
            : `Son las ${hours12} y ${minutes} ${ampm}`;
        const statusPrefix = update.severity === 'critical'
            ? 'Alerta critica.'
            : update.severity === 'warning'
                ? 'Aviso importante.'
                : 'Update del sistema.';

        const message = `${timePrefix}. ${statusPrefix} ${update.message}`;
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'es-ES';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to find a Spanish FEMALE voice
        const voices = window.speechSynthesis.getVoices();
        const femaleSpanishVoices = voices.filter(voice => 
            voice.lang.startsWith('es') && 
            (voice.name.includes('Monica') || 
             voice.name.includes('Helena') || 
             voice.name.includes('Carmen') ||
             voice.name.includes('Female') ||
             voice.name.includes('Mujer') ||
             voice.name.includes('Femenina') ||
             voice.name.includes('Google español'))
        );
        
        if (femaleSpanishVoices.length > 0) {
            utterance.voice = femaleSpanishVoices[0];
        } else {
            const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
            if (spanishVoice) {
                utterance.voice = spanishVoice;
            }
        }

        window.speechSynthesis.speak(utterance);
        console.log('🔊 Update anunciado:', message);
    } catch (error) {
        console.error('Error speaking status update:', error);
        speakCurrentTime();
    }
}

// Ensure voices are loaded (Chrome requires this)
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = function() {
        console.log('🎤 Voces de síntesis cargadas');
    };
}

async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        // Update stat cards if they exist
        const statNumbers = document.querySelectorAll('.stat-card .number');
        if (statNumbers.length >= 4) {
            statNumbers[0].textContent = `${data.tracks.total}/${data.tracks.target}`;
            statNumbers[1].textContent = data.producers;
            statNumbers[2].textContent = `${data.splitsheets.confirmed}/${data.tracks.total}`;
            statNumbers[3].textContent = `${data.content.total}/${data.content.target}`;
        }
        
        // Update progress bars with animation
        const progressBars = document.querySelectorAll('.progress-fill');
        if (progressBars.length >= 3) {
            progressBars[0].style.width = `${(data.tracks.total / data.tracks.target * 100)}%`;
            progressBars[1].style.width = data.tracks.total > 0 ? `${(data.splitsheets.confirmed / data.tracks.total * 100)}%` : '0%';
            progressBars[2].style.width = `${(data.content.total / data.content.target * 100)}%`;
        }
        
        // Show toast notification
        showToast('Stats actualizados', 'success');
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Toast notification system
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.dashboard-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `dashboard-toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
        <span class="toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Toggle track status
async function toggleTrackStatus(trackId, field) {
    try {
        const response = await fetch(`/api/tracks/${trackId}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ field, value: 1 })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('Estado actualizado', 'success');
            setTimeout(() => location.reload(), 500);
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error actualizando estado', 'error');
    }
}

// Delete item immediately without confirmation
function confirmDelete(type, id) {
    fetch(`/${type}s/${id}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Eliminado correctamente', 'success');
            setTimeout(() => location.reload(), 500);
        } else {
            showToast('Error eliminando', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('Error eliminando', 'error');
    });
}

// Form validation
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return true;
    
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.style.borderColor = '#dc3545';
            field.classList.add('shake');
            setTimeout(() => field.classList.remove('shake'), 500);
            isValid = false;
        } else {
            field.style.borderColor = '';
        }
    });
    
    if (!isValid) {
        showToast('Por favor completa todos los campos requeridos', 'error');
    }
    
    return isValid;
}

// Real-time clock for header
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    const clockEl = document.getElementById('realtime-clock');
    if (clockEl) {
        clockEl.textContent = timeString;
    }
}

// Update clock every second
setInterval(updateClock, 1000);
updateClock();

// Export functions for global use
window.Dashboard = {
    showToast,
    updateStats,
    toggleTrackStatus,
    confirmDelete,
    validateForm,
    showQuickSearch
};
