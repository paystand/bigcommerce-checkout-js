/* eslint-disable */
import { getScriptLoader } from '@bigcommerce/script-loader';
import React, { type FunctionComponent, useCallback, useEffect, useState } from 'react';

import {
    type PaymentMethodProps,
    type PaymentMethodResolveId,
    toResolvableComponent,
} from '@bigcommerce/checkout/payment-integration-api';

import { getPaystandEndpoint, PAYSTAND_SCRIPT } from './config';

interface PaystandConfig {
    publishableKey: string;
    customerId: string;
    updateOrderOn: string;
    useSandbox?: number;
    checkoutPresetKey: string;
    appClientId?: string;
}

interface PaystandPaymentState {
    isTokenizing: boolean;
    error: string | null;
    config: PaystandConfig | null;
    paystandAccessToken: string | null;
}

/**
 * Fetch Paystand configuration from backend
 */
async function fetchPaystandConfig(storeHash: string): Promise<PaystandConfig> {
    const response = await fetch(getPaystandEndpoint('config'), {
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
    
    const config = {
        publishableKey: apiData.publishable_key || apiData.publishableKey,
        customerId: apiData.customer_id || apiData.customerId,
        updateOrderOn: apiData.update_order_on || apiData.updateOrderOn,
        useSandbox: apiData.use_sandbox ?? apiData.useSandbox,
        checkoutPresetKey: apiData.presetCustom || 'default',
        appClientId: apiData.app_client_id || apiData.appClientId,
    };
    
    return config;
}

/**
 * Fetch customer JWT and validate it with backend to get Paystand access token
 * Returns null if user is not logged in (guest user) or if any step fails
 */
async function getPaystandAccessToken(appClientId?: string): Promise<string | null> {
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
        const validateResponse = await fetch(getPaystandEndpoint('validateCustomerToken'), {
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
    payerId: string
): Promise<void> {
    const response = await fetch(getPaystandEndpoint('addAdjustment'), {
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
    });

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
                
                if (!isGuest && paystandConfig.appClientId) {
                    // Only fetch access token for logged-in users
                    accessToken = await getPaystandAccessToken(paystandConfig.appClientId);
                }
                
                setState(prev => ({ 
                    ...prev, 
                    config: paystandConfig,
                    paystandAccessToken: accessToken
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
            console.log('customer', customer);
            // Get payer_id from customer attributes if logged in
            let existingPayerId: string | undefined;
            if (customer && !customer.isGuest) {
                // Check if customer has attributes with payer_id
                const customerData = customer as any; // Customer type may not include custom attributes
                if (customerData.attributes && customerData.attributes.length > 0) {
                    const payerIdAttr = customerData.attributes.find((attr: any) => attr.name === 'payer_id');
                    if (payerIdAttr && payerIdAttr.value) {
                        existingPayerId = payerIdAttr.value;
                        console.log('✅ Found existing payer_id for logged in customer:', existingPayerId);
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
            const environment = state.config.useSandbox === 0 ? 'live' : 'sandbox';
            const domain = environment === 'sandbox' ? 'co' : 'com';
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
                'ps-paymentMeta': JSON.stringify({
                    cartId: cartInfo?.id,
                    customerId: checkoutInfo.customer.id.toString(),
                }),
            };
            
            // Conditional attributes based on user type
            if (state.paystandAccessToken) {
                // LOGGED-IN USER: Add access token, DON'T add publishable-key and presetCustom
                attributes['ps-accessToken'] = state.paystandAccessToken;
                attributes['ps-checkoutType'] = "checkout_saved_funds";
            } else {
                // GUEST USER: Add publishable-key and presetCustom, NO access token
                attributes['ps-publishable-key'] = state.config.publishableKey;
                attributes['ps-presetCustom'] = state.config.checkoutPresetKey;
            }

            console.log('📋 Atributos enviados a la modal de Paystand:', attributes);

            const setupPayStandHandlers = () => {
                // Listen for postMessage events from Paystand iframe
                const messageHandler = (event: MessageEvent) => {
                    // Only process messages from paystand domains
                    if (event.origin.includes('paystand') && event.data && typeof event.data === 'object') {
                        // Check for modal close events
                        if (event.data.type === 'checkoutEvent' && event.data.response?.event?.type === 'closeModal') {
                            setState((prev) => ({
                                ...prev,
                                isTokenizing: false,
                            }));
                        }

                        // Also check for closeDialog event
                        if (event.data.type === 'checkoutEvent' && event.data.response?.event?.type === 'closeDialog') {
                            setState((prev) => ({
                                ...prev,
                                isTokenizing: false,
                            }));
                        }
                    }
                };

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
                                        payerId
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
                                            const response = await fetch(getPaystandEndpoint('setPayerId'), {
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

                                            if (response.ok) {
                                                console.log('✅ Payer ID set successfully:', payerId);
                                            } else {
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
