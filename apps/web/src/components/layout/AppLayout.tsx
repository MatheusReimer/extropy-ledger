import { Box, Button, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Brand, BrandMark } from '../Brand';
import { useT, type TranslationKey } from '../../i18n';
import { Preferences } from '../Preferences';
import { SidebarWaves } from '../SidebarWaves';
import { CategoriesIcon, OverviewIcon } from '../icons';

export type ViewKey = 'overview' | 'categories';

/**
 * Two destinations, not three.
 *
 * "Overview" and "Expenses" were showing the same data twice - the same add
 * form, the same table, the same numbers - and a nav that leads to a place you
 * have already been is worse than no nav. Everything to do with spending now
 * lives on one page; Categories stays separate because it answers a different
 * question and has its own editing surface.
 */
const NAV: ReadonlyArray<{ key: ViewKey; labelKey: TranslationKey; Icon: typeof OverviewIcon }> = [
  { key: 'overview', labelKey: 'nav.overview', Icon: OverviewIcon },
  { key: 'categories', labelKey: 'nav.categories', Icon: CategoriesIcon },
];

const SIDEBAR_WIDTH = '15rem';

type Props = {
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  email?: string | undefined;
  onSignOut?: (() => void) | undefined;
  title: string;
  subtitle?: string | undefined;
  action?: ReactNode;
  children: ReactNode;
};

/**
 * A persistent nav rail, which is the difference between an app and a page.
 *
 * Stacked full-width panels in one column is the shape every scaffold produces;
 * a rail that stays put while the content changes is what makes a product feel
 * like it has places in it. The three views also give each concern room to
 * breathe instead of competing for the same scroll.
 *
 * There is still no router. Two of these views have nothing worth deep-linking
 * to, and the third would need auth-aware routes to be useful - a dependency and
 * a redirect to express what a `useState` already expresses.
 */
