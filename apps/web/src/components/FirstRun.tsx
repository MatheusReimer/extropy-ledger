import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { ReceiptIcon, UploadIcon } from './icons';
import { useT } from '../i18n';

export function FirstRun() {
  const t = useT();
  const steps = [
    {
      icon: <UploadIcon size={17} />,
      title: t('firstRun.step1'),
      body: t('firstRun.step1Body'),
    },
    {
      icon: <ReceiptIcon size={17} />,
      title: t('firstRun.step2'),
      body: t('firstRun.step2Body'),
    },
    {
      icon: (
        <Box
          as="span"
          fontSize="md"
          fontWeight="semibold"
          lineHeight="1"
          width="17px"
          textAlign="center"
        >
          $
        </Box>
      ),
      title: t('firstRun.step3'),
      body: t('firstRun.step3Body'),
    },
  ];

  return (
    <Stack gap="6" py="2">
      <Stack gap="2" maxW="lg">
        <Text
          fontSize={{ base: 'xl', md: '2xl' }}
          fontWeight="semibold"
          letterSpacing="-0.02em"
          lineHeight="1.2"
        >
          {t('firstRun.title')}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {t('firstRun.body')}
        </Text>
      </Stack>

      <Stack gap="0" borderTopWidth="1px" borderColor="border.subtle">
        {steps.map((step, index) => (
          <HStack
            key={step.title}
            align="flex-start"
            gap="4"
            py="4"
            borderBottomWidth="1px"
            borderColor="border.subtle"
          >
            <HStack gap="3" flexShrink="0" color="accent" pt="0.5">
              <Text fontSize="sm" fontWeight="semibold" color="fg.subtle" width="4" lineHeight="1">
                {index + 1}
              </Text>
              {step.icon}
            </HStack>
            <Stack gap="1" minW="0">
              <Text fontSize="sm" fontWeight="medium">
                {step.title}
              </Text>
              <Text fontSize="sm" color="fg.muted">
                {step.body}
              </Text>
            </Stack>
          </HStack>
        ))}
      </Stack>
    </Stack>
  );
}
