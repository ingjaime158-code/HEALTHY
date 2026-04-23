/**
 * Shared formatting utilities for the Healthy Dream application.
 * Centralized here to avoid redeclaration across components.
 */

/**
 * Formats a number as Mexican Peso currency (MXN).
 * @param amount  The amount to format.
 * @returns       Formatted string like "$1,234.56"
 */
export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
    }).format(amount || 0);
};
