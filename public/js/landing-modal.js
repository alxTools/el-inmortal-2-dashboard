/**
 * Landing Page Track Modal
 * Maneja la apertura de modales de tracks, reproducción de audio y generación de promos
 */

// Estado global del modal
let currentTrack = null;
let currentLoopIndex = 0;
let currentTemplate = 1;
let uploadedPhoto = null;
let isLoading = false;

/**
 * Abre el modal de un track específico
 * @param {string|number} trackId - ID del track
 */
async function openTrackModal(trackId) {
    // Verificar autenticación primero
    const hasAccess = await checkAuth();
    
    if (!hasAccess) {
        // Mostrar modal de registro o redirigir
        showEmailModal();
        return;
    }
    
    // Mostrar loading
    isLoading = true;
    showLoadingOverlay();
    
    try {
        // Obtener datos del track
        const response = await fetch(`/api/landing/tracks/${trackId}`);
        
        if (!response.ok) {
            if (response.status === 403) {
                showEmailModal();
                return;
            }
            throw new Error('Error cargando track');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error desconocido');
        }
        
        currentTrack = data.track;
        
        // Actualizar UI del modal
        updateModalUI();
        
        // Mostrar modal
        const modal = document.getElementById('track-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // Prevenir scroll
        }
        
        // Cargar primer loop
        selectLoop(1);
        
    } catch (error) {
        console.error('Error abriendo track:', error);
        alert('Error al cargar el track. Por favor, intenta nuevamente.');
    } finally {
        isLoading = false;
        hideLoadingOverlay();
    }
}

/**
 * Cierra el modal del track
 */
function closeTrackModal() {
    const modal = document.getElementById('track-modal');
    const audioPlayer = document.getElementById('track-audio-player');
    
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
    
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // Restaurar scroll
    }
    
    // Resetear estado
    currentTrack = null;
    currentLoopIndex = 0;
    uploadedPhoto = null;
    
    // Resetear UI
    const templateSection = document.getElementById('template-section');
    if (templateSection) {
        templateSection.style.display = 'none';
    }
    
    const photoInput = document.getElementById('promo-photo-input');
    if (photoInput) {
        photoInput.value = '';
    }
}

/**
 * Actualiza la UI del modal con los datos del track actual
 */
function updateModalUI() {
    if (!currentTrack) return;
    
    // Actualizar información del track
    const titleEl = document.getElementById('modal-track-title');
    const producerEl = document.getElementById('modal-track-producer');
    const featuresEl = document.getElementById('modal-track-features');
    const durationEl = document.getElementById('modal-track-duration');
    const coverEl = document.getElementById('modal-track-cover');
    
    if (titleEl) titleEl.textContent = currentTrack.title;
    if (producerEl) producerEl.textContent = `🎵 Prod. ${currentTrack.producer || 'Desconocido'}`;
    if (featuresEl) featuresEl.textContent = currentTrack.features ? `🎤 ${currentTrack.features}` : '';
    if (durationEl) durationEl.textContent = currentTrack.duration ? `⏱️ ${currentTrack.duration}` : '';
    if (coverEl) coverEl.src = currentTrack.coverImage || '/uploads/images/el_inmortal_2_cover_1771220102312.png';
}

/**
 * Selecciona un loop para reproducir
 * @param {number} loopIndex - Índice del loop (1-4)
 */
function selectLoop(loopIndex) {
    if (!currentTrack || !currentTrack.loops) return;
    
    currentLoopIndex = loopIndex - 1;
    const loop = currentTrack.loops[currentLoopIndex];
    
    if (!loop) return;
    
    // Actualizar botones
    document.querySelectorAll('.loop-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === currentLoopIndex);
    });
    
    // Actualizar audio player
    const audioPlayer = document.getElementById('track-audio-player');
    if (audioPlayer) {
        audioPlayer.src = loop.url;
        audioPlayer.load();
    }
}

/**
 * Maneja la subida de foto para el promo
 * @param {Event} event - Evento de cambio del input file
 */
function handlePhotoUpload(event) {
    const file = event.target.files[0];
    
    if (!file) return;
    
    // Validar tipo y tamaño
    if (!file.type.startsWith('image/')) {
        alert('Por favor, selecciona una imagen válida (JPG, PNG)');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        alert('La imagen es demasiado grande. Máximo 5MB.');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        uploadedPhoto = e.target.result;
        
        // Mostrar sección de templates
        const templateSection = document.getElementById('template-section');
        if (templateSection) {
            templateSection.style.display = 'block';
        }
        
        // Generar preview inicial
        generatePromoPreview();
    };
    
    reader.readAsDataURL(file);
}

/**
 * Selecciona un template para el promo
 * @param {number} templateId - ID del template (1-4)
 */
function selectTemplate(templateId) {
    currentTemplate = templateId;
    
    // Actualizar botones
    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.template) === templateId);
    });
    
    // Regenerar preview
    generatePromoPreview();
}

/**
 * Genera el preview del promo en el canvas
 */