export function AppLayout({
  view,
  onViewChange,
  email,
  onSignOut,
  title,
  subtitle,
  action,
  children,
}: Props) {
  const t = useT();
  return (
    <Flex minH="100dvh" bg="bg">
      {/* Rail: a real sidebar from md up. */}
      <Box
        as="aside"
        display={{ base: 'none', md: 'flex' }}
        flexDirection="column"
        position="fixed"
        insetY="0"
        left="0"
        width={SIDEBAR_WIDTH}
        borderRightWidth="1px"
        borderColor="border"
        bg="bg.panel"
        px="4"
        py="5"
        /**
         * Artwork rather than a flat panel.
         *
         * Anchored to the bottom, and the image itself fades to bare paper
         * across its top quarter - so the nav labels never sit on colour and
         * nothing has to be legible over the warm end of it. `cover` keeps it
         * filling any viewport height without distorting the arcs.
         */
        backgroundImage="url('/sidebar-art.jpg')"
        backgroundSize="cover"
        backgroundPosition="bottom center"
        backgroundRepeat="no-repeat"
        overflow="hidden"
      >
        <SidebarWaves />

        {/* Everything below rides above the ripples. */}
        <Box px="2" mb="7" position="relative" zIndex="1">
          <Brand />
        </Box>

        <Stack as="nav" gap="1" flex="1" position="relative" zIndex="1">
          {NAV.map(({ key, labelKey, Icon }) => (
            <NavItem
              key={key}
              label={t(labelKey)}
              icon={<Icon />}
              active={view === key}
              onClick={() => onViewChange(key)}
            />
          ))}
        </Stack>

        {/*
          Frosted, for the same reason the block below it is: this lands on the
          saturated end of the artwork, where the muted text it contains measured
          1.28:1 against the background - invisible, not merely quiet. A surface
          of its own makes the contrast a property of the panel rather than a
          gamble on where the gradient happens to sit at this viewport height.
        */}
        <Box
          mb="4"
          position="relative"
          zIndex="1"
          p="2.5"
          borderRadius="card"
          borderWidth="1px"
          borderColor="rgba(255,253,249,0.7)"
          bg="rgba(255,253,249,0.82)"
          backdropFilter="blur(10px)"
        >
          <Preferences />
        </Box>

        {email ? (
          /*
            Frosted rather than transparent: this block lands on the saturated
            end of the artwork, where muted text would fall below contrast. The
            blur keeps the artwork legible behind it instead of covering it.
          */
          <Stack
            gap="1"
            p="2.5"
            borderRadius="card"
            borderWidth="1px"
            borderColor="rgba(255,253,249,0.7)"
            // 0.72 measured 4.16:1 for the muted text on it; 0.82 clears AA.
            bg="rgba(255,253,249,0.82)"
            backdropFilter="blur(10px)"
            position="relative"
            zIndex="1"
          >
            <Text fontSize="xs" color="fg.muted" px="1" truncate title={email}>
              {email}
            </Text>
            <Button size="xs" variant="ghost" justifyContent="flex-start" onClick={onSignOut}>
              {t('nav.signOut')}
            </Button>
          </Stack>
        ) : null}
      </Box>

      <Flex direction="column" flex="1" ml={{ base: '0', md: SIDEBAR_WIDTH }} minW="0">
        {/*
          Mobile keeps the same three destinations as a scrollable tab row rather
          than a drawer. A drawer hides the app's structure behind a tap and adds
          open/close state for no gain at this size.
        */}
        <Box
          display={{ base: 'block', md: 'none' }}
          borderBottomWidth="1px"
          borderColor="border"
          bg="bg.panel"
          position="sticky"
          top="0"
          zIndex="docked"
        >
          <Flex align="center" justify="space-between" px="4" py="3">
            <HStack gap="2.5" color="accent">
              <BrandMark size={22} />
              <Text fontWeight="semibold" color="fg" lineHeight="1">
                {t('brand.name')}
              </Text>
            </HStack>
            {email ? (
              <Button size="xs" variant="ghost" onClick={onSignOut}>
                {t('nav.signOut')}
              </Button>
            ) : null}
          </Flex>
          <HStack gap="1" px="3" pb="2" overflowX="auto">
            {NAV.map(({ key, labelKey, Icon }) => (
              <NavItem
                key={key}
                label={t(labelKey)}
                icon={<Icon size={16} />}
                active={view === key}
                onClick={() => onViewChange(key)}
                compact
              />
            ))}
          </HStack>
        </Box>

        <Box
          as="header"
          borderBottomWidth="1px"
          borderColor="border"
          px={{ base: '4', md: '8' }}
          py={{ base: '5', md: '6' }}
        >
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'stretch', sm: 'flex-end' }}
            justify="space-between"
            gap="3"
          >
            <Box>
              <Text
                fontSize="xs"
                fontWeight="semibold"
                letterSpacing="0.08em"
                textTransform="uppercase"
                color="fg.subtle"
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  fontSize={{ base: 'xl', md: '2xl' }}
                  fontWeight="semibold"
                  letterSpacing="-0.02em"
                  mt="1"
                  lineHeight="1.2"
                >
                  {subtitle}
                </Text>
              ) : null}
            </Box>
            {action ? <Box flexShrink="0">{action}</Box> : null}
          </Flex>
        </Box>

        <Box as="main" flex="1" px={{ base: '4', md: '8' }} py={{ base: '5', md: '7' }}>
          {children}
        </Box>

        <Box
          as="footer"
          borderTopWidth="1px"
          borderColor="border"
          px={{ base: '4', md: '8' }}
          py="4"
        >
          <Text fontSize="xs" color="fg.subtle">
            {t('auth.builtBy')}
          </Text>
        </Box>
      </Flex>
    </Flex>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
  compact = false,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      variant="ghost"
      size="sm"
      width={compact ? 'auto' : 'full'}
      justifyContent="flex-start"
      gap="2.5"
      flexShrink="0"
      fontWeight={active ? 'semibold' : 'normal'}
      color={active ? 'accent' : 'fg.muted'}
      bg={active ? 'accent.subtle' : 'transparent'}
      _hover={{ bg: active ? 'accent.subtle' : 'bg.subtle', color: active ? 'accent' : 'fg' }}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {label}
    </Button>
  );
}
