import { HStack, Text } from '@chakra-ui/react';
import { useT } from '../i18n';

export function BrandMark({ size = 26 }: { size?: number }) {
  const t = useT();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={t('brand.name')}
      style={{ flexShrink: 0 }}
    >
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <g stroke="white" strokeWidth="2.2" strokeLinecap="round">
        <line x1="9" y1="11" x2="23" y2="11" opacity="0.55" />
        <line x1="9" y1="16" x2="23" y2="16" opacity="0.8" />
        <line x1="9" y1="21" x2="17" y2="21" />
      </g>
    </svg>
  );
}

export function Brand({ size = 26 }: { size?: number }) {
  const t = useT();
  return (
    <HStack gap="2.5" color="accent">
      <BrandMark size={size} />
      <Text fontSize="md" fontWeight="semibold" letterSpacing="-0.015em" color="fg" lineHeight="1">
        {t('brand.name')}
      </Text>
    </HStack>
  );
}
