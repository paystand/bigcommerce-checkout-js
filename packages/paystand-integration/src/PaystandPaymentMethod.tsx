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

            // Set up event listener for tokenization completion
            const handleTokenization = (event: Event) => {
                console.log('handleTokenization', event);
                const customEvent = event as CustomEvent<{ token: any }>;

                if (customEvent.detail && customEvent.detail.token) {
                    const tokenResponse = customEvent.detail.token;
                    const paymentMethodType = feeCalculator.determinePaymentMethodType(tokenResponse);

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
            };

            // Set up PayStandCheckout completion handler
            const setupPayStandHandlers = () => {
                // Wait for PayStandCheckout to be available
                const checkForPayStand = (attempts = 0) => {
                    const maxAttempts = 50; // 5 seconds with 100ms intervals
                    if ((window as any).PayStandCheckout) {
                        console.log('PayStandCheckout', (window as any).PayStandCheckout);
                        const PayStandCheckout = (window as any).PayStandCheckout;

                        // Set up completion handler
                        PayStandCheckout.onComplete(() => {
                            if (PayStandCheckout.hideCheckout) {
                                PayStandCheckout.hideCheckout();
                            }
                        });

                        // Set up checkout loaded configuration
                        PayStandCheckout.once('event', 'checkoutLoaded', () => {
                            PayStandCheckout.update({settings: { options: { address: { token: { edit: { buttons: { second: { preText: 'Save' } } } } } } } });
                        });
                    } else if (attempts < maxAttempts) {
                        setTimeout(() => checkForPayStand(attempts + 1), 100);
                    }
                };
                
                checkForPayStand();
            };

            // Add event listener for tokenization
            window.addEventListener('paystand-tokenization-complete', handleTokenization);

            await scriptLoader.loadScript(PAYSTAND_SCRIPT_SRC, {
                async: false,
                attributes,
            });
            
            // Set up PayStand completion handlers after script loads
            setupPayStandHandlers();

            // Clean up event listener after script loads
            return () => {
                window.removeEventListener('paystand-tokenization-complete', handleTokenization);
            };

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
