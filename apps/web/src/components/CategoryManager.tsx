import { useState, type FormEvent } from 'react';
import { Button, Field, HStack, Input, Stack } from '@chakra-ui/react';
import {
  createCategorySchema,
  parseOrFieldErrors,
  type CategoryDto,
  type FieldErrors,
} from '@expense/shared';
import { ApiError } from '../api/client';
import { useCreateCategory } from '../api/hooks';
import { useT } from '../i18n';
import { ErrorState } from './StateViews';

/**
 * Only the add-a-category form.
 *
 * The list of existing categories lives on the page beside it, because it is
 * read far more often than it is added to - and a component that both lists and
 * mutates ends up owning layout decisions that belong to the page.
 */
export function CategoryManager({ categories }: { categories: CategoryDto[] }) {
  const t = useT();
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const create = useCreateCategory();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseOrFieldErrors(createCategorySchema, { name });
    if (!parsed.ok) {
      setFieldErrors(parsed.fields);
      return;
    }
    setFieldErrors({});

    create.mutate(parsed.data, {
      onSuccess: () => setName(''),
      // 409 is a FIELD error ("already exists"), not a page-level alert: it
      // belongs on the input that caused the conflict.
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setFieldErrors({ name: error.message });
        }
      },
    });
  };

  const conflictHandled = create.isError && Boolean(fieldErrors['name']);

  return (
    <Stack gap="3" w="full" maxW="md">
      {create.isError && !conflictHandled ? <ErrorState error={create.error} /> : null}

      <form onSubmit={submit} noValidate>
        <Field.Root invalid={Boolean(fieldErrors['name'])}>
          <HStack align="flex-start" gap="2">
            <Stack gap="1" flex="1">
              <Input
                size="sm"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('categories.newPlaceholder', { count: categories.length })}
              />
              <Field.ErrorText>{fieldErrors['name']}</Field.ErrorText>
            </Stack>
            <Button size="sm" type="submit" variant="outline" loading={create.isPending}>
              {t('categories.add')}
            </Button>
          </HStack>
        </Field.Root>
      </form>
    </Stack>
  );
}
