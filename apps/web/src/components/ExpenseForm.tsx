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
  minorUnitsToDecimalString,
  isCurrency,
  createExpenseSchema,
  parseAmountToMinorUnits,
  parseOrFieldErrors,
  type CategorizeResult,
  type CategoryDto,
  type ExpenseDto,
  type ExtractedExpense,
  type FieldErrors,
} from '@expense/shared';
import { useCategorize, useCreateExpense, useUpdateExpense } from '../api/hooks';
import { formatMonth, todayIso } from '../lib/dates';
import { ErrorState } from './StateViews';
import { ReceiptDropzone } from './ReceiptDropzone';
import { SavedExpense } from './SavedExpense';
import { useI18n, useT, type TranslationKey } from '../i18n';

type Props = {
  categories: CategoryDto[];
  editing?: ExpenseDto | undefined;
  onDone?: ((saved?: ExpenseDto) => void) | undefined;
  compact?: boolean;
  viewingMonth?: string | undefined;
};

const emptyDraft = (currency: string) => ({
  description: '',
  amount: '',
  categoryId: '',
  date: todayIso(),
  currency,
});

const draftFrom = (expense: ExpenseDto) => ({
  description: expense.description,
  amount: minorUnitsToDecimalString(expense.amountCents, expense.currency),
  categoryId: expense.categoryId,
  date: expense.date,
  currency: expense.currency,
});

const describeExtraction = (extracted: ExtractedExpense): string =>
  [extracted.merchant, extracted.description].filter(Boolean).join(' - ').slice(0, 72);

const SOURCE_KEY: Record<CategorizeResult['source'], TranslationKey> = {
  rule: 'form.sourceRule',
  model: 'form.sourceModel',
  fallback: 'form.sourceFallback',
};

export function ExpenseForm({ categories, editing, onDone, compact = false, viewingMonth }: Props) {
  const t = useT();
  const { displayCurrency } = useI18n();
  const [draft, setDraft] = useState(() =>
    editing ? draftFrom(editing) : emptyDraft(displayCurrency),
  );

  const [justSaved, setJustSaved] = useState<
    { expense: ExpenseDto; landedIn?: string | undefined } | undefined
  >(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [suggestion, setSuggestion] = useState<CategorizeResult | undefined>(undefined);

  const suggestedFor = useRef<string>('');
  const categoryTouched = useRef(Boolean(editing));

  const [landed, setLanded] = useState<readonly string[]>([]);

  const [receiptId, setReceiptId] = useState<string | undefined>(undefined);

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

  const maybeSuggest = () => {
    const description = draft.description.trim();
    if (categoryTouched.current || description.length < 3) return;
    if (suggestedFor.current === description) return;

    suggestedFor.current = description;
    const amountCents = parseAmountToMinorUnits(draft.amount, draft.currency);
    categorize.mutate(
      { description, ...(amountCents === null ? {} : { amountCents }) },
      {
        onSuccess: (result) => {
          setSuggestion(result);
          const match = categories.find((category) => category.name === result.category);
          if (match && result.source !== 'fallback') {
            setDraft((current) => ({ ...current, categoryId: match.id }));
          }
        },
        onError: () => setSuggestion(undefined),
      },
    );
  };

  const applyExtraction = (extracted: ExtractedExpense) => {
    setReceiptId(extracted.receiptId);
    const matched = extracted.category
      ? categories.find((category) => category.name === extracted.category)
      : undefined;

    setDraft((current) => ({
      description: describeExtraction(extracted) || current.description,
      amount:
        extracted.amountCents === null
          ? current.amount
          : minorUnitsToDecimalString(
              extracted.amountCents,
              extracted.currency && isCurrency(extracted.currency)
                ? extracted.currency
                : current.currency,
            ),
      categoryId: matched?.id ?? current.categoryId,
      date: extracted.date ?? current.date,
      currency:
        extracted.currency && isCurrency(extracted.currency)
          ? extracted.currency
          : current.currency,
    }));

    setLanded(
      [
        describeExtraction(extracted) ? 'description' : '',
        extracted.amountCents === null ? '' : 'amount',
        matched ? 'category' : '',
        extracted.date ? 'date' : '',
      ].filter(Boolean),
    );

    suggestedFor.current = describeExtraction(extracted);
    if (matched) categoryTouched.current = true;
    setSuggestion(undefined);
    setFieldErrors({});
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseAmountToMinorUnits(draft.amount, draft.currency);

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
      const savedMonth = saved.date.slice(0, 7);
      const landedIn =
        viewingMonth && savedMonth !== viewingMonth ? formatMonth(savedMonth) : undefined;

      if (!editing) setJustSaved({ expense: saved, landedIn });
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
        expense={justSaved.expense}
        categories={categories}
        onAddAnother={() => setJustSaved(undefined)}
        landedInMonth={justSaved.landedIn}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="4">
        {active.isError ? <ErrorState error={active.error} /> : null}

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
          <Button type="submit" loading={active.isPending}>
            {editing ? t('form.save') : t('form.add')}
          </Button>
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
