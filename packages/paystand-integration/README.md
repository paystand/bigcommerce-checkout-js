# Paystand Payment Integration

Enhanced BigCommerce Checkout.js integration for Paystand payments with tokenization and fee calculation.

## Features

- **Tokenization Flow**: Secure payment method tokenization using Paystand modal
- **Dynamic Fee Calculation**: Real-time fee calculation based on payment method and cart total
- **Multiple Payment Methods**: Support for card and bank payments
- **Fee Transparency**: Display processing fees before order completion
- **Order Integration**: Seamless integration with BigCommerce order submission

## Flow Overview

1. **Payment Method Selection**: Customer selects Paystand as payment method
2. **Tokenization**: Customer opens Paystand modal and tokenizes payment method (card or bank)
3. **Fee Calculation**: System fetches fees from Paystand API based on payment method and cart total
4. **Order Review**: Customer reviews order with fees included
5. **Order Submission**: Payment is processed using tokenized payment method

## Configuration

The integration uses the following configuration (found in `PaystandPaymentMethod.tsx`):

```typescript
const PAYSTAND_CONFIG = {
    publishableKey: '<publishableKey>',
    environment: 'com' as const,
};
```

## API Integration

### Endpoints Used

 **Payment Processing**: `POST https://api.paystand.com/v3/payments/secure`

### Fee Structure

The integration calculates fees for different payment methods:
- **Card Payments**: Configurable percentage + flat fee
- **ACH Bank Payments**: Typically no fees (absorbed by merchant)
- **Network Bank Payments**: Configurable fees

## Components

### PaystandApiService
Handles all API communication with Paystand endpoints.

### PaystandPaymentMethod
Main React component providing the payment interface.

## Usage in Checkout

The component is automatically registered for the `paystand` payment method ID. When customers select Paystand as their payment method, they will see:

1. Initial state: Button to "Choose Payment Method"
2. Tokenization state: Paystand modal for secure payment method entry
3. Selected state: Payment method summary with fee breakdown
4. Option to change payment method

## Error Handling

The integration includes comprehensive error handling for:
- Network failures
- Invalid tokenization
- Fee calculation errors
- Order submission failures

## Development Notes

- The integration uses React hooks and modern TypeScript patterns
- All API calls are properly typed with interfaces
- The component is memoized and optimized for performance
- Event listeners are properly cleaned up to prevent memory leaks

## Future Enhancements

- Integration with BigCommerce's native fee system for order summary display
- Support for stored payment methods
- Enhanced error messaging with localization
- Real-time fee updates on cart changes