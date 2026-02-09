/* eslint-disable */
import { getScriptLoader } from '@bigcommerce/script-loader';
import React, { type FunctionComponent, useCallback, useEffect, useState, useRef } from 'react';

import {
    type PaymentMethodProps,
    type PaymentMethodResolveId,
    toResolvableComponent,
} from '@bigcommerce/checkout/payment-integration-api';

import { getPaystandEndpoint, getPaystandEnvironment, getPaystandDomain, getUseSandboxFromEnv, PAYSTAND_ENV, PAYSTAND_SCRIPT } from './config';

interface PaystandConfig {
    publishableKey: string;
    customerId: string;
    updateOrderOn: string;
    useSandbox?: number; // 0 = live, 1 = non-live
    checkoutPresetKey: string;
    appClientId?: string;
}

interface PaystandPaymentState {
    isTokenizing: boolean;
    error: string | null;
    config: PaystandConfig | null;
    paystandAccessToken: string | null;
    customerPayerId: string | null;
}

/**
 * Fetch Paystand configuration from backend
 * Strategy: Single call to the appropriate endpoint based on PAYSTAND_ENV
 * - PAYSTAND_ENV undefined/'live' → calls .com (use_sandbox = 0)
 * - PAYSTAND_ENV 'sandbox'/'development'/'staging' → calls respective endpoint (use_sandbox = 1)
 */
async function fetchPaystandConfig(storeHash: string): Promise<PaystandConfig> {
    // Determine use_sandbox based on PAYSTAND_ENV (source of truth)
    const useSandbox = getUseSandboxFromEnv(PAYSTAND_ENV);
    
    // Get the appropriate endpoint based on use_sandbox and PAYSTAND_ENV
    const endpoint = getPaystandEndpoint('config', useSandbox, PAYSTAND_ENV);
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ store_hash: storeHash }),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Paystand config: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success || !result.data) {
        throw new Error('Invalid response from Paystand config endpoint');
    }

    const apiData = result.data;
    
    return {
        publishableKey: apiData.publishable_key || apiData.publishableKey,
        customerId: apiData.customer_id || apiData.customerId,
        updateOrderOn: apiData.update_order_on || apiData.updateOrderOn,
        useSandbox: useSandbox,
        checkoutPresetKey: apiData.presetCustom || 'default',
        appClientId: apiData.app_client_id || apiData.appClientId,
    };
}

/**
 * Get customer payer ID from external service
 * Only called for logged-in customers
 */
async function getCustomerPayerId(storeHash: string, customerId: number, useSandbox?: number): Promise<string | null> {
    try {
        const response = await fetch(getPaystandEndpoint('getCustomerPayerId', useSandbox, PAYSTAND_ENV), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                store_hash: storeHash,
                customerId: customerId,
            }),
        });
        
        if (!response.ok) {
            return null;
        }

        const result = await response.json();
        
        if (!result.success || !result.data?.payerId) {
            return null;
        }
        
        return result.data.payerId;
        
    } catch (error) {
        return null;
    }
}

/**
 * Fetch customer JWT and validate it with backend to get Paystand access token
 * Returns null if user is not logged in (guest user) or if any step fails
 */
async function getPaystandAccessToken(appClientId?: string, useSandbox?: number): Promise<string | null> {
    try {
        if (!appClientId) {
            return null;
        }
        
        // Step 1: Get customer JWT from BigCommerce
        const storeDomain = window.location.origin;
        const jwtUrl = `${storeDomain}/customer/current.jwt?app_client_id=${appClientId}`;
        
        const jwtResponse = await fetch(jwtUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });
        
        if (!jwtResponse.ok) {
            return null;
        }
        
        const customerJWTResponse = await jwtResponse.text();
        
        // Parse the JWT response to extract the token string
        let customerJWT: string;
        try {
            const parsed = JSON.parse(customerJWTResponse);
            customerJWT = parsed.token;
        } catch (e) {
            customerJWT = customerJWTResponse;
        }
        
        // Step 2: Validate JWT with backend and get Paystand access token
        const validateResponse = await fetch(getPaystandEndpoint('validateCustomerToken', useSandbox, PAYSTAND_ENV), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: customerJWT,
            }),
        });
        
        if (!validateResponse.ok) {
            return null;
        }
        
        const result = await validateResponse.json();
        
        if (!result.success || !result.token) {
            return null;
        }
        
        return result.token;
        
    } catch (error) {
        return null;
    }
}

