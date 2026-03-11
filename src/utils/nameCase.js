function capitalizeNameToken(token) {
    const rawToken = String(token || '').trim();
    if (!rawToken) {
        return '';
    }

    const parts = rawToken.split(/([\-\u2019'])/g);
    return parts
        .map((part) => {
            if (!part) {
                return part;
            }

            if (part === '-' || part === '\'' || part === '\u2019') {
                return part;
            }

            if (/^[ivxlcdm]{1,6}$/i.test(part)) {
                return part.toUpperCase();
            }

            if (/^[A-Z0-9]{2,3}$/.test(part) && !/[a-z]/.test(part)) {
                return part;
            }

            if (/^[a-z]\.$/i.test(part)) {
                return `${part.charAt(0).toUpperCase()}.`;
            }

            const lowered = part.toLocaleLowerCase('es-PR');
            return lowered.charAt(0).toLocaleUpperCase('es-PR') + lowered.slice(1);
        })
        .join('');
}

function normalizePersonName(name) {
    const normalized = String(name || '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
        return '';
    }

    return normalized
        .split(' ')
        .map((token) => capitalizeNameToken(token))
        .filter(Boolean)
        .join(' ');
}

module.exports = {
    normalizePersonName
};
