export interface PaystandTokenResponse {
    object: 'token';
    id: string;
    used: boolean;
    created: string;
    lastUpdated: string;
    status: string;
    payerId?: string;
    cardId?: string;
    card?: PaystandCard;
    bank?: PaystandBank;
}

export interface PaystandCard {
    object: 'card';
    id: string;
    nameOnCard: string;
    brand: string;
    last4: string;
    expirationMonth: string;
    expirationYear: string;
    fingerprint: string;
    billingAddress: PaystandAddress;
    created: string;
    lastUpdated: string;
    status: string;
}

export interface PaystandBank {
    object: 'bank';
    id: string;
    accountType: string;
    routingNumber: string;
    nameOnAccount: string;
    currency: string;
    country: string;
    last4: string;
    fingerprint: string;
    billingAddress: PaystandAddress;
    dropped: boolean;
    verified: boolean;
    status: string;
    created: string;
    lastUpdated: string;
}

export interface PaystandAddress {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}

export interface PaystandFeeSplitRequest {
    subtotal: string;
    currency: string;
    feeSettingPlanId: string;
    dynamicDiscountingPlanId?: string;
}

export interface PaystandFeeSplit {
    object: 'feeSplit';
    feeType: string;
    feeSplitType: string;
    customRate: string;
    customFlat: string;
    currency: string;
    subtotal: string;
    payerTotalFees: string;
    payerTotal: string;
    payerDiscount: string;
    otherCardsPaymentFees?: {
        customRate: number;
        customFlat: number;
    };
}

export interface PaystandFeeSplitResponse {
    cardPayments: PaystandFeeSplit;
    bankPayments: PaystandFeeSplit;
    networkBankPayments: PaystandFeeSplit;
    achBankPayments: PaystandFeeSplit;
}

export interface PaystandPaymentRequest {
    subtotal: string;
    currency: string;
    tokenId?: string;
    cardId?: string;
    bankId?: string;
    payerId?: string;
    payer?: {
        name: string;
        email: string;
        extId?: string;
        address?: PaystandAddress;
        meta?: Record<string, any>;
    };
    meta?: Record<string, any>;
}

export class PaystandApiService {
    private publishableKey: string;
    private baseUrl: string;

    constructor(publishableKey: string, environment: 'biz' | 'sandbox' | 'development' = 'biz') {
        this.publishableKey = publishableKey;
        this.baseUrl = environment === 'biz' 
            ? 'https://api.paystand.biz' 
            : environment === 'development' 
                ? 'https://api.paystand.io' 
                : 'https://api.paystand.io';
    }

    /**
     * Fetch fee splits for different payment methods based on cart subtotal
     */
    async fetchFeeSplits(request: PaystandFeeSplitRequest): Promise<PaystandFeeSplitResponse> {
        const response = await fetch(`${this.baseUrl}/v3/FeeSplits/splitFees/public`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-key': this.publishableKey,
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch fee splits: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Create a payment token using the tokenization endpoint
     */
    async createToken(tokenData: {
        card?: any;
        bank?: any;
        payer?: any;
        payerId?: string;
    }): Promise<PaystandTokenResponse> {
        const response = await fetch(`${this.baseUrl}/v3/tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-key': this.publishableKey,
            },
            body: JSON.stringify(tokenData),
        });

        if (!response.ok) {
            throw new Error(`Failed to create token: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Process payment using the secure payments endpoint
     */
    async processPayment(paymentData: PaystandPaymentRequest): Promise<any> {
        const response = await fetch(`${this.baseUrl}/v3/payments/secure`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-key': this.publishableKey,
            },
            body: JSON.stringify(paymentData),
        });

        if (!response.ok) {
            throw new Error(`Failed to process payment: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Apply fee splits after calculating fees
     */
    async applyFeeSplits(feeSplitData: PaystandFeeSplitRequest): Promise<any> {
        const response = await fetch(`${this.baseUrl}/v3/FeeSplits/apply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-key': this.publishableKey,
            },
            body: JSON.stringify(feeSplitData),
        });

        if (!response.ok) {
            throw new Error(`Failed to apply fee splits: ${response.statusText}`);
        }

        return await response.json();
    }
}
