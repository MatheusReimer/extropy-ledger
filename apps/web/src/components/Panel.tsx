import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export function Panel({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <Box
      borderWidth="1px"
      borderColor="border"
      borderRadius="panel"
      bg="bg.panel"
      p={padded ? { base: '4', md: '5' } : '0'}
      height="full"
    >
      {children}
    </Box>
  );
}

export function PanelHeading({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string | undefined;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Flex justify="space-between" align="center" gap="3" mb="4" wrap="wrap">
      <HStack gap="2.5" minW="8rem" flex="1 1 auto">
        {icon ? <Box color="accent">{icon}</Box> : null}
        <Text fontSize="sm" fontWeight="semibold" letterSpacing="-0.01em" truncate>
          {title}
        </Text>
      </HStack>
      {action ??
        (hint ? (
          <Text fontSize="xs" color="fg.subtle" whiteSpace="nowrap" flexShrink="0">
            {hint}
          </Text>
        ) : null)}
    </Flex>
  );
}
