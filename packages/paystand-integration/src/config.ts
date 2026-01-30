/**
 * Paystand Integration Configuration
 */

// Environment types
export type PaystandEnvironment = 'live' | 'sandbox' | 'staging' | 'development';

// PAYSTAND_ENV configuration
// Set this to 'staging', 'sandbox', or 'development' when useSandbox === 1
// Leave as undefined to default to 'sandbox' when useSandbox === 1
export const PAYSTAND_ENV: 'staging' | 'sandbox' | 'development' | undefined = 'development';

// Environment to domain mapping
export const PAYSTAND_ENVIRONMENT_DOMAIN_MAP: Record<PaystandEnvironment, string> = {
    live: 'com',
    sandbox: 'co',
    staging: 'io',
    development: 'biz',
} as const;

// Backend API base URLs by environment
export const PAYSTAND_BACKEND_URLS: Record<PaystandEnvironment, string> = {
    live: 'https://bigcommerce.paystand.com',
    sandbox: 'https://bigcommerce.paystand.co',
    staging: 'https://bigcommerce.paystand.io',
    development: 'https://bigcommerce.paystand.biz',
} as const;

// Legacy exports for backward compatibility
export const PAYSTAND_BACKEND_URL = PAYSTAND_BACKEND_URLS.live;
export const PAYSTAND_BACKEND_SANDBOX_URL = PAYSTAND_BACKEND_URLS.staging;

// Paystand API endpoints
export const PAYSTAND_ENDPOINTS = {
    config: '/api/paystand-config',
    addAdjustment: '/api/webhook/add-adjustment',
    setPayerId: '/api/webhook/set-payer-id',
    validateCustomerToken: '/api/webhook/validate-customer-token',
    getCustomerPayerId: '/api/customer/payer-id',
} as const;

// Paystand script configuration
export const PAYSTAND_SCRIPT = {
    id: 'paystand_checkout',
    src: 'https://checkout.paystand.com/v4/js/paystand.checkout.js?env=live',
} as const;

export const PAYSTAND_SCRIPT_SANDBOX = {
    id: 'paystand_checkout_sandbox',
    src: 'https://checkout.paystand.io/v4/js/paystand.checkout.js?env=staging',
} as const;

// Paystand retry configuration
export const PAYSTAND_RETRY = {
    maxAttempts: 50,
    intervalMs: 100,
} as const;

/**
 * Map useSandbox number and PAYSTAND_ENV to environment type
 * @param {number} [useSandbox] - Environment value (0 = live, 1 = non-live)
 * @param {string} [paystandEnv] - PAYSTAND_ENV variable ('staging', 'sandbox', or 'development') when useSandbox === 1
 * @returns {PaystandEnvironment} The environment type
 */
export function getPaystandEnvironment(
    useSandbox?: number,
    paystandEnv?: string,
): PaystandEnvironment {
    // If useSandbox is 0, always use live
    if (useSandbox === 0) {
        return 'live';
    }

    // If useSandbox is 1, use PAYSTAND_ENV to determine which non-live environment
    if (useSandbox === 1) {
        if (paystandEnv === 'staging') {
            return 'staging';
        }

        if (paystandEnv === 'development') {
            return 'development';
        }

        if (paystandEnv === 'sandbox') {
            return 'sandbox';
        }

        // Default to sandbox when useSandbox === 1 and no specific PAYSTAND_ENV is provided
        return 'sandbox';
    }

    // Default to live
    return 'live';
}

/**
 * Get domain for a given environment
 * @param {PaystandEnvironment} environment - The environment type
 * @returns {string} The domain (com, co, io, or biz)
 */
export function getPaystandDomain(environment: PaystandEnvironment): string {
    return PAYSTAND_ENVIRONMENT_DOMAIN_MAP[environment];
}

/**
 * Build full URL for a Paystand endpoint
 * @param {keyof typeof PAYSTAND_ENDPOINTS} endpoint - The endpoint key
 * @param {number} [useSandbox] - Environment value (0 = live, 1 = non-live)
 * @param {string} [paystandEnv] - PAYSTAND_ENV variable ('staging', 'sandbox', or 'development') when useSandbox === 1
 * @returns {string} The full URL for the endpoint
 */
export function getPaystandEndpoint(
    endpoint: keyof typeof PAYSTAND_ENDPOINTS,
    useSandbox?: number,
    paystandEnv?: string,
): string {
    // If useSandbox is 0 (live), always use live environment
    if (useSandbox === 0) {
        return `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS[endpoint]}`;
    }

    // If useSandbox is 1 (non-live), use PAYSTAND_ENV to determine environment
    if (useSandbox === 1) {
        const env = getPaystandEnvironment(1, paystandEnv || PAYSTAND_ENV);

        return `${PAYSTAND_BACKEND_URLS[env]}${PAYSTAND_ENDPOINTS[endpoint]}`;
    }

    // If useSandbox is not provided, always default to live
    // The first call to config endpoint will always go to .com
    return `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS[endpoint]}`;
}
