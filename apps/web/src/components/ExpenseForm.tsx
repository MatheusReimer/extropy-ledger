import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
  CURRENCIES,
  centsToDecimalString,
  isCurrency,
  createExpenseSchema,
  parseAmountToCents,
  parseOrFieldErrors,
  type CategorizeResult,
  type CategoryDto,
  type ExpenseDto,
  type ExtractedExpense,
  type FieldErrors,
} from '@expense/shared';
import { useCategorize, useCreateExpense, useUpdateExpense } from '../api/hooks';
import { todayIso } from '../lib/dates';
import { ErrorState } from './StateViews';
import { ReceiptDropzone } from './ReceiptDropzone';
import { SavedExpense } from './SavedExpense';
import { useI18n, useT, type TranslationKey } from '../i18n';

type Props = {
  categories: CategoryDto[];
  editing?: ExpenseDto | undefined;
  /** Receives the saved expense, so the page can follow it to its month. */
  onDone?: ((saved?: ExpenseDto) => void) | undefined;
  /** Single column, for the narrow rail on the overview. */
  compact?: boolean;
};

const emptyDraft = (currency: string) => ({
  description: '',
  amount: '',
  categoryId: '',
  date: todayIso(),
  currency,
});

/**
 * Mirrors the server's `toDescription`, including its 72-character cap.
 *
 * Both sides compose the same string, so they have to agree on the length too -
 * otherwise the form shows one description and the saved row shows another.
 */
const describeExtraction = (extracted: ExtractedExpense): string =>
  [extracted.merchant, extracted.description].filter(Boolean).join(' - ').slice(0, 72);

const SOURCE_KEY: Record<CategorizeResult['source'], TranslationKey> = {
  rule: 'form.sourceRule',
  model: 'form.sourceModel',
  fallback: 'form.sourceFallback',
};

