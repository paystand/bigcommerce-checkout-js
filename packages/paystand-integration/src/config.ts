/**
 * Paystand Integration Configuration
 */

// Backend API base URL
export const PAYSTAND_BACKEND_URL = 'https://bigcommerce.paystand.biz';

// Paystand API endpoints
export const PAYSTAND_ENDPOINTS = {
    config: '/api/paystand-config',
    addAdjustment: '/api/webhook/add-adjustment',
    setPayerId: '/api/webhook/set-payer-id',
    validateCustomerToken: '/api/webhook/validate-customer-token',
} as const;

// Paystand script configuration
export const PAYSTAND_SCRIPT = {
    id: 'paystand_checkout',
    src: 'https://checkout.paystand.io/v4/js/paystand.checkout.js?env=staging',
} as const;

// Paystand retry configuration
export const PAYSTAND_RETRY = {
    maxAttempts: 50,
    intervalMs: 100,
} as const;

/**
 * Build full URL for a Paystand endpoint
 */
export function getPaystandEndpoint(endpoint: keyof typeof PAYSTAND_ENDPOINTS): string {
    return `${PAYSTAND_BACKEND_URL}${PAYSTAND_ENDPOINTS[endpoint]}`;
}
