// Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Auto-update stats every 30 seconds
    setInterval(updateStats, 30000);
    
    // Initial load
    updateStats();
    
    // Setup 30-minute reminder alert
    setupThirtyMinuteAlert();
});

// Setup voice alert every 30 minutes
function setupThirtyMinuteAlert() {
    const THIRTY_MINUTES = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    console.log('🔔 Alerta de voz cada 30 minutos activada');
    
    // Check if speech synthesis is available
    if (!('speechSynthesis' in window)) {
        console.warn('⚠️ Speech synthesis no soportado en este navegador');
        return;
    }
    
    // Set interval for every 30 minutes
    setInterval(function() {
        speakStatusUpdate();
    }, THIRTY_MINUTES);
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
        
        // Try to find a Spanish voice
        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
        if (spanishVoice) {
            utterance.voice = spanishVoice;
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

        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
        if (spanishVoice) {
            utterance.voice = spanishVoice;
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
        
        // Update progress bars
        const progressBars = document.querySelectorAll('.progress-fill');
        if (progressBars.length >= 3) {
            progressBars[0].style.width = `${(data.tracks.total / data.tracks.target * 100)}%`;
            progressBars[1].style.width = data.tracks.total > 0 ? `${(data.splitsheets.confirmed / data.tracks.total * 100)}%` : '0%';
            progressBars[2].style.width = `${(data.content.total / data.content.target * 100)}%`;
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
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
            location.reload();
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error actualizando estado');
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
            location.reload();
        } else {
            alert('Error eliminando');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error eliminando');
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
            isValid = false;
        } else {
            field.style.borderColor = '';
        }
    });
    
    if (!isValid) {
        alert('Por favor completa todos los campos requeridos');
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
