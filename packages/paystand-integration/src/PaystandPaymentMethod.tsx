/* eslint-disable */
import { getScriptLoader } from '@bigcommerce/script-loader';
import React, { type FunctionComponent, useCallback, useEffect, useState } from 'react';

import {
    type PaymentMethodProps,
    type PaymentMethodResolveId,
    toResolvableComponent,
} from '@bigcommerce/checkout/payment-integration-api';

const PAYSTAND_SCRIPT_ID = 'paystand_checkout';
const PAYSTAND_SCRIPT_SRC = 'https://checkout.paystand.io/v4/js/paystand.checkout.js?env=staging';
const PAYSTAND_CONFIG_ENDPOINT = 'https://de5a53673321.ngrok-free.app/api/paystand-config';

interface PaystandConfig {
    publishableKey: string;
    customerId: string;
    updateOrderOn: string;
    useSandbox?: number;
}

interface PaystandPaymentState {
    isTokenizing: boolean;
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

    const apiData = result.data;
    return {
        publishableKey: apiData.publishable_key || apiData.publishableKey,
        customerId: apiData.customer_id || apiData.customerId,
        updateOrderOn: apiData.update_order_on || apiData.updateOrderOn,
        useSandbox: apiData.use_sandbox ?? apiData.useSandbox,
    };
}

const PaystandPaymentMethod: FunctionComponent<PaymentMethodProps> = ({
    onUnhandledError,
    checkoutService,
    checkoutState,
}) => {
    const [state, setState] = useState<PaystandPaymentState>({
        isTokenizing: false,
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

                const paystandConfig = await fetchPaystandConfig(storeHash);
                console.log('Succesfully load paystand configuration!');
                setState(prev => ({ ...prev, config: paystandConfig }));
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
            const cartInfo = checkoutState.data.getCart();
            
            if (!checkoutInfo) {
                throw new Error('Checkout data not available');
            }

            const scriptLoader = getScriptLoader();
            const existing = document.getElementById(PAYSTAND_SCRIPT_ID);

            if (existing) {
                existing.parentElement?.removeChild(existing);
            }

            const email = cartInfo?.email || '';
            const environment = state.config.useSandbox === 0 ? 'production' : 'staging';
            
            const attributes: Record<string, string> = {
                id: PAYSTAND_SCRIPT_ID,
                type: 'text/javascript',
                'ps-mode': 'modal',
                'ps-show': 'true',
                'ps-publishable-key': state.config.publishableKey,
                'ps-env': environment,
                'ps-payerEmail': email,
                'ps-fixedAmount': 'true',
                'ps-amount': checkoutInfo?.grandTotal.toString() || '0',
            };

            const setupPayStandHandlers = () => {
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
                                    },
                                },
                            });
                        })

                        // Auto-submit after payment completion
                        PayStandCheckout.onComplete(async (paymentData: any) => {
                            console.log('🎉 Payment completed in Paystand modal');

                            console.log('This should be the payment data')
                            console.log(JSON.stringify(paymentData.response.data, null, 2));

                            const payerId = paymentData.response.data.payerId;
                            const payerDiscount = paymentData.response.data.feeSplit.payerDiscount;
                            const payerTotalFees = paymentData.response.data.feeSplit.payerTotalFees;

                            console.log(`Este es el payerId ${payerId}`);
                            console.log(`Payer Discount: ${payerDiscount}, Payer Total Fees: ${payerTotalFees}`);
                            
                            if (!paymentData || !paymentData.response || !paymentData.response.data || !paymentData.response.data.id) {
                                console.error('❌ No token found in response');
                                setState((prev) => ({
                                    ...prev,
                                    error: 'No se recibió token de pago',
                                    isTokenizing: false,
                                }));
                                return;
                            }
                            
                            //set fees-discounts
                            

                            // Hide modal
                            if (PayStandCheckout.hideCheckout) {
                                PayStandCheckout.hideCheckout();
                            }

                            // Auto-submit order
                            try {
                                console.log('🚀 Auto-submitting order...');
                                
                                await checkoutService.submitOrder({
                                    payment: { methodId: 'moneyorder' },
                                });

                                const orderState = checkoutService.getState();
                                const order = orderState.data.getOrder();
                                console.log(`Order que se acaba de crear ${order}`);

                                if (order && order.orderId) {
                                    window.location.href = `/checkout/order-confirmation/${order.orderId}`;
                                }
                            } catch (error) {
                                console.error('❌ Error submitting order:', error);
                                setState((prev) => ({
                                    ...prev,
                                    error: 'Error al procesar la orden',
                                    isTokenizing: false,
                                }));
                                alert('❌ El pago fue exitoso pero hubo un error al crear la orden. Por favor contacta a soporte.');
                            }
                        });
                        
                        // Handle cancellation
                        if (PayStandCheckout.onCancel) {
                            PayStandCheckout.onCancel(() => {
                                setState((prev) => ({
                                    ...prev,
                                    isTokenizing: false,
                                }));
                            });
                        }
                        
                        // Handle errors
                        if (PayStandCheckout.onError) {
                            PayStandCheckout.onError((error: any) => {
                                setState((prev) => ({
                                    ...prev,
                                    error: error?.message || 'Error al procesar el pago',
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
    }, [onUnhandledError, checkoutState, state.config, checkoutService]);

    // Cleanup script on unmount
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

