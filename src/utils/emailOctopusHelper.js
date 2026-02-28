let fetch = globalThis.fetch;

if (!fetch) {
    try {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
    } catch (e) {
        console.error('[EmailOctopus] No se pudo cargar fetch:', e);
    }
}

const EMAIL_OCTOPUS_API_BASE = 'https://emailoctopus.com/api/1.6';

/**
 * Obtiene o crea una lista en Email Octopus
 * @param {string} listName - Nombre de la lista
 * @returns {Promise<string|null>} - ID de la lista
 */
async function getOrCreateList(listName) {
    const apiKey = process.env.EMAIL_OCTOPUS_API_KEY;
    if (!apiKey) {
        console.log('[EmailOctopus] API Key no configurada, saltando sincronización');
        return null;
    }

    try {
        // Primero buscar si existe la lista
        const listsUrl = `${EMAIL_OCTOPUS_API_BASE}/lists?api_key=${apiKey}`;
        const listsRes = await fetch(listsUrl);
        
        if (!listsRes.ok) {
            throw new Error(`Error obteniendo listas: ${listsRes.status}`);
        }

        const listsData = await listsRes.json();
        const existingList = listsData.data?.find(list => list.name === listName);

        if (existingList) {
            console.log(`[EmailOctopus] Lista encontrada: ${listName} (${existingList.id})`);
            return existingList.id;
        }

        // Crear nueva lista si no existe
        console.log(`[EmailOctopus] Creando nueva lista: ${listName}`);
        const createUrl = `${EMAIL_OCTOPUS_API_BASE}/lists?api_key=${apiKey}`;
        const createRes = await fetch(createUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: listName })
        });

        if (!createRes.ok) {
            const errorText = await createRes.text();
            throw new Error(`Error creando lista: ${createRes.status} - ${errorText}`);
        }

        const newList = await createRes.json();
        console.log(`[EmailOctopus] Lista creada: ${listName} (${newList.id})`);
        return newList.id;

    } catch (error) {
        console.error('[EmailOctopus] Error en getOrCreateList:', error.message);
        return null;
    }
}

/**
 * Agrega un contacto a una lista de Email Octopus
 * @param {Object} options
 * @param {string} options.email - Email del contacto
 * @param {string} options.name - Nombre del contacto
 * @param {string} options.country - País del contacto
 * @param {string} options.listId - ID de la lista (opcional, si no se proporciona usa EMAIL_OCTOPUS_LIST_ID del env)
 * @param {Object} options.customFields - Campos personalizados adicionales
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function addToEmailOctopus({ email, name, country, listId, customFields = {} }) {
    const apiKey = process.env.EMAIL_OCTOPUS_API_KEY;
    if (!apiKey) {
        console.log('[EmailOctopus] API Key no configurada, saltando');
        return { success: false, skipped: true, reason: 'not_configured' };
    }

    try {
        // Usar listId proporcionado o buscar/crear la lista por defecto
        let targetListId = listId || process.env.EMAIL_OCTOPUS_LIST_ID;
        
        if (!targetListId && process.env.EMAIL_OCTOPUS_DEFAULT_LIST_NAME) {
            targetListId = await getOrCreateList(process.env.EMAIL_OCTOPUS_DEFAULT_LIST_NAME);
        }

        if (!targetListId) {
            console.log('[EmailOctopus] No hay listId configurado, saltando');
            return { success: false, skipped: true, reason: 'no_list_id' };
        }

        // Preparar campos personalizados
        const fields = {
            FirstName: name?.split(' ')[0] || '',
            LastName: name?.split(' ').slice(1).join(' ') || '',
            Country: country || '',
            ...customFields
        };

        // Agregar contacto a la lista
        const url = `${EMAIL_OCTOPUS_API_BASE}/lists/${targetListId}/contacts?api_key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email_address: email,
                fields: fields,
                tags: ['El Inmortal 2', 'Landing'],
                status: 'SUBSCRIBED'
            })
        });

        if (res.ok) {
            const data = await res.json();
            console.log(`[EmailOctopus] ✅ Contacto agregado: ${email} a lista ${targetListId}`);
            return { success: true, contactId: data.id, listId: targetListId };
        }

        // Si el contacto ya existe, actualizarlo
        if (res.status === 409) {
            console.log(`[EmailOctopus] Contacto ya existe: ${email}, actualizando...`);
            
            // Obtener el ID del contacto existente
            const getUrl = `${EMAIL_OCTOPUS_API_BASE}/lists/${targetListId}/contacts/${encodeURIComponent(email)}?api_key=${apiKey}`;
            const getRes = await fetch(getUrl);
            
            if (getRes.ok) {
                const existingContact = await getRes.json();
                
                // Actualizar el contacto
                const updateUrl = `${EMAIL_OCTOPUS_API_BASE}/lists/${targetListId}/contacts/${existingContact.id}?api_key=${apiKey}`;
                const updateRes = await fetch(updateUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fields: fields,
                        tags: ['El Inmortal 2', 'Landing']
                    })
                });

                if (updateRes.ok) {
                    console.log(`[EmailOctopus] ✅ Contacto actualizado: ${email}`);
                    return { success: true, updated: true, contactId: existingContact.id, listId: targetListId };
                }
            }
        }

        const errorText = await res.text();
        throw new Error(`Error agregando contacto: ${res.status} - ${errorText}`);

    } catch (error) {
        console.error('[EmailOctopus] Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Sincroniza un lead del landing con Email Octopus
 * @param {Object} lead - Datos del lead
 * @returns {Promise<Object>} - Resultado de la sincronización
 */
async function syncLeadToEmailOctopus(lead) {
    const { email, fullName, country, sourceLabel, userId } = lead;
    
    // Determinar el nombre de la lista basado en la fuente o usar el default
    const listName = sourceLabel || process.env.EMAIL_OCTOPUS_DEFAULT_LIST_NAME || 'El Inmortal 2 Fans';
    
    // Obtener o crear la lista
    const listId = await getOrCreateList(listName);
    
    if (!listId) {
        return { success: false, skipped: true, reason: 'could_not_create_list' };
    }

    // Agregar el contacto
    return addToEmailOctopus({
        email,
        name: fullName,
        country,
        listId,
        customFields: {
            Source: sourceLabel || 'Landing Page',
            UserID: String(userId || ''),
            RegistrationDate: new Date().toISOString()
        }
    });
}

module.exports = {
    addToEmailOctopus,
    getOrCreateList,
    syncLeadToEmailOctopus
};
