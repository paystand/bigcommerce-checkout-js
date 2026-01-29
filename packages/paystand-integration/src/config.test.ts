import {
    getPaystandEnvironment,
    getPaystandDomain,
    getPaystandEndpoint,
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
            it('should use PAYSTAND_ENV when set for config endpoint', () => {
                // Mock PAYSTAND_ENV by testing with different values
                // Since PAYSTAND_ENV is a constant, we test the logic
                const result = getPaystandEndpoint('config');
                
                // The config endpoint should use PAYSTAND_ENV if set, otherwise staging
                if (PAYSTAND_ENV) {
                    const expectedEnv = PAYSTAND_ENV === 'staging' ? 'staging' :
                                      PAYSTAND_ENV === 'sandbox' ? 'sandbox' :
                                      PAYSTAND_ENV === 'development' ? 'development' : 'staging';
                    expect(result).toBe(`${PAYSTAND_BACKEND_URLS[expectedEnv]}${PAYSTAND_ENDPOINTS.config}`);
                } else {
                    expect(result).toBe(`${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.config}`);
                }
            });
        });

        describe('other endpoints with useSandbox = 0', () => {
            it('should use live URL for all endpoints when useSandbox is 0', () => {
                expect(getPaystandEndpoint('addAdjustment', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.addAdjustment}`
                );
                expect(getPaystandEndpoint('setPayerId', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.setPayerId}`
                );
                expect(getPaystandEndpoint('validateCustomerToken', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.validateCustomerToken}`
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 0)).toBe(
                    `${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`
                );
            });
        });

        describe('other endpoints with useSandbox = 1 and different PAYSTAND_ENV values', () => {
            it('should use staging URL when useSandbox is 1 and paystandEnv is staging', () => {
                expect(getPaystandEndpoint('addAdjustment', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.addAdjustment}`
                );
                expect(getPaystandEndpoint('setPayerId', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.setPayerId}`
                );
                expect(getPaystandEndpoint('validateCustomerToken', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.validateCustomerToken}`
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 1, 'staging')).toBe(
                    `${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`
                );
            });

            it('should use sandbox URL when useSandbox is 1 and paystandEnv is sandbox', () => {
                expect(getPaystandEndpoint('addAdjustment', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.addAdjustment}`
                );
                expect(getPaystandEndpoint('setPayerId', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.setPayerId}`
                );
                expect(getPaystandEndpoint('validateCustomerToken', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.validateCustomerToken}`
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 1, 'sandbox')).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`
                );
            });

            it('should use development URL when useSandbox is 1 and paystandEnv is development', () => {
                expect(getPaystandEndpoint('addAdjustment', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.addAdjustment}`
                );
                expect(getPaystandEndpoint('setPayerId', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.setPayerId}`
                );
                expect(getPaystandEndpoint('validateCustomerToken', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.validateCustomerToken}`
                );
                expect(getPaystandEndpoint('getCustomerPayerId', 1, 'development')).toBe(
                    `${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS.getCustomerPayerId}`
                );
            });

            it('should default to sandbox URL when useSandbox is 1 and paystandEnv is undefined', () => {
                expect(getPaystandEndpoint('addAdjustment', 1)).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.addAdjustment}`
                );
                expect(getPaystandEndpoint('setPayerId', 1, undefined)).toBe(
                    `${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS.setPayerId}`
                );
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

                endpoints.forEach(endpoint => {
                    const url = getPaystandEndpoint(endpoint, 0);
                    expect(url).toBe(`${PAYSTAND_BACKEND_URLS.live}${PAYSTAND_ENDPOINTS[endpoint]}`);
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

                endpoints.forEach(endpoint => {
                    const url = getPaystandEndpoint(endpoint, 1, 'sandbox');
                    expect(url).toBe(`${PAYSTAND_BACKEND_URLS.sandbox}${PAYSTAND_ENDPOINTS[endpoint]}`);
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

                endpoints.forEach(endpoint => {
                    const url = getPaystandEndpoint(endpoint, 1, 'staging');
                    expect(url).toBe(`${PAYSTAND_BACKEND_URLS.staging}${PAYSTAND_ENDPOINTS[endpoint]}`);
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

                endpoints.forEach(endpoint => {
                    const url = getPaystandEndpoint(endpoint, 1, 'development');
                    expect(url).toBe(`${PAYSTAND_BACKEND_URLS.development}${PAYSTAND_ENDPOINTS[endpoint]}`);
                    expect(url).toContain('bigcommerce.paystand.biz');
                });
            });
        });
    });
});