/**
 * Add adjustment (fees/discounts) to checkout
 */
async function addAdjustment(
    checkoutId: string,
    storeHash: string,
    payerTotalFees: number,
    payerDiscount: number,
    payerId: string,
    useSandbox?: number,
): Promise<void> {
    const response = await fetch(getPaystandEndpoint('addAdjustment', useSandbox, PAYSTAND_ENV), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            checkoutId,
            store_hash: storeHash,
            payerTotalFees,
            payerDiscount,
            payerId,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to add adjustment: ${response.statusText}`);
    }
}

const PaystandPaymentMethod: FunctionComponent<PaymentMethodProps> = ({
    onUnhandledError,
    checkoutService,
    checkoutState,
    paymentForm,
    method,
}) => {
    const [state, setState] = useState<PaystandPaymentState>({
        isTokenizing: false,
        error: null,
        config: null,
        paystandAccessToken: null,
        customerPayerId: null,
    });
    const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
    // Disable Place Order button when Paystand is selected
    useEffect(() => {
        paymentForm.disableSubmit(method, true);
        return () => {
            paymentForm.disableSubmit(method, false);
        };
    }, []);

    // Fetch Paystand configuration on mount
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const config = checkoutState.data.getConfig();
                const storeHash = config?.storeProfile?.storeHash;
                
                if (!storeHash) {
                    throw new Error('Store hash not available');
                }

                const paystandConfig = await fetchPaystandConfig(storeHash);
                
                // Check if customer is guest BEFORE making any API calls
                const customer = checkoutState.data.getCustomer();
                const isGuest = customer?.isGuest ?? true; // Default to guest if no customer info
                
                let accessToken: string | null = null;
                let customerPayerId: string | null = null;
                
                if (!isGuest && paystandConfig.appClientId) {
                    // Only fetch access token for logged-in users
                    accessToken = await getPaystandAccessToken(paystandConfig.appClientId, paystandConfig.useSandbox);
                    
                    // Only fetch customer payer ID for logged-in users
                    if (customer?.id) {
                        customerPayerId = await getCustomerPayerId(storeHash, customer.id, paystandConfig.useSandbox);
                    }
                }
                
                setState(prev => ({ 
                    ...prev, 
                    config: paystandConfig,
                    paystandAccessToken: accessToken,
                    customerPayerId: customerPayerId
                }));
            } catch (error) {
                console.error('❌ Failed to load Paystand configuration:', error);
                setState(prev => ({
                    ...prev,
                    error: error instanceof Error ? error.message : 'Failed to load payment configuration',
                }));
            }
        };

        loadConfig();
    }, [checkoutState]);

    const handleTokenizePayment = useCallback(async () => {
        try {
            setState((prev) => ({ ...prev, isTokenizing: true, error: null }));
            
            if (!state.config) {
                throw new Error('Paystand configuration not loaded');
            }
            
            const checkoutInfo = checkoutState.data.getCheckout();
            const customer = checkoutState.data.getCustomer();
            
            if (!checkoutInfo) {
                throw new Error('Checkout data not available');
            }
            // Get payer_id from customer attributes if logged in
            let existingPayerId: string | undefined;
            if (customer && !customer.isGuest) {
                // Check if customer has attributes with payer_id
                const customerData = customer as any; // Customer type may not include custom attributes
                if (customerData.attributes && customerData.attributes.length > 0) {
                    const payerIdAttr = customerData.attributes.find((attr: any) => attr.name === 'payer_id');
                    if (payerIdAttr && payerIdAttr.value) {
                        existingPayerId = payerIdAttr.value;
                    }
                }
            }

            // If PayStandCheckout already exists, just show it
            if ((window as any).PayStandCheckout) {
                const PayStandCheckout = (window as any).PayStandCheckout;
                if (PayStandCheckout.showCheckout) {
                    PayStandCheckout.showCheckout();
                    return;
                }
            }

            // Otherwise, load the script for the first time
            const scriptLoader = getScriptLoader();
            const existing = document.getElementById(PAYSTAND_SCRIPT.id);

            if (existing) {
                existing.parentElement?.removeChild(existing);
            }

            const cartInfo = checkoutState.data.getCart();
            const email = cartInfo?.email || '';
            // useSandbox comes from the /api/paystand-config endpoint response
            // 0 = live (.com), 1 = non-live (determined by PAYSTAND_ENV in config.ts: sandbox .co, staging .io, or development .biz)
            const environment = getPaystandEnvironment(state.config.useSandbox, PAYSTAND_ENV);
            const domain = getPaystandDomain(environment);
            const PAYSTAND_SCRIPT_SRC = `https://checkout.paystand.${domain}/v4/js/paystand.checkout.js?env=${environment}`;
            
            // Base attributes (always included)
            const attributes: Record<string, string> = {
                id: PAYSTAND_SCRIPT.id,
                type: 'text/javascript',
                'ps-mode': 'modal',
                'ps-show': 'true',
                'ps-env': environment,
                'ps-payerEmail': email,
                'ps-fixedAmount': 'true',
                'ps-amount': checkoutInfo?.grandTotal.toString() || '0',
                'ps-checkoutId': checkoutInfo?.id.toString() || '',
                'ps-paymentMeta': JSON.stringify({
                    cartId: cartInfo?.id,
                    customerId: checkoutInfo.customer.id.toString(),
                    paymentSource: 'bigcommerce',
                }),
                'ps-paymentSource': 'bigcommerce',
            };
            
            // Conditional attributes based on user type
            if (state.paystandAccessToken) {
                // LOGGED-IN USER: Add access token, DON'T add publishable-key and presetCustom
                attributes['ps-accessToken'] = state.paystandAccessToken;
                attributes['ps-checkoutType'] = "checkout_saved_funds";
                attributes['ps-customerId'] = state.config.customerId;
                
                // Add payer ID only for logged-in users
                if (state.customerPayerId) {
                    attributes['ps-payerId'] = state.customerPayerId;
                }
            } else {
                // GUEST USER: Add publishable-key and presetCustom, NO access token
                attributes['ps-publishable-key'] = state.config.publishableKey;
                attributes['ps-presetCustom'] = state.config.checkoutPresetKey;
            }

            const setupPayStandHandlers = () => {
                // Define the message handler
                const messageHandler = (event: MessageEvent) => {
                    if (event.origin.includes('paystand') && event.data && typeof event.data === 'object') {
                        if (event.data.type === 'checkoutEvent' && event.data.response?.event?.type === 'closeModal') {
                            setState((prev) => ({ ...prev, isTokenizing: false }));
                        }
                        if (event.data.type === 'checkoutEvent' && event.data.response?.event?.type === 'closeDialog') {
                            setState((prev) => ({ ...prev, isTokenizing: false }));
                        }
                    }
                };

                // Store the handler in the ref
                messageHandlerRef.current = messageHandler;

                // Add the event listener
                window.addEventListener('message', messageHandler);

                const checkForPayStand = (attempts = 0) => {
                    const maxAttempts = 50;
                    if ((window as any).PayStandCheckout) {
                        const PayStandCheckout = (window as any).PayStandCheckout;

                        PayStandCheckout.onceLoaded(function () {
                            PayStandCheckout.update({
                                settings: {
                                    options: {
                                        payer: {
                                            edit: { email: { show: false } }
                                        },
                                        portal: {
                                            logo: {
                                              show: false,
                                              remove: true
                                            }
                                        },
                                    },
                                },
                            });
                        })

                        // Auto-submit after payment completion
                        PayStandCheckout.onComplete(async (paymentData: any) => {
                            const payerId = paymentData.response.data.payerId || existingPayerId;
                            const payerDiscount = paymentData.response.data.feeSplit.payerDiscount;
                            const payerTotalFees = paymentData.response.data.feeSplit.payerTotalFees;

                            if (!paymentData || !paymentData.response || !paymentData.response.data || !paymentData.response.data.id) {
                                setState((prev) => ({
                                    ...prev,
                                    error: 'Payment token not received',
                                    isTokenizing: false,
                                }));
                                return;
                            }

                            // Hide modal
                            if (PayStandCheckout.hideCheckout) {
                                PayStandCheckout.hideCheckout();
                            }

                            // Set fees-discounts
                            try {
                                const config = checkoutState.data.getConfig();
                                const storeHash = config?.storeProfile?.storeHash;

                                if (storeHash) {
                                    await addAdjustment(
                                        checkoutInfo.id,
                                        storeHash,
                                        payerTotalFees || 0,
                                        payerDiscount || 0,
                                        payerId,
                                        state.config?.useSandbox,
                                    );

                                    await checkoutService.loadCheckout(checkoutInfo.id);
                                }
                            } catch (adjustmentError) {
                                console.error('⚠️ Warning: Failed to add adjustment:', adjustmentError);
                            }

                            // Auto-submit order
                            try {
                                await checkoutService.submitOrder({
                                    payment: { methodId: 'moneyorder' },
                                });

                                const orderState = checkoutService.getState();
                                const order = orderState.data.getOrder();

                                // Set Payer ID for the order
                                if (order && order.orderId) {
                                    try {
                                        const config = checkoutState.data.getConfig();
                                        const storeHash = config?.storeProfile?.storeHash;
                                        
                                        if (storeHash) {
                                            const response = await fetch(getPaystandEndpoint('setPayerId', state.config?.useSandbox, PAYSTAND_ENV), {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                },
                                                body: JSON.stringify({
                                                    store_hash: storeHash,
                                                    payer_id: payerId,
                                                    order: order,
                                                }),
                                            });

                                            if (!response.ok) {
                                                console.error('❌ Failed to set payer ID:', response.statusText);
                                            }
                                        }
                                    } catch (setPayerError) {
                                        console.error('❌ Error setting payer ID:', setPayerError);
                                        // Continue to redirect even if setting payer ID fails
                                    }

                                    // Redirect to order confirmation
                                    window.location.href = `/checkout/order-confirmation/${order.orderId}`;
                                }
                            } catch (error) {
                                console.error('❌ Error submitting order:', error);
                                setState((prev) => ({
                                    ...prev,
                                    error: 'Error processing the order',
                                    isTokenizing: false,
                                }));
                            }
                        });

                        // Handle errors
                        if (PayStandCheckout.onError) {
                            PayStandCheckout.onError((error: any) => {
                                console.error('❌ Payment error:', error);
                                setState((prev) => ({
                                    ...prev,
                                    error: error?.message || 'Error processing payment',
                                    isTokenizing: false,
                                }));
                            });
                        }
                    } else if (attempts < maxAttempts) {
                        setTimeout(() => checkForPayStand(attempts + 1), 100);
                    }
                };
                checkForPayStand();
            };

            await scriptLoader.loadScript(PAYSTAND_SCRIPT_SRC, {
                async: false,
                attributes,
            });

            setupPayStandHandlers();
        } catch (error) {
            setState((prev) => ({
                ...prev,
                isTokenizing: false,
                error: error instanceof Error ? error.message : 'Tokenization failed',
            }));
            if (error instanceof Error) {
                onUnhandledError(error);
            }
        }
    }, [onUnhandledError, checkoutState, state.config, state.paystandAccessToken, checkoutService]);

    // Cleanup script on unmount
    useEffect(() => {
        return () => {
            if (messageHandlerRef.current) {
                window.removeEventListener('message', messageHandlerRef.current);
            }
            const script = document.getElementById(PAYSTAND_SCRIPT.id);
            if (script) {
                script.parentElement?.removeChild(script);
            }
        };
    }, []);

    // Show loading state while configuration is being fetched
    if (!state.config && !state.error) {
        return (
            <div data-test="paystand-payment-method">
                <div className="alert alert--info">
                    Loading payment configuration...
                </div>
            </div>
        );
    }

    return (
        <div data-test="paystand-payment-method">
            {Boolean(state.error) && (
                <div className="alert alert--error" data-test="paystand-error">
                    {state.error}
                </div>
            )}

            <div>
                <p>Complete your payment securely with Paystand.</p>
                <button
                    className="button button--primary"
                    data-test="paystand-tokenize-button"
                    disabled={state.isTokenizing || !state.config}
                    onClick={handleTokenizePayment}
                    type="button"
                >
                    {state.isTokenizing ? 'Setting up payment...' : 'Choose Payment Method'}
                </button>
            </div>
        </div>
    );
};

export default toResolvableComponent<PaymentMethodProps, PaymentMethodResolveId>(
    PaystandPaymentMethod,
    [{ id: 'moneyorder', type: 'PAYMENT_TYPE_OFFLINE' }],
);
