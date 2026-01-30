import {
    getPaystandDomain,
    getPaystandEndpoint,
    getPaystandEnvironment,
    PAYSTAND_BACKEND_URLS,
    PAYSTAND_ENDPOINTS,
    PAYSTAND_ENV,
} from './config';

describe('Paystand Configuration', () => {
    describe('getPaystandEnvironment', () => {
        it('should return live when useSandbox is 0', () => {
            expect(getPaystandEnvironment(0)).toBe('live');
            expect(getPaystandEnvironment(0, 'sandbox')).toBe('live');
            expect(getPaystandEnvironment(0, 'staging')).toBe('live');
            expect(getPaystandEnvironment(0, 'development')).toBe('live');
        });

        it('should return staging when useSandbox is 1 and paystandEnv is staging', () => {
            expect(getPaystandEnvironment(1, 'staging')).toBe('staging');
        });

        it('should return sandbox when useSandbox is 1 and paystandEnv is sandbox', () => {
            expect(getPaystandEnvironment(1, 'sandbox')).toBe('sandbox');
        });

        it('should return development when useSandbox is 1 and paystandEnv is development', () => {
            expect(getPaystandEnvironment(1, 'development')).toBe('development');
        });

        it('should default to sandbox when useSandbox is 1 and paystandEnv is undefined', () => {
            expect(getPaystandEnvironment(1)).toBe('sandbox');
            expect(getPaystandEnvironment(1, undefined)).toBe('sandbox');
        });

        it('should default to live when useSandbox is undefined', () => {
            expect(getPaystandEnvironment()).toBe('live');
            expect(getPaystandEnvironment(undefined, 'sandbox')).toBe('live');
        });
    });

    describe('getPaystandDomain', () => {
        it('should return correct domain for each environment', () => {
            expect(getPaystandDomain('live')).toBe('com');
            expect(getPaystandDomain('sandbox')).toBe('co');
            expect(getPaystandDomain('staging')).toBe('io');
            expect(getPaystandDomain('development')).toBe('biz');
        });
    });

    describe('getPaystandEndpoint', () => {
        describe('config endpoint', () => {
            it('should use live URL when useSandbox is 0, regardless of PAYSTAND_ENV', () => {
                // Even if PAYSTAND_ENV is set to 'development', when useSandbox is 0, it should use live
                const result = getPaystandEndpoint('config', 0);

                expect(result).toBe(`${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.config}`);
                expect(result).toBe('https://bigcommerce.paystand.com/api/paystand-config');
                expect(result).toContain('bigcommerce.paystand.com');
            });

            it('should use live URL when useSandbox is 0, even with paystandEnv parameter', () => {
                // Test that paystandEnv parameter is ignored when useSandbox is 0
                expect(getPaystandEndpoint('config', 0, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.config}`,
                );
                expect(getPaystandEndpoint('config', 0, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.config}`,
                );
                expect(getPaystandEndpoint('config', 0, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.config}`,
                );
            });

            it('should use live URL when useSandbox is not provided (first call)', () => {
                // When useSandbox is not available (first call), config endpoint should ALWAYS go to .com first
                // This is the first step to check use_sandbox value
                const result = getPaystandEndpoint('config');

                // The config endpoint should use live (.com) when useSandbox is not provided
                expect(result).toBe(`${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.config}`);
                expect(result).toBe('https://bigcommerce.paystand.com/api/paystand-config');
                expect(result).toContain('bigcommerce.paystand.com');
            });

            it('should use correct environment when useSandbox is 1 and paystandEnv is provided', () => {
                expect(getPaystandEndpoint('config', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.config}`,
                );
                expect(getPaystandEndpoint('config', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.config}`,
                );
                expect(getPaystandEndpoint('config', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.config}`,
                );
            });
        });

        describe('other endpoints with useSandbox = 0', () => {
            it('should use live URL (.com) for all endpoints when useSandbox is 0, ignoring PAYSTAND_ENV', () => {
                // Test that even if PAYSTAND_ENV is 'development', when useSandbox is 0, all endpoints go to .com
                expect(getPaystandEndpoint('addAdjustment', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.addAdjustment}`,
                );
                expect(getPaystandEndpoint('addAdjustment', 0)).toContain(
                    'bigcommerce.paystand.com',
                );

                expect(getPaystandEndpoint('setPayerId', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.setPayerId}`,
                );
                expect(getPaystandEndpoint('setPayerId', 0)).toContain('bigcommerce.paystand.com');

                expect(getPaystandEndpoint('validateCustomerToken', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.validateCustomerToken}`,
                );
                expect(getPaystandEndpoint('validateCustomerToken', 0)).toContain(
                    'bigcommerce.paystand.com',
                );

                expect(getPaystandEndpoint('getCustomerPayerId', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`,
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 0)).toContain(
                    'bigcommerce.paystand.com',
                );
            });

            it('should use live URL (.com) for all endpoints when useSandbox is 0, even with paystandEnv parameter', () => {
                // Test that paystandEnv parameter is ignored when useSandbox is 0
                expect(getPaystandEndpoint('addAdjustment', 0, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.addAdjustment}`,
                );
                expect(getPaystandEndpoint('addAdjustment', 0, 'development')).toContain(
                    'bigcommerce.paystand.com',
                );

                expect(getPaystandEndpoint('setPayerId', 0, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.setPayerId}`,
                );
                expect(getPaystandEndpoint('setPayerId', 0, 'development')).toContain(
                    'bigcommerce.paystand.com',
                );

                expect(getPaystandEndpoint('validateCustomerToken', 0, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.validateCustomerToken}`,
                );
                expect(getPaystandEndpoint('validateCustomerToken', 0, 'staging')).toContain(
                    'bigcommerce.paystand.com',
                );

                expect(getPaystandEndpoint('getCustomerPayerId', 0, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`,
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 0, 'sandbox')).toContain(
                    'bigcommerce.paystand.com',
                );
            });
        });

        describe('other endpoints with useSandbox = 1 and different PAYSTAND_ENV values', () => {
            it('should use staging URL when useSandbox is 1 and paystandEnv is staging', () => {
                expect(getPaystandEndpoint('addAdjustment', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.addAdjustment}`,
                );
                expect(getPaystandEndpoint('setPayerId', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.setPayerId}`,
                );
                expect(getPaystandEndpoint('validateCustomerToken', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.validateCustomerToken}`,
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`,
                );
            });

            it('should use sandbox URL when useSandbox is 1 and paystandEnv is sandbox', () => {
                expect(getPaystandEndpoint('addAdjustment', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.addAdjustment}`,
                );
                expect(getPaystandEndpoint('setPayerId', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.setPayerId}`,
                );
                expect(getPaystandEndpoint('validateCustomerToken', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.validateCustomerToken}`,
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`,
                );
            });

            it('should use development URL when useSandbox is 1 and paystandEnv is development', () => {
                expect(getPaystandEndpoint('addAdjustment', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.addAdjustment}`,
                );
                expect(getPaystandEndpoint('setPayerId', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.setPayerId}`,
                );
                expect(getPaystandEndpoint('validateCustomerToken', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.validateCustomerToken}`,
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`,
                );
            });

            it('should use PAYSTAND_ENV when useSandbox is 1 and paystandEnv is undefined', () => {
                // When paystandEnv is undefined, it should use PAYSTAND_ENV as fallback
                const expectedEnv = PAYSTAND_ENV
                    ? getPaystandEnvironment(1, PAYSTAND_ENV)
                    : 'sandbox';

                expect(getPaystandEndpoint('addAdjustment', 1)).toBe(
                    `${PAYSTAND_BACKEND_URLS[expectedEnv]}${PAYSTAND_ENDPOINTS.addAdjustment}`,
                );
                expect(getPaystandEndpoint('setPayerId', 1, undefined)).toBe(
                    `${PAYSTAND_BACKEND_URLS[expectedEnv]}${PAYSTAND_ENDPOINTS.setPayerId}`,
                );
            });
        });

        describe('critical: first call always goes to .com, then use_sandbox determines next steps', () => {
            it('should use .com for config endpoint when useSandbox is 0', () => {
                // When useSandbox is 0 (live), config endpoint should go to .com
                const configUrl = getPaystandEndpoint('config', 0);

                expect(configUrl).toBe('https://bigcommerce.paystand.com/api/paystand-config');
                expect(configUrl).toContain('bigcommerce.paystand.com');
                expect(configUrl).not.toContain('bigcommerce.paystand.biz');
                expect(configUrl).not.toContain('bigcommerce.paystand.io');
                // Check that it doesn't contain .co as a separate domain (not just as part of .com)
                expect(configUrl).not.toMatch(/bigcommerce\.paystand\.co[^m]/);
            });

            it('should use PAYSTAND_ENV for config endpoint when useSandbox is 1', () => {
                // When useSandbox is 1, should use PAYSTAND_ENV to determine environment
                // This is the SECOND call after detecting use_sandbox=1 from .com
                const configUrl = getPaystandEndpoint('config', 1, 'development');

                expect(configUrl).toBe('https://bigcommerce.paystand.biz/api/paystand-config');
                expect(configUrl).toContain('bigcommerce.paystand.biz');
                expect(configUrl).not.toContain('bigcommerce.paystand.com');
            });

            it('should use .com when useSandbox is undefined (first call always)', () => {
                // First call without useSandbox should ALWAYS go to .com
                const configUrl = getPaystandEndpoint('config');

                expect(configUrl).toBe('https://bigcommerce.paystand.com/api/paystand-config');
                expect(configUrl).toContain('bigcommerce.paystand.com');
            });

            it('should use .com for ALL endpoints when useSandbox is 0, regardless of PAYSTAND_ENV', () => {
                const endpoints: Array<keyof typeof PAYSTAND_ENDPOINTS> = [
                    'config',
                    'addAdjustment',
                    'setPayerId',
                    'validateCustomerToken',
                    'getCustomerPayerId',
                ];

                endpoints.forEach((endpoint) => {
                    const url = getPaystandEndpoint(endpoint, 0);

                    // All should point to .com
                    expect(url).toBe(
                        `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS[endpoint]}`,
                    );
                    expect(url).toContain('bigcommerce.paystand.com');
                    expect(url).not.toContain('bigcommerce.paystand.biz');
                    expect(url).not.toContain('bigcommerce.paystand.io');
                    // Check that it doesn't contain .co as a separate domain (not just as part of .com)
                    expect(url).not.toMatch(/bigcommerce\.paystand\.co[^m]/);
                });
            });
        });

        describe('all endpoints are dynamic', () => {
            it('should generate correct URLs for all endpoints in live environment', () => {
                const endpoints: Array<keyof typeof PAYSTAND_ENDPOINTS> = [
                    'addAdjustment',
                    'setPayerId',
                    'validateCustomerToken',
                    'getCustomerPayerId',
                ];

                endpoints.forEach((endpoint) => {
                    const url = getPaystandEndpoint(endpoint, 0);

                    expect(url).toBe(
                        `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS[endpoint]}`,
                    );
                    expect(url).toContain('bigcommerce.paystand.com');
                });
            });

            it('should generate correct URLs for all endpoints in sandbox environment', () => {
                const endpoints: Array<keyof typeof PAYSTAND_ENDPOINTS> = [
                    'addAdjustment',
                    'setPayerId',
                    'validateCustomerToken',
                    'getCustomerPayerId',
                ];

                endpoints.forEach((endpoint) => {
                    const url = getPaystandEndpoint(endpoint, 1, 'sandbox');

                    expect(url).toBe(
                        `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS[endpoint]}`,
                    );
                    expect(url).toContain('bigcommerce.paystand.co');
                });
            });

            it('should generate correct URLs for all endpoints in staging environment', () => {
                const endpoints: Array<keyof typeof PAYSTAND_ENDPOINTS> = [
                    'addAdjustment',
                    'setPayerId',
                    'validateCustomerToken',
                    'getCustomerPayerId',
                ];

                endpoints.forEach((endpoint) => {
                    const url = getPaystandEndpoint(endpoint, 1, 'staging');

                    expect(url).toBe(
                        `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS[endpoint]}`,
                    );
                    expect(url).toContain('bigcommerce.paystand.io');
                });
            });

            it('should generate correct URLs for all endpoints in development environment', () => {
                const endpoints: Array<keyof typeof PAYSTAND_ENDPOINTS> = [
                    'addAdjustment',
                    'setPayerId',
                    'validateCustomerToken',
                    'getCustomerPayerId',
                ];

                endpoints.forEach((endpoint) => {
                    const url = getPaystandEndpoint(endpoint, 1, 'development');

                    expect(url).toBe(
                        `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS[endpoint]}`,
                    );
                    expect(url).toContain('bigcommerce.paystand.biz');
                });
            });
        });
    });
});
