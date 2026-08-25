// One currency per project (ADR D-17). Extend as needed.
export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED", "JPY", "CHF"] as const;

export function formatBudget(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}
