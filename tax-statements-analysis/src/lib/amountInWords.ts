// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ

/**
 * PKR amounts in words (FR-018, FR-031).
 *
 * Amounts arrive as integer minor units (paisa) and come out in **English**
 * numbering — hundred, thousand, million, billion — with paisa spelled out when
 * they are present, ending in "Only". (Changed from lakh/crore at the client's
 * request, 2026-09-19.) One function, used both beside the live total and on the
 * invoice, so the two can never disagree.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

function twoDigits(value: number): string {
  if (value < 20) {
    return ONES[value];
  }
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
}

function threeDigits(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} hundred`);
  }
  if (rest > 0) {
    parts.push(twoDigits(rest));
  }
  return parts.join(" ");
}

/** Scales, largest first. */
const SCALES: ReadonlyArray<{ value: number; name: string }> = [
  { value: 1_000_000_000, name: "billion" },
  { value: 1_000_000, name: "million" },
  { value: 1_000, name: "thousand" },
];

/** English short scale: hundred, thousand, million, billion. */
function integerWords(value: number): string {
  if (value === 0) {
    return "zero";
  }
  if (value < 1_000) {
    return threeDigits(value);
  }

  const parts: string[] = [];
  let remaining = value;
  for (const scale of SCALES) {
    const count = Math.floor(remaining / scale.value);
    if (count > 0) {
      parts.push(`${integerWords(count)} ${scale.name}`);
      remaining %= scale.value;
    }
  }
  if (remaining > 0) {
    parts.push(threeDigits(remaining));
  }
  return parts.join(" ");
}

/** Rupees (major units) to integer paisa, the store's unit of account. */
export function rupeesToMinor(amount: number): number {
  return Math.round(amount * 100);
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/** "PKR 1500.00" → "Rupees one thousand five hundred Only". */
export function amountInWordsPkr(minor: number): string {
  const safe = Math.round(Math.abs(minor));
  const rupees = Math.floor(safe / 100);
  const paisa = safe % 100;

  const body =
    paisa === 0
      ? integerWords(rupees)
      : `${integerWords(rupees)} and ${twoDigits(paisa)} paisa`;

  const words = `Rupees ${body} Only`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}


// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
