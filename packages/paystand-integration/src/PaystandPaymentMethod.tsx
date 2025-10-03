/* eslint-disable */
import { getScriptLoader } from '@bigcommerce/script-loader';
import React, { type FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react';

import {
    type PaymentMethodProps,
    type PaymentMethodResolveId,
    toResolvableComponent,
} from '@bigcommerce/checkout/payment-integration-api';

import { PaystandApiService } from './PaystandApiService';
import {
    PaystandFeeCalculator,
    type PaystandFeeInfo,
    type PaystandTokenData, // Updated interface with proper card/bank types
} from './PaystandFeeCalculator';
import { PaystandOrderService } from './PaystandOrderService';

const PAYSTAND_SCRIPT_ID = 'paystand_checkout';
const PAYSTAND_SCRIPT_SRC = 'https://checkout.paystand.co/v4/js/paystand.checkout.js';
const PAYSTAND_CONFIG_ENDPOINT = 'https://de5a53673321.ngrok-free.app/api/paystand-config';

interface PaystandConfig {
    publishableKey: string;
    presetCustom: string;
    customerId: string;
    updateOrderOn: string;
    useSandbox?: number; // Optional in case backend doesn't send it
}

interface PaystandPaymentState {
    isTokenizing: boolean;
    tokenData: PaystandTokenData | null;
    feeInfo: PaystandFeeInfo | null;
    error: string | null;
    config: PaystandConfig | null;
}

/**
 * Fetch Paystand configuration from backend
 */
async function fetchPaystandConfig(storeHash: string): Promise<PaystandConfig> {
    const response = await fetch(PAYSTAND_CONFIG_ENDPOINT, {
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

    // Map snake_case from API to camelCase for TypeScript
    const apiData = result.data;
    return {
        publishableKey: apiData.publishable_key || apiData.publishableKey,
        presetCustom: apiData.preset_custom || apiData.presetCustom,
        customerId: apiData.customer_id || apiData.customerId,
        updateOrderOn: apiData.update_order_on || apiData.updateOrderOn,
        useSandbox: apiData.use_sandbox ?? apiData.useSandbox,
    };
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
        tokenData: null,
        feeInfo: null,
        error: null,
        config: null,
    });

    // Fetch Paystand configuration on mount
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const config = checkoutState.data.getConfig();
                const storeHash = config?.storeProfile?.storeHash;
                
                if (!storeHash) {
                    throw new Error('Store hash not available');
                }

                console.log('🔄 Fetching Paystand configuration for store:', storeHash);
                const paystandConfig = await fetchPaystandConfig(storeHash);
                
                console.log('✅ Paystand configuration loaded:', paystandConfig);
                setState(prev => ({ ...prev, config: paystandConfig }));
                console.log(state);
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

    const apiService = useMemo(
        () => {
            if (!state.config) return null;
            // 'sandbox' for .co, 'biz' for production
            const environment = state.config.useSandbox === 0 ? 'biz' : 'sandbox';
            return new PaystandApiService(state.config.publishableKey, environment);
        },
        [state.config],
    );

    const feeCalculator = useMemo(
        () => {
            if (!apiService || !state.config) return null;
            // Note: Using customerId as feeSettingPlanId - adjust if needed
            return new PaystandFeeCalculator(
                apiService,
                state.config.customerId,
                undefined, // No dynamicDiscountingPlanId in the response
            );
        },
        [apiService, state.config],
    );

    const orderService = useMemo(
        () => new PaystandOrderService(checkoutService),
        [checkoutService],
    );

    // Set up custom submit function when component mounts
    useEffect(() => {
        const customSubmit = async () => {
            console.log('customSubmit');
            try {
                if (!state.tokenData) {
                    throw new Error(
                        'Payment method not tokenized. Please select a payment method first.',
                    );
                }

                const checkout = checkoutState.data.getCheckout();
                if (!checkout) {
                    throw new Error('Checkout data not available');
                }

                const customer = checkoutState.data.getCustomer();
                if (!customer) {
                    throw new Error('Customer data not available');
                }

                const config = checkoutState.data.getConfig();
                if (!config) {
                    throw new Error('Store configuration not available');
                }

                // Process payment using the stored token
                const paymentData = {
                    subtotal: checkout.subtotal.toFixed(2),
                    currency: config.shopperCurrency.code,
                    tokenId: state.tokenData.tokenId,
                    payer: {
                        name: `${customer.firstName} ${customer.lastName}`,
                        email: customer.email,
                        extId: customer.id ? customer.id.toString() : undefined,
                    },
                    meta: {
                        orderId: 'pending', // Will be updated after order creation
                        checkoutId: checkout.id,
                    },
                };

                if (!apiService) {
                    throw new Error('Payment service not initialized');
                }
                
                const paymentResult = await apiService.processPayment(paymentData);

                // Submit the order through BigCommerce with payment data
                const orderRequestBody = {
                    payment: {
                        methodId: method.id,
                        gatewayId: method.gateway,
                        paymentData: {
                            paystandTokenId: state.tokenData.tokenId,
                            paystandPaymentId: (paymentResult as { id: string }).id,
                            paymentMethodType: state.tokenData.paymentMethodType,
                        },
                    },
                };

                return await checkoutService.submitOrder(orderRequestBody);
            } catch (error) {
                setState((prev) => ({
                    ...prev,
                    error: error instanceof Error ? error.message : 'Payment failed',
                }));
                throw error;
            }
        };

        paymentForm.setSubmit(method, customSubmit);

        return () => {
            paymentForm.setSubmit(method, null);
        };
    }, [checkoutService, paymentForm, method, state.tokenData, apiService, checkoutState.data]);

    // Clean up fees when component unmounts or when switching payment methods
    useEffect(() => {
        return () => {
            // Clear any applied Paystand fees when component unmounts
            orderService.clearPaystandFees().catch(console.warn);
        };
    }, [orderService]);

    const handleTokenizePayment = useCallback(async () => {
        try {
            setState((prev) => ({ ...prev, isTokenizing: true, error: null }));
            
            if (!state.config) {
                throw new Error('Paystand configuration not loaded');
            }
            
            console.log('checkoutState', checkoutState);
            const checkoutInfo = checkoutState.data.getCheckout();
            const cartInfo = checkoutState.data.getCart();
            console.log('checkoutInfo', checkoutInfo);
            if (!checkoutInfo) {
                throw new Error('Checkout data not available');
            }

            // Load Paystand modal script for tokenization
            const scriptLoader = getScriptLoader();

            // If the script already exists, remove to ensure attributes refresh
            const existing = document.getElementById(PAYSTAND_SCRIPT_ID);

            if (existing) {
                existing.parentElement?.removeChild(existing);
            }

            const email = cartInfo?.email || '';
            const config = checkoutState.data.getConfig();
            const storeHash = config?.storeProfile?.storeHash || '';
            
            console.log('═══════════════════════════════════════════════════');
            console.log('🏪 STORE HASH:', storeHash);
            console.log('🔧 PAYSTAND CONFIG:', state.config);
            console.log('═══════════════════════════════════════════════════');
            
            // Environment mapping:
            // 'sandbox' -> uses .co domain
            // 'development' -> uses .biz domain  
            // 'production' -> uses .biz/com domain
            // Default to 'sandbox' if useSandbox is undefined or 1
            const environment = state.config.useSandbox === 0 ? 'production' : 'sandbox';
            
            console.log('🌍 Environment:', environment);
            console.log('🔧 useSandbox from config:', state.config.useSandbox);
            console.log('⚠️ Using "sandbox" for .co domain');
            
            const attributes: Record<string, string> = {
                id: PAYSTAND_SCRIPT_ID,
                type: 'text/javascript',
                // Core attributes matching the template
                'ps-mode': 'modal',
                'ps-show': 'true',
                'ps-preset-name': state.config.presetCustom,
                'ps-publishable-key': state.config.publishableKey,
                'ps-env': environment,
                // Payer information from checkout
                'ps-payerEmail': email,
                'ps-amount': checkoutInfo?.grandTotal.toString() || '0',
            };
            
            console.log('📝 Script attributes:', attributes);

            // Set up PayStandCheckout completion handler
            const setupPayStandHandlers = () => {
                console.log('🎯 Setting up PayStandCheckout handlers');
                
                // Listen for ALL postMessage events from the iframe
                const messageHandler = (event: MessageEvent) => {
                    // Only process messages from paystand domains
                    if (event.origin.includes('paystand')) {
                        console.log('═══════════════════════════════════════════════════');
                        console.log('📨 MESSAGE FROM PAYSTAND IFRAME');
                        console.log('═══════════════════════════════════════════════════');
                        console.log('Origin:', event.origin);
                        console.log('Data:', event.data);
                        console.log('Timestamp:', new Date().toISOString());
                        console.log('═══════════════════════════════════════════════════');
                        
                        // Check if this is a token message
                        if (event.data && typeof event.data === 'object') {
                            if (event.data.token || event.data.type === 'token' || event.data.action === 'tokenize') {
                                console.log('🎯🎯🎯 TOKEN DATA FOUND IN MESSAGE:', JSON.stringify(event.data, null, 2));
                            }
                            
                            // Check for modal close events
                            if (event.data.type === 'checkoutEvent' && event.data.response?.event?.type === 'closeModal') {
                                console.log('═══════════════════════════════════════════════════');
                                console.log('❌ MODAL CLOSED - closeModal event');
                                console.log('═══════════════════════════════════════════════════');
                                console.log('Usuario cerró el modal de Paystand');
                                console.log('Timestamp:', new Date().toISOString());
                                console.log('═══════════════════════════════════════════════════');
                                
                                // Reset tokenizing state
                                setState((prev) => ({
                                    ...prev,
                                    isTokenizing: false,
                                }));
                            }
                            
                            // Also check for closeDialog event
                            if (event.data.type === 'checkoutEvent' && event.data.response?.event?.type === 'closeDialog') {
                                console.log('═══════════════════════════════════════════════════');
                                console.log('❌ DIALOG CLOSED - closeDialog event');
                                console.log('═══════════════════════════════════════════════════');
                                console.log('Usuario cerró el diálogo de Paystand');
                                console.log('Timestamp:', new Date().toISOString());
                                console.log('═══════════════════════════════════════════════════');
                                
                                // Reset tokenizing state
                                setState((prev) => ({
                                    ...prev,
                                    isTokenizing: false,
                                }));
                            }
                        }
                    }
                };
                
                window.addEventListener('message', messageHandler);
                console.log('✅ Added message listener for iframe communication');
                
                // Wait for PayStandCheckout to be available
                const checkForPayStand = (attempts = 0) => {
                    const maxAttempts = 50; // 5 seconds with 100ms intervals
                    if ((window as any).PayStandCheckout) {
                        console.log('✅ PayStandCheckout available:', (window as any).PayStandCheckout);
                        const PayStandCheckout = (window as any).PayStandCheckout;

                        // Set up completion handler
                        PayStandCheckout.onComplete((data: any) => {
                            console.log('═══════════════════════════════════════════════════');
                            console.log('🎉 PayStandCheckout.onComplete TRIGGERED');
                            console.log('═══════════════════════════════════════════════════');
                            console.log('Data:', JSON.stringify(data, null, 2));
                            console.log('Timestamp:', new Date().toISOString());
                            console.log('═══════════════════════════════════════════════════');
                            
                            // ✅ 1. VERIFICAR QUE EXISTA EL TOKEN EN data.response.data
                            if (!data || !data.response || !data.response.data || !data.response.data.id) {
                                console.error('❌ No token found in onComplete data.response.data');
                                setState((prev) => ({
                                    ...prev,
                                    error: 'No se recibió token de pago',
                                    isTokenizing: false,
                                }));
                                return;
                            }
                            
                            const tokenResponse = data.response.data;
                            
                            console.log('═══════════════════════════════════════════════════');
                            console.log('TokenResponse:', JSON.stringify(tokenResponse, null, 2));
                            console.log('═══════════════════════════════════════════════════');

                            // OCULTAR EL MODAL DE PAYSTAND
                            if (PayStandCheckout.hideCheckout) {
                                PayStandCheckout.hideCheckout();
                            }
                        });
                        
                        // Set up cancel handler
                        if (PayStandCheckout.onCancel) {
                            PayStandCheckout.onCancel(() => {
                                console.log('═══════════════════════════════════════════════════');
                                console.log('❌ PayStandCheckout.onCancel TRIGGERED');
                                console.log('═══════════════════════════════════════════════════');
                                console.log('Usuario canceló el modal de Paystand');
                                console.log('Timestamp:', new Date().toISOString());
                                console.log('═══════════════════════════════════════════════════');
                                
                                // Reset tokenizing state
                                setState((prev) => ({
                                    ...prev,
                                    isTokenizing: false,
                                }));
                            });
                            console.log('✅ Registered onCancel handler');
                        } else {
                            console.log('⚠️ PayStandCheckout.onCancel not available');
                        }
                        
                        // Set up error handler
                        if (PayStandCheckout.onError) {
                            PayStandCheckout.onError((error: any) => {
                                console.log('═══════════════════════════════════════════════════');
                                console.log('⚠️ PayStandCheckout.onError TRIGGERED');
                                console.log('═══════════════════════════════════════════════════');
                                console.log('Error:', JSON.stringify(error, null, 2));
                                console.log('Timestamp:', new Date().toISOString());
                                console.log('═══════════════════════════════════════════════════');
                                
                                // Update state with error
                                setState((prev) => ({
                                    ...prev,
                                    error: error?.message || 'Error al procesar el pago',
                                    isTokenizing: false,
                                }));
                            });
                            console.log('✅ Registered onError handler');
                        } else {
                            console.log('⚠️ PayStandCheckout.onError not available');
                        }
                        
                        // Try to listen for all possible events
                        const eventTypes = ['complete', 'tokenize', 'token', 'save', 'submit', 'success', 'ready', 'checkoutLoaded'];
                        eventTypes.forEach(eventType => {
                            try {
                                if (PayStandCheckout.on) {
                                    PayStandCheckout.on('event', eventType, (data: any) => {
                                        console.log('═══════════════════════════════════════════════════');
                                        console.log(`🔔 PayStand Event: ${eventType}`);
                                        console.log('═══════════════════════════════════════════════════');
                                        console.log('Data:', JSON.stringify(data, null, 2));
                                        console.log('═══════════════════════════════════════════════════');
                                    });
                                    console.log(`✅ Registered listener for event: ${eventType}`);
                                }
                            } catch (e) {
                                console.log(`⚠️ Could not register event: ${eventType}`);
                            }
                        });
                    } else if (attempts < maxAttempts) {
                        setTimeout(() => checkForPayStand(attempts + 1), 100);
                    } else {
                        console.log('❌ PayStandCheckout not available after max attempts');
                    }
                };
                checkForPayStand();
            };

            // 🚀 LOG: About to load Paystand modal script
            console.log('🚀 LOADING PAYSTAND MODAL SCRIPT');
            console.log('Script URL:', PAYSTAND_SCRIPT_SRC);
            console.log('Script attributes:', attributes);
            console.log('Timestamp:', new Date().toISOString());

            await scriptLoader.loadScript(PAYSTAND_SCRIPT_SRC, {
                async: false,
                attributes,
            });
            
            // Set up PayStand completion handlers after script loads
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
    }, [onUnhandledError, checkoutState, paymentForm, feeCalculator, orderService, state.config, apiService]);

    useEffect(() => {
        return () => {
            const script = document.getElementById(PAYSTAND_SCRIPT_ID);
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

            {!state.tokenData ? (
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
            ) : (
                <div>
                    <div className="payment-method-summary" data-test="paystand-summary">
                        <h4>Payment Method Selected</h4>
                        <p>
                            <strong>Type:</strong>{' '}
                            {state.tokenData.paymentMethodType === 'card'
                                ? 'Credit/Debit Card'
                                : 'Bank Account'}
                        </p>
                        {state.tokenData.card && (
                            <p>
                                <strong>Card:</strong> **** **** **** {(state.tokenData.card as any).last4} (
                                {(state.tokenData.card as any).brand})
                            </p>
                        )}
                        {state.tokenData.bank && (
                            <p>
                                <strong>Bank:</strong> {(state.tokenData.bank as any).nameOnAccount} - ****
                                {(state.tokenData.bank as any).last4}
                            </p>
                        )}
                        {state.feeInfo && (
                            <div className="fee-summary" style={{ 
                                marginTop: '12px', 
                                padding: '12px', 
                                backgroundColor: '#f8f9fa', 
                                borderRadius: '4px',
                                border: '1px solid #e9ecef'
                            }}>
                                <h5 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                                    Payment Processing Summary
                                </h5>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span>Subtotal:</span>
                                    <span>${state.feeInfo.subtotal.toFixed(2)}</span>
                                </div>
                                {state.feeInfo.fees > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Processing Fee:</span>
                                        <span>${state.feeInfo.fees.toFixed(2)}</span>
                                    </div>
                                )}
                                {state.feeInfo.discount > 0 && (
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        marginBottom: '4px',
                                        color: '#28a745' 
                                    }}>
                                        <span>Processing Discount:</span>
                                        <span>-${state.feeInfo.discount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    fontWeight: 'bold',
                                    borderTop: '1px solid #e9ecef',
                                    marginTop: '8px',
                                    paddingTop: '8px'
                                }}>
                                    <span>New Total:</span>
                                    <span>${state.feeInfo.total.toFixed(2)}</span>
                                </div>
                                <div style={{ 
                                    fontSize: '12px', 
                                    color: '#6c757d', 
                                    marginTop: '8px',
                                    textAlign: 'center'
                                }}>
                                    ✓ Fees have been applied to your order
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        className="button button--secondary"
                        data-test="paystand-change-payment"
                        disabled={state.isTokenizing}
                        onClick={handleTokenizePayment}
                        type="button"
                    >
                        Change Payment Method
                    </button>
                </div>
            )}
        </div>
    );
};

export default toResolvableComponent<PaymentMethodProps, PaymentMethodResolveId>(
    PaystandPaymentMethod,
    [{ id: 'paystand' }],
);
