import { useState } from 'react';
import { Box, Button, chakra, HStack, Input, Text } from '@chakra-ui/react';
import { parseAmountToMinorUnits } from '@expense/shared';
import { useI18n, useT } from '../i18n';

const Pressable = chakra('button', {
  base: { textAlign: 'left', width: '100%', cursor: 'pointer', display: 'block' },
});

type Props = {
  spentCents: number;
  limitCents: number | undefined;
  onSave: (limitCents: number | null) => void;
  saving: boolean;
};

export function BudgetRow({ spentCents, limitCents, onSave, saving }: Props) {
  const t = useT();
  const { formatBase, toDisplayAmount, toBaseCents, displayCurrency } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const open = () => {
    setDraft(limitCents === undefined ? '' : toDisplayAmount(limitCents));
    setInvalid(false);
    setEditing(true);
  };

  const commit = () => {
    const typed = parseAmountToMinorUnits(draft, displayCurrency);
    if (typed === null || typed < 0) {
      setInvalid(true);
      return;
    }
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
