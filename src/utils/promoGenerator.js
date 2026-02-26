/**
 * Promo Generator
 * Genera imágenes promocionales combinando fotos de fans con artwork de tracks
 * Usa Sharp para composición de imágenes
 */

const sharp = require('sharp');
const path = require('path');

// Dimensiones del promo final (optimizado para Instagram/Facebook)
const OUTPUT_SIZE = 1080;

/**
 * Template 1: "Esquina"
 * Foto del fan 300x300 en esquina inferior derecha sobre el artwork
 */
async function templateEsquina(fanPhotoBuffer, artworkBuffer) {
    // Redimensionar artwork a tamaño completo
    const artworkResized = await sharp(artworkBuffer)
        .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover' })
        .toBuffer();
    
    // Redimensionar foto del fan
    const fanResized = await sharp(fanPhotoBuffer)
        .resize(300, 300, { fit: 'cover' })
        .toBuffer();
    
    // Componer: artwork de base + foto en esquina
    return sharp(artworkResized)
        .composite([{
            input: fanResized,
            top: OUTPUT_SIZE - 320,
            left: OUTPUT_SIZE - 320
        }])
        .png()
        .toBuffer();
}

/**
 * Template 2: "Fondo Blur"
 * Foto del fan como fondo difuminado, artwork centrado 600x600
 */
async function templateFondoBlur(fanPhotoBuffer, artworkBuffer) {
    // Foto como fondo (difuminada y oscurecida)
    const background = await sharp(fanPhotoBuffer)
        .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover' })
        .blur(15)
        .modulate({ brightness: 0.5 })
        .toBuffer();
    
    // Artwork centrado
    const artworkSize = 600;
    const artworkResized = await sharp(artworkBuffer)
        .resize(artworkSize, artworkSize, { fit: 'cover' })
        .toBuffer();
    
    // Calcular posición centrada
    const top = Math.floor((OUTPUT_SIZE - artworkSize) / 2);
    const left = Math.floor((OUTPUT_SIZE - artworkSize) / 2);
    
    return sharp(background)
        .composite([{
            input: artworkResized,
            top,
            left
        }])
        .png()
        .toBuffer();
}

/**
 * Template 3: "Split"
 * Pantalla dividida 50/50 - foto a la izquierda, artwork a la derecha
 */
async function templateSplit(fanPhotoBuffer, artworkBuffer) {
    const halfSize = OUTPUT_SIZE / 2;
    
    // Foto en mitad izquierda
    const leftSide = await sharp(fanPhotoBuffer)
        .resize(halfSize, OUTPUT_SIZE, { fit: 'cover' })
        .toBuffer();
    
    // Artwork en mitad derecha
    const rightSide = await sharp(artworkBuffer)
        .resize(halfSize, OUTPUT_SIZE, { fit: 'cover' })
        .toBuffer();
    
    // Crear canvas negro
    const canvas = sharp({
        create: {
            width: OUTPUT_SIZE,
            height: OUTPUT_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
    });
    
    return canvas
        .composite([
            { input: leftSide, top: 0, left: 0 },
            { input: rightSide, top: 0, left: halfSize }
        ])
        .png()
        .toBuffer();
}

/**
 * Template 4: "Círculo"
 * Foto del fan en máscara circular, posicionada sobre el artwork
 */
async function templateCirculo(fanPhotoBuffer, artworkBuffer) {
    const circleSize = 300;
    const circleRadius = circleSize / 2;
    
    // Crear máscara circular
    const circleMask = Buffer.from(
        `<svg width="${circleSize}" height="${circleSize}">
            <circle cx="${circleRadius}" cy="${circleRadius}" r="${circleRadius}" fill="white"/>
        </svg>
        `
    );
    
    // Redimensionar y aplicar máscara a foto del fan
    const fanCircular = await sharp(fanPhotoBuffer)
        .resize(circleSize, circleSize, { fit: 'cover' })
        .composite([{
            input: circleMask,
            blend: 'dest-in'
        }])
        .png()
        .toBuffer();
    
    // Artwork de base
    const artworkResized = await sharp(artworkBuffer)
        .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover' })
        .toBuffer();
    
    // Posición del círculo (esquina inferior derecha con margen)
    const position = {
        top: OUTPUT_SIZE - circleSize - 100,
        left: OUTPUT_SIZE - circleSize - 100
    };
    
    return sharp(artworkResized)
        .composite([{
            input: fanCircular,
            top: position.top,
            left: position.left
        }])
        .png()
        .toBuffer();
}

/**
 * Genera un promo basado en el template seleccionado
 * @param {Buffer} fanPhotoBuffer - Buffer de la foto del fan
 * @param {Buffer} artworkBuffer - Buffer del artwork del track
 * @param {number} templateId - ID del template (1-4)
 * @returns {Promise<Buffer>} - Buffer de la imagen generada (PNG)
 */
async function generatePromo(fanPhotoBuffer, artworkBuffer, templateId) {
    console.log(`[PromoGenerator] Generando promo con template ${templateId}`);
    
    // Validar buffers
    if (!fanPhotoBuffer || !artworkBuffer) {
        throw new Error('Se requieren ambos buffers (foto y artwork)');
    }
    
    // Validar template
    const validTemplates = [1, 2, 3, 4];
    if (!validTemplates.includes(templateId)) {
        throw new Error(`Template inválido: ${templateId}. Use 1-4.`);
    }
    
    try {
        let resultBuffer;
        
        switch (templateId) {
            case 1:
                resultBuffer = await templateEsquina(fanPhotoBuffer, artworkBuffer);
                break;
            case 2:
                resultBuffer = await templateFondoBlur(fanPhotoBuffer, artworkBuffer);
                break;
            case 3:
                resultBuffer = await templateSplit(fanPhotoBuffer, artworkBuffer);
                break;
            case 4:
                resultBuffer = await templateCirculo(fanPhotoBuffer, artworkBuffer);
                break;
            default:
                throw new Error('Template no implementado');
        }
        
        console.log(`[PromoGenerator] ✅ Promo generado: ${resultBuffer.length} bytes`);
        return resultBuffer;
        
    } catch (error) {
        console.error('[PromoGenerator] ❌ Error generando promo:', error.message);
        throw error;
    }
}

/**
 * Genera un preview de todos los templates
 * Útil para mostrar opciones al usuario
 * @param {Buffer} fanPhotoBuffer - Buffer de la foto del fan
 * @param {Buffer} artworkBuffer - Buffer del artwork del track
 * @returns {Promise<Object>} - Objeto con todos los previews
 */
async function generateAllPreviews(fanPhotoBuffer, artworkBuffer) {
    const previews = {};
    
    for (let i = 1; i <= 4; i++) {
        try {
            previews[`template${i}`] = await generatePromo(fanPhotoBuffer, artworkBuffer, i);
        } catch (error) {
            console.error(`[PromoGenerator] Error en template ${i}:`, error.message);
            previews[`template${i}`] = null;
        }
    }
    
    return previews;
}

/**
 * Valida que un buffer sea una imagen válida
 * @param {Buffer} buffer - Buffer a validar
 * @returns {Promise<Object>} - Información de la imagen o error
 */
async function validateImage(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        return {
            valid: true,
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: buffer.length
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
}

module.exports = {
    generatePromo,
    generateAllPreviews,
    validateImage,
    OUTPUT_SIZE
};
