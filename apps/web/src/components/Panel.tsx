import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * A raised surface on the dark canvas.
 *
 * Elevation is lightness plus a hairline, never a drop shadow - a shadow on a
 * near-black ground is simply invisible, so the only way a panel can read as
 * "above" the page is by being lighter than it.
 */
export function Panel({
  children,
  padded = true,
}: {
  children: ReactNode;
  padded?: boolean;
}) {
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

/** Title on the left, a quiet hint on the right - the panel's own little header. */
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
    /*
     * Wraps rather than crushes.
     *
     * With a nowrap `action` beside it - the breakdown's range switcher, say -
     * a title group free to shrink to zero does exactly that: at 390px the
     * heading "Spending breakdown" was squeezed into 29px and vanished behind
     * its own ellipsis. The floor below plus `wrap` sends the action to a second
     * line instead, which is the honest response to not having room.
     */
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
