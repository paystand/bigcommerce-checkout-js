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
    const response = await fetch('https://de5a53673321.ngrok-free.app/api/webhook/add-adjustment', {
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
            
            if (!checkoutInfo) {
                throw new Error('Checkout data not available');
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
            const existing = document.getElementById(PAYSTAND_SCRIPT_ID);

            if (existing) {
                existing.parentElement?.removeChild(existing);
            }

            const cartInfo = checkoutState.data.getCart();
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
                'ps-customerId': checkoutInfo.customer.id.toString(),
                'ps-checkoutId': checkoutInfo.id,
            };

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
                                    },
                                },
                            });
                        })

                        // Auto-submit after payment completion
                        PayStandCheckout.onComplete(async (paymentData: any) => {
                            const payerId = paymentData.response.data.payerId;
                            const payerDiscount = paymentData.response.data.feeSplit.payerDiscount;
                            const payerTotalFees = paymentData.response.data.feeSplit.payerTotalFees;
                            
                            if (!paymentData || !paymentData.response || !paymentData.response.data || !paymentData.response.data.id) {
                                setState((prev) => ({
                                    ...prev,
                                    error: 'No se recibió token de pago',
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

                                // Update order with Paystand payment info
                                if (order && order.orderId) {
                                    try {
                                        const config = checkoutState.data.getConfig();
                                        const storeHash = config?.storeProfile?.storeHash;
                                        
                                        if (storeHash) {
                                            const response = await fetch('https://de5a53673321.ngrok-free.app/api/webhook/update-order', {
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
                                                console.error('⚠️ Failed to update order:', response.statusText);
                                            }
                                        }
                                    } catch (updateError) {
                                        console.error('⚠️ Error updating order:', updateError);
                                        // Continue to redirect even if update fails
                                    }

                                    // Redirect to order confirmation
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
                        
                        // Handle errors
                        if (PayStandCheckout.onError) {
                            PayStandCheckout.onError((error: any) => {
                                console.error('❌ Payment error:', error);
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

