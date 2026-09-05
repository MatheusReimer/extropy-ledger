import { Box, HStack, Image, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useT, type TranslationKey } from '../i18n';

const STAGE_KEYS = [
  'receipt.stageReading',
  'receipt.stageMerchant',
  'receipt.stageTotal',
  'receipt.stageCategory',
] as const satisfies readonly TranslationKey[];

const STAGE_MS = 1400;

export function ScanningReceipt({ src, isImage }: { src: string; isImage: boolean }) {
  const t = useT();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setStage((current) => Math.min(current + 1, STAGE_KEYS.length - 1)),
      STAGE_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <HStack gap="5" align="center" py="1">
      <Box
        position="relative"
        width="20"
        height="24"
        borderRadius="card"
        borderWidth="1px"
        borderColor="border"
        overflow="hidden"
        bg="bg.panel"
        flexShrink="0"
      >
        {isImage ? (
          <Image src={src} alt="" width="100%" height="100%" objectFit="cover" opacity="0.9" />
        ) : (
          <Box position="absolute" inset="0" bg="bg.subtle" />
        )}

        <Box
          position="absolute"
          insetX="0"
          height="45%"
          bgGradient="to-b"
          gradientFrom="transparent"
          gradientTo="transparent"
          gradientVia="accent.muted"
          animationName="scan"
          animationDuration="1.9s"
          animationTimingFunction="cubic-bezier(0.4, 0, 0.6, 1)"
          animationIterationCount="infinite"
        />
        <Box
          position="absolute"
          insetX="0"
          height="2px"
          bg="accent"
          opacity="0.55"
          animationName="scanline"
          animationDuration="1.9s"
          animationTimingFunction="cubic-bezier(0.4, 0, 0.6, 1)"
          animationIterationCount="infinite"
        />
      </Box>

      <Stack gap="2" minW="0" flex="1">
        {STAGE_KEYS.map((key, index) => (
          <HStack key={key} gap="2.5" opacity={index <= stage ? 1 : 0.35}>
            <Box
              width="1.5"
              height="1.5"
              borderRadius="full"
              flexShrink="0"
              bg={index < stage ? 'accent' : index === stage ? 'accent' : 'border.emphasized'}
              animationName={index === stage ? 'pulse' : undefined}
              animationDuration="1.1s"
              animationIterationCount="infinite"
            />
            <Text
              fontSize="sm"
              color={index === stage ? 'fg' : 'fg.muted'}
              fontWeight={index === stage ? 'medium' : 'normal'}
              truncate
            >
              {t(key)}
            </Text>
          </HStack>
        ))}
      </Stack>
    </HStack>
  );
}
