// Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Auto-update stats every 30 seconds
    setInterval(updateStats, 30000);
    
    // Initial load
    updateStats();
});

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

// Delete confirmation
function confirmDelete(type, id) {
    if (confirm(`¿Estás seguro de que quieres eliminar este ${type}?`)) {
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