export function ExpenseForm({ categories, editing, onDone, compact = false }: Props) {
  const t = useT();
  const { displayCurrency } = useI18n();
  /**
   * A new expense defaults to the currency the user reads in.
   *
   * Not to the account's base: someone whose display currency is BRL is almost
   * certainly spending in BRL, and defaulting to USD would make the common case
   * a correction on every single entry.
   */
  const [draft, setDraft] = useState(() => emptyDraft(displayCurrency));

  /**
   * The entry just created, held so the panel can confirm it.
   *
   * Only ever set for a CREATE. Editing is a correction made in place - the row
   * the user is looking at updates in the table behind the form, so a
   * confirmation would be telling them something they can already see.
   */
  const [justSaved, setJustSaved] = useState<ExpenseDto | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [suggestion, setSuggestion] = useState<CategorizeResult | undefined>(undefined);

  /**
   * Remembers the description already classified.
   *
   * It is what stops the same call going out twice when the field loses and
   * regains focus without the text changing - the easiest way to double the
   * cost of this feature without anyone noticing.
   */
  const suggestedFor = useRef<string>('');
  /** A manual pick disables auto-suggestion: the user has already decided. */
  const categoryTouched = useRef(false);

  /**
   * Which fields an extraction just filled, so each can flash as it lands.
   *
   * The app's best trick used to happen invisibly - four values appeared at once
   * and nothing told you where to look. Flashing them in sequence makes the
   * extraction legible as an event rather than a repaint, and it doubles as an
   * honest signal of WHICH fields the document actually yielded.
   */
  const [landed, setLanded] = useState<readonly string[]>([]);

  /**
   * The upload this draft came from, if any.
   *
   * Held here rather than in the dropzone because it belongs to the DRAFT: it
   * has to survive until submit, and be dropped if the user starts over.
   */
  const [receiptId, setReceiptId] = useState<string | undefined>(undefined);

  /** Cleared on a timer, so a second upload re-animates rather than staying lit. */
  useEffect(() => {
    if (landed.length === 0) return;
    const timer = setTimeout(() => setLanded([]), 1400);
    return () => clearTimeout(timer);
  }, [landed]);

  const landing = (field: string) => {
    const index = landed.indexOf(field);
    return index === -1
      ? {}
      : {
          animationName: 'landed',
          animationDuration: '900ms',
          animationDelay: `${index * 110}ms`,
          animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          animationFillMode: 'backwards' as const,
        };
  };

  const create = useCreateExpense();
  const update = useUpdateExpense();
  const categorize = useCategorize();
  const active = editing ? update : create;

  useEffect(() => {
    if (!editing) return;
    setDraft({
      description: editing.description,
      amount: centsToDecimalString(editing.amountCents),
      categoryId: editing.categoryId,
      date: editing.date,
      currency: editing.currency,
    });
    categoryTouched.current = true;
    setSuggestion(undefined);
  }, [editing]);

  /**
   * The call fires when the description is FINISHED (blur), not on every keystroke.
   *
   * Per keystroke, "Starbucks downtown" would be ~20 calls - visible latency,
   * rate limits and an API bill for a result that only matters once. On blur it
   * is one call per expense, and only while no category has been chosen yet: if
   * one has, there is nothing to suggest.
   */
  const maybeSuggest = () => {
    const description = draft.description.trim();
    if (categoryTouched.current || description.length < 3) return;
    if (suggestedFor.current === description) return;

    suggestedFor.current = description;
    const amountCents = parseAmountToCents(draft.amount);
    categorize.mutate(
      { description, ...(amountCents === null ? {} : { amountCents }) },
      {
        onSuccess: (result) => {
          setSuggestion(result);
          const match = categories.find((category) => category.name === result.category);
          // A fallback preselects nothing: offering "Other" at zero confidence
          // would be faking an answer the system does not have.
          if (match && result.source !== 'fallback') {
            setDraft((current) => ({ ...current, categoryId: match.id }));
          }
        },
        // A failed suggestion is silent by design: the form stays perfectly
        // usable without it.
        onError: () => setSuggestion(undefined),
      },
    );
  };

  /**
   * A receipt fills the form; it never saves anything.
   *
   * Each field is only overwritten when the document actually yielded one, so a
   * partial read tops up what is there instead of blanking it. And because the
   * user still has to press the button, a wrong extraction costs a correction
   * rather than a bad row in their ledger - which is the right trade on a
   * financial record.
   */
  const applyExtraction = (extracted: ExtractedExpense) => {
    setReceiptId(extracted.receiptId);
    const matched = extracted.category
      ? categories.find((category) => category.name === extracted.category)
      : undefined;

    setDraft((current) => ({
      description: describeExtraction(extracted) || current.description,
      amount:
        extracted.amountCents === null ? current.amount : centsToDecimalString(extracted.amountCents),
      categoryId: matched?.id ?? current.categoryId,
      date: extracted.date ?? current.date,
      /**
       * The receipt's own currency, when it printed one we support.
       *
       * This is the whole point of reading `currency` off the document: a
       * Brazilian receipt should arrive as BRL, not as the user's display
       * currency with a Brazilian number in it. An unsupported code is ignored
       * rather than guessed at.
       */
      currency:
        extracted.currency && isCurrency(extracted.currency) ? extracted.currency : current.currency,
    }));

    // Only the fields the document actually produced get flashed, in reading
    // order - a field that stayed empty must not pretend it was filled.
    setLanded(
      [
        describeExtraction(extracted) ? 'description' : '',
        extracted.amountCents === null ? '' : 'amount',
        matched ? 'category' : '',
        extracted.date ? 'date' : '',
      ].filter(Boolean),
    );

    // The description came from a document, so the blur-suggest has nothing left
    // to add - and a manual category pick from the receipt counts as a choice.
    suggestedFor.current = describeExtraction(extracted);
    if (matched) categoryTouched.current = true;
    setSuggestion(undefined);
    setFieldErrors({});
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseAmountToCents(draft.amount);

    if (amountCents === null) {
      setFieldErrors({ amountCents: t('form.amountInvalid') });
      return;
    }

    const parsed = parseOrFieldErrors(createExpenseSchema, {
      amountCents,
      description: draft.description,
      categoryId: draft.categoryId,
      date: draft.date,
      currency: draft.currency,
    });

    if (!parsed.ok) {
      setFieldErrors(parsed.fields);
      return;
    }
    setFieldErrors({});

    const onSuccess = (saved: ExpenseDto) => {
      setDraft(emptyDraft(displayCurrency));
      setReceiptId(undefined);
      setSuggestion(undefined);
      suggestedFor.current = '';
      categoryTouched.current = false;
      if (!editing) setJustSaved(saved);
      onDone?.(saved);
    };

    if (editing) {
      update.mutate({ id: editing.id, ...parsed.data }, { onSuccess });
    } else {
      create.mutate({ ...parsed.data, ...(receiptId ? { receiptId } : {}) }, { onSuccess });
    }
  };

  if (justSaved) {
    return (
      <SavedExpense
        expense={justSaved}
        categories={categories}
        onAddAnother={() => setJustSaved(undefined)}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="4">
        {active.isError ? <ErrorState error={active.error} /> : null}

        {/* Editing an existing row is a correction, not a fresh capture. */}
        {editing ? null : <ReceiptDropzone onExtracted={applyExtraction} />}

        <SimpleGrid columns={compact ? 1 : { base: 1, md: 2 }} gap="4">
          <Field.Root invalid={Boolean(fieldErrors['description'])}>
            <Field.Label>{t('form.description')}</Field.Label>
            <Input
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              onBlur={maybeSuggest}
              placeholder={t('form.descriptionPlaceholder')}
              {...landing('description')}
            />
            <Field.ErrorText>{fieldErrors['description']}</Field.ErrorText>
          </Field.Root>

          {/*
            Amount and currency are one field, because they are one fact. Putting
            the currency somewhere else would let a value be entered against the
            wrong one without anything on screen looking odd.
          */}
          <Field.Root invalid={Boolean(fieldErrors['amountCents'])}>
            <Field.Label>{t('form.amount')}</Field.Label>
            <HStack gap="2" width="full" {...landing('amount')}>
              <Input
                inputMode="decimal"
                value={draft.amount}
                onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                placeholder="12.50"
                flex="1"
              />
              <NativeSelect.Root width="24" flexShrink="0">
                <NativeSelect.Field
                  aria-label={t('form.currency')}
                  value={draft.currency}
                  onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </HStack>
            <Field.ErrorText>{fieldErrors['amountCents']}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={Boolean(fieldErrors['categoryId'])}>
            <Field.Label>{t('form.category')}</Field.Label>
            <NativeSelect.Root {...landing('category')}>
              <NativeSelect.Field
                value={draft.categoryId}
                onChange={(event) => {
                  categoryTouched.current = true;
                  setDraft({ ...draft, categoryId: event.target.value });
                }}
              >
                <option value="">{t('form.selectCategory')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Field.ErrorText>{fieldErrors['categoryId']}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={Boolean(fieldErrors['date'])}>
            <Field.Label>{t('form.date')}</Field.Label>
            <Input
              type="date"
              value={draft.date}
              max={todayIso()}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              {...landing('date')}
            />
            <Field.ErrorText>{fieldErrors['date']}</Field.ErrorText>
          </Field.Root>
        </SimpleGrid>

        {/* The UI is honest about provenance: rule, model, or neither. */}
        <HStack minH="6" gap="2" fontSize="sm" color="fg.muted">
          {categorize.isPending ? <Text>{t('form.looking')}</Text> : null}
          {!categorize.isPending && suggestion ? (
            <>
              <Badge colorPalette={suggestion.source === 'fallback' ? 'gray' : 'orange'}>
                {suggestion.category}
              </Badge>
              <Text>
                {t(SOURCE_KEY[suggestion.source])}
                {suggestion.source === 'model'
                  ? ` · ${t('form.confident', { percent: Math.round(suggestion.confidence * 100) })}`
                  : ''}
              </Text>
            </>
          ) : null}
        </HStack>

        <HStack>
          <Button type="submit"  loading={active.isPending}>
            {editing ? t('form.save') : t('form.add')}
          </Button>
          {/* Cancel reports no saved expense, because there isn't one. */}
          {editing ? (
            <Button variant="ghost" onClick={() => onDone?.()} type="button">
              {t('form.cancel')}
            </Button>
          ) : null}
        </HStack>
      </Stack>
    </form>
  );
}
