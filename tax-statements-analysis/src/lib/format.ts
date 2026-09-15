// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ

export const NONE = "None";

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(amount: number): string {
  return `₨ ${amountFormatter.format(amount)}`;
}

export function formatOptional(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : NONE;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE_PATTERN.test(iso)) {
    return false;
  }
  const parsed = parseIsoDate(iso);
  return toIsoDate(parsed) === iso;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function firstOfCurrentMonthIso(reference: Date = new Date()): string {
  return toIsoDate(new Date(reference.getFullYear(), reference.getMonth(), 1));
}

export function formatDate(iso: string): string {
  return isValidIsoDate(iso) ? iso : "";
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
