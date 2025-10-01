import { type CheckoutService } from '@bigcommerce/checkout-sdk';

import {
    createBigCommerceFee,
    createBigCommerceDiscount,
    type PaystandFeeInfo,
} from './PaystandFeeCalculator';

/**
 * Service to manage order updates with Paystand fees and discounts
 */
export class PaystandOrderService {
    private checkoutService: CheckoutService;
    private appliedFees: Array<{ id: string; type: 'fee' | 'discount' }> = [];

    constructor(checkoutService: CheckoutService) {
        this.checkoutService = checkoutService;
    }

    /**
     * Apply Paystand fees to the current checkout
     */
    async applyFeesToOrder(feeInfo: PaystandFeeInfo): Promise<void> {
        try {
            // Clear any previously applied Paystand fees
            await this.clearPaystandFees();

            const feesToApply = [];

            // Add processing fee if exists
            if (feeInfo.fees > 0) {
                const fee = createBigCommerceFee(feeInfo);
                feesToApply.push(fee);
                this.appliedFees.push({ id: fee.id, type: 'fee' });
            }

            // Add discount if exists
            if (feeInfo.discount > 0) {
                const discount = createBigCommerceDiscount(feeInfo);
                if (discount) {
                    feesToApply.push(discount);
                    this.appliedFees.push({ id: discount.id, type: 'discount' });
                }
            }

            // Apply fees to checkout
            if (feesToApply.length > 0) {
                // Note: This is a conceptual implementation. 
                // The actual BigCommerce SDK might not have a direct method to add fees.
                // This would typically require backend integration or use of the Store API.
                await this.updateCheckoutWithFees(feesToApply);
            }

        } catch (error) {
            console.error('Failed to apply Paystand fees to order:', error);
            throw new Error('Unable to update order with payment processing fees');
        }
    }

    /**
     * Clear all previously applied Paystand fees
     */
    async clearPaystandFees(): Promise<void> {
        try {
            if (this.appliedFees.length > 0) {
                // Remove fees from checkout
                await this.removeFeesFromCheckout();
                this.appliedFees = [];
            }
        } catch (error) {
            console.warn('Failed to clear previous Paystand fees:', error);
        }
    }

    /**
     * Update checkout with fees (placeholder for actual implementation)
     * Note: This would typically require backend integration
     */
    private async updateCheckoutWithFees(fees: any[]): Promise<void> {
        // In a real implementation, this would either:
        // 1. Use a Store API call to add custom fees to the cart/order
        // 2. Store fees in checkout session data for display purposes
        // 3. Use a webhook to modify the order on the backend
        
        // For now, we'll store in session storage for display
        sessionStorage.setItem('paystand_fees', JSON.stringify(fees));
        
        // Trigger a checkout reload to reflect changes
        await this.checkoutService.loadCheckout();
    }

    /**
     * Remove fees from checkout (placeholder for actual implementation)
     */
    private async removeFeesFromCheckout(): Promise<void> {
        // Remove from session storage
        sessionStorage.removeItem('paystand_fees');

        // Trigger a checkout reload to reflect changes
        await this.checkoutService.loadCheckout();
    }

    /**
     * Get currently applied Paystand fees from session
     */
    getAppliedFees(): any[] {
        try {
            const storedFees = sessionStorage.getItem('paystand_fees');
            return storedFees ? JSON.parse(storedFees) : [];
        } catch {
            return [];
        }
    }

    /**
     * Calculate new order total with Paystand fees
     */
    calculateNewTotal(originalSubtotal: number, feeInfo: PaystandFeeInfo): number {
        return originalSubtotal + feeInfo.fees - feeInfo.discount;
    }
}
