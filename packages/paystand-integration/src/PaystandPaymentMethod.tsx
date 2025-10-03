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
const PAYSTAND_SCRIPT_SRC = 'https://checkout.paystand.biz/v4/js/paystand.checkout.js';

// Configuration - in a real implementation, these would come from method configuration
const PAYSTAND_CONFIG = {
    publishableKey: 'l8mug63855x4ow0xeo669zhf',
    feeSettingPlanId: 'qr4gmsa22s9emxz6atwdyfos',
    dynamicDiscountingPlanId: '2nmhwx9kzjbvkp3kqfcyor7i',
    environment: 'development' as const,
};

interface PaystandPaymentState {
    isTokenizing: boolean;
    tokenData: PaystandTokenData | null;
    feeInfo: PaystandFeeInfo | null;
    error: string | null;
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
    });

    const apiService = useMemo(
        () => new PaystandApiService(PAYSTAND_CONFIG.publishableKey, PAYSTAND_CONFIG.environment),
        [],
    );

    const feeCalculator = useMemo(
        () =>
            new PaystandFeeCalculator(
                apiService,
                PAYSTAND_CONFIG.feeSettingPlanId,
                PAYSTAND_CONFIG.dynamicDiscountingPlanId,
            ),
        [apiService],
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
            const attributes: Record<string, string> = {
                id: PAYSTAND_SCRIPT_ID,
                type: 'text/javascript',
                // Core attributes matching the template
                'ps-mode': 'modal',
                'ps-show': 'true',
                'ps-preset-name': 'tokenize',
                'ps-publishable-key': PAYSTAND_CONFIG.publishableKey,
                'ps-env': PAYSTAND_CONFIG.environment,
                // Payer information from checkout
                'ps-payerEmail': email,
            };

            // ⚠️ COMMENTED OUT - Original logic for processing token and fees
            /*
            const customEvent = event as CustomEvent<{ token: any }>;

            if (customEvent.detail && customEvent.detail.token) {
                const tokenResponse = customEvent.detail.token;
                const paymentMethodType = feeCalculator.determinePaymentMethodType(tokenResponse);

                // 🎯 LOG COMPLETE TOKEN RESPONSE FROM /v3/Tokens
                console.log('═══════════════════════════════════════════════════');
                console.log('🎯 PAYSTAND TOKEN RESPONSE FROM /v3/Tokens');
                console.log('═══════════════════════════════════════════════════');
                console.log(JSON.stringify(tokenResponse, null, 2));
                console.log('═══════════════════════════════════════════════════');

                // 📊 LOG CAPTURED DATA FROM MODAL
                const capturedData = {
                    tokenId: tokenResponse.id,
                    type: paymentMethodType,
                    ...(tokenResponse.card && {
                        card: {
                            name: tokenResponse.card.nameOnCard,
                            brand: tokenResponse.card.brand,
                            last4: tokenResponse.card.last4,
                            expiry: `${tokenResponse.card.expirationMonth}/${tokenResponse.card.expirationYear}`,
                            billingAddress: tokenResponse.card.billingAddress,
                        },
                    }),
                    ...(tokenResponse.bank && {
                        bank: {
                            name: tokenResponse.bank.nameOnAccount,
                            accountType: tokenResponse.bank.accountType,
                            accountHolderType: tokenResponse.bank.accountHolderType,
                            bankName: tokenResponse.bank.bankName,
                            routingNumber: tokenResponse.bank.routingNumber,
                            last4: tokenResponse.bank.last4,
                            verified: tokenResponse.bank.verified,
                            billingAddress: tokenResponse.bank.billingAddress,
                        },
                    }),
                    timestamp: new Date().toISOString(),
                };

                // eslint-disable-next-line no-console
                console.log('🎯 PAYSTAND MODAL DATA CAPTURED:', capturedData);

                const tokenData: PaystandTokenData = {
                    tokenId: tokenResponse.id as string,
                    paymentMethodType,
                    card: tokenResponse.card,
                    bank: tokenResponse.bank,
                };

                // Store token data in payment form
                paymentForm.setFieldValue('paystandTokenId', tokenResponse.id);
                paymentForm.setFieldValue('paystandPaymentMethodType', paymentMethodType);

                // Calculate fees for the selected payment method
                feeCalculator
                    .calculateFeesForPaymentMethod(paymentMethodType, checkoutInfo.subtotal)
                    .then(async (feeInfo) => {
                        try {
                            // Apply fees to the order
                            await orderService.applyFeesToOrder(feeInfo);

                            setState((prev) => ({
                                ...prev,
                                tokenData,
                                feeInfo,
                                isTokenizing: false,
                            }));

                            // eslint-disable-next-line no-console
                            console.log('Calculated and applied fees:', feeInfo);
                        } catch (feeApplicationError) {
                            // If fee application fails, still store the fee info for display
                            setState((prev) => ({
                                ...prev,
                                tokenData,
                                feeInfo,
                                isTokenizing: false,
                            }));

                            console.warn('Failed to apply fees to order, but continuing with tokenization:', feeApplicationError);
                            // eslint-disable-next-line no-console
                            console.log('Calculated fees (not applied to order):', feeInfo);
                        }
                    })
                    .catch((error) => {
                        setState((prev) => ({
                            ...prev,
                            error: 'Failed to calculate fees',
                            isTokenizing: false,
                        }));
                        onUnhandledError(error as Error);
                    });
            }
            */

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
                            
                            
                            console.log('═══════════════════════════════════════════════════');
                            console.log("Alex console.log");
                            console.log(data);
                            console.log('═══════════════════════════════════════════════════');

                            /*
                            if (!data || !data.token || !data.token.id) {
                                console.error('❌ No token found in onComplete data');
                                setState((prev) => ({
                                    ...prev,
                                    error: 'No se recibió token de pago',
                                    isTokenizing: false,
                                }));
                                return;
                            }
                            
                            const tokenResponse = data.token;
                            
                            console.log(tokenResponse);
                            
                            */
                            // Get checkout state to retrieve grandTotal and currencyCode
                            const state = checkoutService.getState();
                            const grandTotal = state.data.getCheckout()?.grandTotal;
                            const currencyCode = 
                                state.data.getCart()?.currency?.code 
                                ?? state.data.getConfig()?.currency?.code;
                            
                            console.log('═══════════════════════════════════════════════════');
                            console.log('💰 CHECKOUT TOTALS');
                            console.log('═══════════════════════════════════════════════════');
                            console.log('Grand Total:', grandTotal);
                            console.log('Currency Code:', currencyCode);
                            console.log('═══════════════════════════════════════════════════');
                            
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
    }, [onUnhandledError, checkoutState, paymentForm, feeCalculator, orderService]);

    useEffect(() => {
        return () => {
            const script = document.getElementById(PAYSTAND_SCRIPT_ID);
            if (script) {
                script.parentElement?.removeChild(script);
            }
        };
    }, []);

    // const checkoutData = checkoutState.data.getCheckout();
    // const subtotal = checkoutData?.subtotal || 0;

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
                        disabled={state.isTokenizing}
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
