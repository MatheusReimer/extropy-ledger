import { useState } from 'react';
import { Box, Button, chakra, HStack, Input, Text } from '@chakra-ui/react';
import { parseAmountToCents } from '@expense/shared';
import { useI18n, useT } from '../i18n';

/**
 * A real `<button>`, so the whole bar is keyboard-reachable and announces itself.
 *
 * Built with the `chakra` factory rather than `<Box as="button">` because the
 * factory types the element's own attributes - notably `type="button"`, without
 * which nesting this inside a form some day turns a budget edit into a submit.
 */
const Pressable = chakra('button', {
  base: { textAlign: 'left', width: '100%', cursor: 'pointer', display: 'block' },
});

type Props = {
  spentCents: number;
  limitCents: number | undefined;
  onSave: (limitCents: number | null) => void;
  saving: boolean;
};

/**
 * A category's monthly ceiling, and how close this month is to it.
 *
 * Kept out of `CategoryCard` so that card stays one thing - "what was spent" -
 * and this stays another - "against what, and by whose choice". They are edited
 * at different times and would otherwise share a lump of local editing state
 * with the display logic.
 */
export function BudgetRow({ spentCents, limitCents, onSave, saving }: Props) {
  const t = useT();
  const { formatBase, toDisplayAmount, toBaseCents } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const open = () => {
    // Seeded with the current limit so editing is a correction, not a re-entry.
    setDraft(limitCents === undefined ? '' : toDisplayAmount(limitCents));
    setInvalid(false);
    setEditing(true);
  };

  const commit = () => {
    const typed = parseAmountToCents(draft);
    if (typed === null || typed < 0) {
      setInvalid(true);
      return;
    }
    // Typed in whatever the user reads in; stored in the base currency, which is
    // the unit the monthly report sums.
    onSave(toBaseCents(typed));
    setEditing(false);
  };

  if (editing) {
    return (
      <HStack gap="2" pt="1">
        <Input
          size="xs"
          value={draft}
          autoFocus
          inputMode="decimal"
          aria-label={t('budget.limit')}
          aria-invalid={invalid || undefined}
          placeholder="0.00"
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setEditing(false);
          }}
        />
        <Button size="xs" variant="solid" onClick={commit} loading={saving}>
          {t('budget.save')}
        </Button>
        {limitCents === undefined ? (
          <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
            {t('form.cancel')}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              onSave(null);
              setEditing(false);
            }}
          >
            {t('budget.clear')}
          </Button>
        )}
      </HStack>
    );
  }

  if (limitCents === undefined) {
    return (
      <Button size="xs" variant="ghost" alignSelf="flex-start" px="0" onClick={open}>
        {t('budget.set')}
      </Button>
    );
  }

  const over = spentCents > limitCents;
  // A zero budget is a real budget ("spend nothing here"), so it cannot divide.
  const used = limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : over ? 100 : 0;

  return (
    <Pressable type="button" onClick={open} aria-label={t('budget.edit')}>
      <Box
        height="4px"
        borderRadius="full"
        bg="bg.muted"
        overflow="hidden"
        role="img"
        aria-label={t('budget.usedOf', { percent: used })}
      >
        <Box
          height="100%"
          width={`${Math.min(used, 100)}%`}
          borderRadius="full"
          bg={over ? 'red.solid' : 'accent.data'}
          transformOrigin="left"
          animationName="grow"
          animationDuration="620ms"
          animationTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
          animationFillMode="backwards"
        />
      </Box>
      <HStack justify="space-between" fontSize="xs" color="fg.muted" pt="1.5" gap="2">
        <Text truncate>{t('budget.ofLimit', { limit: formatBase(limitCents) })}</Text>
        {/*
          Over-budget is never signalled by colour alone: the bar turns red AND
          the label says so in words, so the state survives a colour-blind reader,
          a greyscale print, and a screenshot in a chat window.
        */}
        <Text
          whiteSpace="nowrap"
          fontWeight={over ? 'semibold' : 'normal'}
          color={over ? 'red.fg' : 'fg.muted'}
        >
          {over
            ? t('budget.over', { amount: formatBase(spentCents - limitCents) })
            : t('budget.left', { amount: formatBase(limitCents - spentCents) })}
        </Text>
      </HStack>
    </Pressable>
  );
}
