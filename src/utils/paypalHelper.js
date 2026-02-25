// Usar fetch nativo de Node.js 18+ o node-fetch como fallback
let fetch = globalThis.fetch;
let FormData = globalThis.FormData;

if (!fetch) {
    try {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch.default || nodeFetch;
        FormData = nodeFetch.FormData || require('form-data');
    } catch (e) {
        console.error('[PayPal] No se pudo cargar node-fetch:', e);
    }
}

/**
 * Obtiene el access token de PayPal
 */
async function getPayPalAccessToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;
    const mode = process.env.PAYPAL_MODE || 'sandbox';
    
    if (!clientId || !secret) {
        throw new Error('PayPal credentials not configured');
    }
    
    const baseUrl = mode === 'live' 
        ? 'https://api-m.paypal.com' 
        : 'https://api-m.sandbox.paypal.com';
    
    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
    
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`PayPal auth failed: ${error}`);
    }
    
    const data = await response.json();
    return data.access_token;
}

/**
 * Crea una orden de PayPal
 * @param {Object} options
 * @param {string} options.packageId - 'cd' o 'cd-video'
 * @param {string} options.customerEmail - Email del cliente
 * @param {string} options.customerName - Nombre del cliente
 * @returns {Promise<Object>}
 */
async function createPayPalOrder({ packageId, customerEmail, customerName }) {
    try {
        const accessToken = await getPayPalAccessToken();
        const mode = process.env.PAYPAL_MODE || 'sandbox';
        const baseUrl = mode === 'live' 
            ? 'https://api-m.paypal.com' 
            : 'https://api-m.sandbox.paypal.com';
        
        // Definir los paquetes
        const packages = {
            'cd': {
                name: 'Mini-Disc Firmado - El Inmortal 2',
                description: 'Edición física limitada con firma de Galante el Emperador. Incluye sticker exclusivo y envío.',
                price: '15.00',
                sku: 'EI2-MINIDISC-001'
            },
            'cd-video': {
                name: 'Mini-Disc + Video Saludo Personalizado',
                description: 'Mini-Disc firmado + Video saludo personalizado de Galante. Entrega prioritaria + Acceso VIP.',
                price: '25.00',
                sku: 'EI2-MINIDISC-VIP-001'
            }
        };
        
        const pkg = packages[packageId];
        if (!pkg) {
            throw new Error('Invalid package ID');
        }
        
        const orderData = {
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: pkg.sku,
                description: pkg.description,
                amount: {
                    currency_code: 'USD',
                    value: pkg.price,
                    breakdown: {
                        item_total: {
                            currency_code: 'USD',
                            value: pkg.price
                        }
                    }
                },
                items: [{
                    name: pkg.name,
                    description: pkg.description,
                    sku: pkg.sku,
                    unit_amount: {
                        currency_code: 'USD',
                        value: pkg.price
                    },
                    quantity: '1',
                    category: 'PHYSICAL_GOODS'
                }],
                shipping: {
                    name: {
                        full_name: customerName || 'Customer'
                    },
                    type: 'SHIPPING'
                },
                custom_id: customerEmail,
                invoice_id: `EI2-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }],
            application_context: {
                brand_name: 'Galante el Emperador',
                landing_page: 'BILLING',
                shipping_preference: 'GET_FROM_FILE',
                user_action: 'PAY_NOW',
                return_url: `${process.env.BASE_URL}/landing/checkout-success`,
                cancel_url: `${process.env.BASE_URL}/landing/checkout-cancel`
            }
        };
        
        const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': `req-${Date.now()}`
            },
            body: JSON.stringify(orderData)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`PayPal order creation failed: ${error}`);
        }
        
        const order = await response.json();
        
        console.log(`[PayPal] Orden creada: ${order.id} para ${customerEmail}`);
        
        return {
            success: true,
            orderId: order.id,
            status: order.status,
            approvalUrl: order.links.find(link => link.rel === 'approve')?.href
        };
        
    } catch (error) {
        console.error('[PayPal] Error creando orden:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Captura un pago de PayPal
 * @param {string} orderId - ID de la orden
 * @returns {Promise<Object>}
 */
async function capturePayPalOrder(orderId) {
    try {
        const accessToken = await getPayPalAccessToken();
        const mode = process.env.PAYPAL_MODE || 'sandbox';
        const baseUrl = mode === 'live' 
            ? 'https://api-m.paypal.com' 
            : 'https://api-m.sandbox.paypal.com';
        
        const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': `capture-${Date.now()}`
            }
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`PayPal capture failed: ${error}`);
        }
        
        const capture = await response.json();
        
        console.log(`[PayPal] Pago capturado: ${capture.id}, Estado: ${capture.status}`);
        
        // Extraer información del pagador
        const payer = capture.payer;
        const purchaseUnit = capture.purchase_units[0];
        const captureInfo = purchaseUnit?.payments?.captures[0];
        
        return {
            success: true,
            orderId: capture.id,
            status: capture.status,
            payerEmail: payer?.email_address,
            payerName: payer?.name?.given_name + ' ' + payer?.name?.surname,
            amount: captureInfo?.amount?.value,
            currency: captureInfo?.amount?.currency_code,
            captureId: captureInfo?.id,
            createTime: capture.create_time,
            updateTime: capture.update_time
        };
        
    } catch (error) {
        console.error('[PayPal] Error capturando pago:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Verifica el estado de una orden
 * @param {string} orderId - ID de la orden
 * @returns {Promise<Object>}
 */
async function getOrderStatus(orderId) {
    try {
        const accessToken = await getPayPalAccessToken();
        const mode = process.env.PAYPAL_MODE || 'sandbox';
        const baseUrl = mode === 'live' 
            ? 'https://api-m.paypal.com' 
            : 'https://api-m.sandbox.paypal.com';
        
        const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get order status: ${response.status}`);
        }
        
        const order = await response.json();
        
        return {
            success: true,
            orderId: order.id,
            status: order.status,
            intent: order.intent,
            purchaseUnits: order.purchase_units
        };
        
    } catch (error) {
        console.error('[PayPal] Error obteniendo estado:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Obtiene la configuración de PayPal para el frontend
 */
function getPayPalConfig() {
    return {
        clientId: process.env.PAYPAL_CLIENT_ID,
        mode: process.env.PAYPAL_MODE || 'sandbox',
        currency: 'USD'
    };
}

module.exports = {
    createPayPalOrder,
    capturePayPalOrder,
    getOrderStatus,
    getPayPalConfig
};
