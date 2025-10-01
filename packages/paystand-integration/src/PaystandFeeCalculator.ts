import { type PaystandApiService, type PaystandFeeSplit } from './PaystandApiService';

export type PaymentMethodType = 'card' | 'bank' | 'ach' | 'networkBank';

export interface PaystandFeeInfo {
    paymentMethodType: PaymentMethodType;
    subtotal: number;
    fees: number;
    total: number;
    discount: number;
    feeSplit: PaystandFeeSplit;
}

export interface PaystandTokenData {
    tokenId: string;
    paymentMethodType: PaymentMethodType;
    card?: {
        last4: string;
        brand: string;
        [key: string]: any;
    };
    bank?: {
        last4: string;
        nameOnAccount: string;
        [key: string]: any;
    };
}

export class PaystandFeeCalculator {
    private apiService: PaystandApiService;
    private feeSettingPlanId: string;
    private dynamicDiscountingPlanId?: string;

    constructor(
        apiService: PaystandApiService,
        feeSettingPlanId: string,
        dynamicDiscountingPlanId?: string,
    ) {
        this.apiService = apiService;
        this.feeSettingPlanId = feeSettingPlanId;
        this.dynamicDiscountingPlanId = dynamicDiscountingPlanId;
    }

    /**
     * Calculate fees for all payment methods
     */
    async calculateFees(
        subtotal: number,
        currency = 'USD',
    ): Promise<Record<PaymentMethodType, PaystandFeeInfo>> {
        const feeSplitRequest = {
            subtotal: subtotal.toFixed(2),
            currency,
            feeSettingPlanId: this.feeSettingPlanId,
            dynamicDiscountingPlanId: this.dynamicDiscountingPlanId,
        };

        const feeSplitResponse = await this.apiService.fetchFeeSplits(feeSplitRequest);

        // Apply the fee splits after getting the calculation
        try {
            await this.apiService.applyFeeSplits(feeSplitRequest);
        } catch (error) {
            // Log the error but don't fail the fee calculation
            console.warn('Failed to apply fee splits:', error);
        }

        return {
            card: this.createFeeInfo('card', subtotal, feeSplitResponse.cardPayments),
            bank: this.createFeeInfo('bank', subtotal, feeSplitResponse.bankPayments),
            ach: this.createFeeInfo('ach', subtotal, feeSplitResponse.achBankPayments),
            networkBank: this.createFeeInfo(
                'networkBank',
                subtotal,
                feeSplitResponse.networkBankPayments,
            ),
        };
    }

    /**
     * Calculate fees for a specific payment method type
     */
    async calculateFeesForPaymentMethod(
        paymentMethodType: PaymentMethodType,
        subtotal: number,
        currency = 'USD',
    ): Promise<PaystandFeeInfo> {
        const allFees = await this.calculateFees(subtotal, currency);

        return allFees[paymentMethodType];
    }

    /**
     * Determine payment method type from token data
     */
    determinePaymentMethodType(tokenData: any): PaymentMethodType {
        if (tokenData.card) {
            return 'card';
        } else if (tokenData.bank) {
            // For now, default bank payments to ACH
            // In a real implementation, you might need additional logic
            // to distinguish between ACH and network bank payments
            return 'ach';
        }

        // Default fallback
        return 'card';
    }

    private createFeeInfo(
        paymentMethodType: PaymentMethodType,
        subtotal: number,
        feeSplit: PaystandFeeSplit,
    ): PaystandFeeInfo {
        const fees = parseFloat(feeSplit.payerTotalFees);
        const total = parseFloat(feeSplit.payerTotal);
        const discount = parseFloat(feeSplit.payerDiscount);

        return {
            paymentMethodType,
            subtotal,
            fees,
            total,
            discount,
            feeSplit,
        };
    }
}

/**
 * Helper to create BigCommerce fee object for order summary
 */
export function createBigCommerceFee(feeInfo: PaystandFeeInfo, index = 0) {
    const paymentMethodNames = {
        card: 'Card',
        bank: 'Bank',
        ach: 'ACH',
        networkBank: 'Network Bank',
    };

    return {
        id: `paystand_${feeInfo.paymentMethodType}_fee_${index}`,
        displayName: `${paymentMethodNames[feeInfo.paymentMethodType]} Processing Fee`,
        customerDisplayName: `${paymentMethodNames[feeInfo.paymentMethodType]} Processing Fee`,
        cost: feeInfo.fees,
        type: 'payment_processing_fee',
        source: 'paystand',
    };
}

/**
 * Helper to create BigCommerce discount object for order summary
 */
export function createBigCommerceDiscount(feeInfo: PaystandFeeInfo, index = 0) {
    if (feeInfo.discount <= 0) {
        return null;
    }

    const paymentMethodNames = {
        card: 'Card',
        bank: 'Bank',
        ach: 'ACH',
        networkBank: 'Network Bank',
    };

    return {
        id: `paystand_${feeInfo.paymentMethodType}_discount_${index}`,
        displayName: `${paymentMethodNames[feeInfo.paymentMethodType]} Processing Discount`,
        customerDisplayName: `${paymentMethodNames[feeInfo.paymentMethodType]} Processing Discount`,
        cost: -Math.abs(feeInfo.discount), // Negative for discount
        type: 'payment_processing_discount',
        source: 'paystand',
    };
}
