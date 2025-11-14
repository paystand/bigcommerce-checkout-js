# 🎯 Captura de Datos del Modal de Paystand

## Qué hace

Cuando el usuario completa el modal de Paystand y hace clic en **"Save Card For Future Payments"** o **"Save Bank For Future Payments"**, automáticamente se capturan y muestran en la consola todos los datos ingresados.

## Cómo verlo

1. Abre la consola del navegador (`F12` o `Cmd+Option+J`)
2. Completa el checkout hasta Paystand
3. Haz clic en "Choose Payment Method"
4. Llena el modal con datos de prueba
5. Haz clic en "Save *** For Future Payments"
6. Verás en la consola: `🎯 PAYSTAND MODAL DATA CAPTURED:`

## Ejemplo de Output para TARJETA

```javascript
🎯 PAYSTAND MODAL DATA CAPTURED: {
  tokenId: "tok_abc123xyz",
  type: "card",
  card: {
    name: "Alejandro Velazquez",
    brand: "visa",
    last4: "4242",
    expiry: "12/2032",
    billingAddress: {
      street1: "123 Main St",
      street2: null,
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US"
    }
  },
  timestamp: "2025-10-02T10:30:45.123Z"
}
```

## Ejemplo de Output para ACH

```javascript
🎯 PAYSTAND MODAL DATA CAPTURED: {
  tokenId: "tok_xyz789abc",
  type: "ach",
  bank: {
    name: "Alejandro Velazquez",
    accountType: "checking",
    accountHolderType: "personal",
    bankName: "Chase",
    routingNumber: "110000000",
    last4: "6789",
    verified: false,
    billingAddress: {
      street1: "123 Main St",
      street2: null,
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US"
    }
  },
  timestamp: "2025-10-02T10:30:45.123Z"
}
```

## Datos de Prueba

**Tarjetas:**
- Visa: 4242 4242 4242 4242
- Mastercard: 5555 5555 5555 4444
- Cualquier fecha futura, cualquier CVV

**ACH:**
- Routing Number: 110000000
- Account Number: 000123456789

## Ubicación del Código

Archivo: `packages/paystand-integration/src/PaystandPaymentMethod.tsx`
Líneas: 195-224

```typescript
const capturedData = {
    tokenId: tokenResponse.id,
    type: paymentMethodType,
    ...(tokenResponse.card && { card: {...} }),
    ...(tokenResponse.bank && { bank: {...} }),
    timestamp: new Date().toISOString(),
};

console.log('🎯 PAYSTAND MODAL DATA CAPTURED:', capturedData);
```

## Para Enviar al Backend

Si necesitas enviar estos datos a tu backend, puedes hacerlo después del log:

```typescript
// En el handleTokenization (después del console.log):
await fetch('/api/paystand/save-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(capturedData)
});
```

---

✅ **Listo.** No hay UI adicional, no hay archivos extra. Solo un log limpio con todos los datos capturados.

