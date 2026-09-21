/** Pure money math shared by API (posting) and web (live totals). All results rounded to 4 dp. */
const r = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export interface LineIn { qty: number; rate: number; discountType: 'flat' | 'percent'; discountValue: number; taxRatePct: number }
export interface LineOut { gross: number; discount: number; taxable: number; tax: number; amount: number }

/** exclusive: tax added on top of (gross − discount); inclusive: rate already contains tax. */
export function calcLine(l: LineIn, taxType: 'exclusive' | 'inclusive'): LineOut {
  const gross = r(l.qty * l.rate);
  const discount = r(l.discountType === 'percent' ? (gross * l.discountValue) / 100 : l.discountValue);
  const net = r(Math.max(0, gross - discount));
  if (taxType === 'inclusive') {
    const taxable = r(net / (1 + l.taxRatePct / 100));
    return { gross, discount, taxable, tax: r(net - taxable), amount: net };
  }
  const tax = r((net * l.taxRatePct) / 100);
  return { gross, discount, taxable: net, tax, amount: r(net + tax) };
}

export interface TotalsIn {
  lines: LineOut[];
  withholdingType: 'none' | 'tds' | 'tcs';
  withholdingRate: number;
  adjustment: number;
  shippingCharges?: number;
  roundOff?: boolean;
}
export interface Totals { subtotal: number; taxableTotal: number; taxTotal: number; discountTotal: number; withholding: number; shipping: number; adjustment: number; roundOff: number; grandTotal: number }

/** TDS is deducted (−), TCS is added (+); both computed on the taxable total. */
export function calcTotals(t: TotalsIn): Totals {
  const taxableTotal = r(t.lines.reduce((s, l) => s + l.taxable, 0));
  const taxTotal = r(t.lines.reduce((s, l) => s + l.tax, 0));
  const discountTotal = r(t.lines.reduce((s, l) => s + l.discount, 0));
  const subtotal = r(t.lines.reduce((s, l) => s + l.amount, 0));
  const wh = r((taxableTotal * t.withholdingRate) / 100);
  const withholding = t.withholdingType === 'tds' ? -wh : t.withholdingType === 'tcs' ? wh : 0;
  const shipping = r(t.shippingCharges ?? 0);
  const raw = r(subtotal + withholding + shipping + t.adjustment);
  const roundOff = t.roundOff ? r(Math.round(raw) - raw, 2) : 0;
  return { subtotal, taxableTotal, taxTotal, discountTotal, withholding, shipping, adjustment: r(t.adjustment), roundOff, grandTotal: r(raw + roundOff) };
}

/** GST split: same state → CGST + SGST (half each), different → IGST. */
export function splitGst(tax: number, interstate: boolean) {
  return interstate ? { cgst: 0, sgst: 0, igst: tax } : { cgst: r(tax / 2), sgst: r(tax - r(tax / 2)), igst: 0 };
}

/** Amount in words (Indian numbering), e.g. "Two Lakh Forty Thousand Rupees Only". */
export function amountInWords(n: number, unit = 'Rupees', sub = 'Paise'): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x]! : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  const words = (x: number): string => {
    if (x === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(x / 1e7); x %= 1e7;
    const lakh = Math.floor(x / 1e5); x %= 1e5;
    const thousand = Math.floor(x / 1e3); x %= 1e3;
    if (crore) parts.push(`${three(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (x) parts.push(three(x));
    return parts.join(' ');
  };
  const whole = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - whole) * 100);
  return `${words(whole)} ${unit}${paise ? ` and ${two(paise)} ${sub}` : ''} Only`;
}
