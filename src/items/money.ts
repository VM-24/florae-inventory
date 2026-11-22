// Money math in integer grosze (1/100 PLN) to avoid float drift: 0.1 * 3 !== 0.3.
export function toGrosze(amount: number | string | { toString(): string }): number {
  return Math.round(Number(amount.toString()) * 100);
}

export function fromGrosze(grosze: number): number {
  return grosze / 100;
}

export function lineTotal(unitPrice: number | string | { toString(): string }, quantity: number): number {
  return fromGrosze(toGrosze(unitPrice) * quantity);
}
