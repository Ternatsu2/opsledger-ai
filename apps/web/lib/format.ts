import { format, formatDistanceToNowStrict } from "date-fns";

export function money(amount: string | number, currency: string): string {
  return new Intl.NumberFormat("en-AG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function dateTime(value: string): string {
  return format(new Date(value), "d MMM yyyy, HH:mm");
}

export function relativeTime(value: string): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function sentenceCase(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
