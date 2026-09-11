/** Round 1 is the summary itself; every later round is the agent's follow-up. */
export function roundLabel(round: number): string {
  return round === 1 ? 'Initial Round' : `Round ${round}`;
}

/**
 * Fixed format for round dates. The text sits inside the selection container, which comment
 * offsets index, so it must render the same way on every load.
 */
export function roundDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
