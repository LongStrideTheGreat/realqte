export type RegionalTaxConfig = {
  taxLabel: string;      // What displays on the invoice line (VAT, GST, etc.)
  defaultRate: number;   // The percentage value (e.g., 20 for 20%)
};

/**
 * Returns the correct tax label and default rate based on the user's profile currency selection.
 * Supports automated regional shifts for UK, SA, Australia, and more.
 */
export function getRegionalTaxConfig(currencyCode: string): RegionalTaxConfig {
  const code = (currencyCode || 'ZAR').toUpperCase();

  switch (code) {
    case 'GBP':
      return { taxLabel: 'VAT', defaultRate: 20 };
    case 'ZAR':
      return { taxLabel: 'VAT', defaultRate: 15 };
    case 'AUD':
      return { taxLabel: 'GST', defaultRate: 10 };
    case 'NZD':
      return { taxLabel: 'GST', defaultRate: 15 };
    case 'USD':
    case 'CAD':
    case 'EUR':
    default:
      // Default baseline for regions with state-dependent or variable taxes
      return { taxLabel: 'Tax', defaultRate: 0 };
  }
}