import { Box, HStack, Text } from '@chakra-ui/react';

export type SegmentOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  name: string;
};

export function Segmented<T extends string>({ options, value, onChange, label, name }: Props<T>) {
  return (
    <HStack
      as="fieldset"
      role="radiogroup"
      aria-label={label}
      gap="0.5"
      p="0.5"
      bg="bg.subtle"
      borderWidth="1px"
      borderColor="border"
      borderRadius="full"
      display="inline-flex"
      flexShrink="0"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Box
            as="label"
            key={option.value}
            position="relative"
            px="3"
            py="1"
            borderRadius="full"
            cursor="pointer"
            whiteSpace="nowrap"
            transition="background 140ms, color 140ms"
            bg={active ? 'bg.panel' : 'transparent'}
            boxShadow={active ? '0 1px 2px rgba(34,28,22,0.10)' : 'none'}
            color={active ? 'fg' : 'fg.muted'}
            _hover={{ color: 'fg' }}
            _focusWithin={{ outline: '2px solid', outlineColor: 'accent', outlineOffset: '1px' }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                opacity: 0,
                margin: 0,
                pointerEvents: 'none',
              }}
            />
            <Text as="span" fontSize="xs" fontWeight={active ? 'semibold' : 'medium'}>
              {option.label}
            </Text>
          </Box>
        );
      })}
    </HStack>
  );
}
