import { centsToDecimalString } from '@expense/shared';

/**
 * A deliberately short prompt.
 *
 * A longer instruction does not classify better - the category list and the
 * schema already carry the specification. What it does add is cost and latency
 * on a call that happens while someone is filling in a form. The lines that
 * survived are the ones that change behaviour: honest confidence (so the UI can
 * decide whether to preselect or merely suggest) and a ban on guessing when the
 * description carries no signal.
 */
export function buildSystemPrompt(categories: readonly string[]): string {
  return [
    'You classify a personal expense into exactly one category.',
    `Allowed categories: ${categories.join(', ')}.`,
    'Pick the category a careful bookkeeper would pick from the merchant or description.',
    'Report confidence honestly: below 0.5 when the description is vague or could fit several categories.',
  ].join('\n');
}

export function buildUserPrompt(input: {
  description: string;
  amountCents?: number | undefined;
}): string {
  const amount =
    input.amountCents === undefined ? '' : `\nAmount: ${centsToDecimalString(input.amountCents)}`;
  return `Expense description: ${input.description}${amount}`;
}
