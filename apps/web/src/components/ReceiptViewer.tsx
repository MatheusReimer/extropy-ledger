import { Box, Button, Dialog, Image, Link, Portal, Spinner, Stack, Text } from '@chakra-ui/react';
import type { ExpenseDto } from '@expense/shared';
import { useReceipt } from '../api/hooks';
import { ErrorState } from './StateViews';
import { useI18n, useT } from '../i18n';
import { formatDateShort } from '../lib/dates';

/**
 * Shows the document an expense came from.
 *
 * The file is fetched only once this opens - a base64 payload per row would be
 * absurd to prefetch - and cached afterwards, so reopening is instant.
 *
 * A PDF gets an object embed rather than an <img>, and a download link either
 * way: browsers disagree about inline PDF rendering, and a link that always
 * works beats a viewer that sometimes does.
 */
export function ReceiptViewer({
  expense,
  onClose,
}: {
  expense: ExpenseDto | undefined;
  onClose: () => void;
}) {
  const t = useT();
  const { formatExpense } = useI18n();
  const receipt = useReceipt(expense?.receiptId);
  const dataUrl = receipt.data ? `data:${receipt.data.mimeType};base64,${receipt.data.data}` : undefined;
  const isPdf = receipt.data?.mimeType === 'application/pdf';

  return (
    <Dialog.Root
      open={Boolean(expense)}
      onOpenChange={(event) => {
        if (!event.open) onClose();
      }}
      size="lg"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="panel">
            <Dialog.Header>
              <Stack gap="1">
                <Dialog.Title fontSize="md">{expense?.description}</Dialog.Title>
                {expense ? (
                  <Text fontSize="sm" color="fg.muted" fontWeight="normal">
                    {formatExpense(expense.amountCents, expense.currency, expense.baseCents).original}{' '}
                    · {formatDateShort(expense.date)}
                  </Text>
                ) : null}
              </Stack>
            </Dialog.Header>

            <Dialog.Body>
              {receipt.isPending ? (
                <Stack align="center" py="10" gap="3">
                  <Spinner size="lg" color="accent" borderWidth="2px" />
                  <Text fontSize="sm" color="fg.muted">
                    {t('receipt.fetching')}
                  </Text>
                </Stack>
              ) : null}

              {receipt.isError ? <ErrorState error={receipt.error} /> : null}

              {dataUrl ? (
                <Box
                  borderWidth="1px"
                  borderColor="border"
                  borderRadius="card"
                  overflow="hidden"
                  bg="bg.subtle"
                >
                  {isPdf ? (
                    // A plain element rather than `Box as="object"`: Chakra's
                    // polymorphic props do not model `data`/`type`, and casting
                    // past that would be fighting the types to no benefit.
                    <object
                      data={dataUrl}
                      type="application/pdf"
                      width="100%"
                      height="520"
                      aria-label={`Receipt for ${expense?.description ?? 'this expense'}`}
                    >
                      <Text fontSize="sm" color="fg.muted" p="4">
                        {t('receipt.noInlinePdf')}
                      </Text>
                    </object>
                  ) : (
                    <Image
                      src={dataUrl}
                      alt={`Receipt for ${expense?.description ?? 'this expense'}`}
                      width="100%"
                    />
                  )}
                </Box>
              ) : null}
            </Dialog.Body>

            <Dialog.Footer>
              {dataUrl && receipt.data ? (
                <Link
                  href={dataUrl}
                  download={receipt.data.fileName}
                  fontSize="sm"
                  color="accent"
                  fontWeight="medium"
                  mr="auto"
                  textDecoration="underline"
                  textUnderlineOffset="3px"
                >
                  {t('receipt.download')}
                </Link>
              ) : null}
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('form.cancel')}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
