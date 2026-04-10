export type TopUpMethod = "pix" | "credit_card";

function parsePositiveNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PIX_MIN_TOP_UP_BRL = parsePositiveNumber(
  import.meta.env.VITE_PIX_MIN_AMOUNT,
  10
);

export const CARD_MIN_TOP_UP_BRL = parsePositiveNumber(
  import.meta.env.VITE_CARD_MIN_AMOUNT,
  15
);

export function getTopUpMinimumAmount(method: TopUpMethod) {
  return method === "credit_card" ? CARD_MIN_TOP_UP_BRL : PIX_MIN_TOP_UP_BRL;
}
