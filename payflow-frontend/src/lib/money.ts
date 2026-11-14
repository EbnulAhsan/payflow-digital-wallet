// SRS 5.4: amounts are shown as ৳ with thousands separators.
// The API sends money as decimal strings ("3000.00"); never use a float.
export function formatBdt(amount: string): string {
  const [whole, fraction = '00'] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `৳ ${grouped}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