function generatePromoPreview() {
    if (!uploadedPhoto || !currentTrack) return;
    
    const canvas = document.getElementById('promo-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Limpiar canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Cargar imágenes
    const coverImg = new Image();
    const photoImg = new Image();
    
    let loadedCount = 0;
    
    function onImageLoad() {
        loadedCount++;
        if (loadedCount < 2) return;
        
        // Aplicar template seleccionado
        applyTemplate(ctx, canvas, coverImg, photoImg);
    }
    
    coverImg.onload = onImageLoad;
    photoImg.onload = onImageLoad;
    
    coverImg.crossOrigin = 'anonymous';
    photoImg.crossOrigin = 'anonymous';
    
    coverImg.src = currentTrack.coverImage || '/uploads/images/el_inmortal_2_cover_1771220102312.png';
    photoImg.src = uploadedPhoto;
}

/**
 * Aplica el template seleccionado al canvas
 */
function applyTemplate(ctx, canvas, coverImg, photoImg) {
    const w = canvas.width;
    const h = canvas.height;
    
    switch (currentTemplate) {
        case 1: // Esquina - Foto 300x300 en esquina inferior derecha
            // Dibujar cover a tamaño completo
            ctx.drawImage(coverImg, 0, 0, w, h);
            // Dibujar foto en esquina inferior derecha
            ctx.drawImage(photoImg, w - 320, h - 320, 300, 300);
            break;
            
        case 2: // Fondo Blur - Foto como fondo difuminado, cover centrado 600x600
            // Dibujar foto como fondo (difuminada visualmente)
            ctx.filter = 'blur(10px) brightness(0.5)';
            ctx.drawImage(photoImg, 0, 0, w, h);
            ctx.filter = 'none';
            // Dibujar cover centrado
            const coverSize = 600;
            ctx.drawImage(coverImg, (w - coverSize) / 2, (h - coverSize) / 2, coverSize, coverSize);
            break;
            
        case 3: // Split - 50/50 pantalla dividida
            // Dibujar foto en mitad izquierda
            ctx.drawImage(photoImg, 0, 0, w / 2, h);
            // Dibujar cover en mitad derecha
            ctx.drawImage(coverImg, w / 2, 0, w / 2, h);
            break;
            
        case 4: // Círculo - Foto en máscara circular sobre cover
            // Dibujar cover primero
            ctx.drawImage(coverImg, 0, 0, w, h);
            // Crear máscara circular para la foto
            ctx.save();
            ctx.beginPath();
            ctx.arc(w - 200, h - 200, 150, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(photoImg, w - 350, h - 350, 300, 300);
            ctx.restore();
            // Añadir borde dorado al círculo
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(w - 200, h - 200, 150, 0, Math.PI * 2);
            ctx.stroke();
            break;
    }
    
    // Añadir texto del track
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(currentTrack.title, w / 2, 80);
    
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '32px Arial, sans-serif';
    ctx.fillText('El Inmortal 2 - Galante el Emperador', w / 2, 130);
}

/**
 * Descarga el promo generado
 */
function downloadPromo() {
    const canvas = document.getElementById('promo-canvas');
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `promo_${currentTrack.title.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    // Tracking
    if (typeof gtag !== 'undefined') {
        gtag('event', 'download_promo', {
            'event_category': 'engagement',
            'event_label': currentTrack.title
        });
    }
}

/**
 * Verifica si el usuario tiene acceso
 */
async function checkAuth() {
    try {
        // Verificar cookie localmente primero
        const cookies = document.cookie.split(';');
        const hasUnlockCookie = cookies.some(cookie => 
            cookie.trim().startsWith('landing_el_inmortal_unlock=')
        );
        
        if (hasUnlockCookie) return true;
        
        // Verificar via API como fallback
        const response = await fetch('/api/landing/check-auth');
        const data = await response.json();
        
        return data.success && data.isAuthenticated;
        
    } catch (error) {
        console.error('Error verificando auth:', error);
        return false;
    }
}

/**
 * Muestra el modal de registro/email
 */
function showEmailModal() {
    // Disparar evento para que el sistema de modals existente lo maneje
    const event = new CustomEvent('showEmailModal');
    window.dispatchEvent(event);
    
    // O mostrar alert temporal
    alert('🎵 Para acceder a este contenido, por favor regístrate con tu email primero.\n\nHaz clic en "Desbloquear Acceso Ahora" en la página principal.');
}

/**
 * Muestra overlay de loading
 */
function showLoadingOverlay() {
    // Implementar según el sistema de UI existente
    console.log('Loading...');
}

/**
 * Oculta overlay de loading
 */
function hideLoadingOverlay() {
    // Implementar según el sistema de UI existente
    console.log('Loading complete');
}

// Cerrar modal al presionar Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeTrackModal();
    }
});

// Exportar funciones globales
window.openTrackModal = openTrackModal;
window.closeTrackModal = closeTrackModal;
window.selectLoop = selectLoop;
window.handlePhotoUpload = handlePhotoUpload;
window.selectTemplate = selectTemplate;
window.generatePromoPreview = generatePromoPreview;
window.downloadPromo = downloadPromo;

console.log('✅ Landing Modal JS cargado');
