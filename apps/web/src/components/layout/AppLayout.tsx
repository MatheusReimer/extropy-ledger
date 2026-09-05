import { Box, Button, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Brand, BrandMark } from '../Brand';
import { useT, type TranslationKey } from '../../i18n';
import { Preferences } from '../Preferences';
import { SidebarWaves } from '../SidebarWaves';
import { CategoriesIcon, OverviewIcon } from '../icons';

export type ViewKey = 'overview' | 'categories';

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
        backgroundImage="url('/sidebar-art.jpg')"
        backgroundSize="cover"
        backgroundPosition="bottom center"
        backgroundRepeat="no-repeat"
        overflow="hidden"
      >
        <SidebarWaves />

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
          <Stack
            gap="1"
            p="2.5"
            borderRadius="card"
            borderWidth="1px"
            borderColor="rgba(255,253,249,0.7)"
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
          <Flex align="center" gap="2" px="3" pb="2">
            <HStack gap="1" flex="1" minW="0" overflowX="auto">
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
            <Preferences inline />
          </Flex>
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
