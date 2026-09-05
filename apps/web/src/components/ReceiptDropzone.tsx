import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Alert, Badge, Box, Button, HStack, Image, Link, Stack, Text } from '@chakra-ui/react';
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MIME_TYPES,
  type ExtractedExpense,
  type ReceiptMimeType,
} from '@expense/shared';
import { ApiError } from '../api/client';
import { useExtractReceipt } from '../api/hooks';
import { useI18n, useT } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { CloseIcon, ReceiptIcon, UploadIcon } from './icons';
import { ScanningReceipt } from './ScanningReceipt';

type Props = {
  onExtracted: (extracted: ExtractedExpense) => void;
};

const MAX_MB = Math.round(RECEIPT_MAX_BYTES / 1024 / 1024);
const SAMPLE_URL = '/sample-receipt.jpg';

const toDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(blob);
  });

const isAcceptedType = (type: string): type is ReceiptMimeType =>
  (RECEIPT_MIME_TYPES as readonly string[]).includes(type);

type Preview = { url: string; name: string; isImage: boolean };

export function describeFailure(
  error: unknown,
  t: (key: TranslationKey) => string,
): { message: string | undefined; canRetry: boolean } {
  if (!(error instanceof ApiError)) return { message: undefined, canRetry: false };
  if (error.status === 422) return { message: error.message, canRetry: false };
  return { message: t('receipt.unavailable'), canRetry: error.status === 503 };
}

export function ReceiptDropzone({ onExtracted }: Props) {
  const t = useT();
  const { formatExpense } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<ExtractedExpense | undefined>(undefined);
  const [preview, setPreview] = useState<Preview | undefined>(undefined);

  const lastPayload = useRef<
    { fileName: string; mimeType: ReceiptMimeType; data: string } | undefined
  >(undefined);
  const extract = useExtractReceipt();

  const reset = () => {
    setSummary(undefined);
    setLocalError(undefined);
    extract.reset();
  };

  const send = async (blob: Blob, fileName: string, mimeType: ReceiptMimeType) => {
    let data: string;
    try {
      data = await toDataUrl(blob);
    } catch {
      setLocalError(t('receipt.unreadable'));
      return;
    }

    setPreview({ url: data, name: fileName, isImage: mimeType !== 'application/pdf' });
    lastPayload.current = { fileName, mimeType, data };

    extract.mutate(
      { fileName, mimeType, data },
      {
        onSuccess: (extracted) => {
          setSummary(extracted);
          onExtracted(extracted);
        },
      },
    );
  };

  const accept = async (file: File) => {
    reset();
    if (!isAcceptedType(file.type)) {
      setLocalError(t('receipt.wrongType'));
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setLocalError(t('receipt.tooLarge', { mb: MAX_MB }));
      return;
    }
    await send(file, file.name, file.type);
  };

  const handleInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await accept(file);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await accept(file);
  };

  const { message: failureMessage, canRetry } = describeFailure(extract.error, t);
  const notice = localError ?? failureMessage;

  const retry = () => {
    const payload = lastPayload.current;
    if (!payload) return;
    setLocalError(undefined);
    extract.mutate(payload, {
      onSuccess: (extracted) => {
        setSummary(extracted);
        onExtracted(extracted);
      },
    });
  };

  return (
    <Stack gap="3">
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_MIME_TYPES.join(',')}
        onChange={(event) => void handleInput(event)}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <Box
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void handleDrop(event)}
        borderWidth="1.5px"
        borderStyle="dashed"
        borderColor={dragging ? 'accent' : 'border.emphasized'}
        bg={dragging ? 'accent.subtle' : 'bg.subtle'}
        borderRadius="panel"
        px="5"
        py={preview && !extract.isPending ? '4' : '7'}
        textAlign="center"
        transition="background 120ms, border-color 120ms"
      >
        {preview && !extract.isPending ? (
          <HStack gap="4" textAlign="left" align="center">
            <Box
              width="14"
              height="16"
              borderRadius="control"
              borderWidth="1px"
              borderColor="border"
              overflow="hidden"
              bg="bg.panel"
              flexShrink="0"
              display="flex"
              alignItems="center"
              justifyContent="center"
              color="fg.subtle"
            >
              {preview.isImage ? (
                <Image src={preview.url} alt="" width="100%" height="100%" objectFit="cover" />
              ) : (
                <ReceiptIcon size={22} />
              )}
            </Box>
            <Stack gap="0.5" flex="1" minW="0">
              <Text fontSize="sm" fontWeight="medium" truncate>
                {preview.name}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                {extract.isPending
                  ? t('state.loading')
                  : summary
                    ? t('receipt.readSuccess')
                    : t('receipt.notRead')}
              </Text>
            </Stack>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setPreview(undefined);
                reset();
              }}
              aria-label={t('receipt.clear')}
            >
              <CloseIcon size={15} />
            </Button>
          </HStack>
        ) : (
          <Stack gap="3" align="center">
            <Box color="fg.subtle">
              <UploadIcon size={24} />
            </Box>
            <Stack gap="1">
              <Text fontSize="sm" fontWeight="medium">
                {t('receipt.dropTitle')}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                {t('receipt.dropHint', { mb: MAX_MB })}
              </Text>
            </Stack>
            <Button size="sm" onClick={() => inputRef.current?.click()}>
              {t('receipt.browse')}
            </Button>
          </Stack>
        )}
      </Box>

      {preview ? null : (
        <HStack gap="1.5" fontSize="xs" color="fg.muted" justify="center">
          <Text>{t('receipt.noReceipt')}</Text>
          <Link
            href={SAMPLE_URL}
            download="sample-receipt.jpg"
            color="accent"
            fontWeight="medium"
            textDecoration="underline"
            textUnderlineOffset="3px"
          >
            {t('receipt.downloadSample')}
          </Link>
          <Text>{t('receipt.andUpload')}</Text>
        </HStack>
      )}

      {extract.isPending && preview ? (
        <Box borderWidth="1px" borderColor="border" borderRadius="card" bg="bg.panel" px="4" py="3">
          <ScanningReceipt src={preview.url} isImage={preview.isImage} />
        </Box>
      ) : null}

      {notice ? (
        <Alert.Root status="warning" borderRadius="control" size="sm">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{notice}</Alert.Description>
            {canRetry && preview ? (
              <Box mt="2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={retry}
                  loading={extract.isPending}
                  loadingText={t('receipt.retrying')}
                >
                  {t('receipt.retry')}
                </Button>
              </Box>
            ) : null}
          </Alert.Content>
        </Alert.Root>
      ) : null}

      {summary && !extract.isPending ? (
        <HStack gap="2" flexWrap="wrap" fontSize="sm" color="fg.muted">
          <Badge
            size="sm"
            variant="subtle"
            colorPalette={summary.confidence >= 0.5 ? 'green' : 'orange'}
          >
            {summary.confidence >= 0.5 ? t('receipt.filled') : t('receipt.lowConfidence')}
          </Badge>
          {summary.amountCents === null ? (
            <Text>{t('receipt.noTotal')}</Text>
          ) : (
            <Text>
              <Text as="span" color="fg" fontWeight="medium">
                {formatExpense(summary.amountCents, summary.currency ?? 'USD', null).original}
              </Text>
              {summary.merchant ? t('receipt.at', { merchant: summary.merchant }) : ''} ·{' '}
              {t('form.confident', { percent: Math.round(summary.confidence * 100) })}
            </Text>
          )}
        </HStack>
      ) : null}
    </Stack>
  );
}
