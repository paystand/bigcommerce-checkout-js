/* eslint-disable */
import { getScriptLoader } from '@bigcommerce/script-loader';
import { useCallback, useEffect, useRef } from 'react';

import { PAYSTAND_RETRY, PAYSTAND_SCRIPT } from '../config';

interface PaystandScriptConfig {
  publishableKey: string;
  environment: 'production' | 'staging';
  email: string;
  amount: string;
  customerId: string;
  checkoutId: string;
  cartId?: string;
}

interface UsePaystandScriptOptions {
  onLoaded?: () => void;
  onError?: (error: Error) => void;
}

interface UsePaystandScriptReturn {
  loadScript: (config: PaystandScriptConfig) => Promise<void>;
  cleanup: () => void;
}

/**
 * Custom hook to manage Paystand script loading and initialization
 */
export function usePaystandScript(options: UsePaystandScriptOptions = {}): UsePaystandScriptReturn {
  const { onLoaded, onError } = options;
  const isLoadingRef = useRef(false);

  /**
   * Wait for PayStandCheckout to be available on window
   */
  const waitForPayStandCheckout = useCallback((): Promise<any> => {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const checkForPayStand = () => {
        if ((window as any).PayStandCheckout) {
          resolve((window as any).PayStandCheckout);
          return;
        }

        attempts++;

        if (attempts >= PAYSTAND_RETRY.maxAttempts) {
          reject(new Error('PayStandCheckout failed to load after maximum attempts'));
          return;
        }

        setTimeout(checkForPayStand, PAYSTAND_RETRY.intervalMs);
      };

      checkForPayStand();
    });
  }, []);

  /**
   * Load Paystand script with configuration
   */
  const loadScript = useCallback(
    async (config: PaystandScriptConfig) => {
      if (isLoadingRef.current) {
        console.warn('Paystand script is already loading');
        return;
      }

      try {
        isLoadingRef.current = true;

        // Remove existing script if present
        const existing = document.getElementById(PAYSTAND_SCRIPT.id);
        if (existing) {
          existing.parentElement?.removeChild(existing);
        }

        // Prepare script attributes
        const attributes: Record<string, string> = {
          id: PAYSTAND_SCRIPT.id,
          type: 'text/javascript',
          'ps-mode': 'modal',
          'ps-show': 'true',
          'ps-publishable-key': config.publishableKey,
          'ps-env': config.environment,
          'ps-payerEmail': config.email,
          'ps-fixedAmount': 'true',
          'ps-amount': config.amount,
          'ps-customerId': config.customerId,
          'ps-checkoutId': config.checkoutId,
        };

        if (config.cartId) {
          attributes['ps-paymentMeta'] = JSON.stringify({
            cartId: config.cartId,
          });
        }

        // Load script
        const scriptLoader = getScriptLoader();
        await scriptLoader.loadScript(PAYSTAND_SCRIPT.src, {
          async: false,
          attributes,
        });

        // Wait for PayStandCheckout to be available
        await waitForPayStandCheckout();

        if (onLoaded) {
          onLoaded();
        }
      } catch (error) {
        const errorObj =
          error instanceof Error ? error : new Error('Failed to load Paystand script');

        if (onError) {
          onError(errorObj);
        }

        throw errorObj;
      } finally {
        isLoadingRef.current = false;
      }
    },
    [waitForPayStandCheckout, onLoaded, onError],
  );

  /**
   * Cleanup script and handlers
   */
  const cleanup = useCallback(() => {
    // Remove script element
    const script = document.getElementById(PAYSTAND_SCRIPT.id);
    if (script) {
      script.parentElement?.removeChild(script);
    }

    // Reset loading state
    isLoadingRef.current = false;
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    loadScript,
    cleanup,
  };
}
