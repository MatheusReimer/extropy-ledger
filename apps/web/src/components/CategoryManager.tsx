import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, HStack, Input, Stack, Text, Wrap } from '@chakra-ui/react';
import {
  FALLBACK_CATEGORY,
  createCategorySchema,
  parseOrFieldErrors,
  renameCategorySchema,
  type CategoryDto,
  type FieldErrors,
} from '@expense/shared';
import { ApiError } from '../api/client';
import { useCreateCategory, useDeleteCategory, useRenameCategory } from '../api/hooks';
import { useT } from '../i18n';
import { CloseIcon, EditIcon } from './icons';
import { ErrorState } from './StateViews';

const FALLBACK_KEY = FALLBACK_CATEGORY.toLowerCase();

const isProtected = (category: CategoryDto): boolean =>
  !category.isCustom && category.name.toLowerCase() === FALLBACK_KEY;

export function CategoryManager({ categories }: { categories: CategoryDto[] }) {
  const t = useT();
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>(undefined);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);

  const create = useCreateCategory();
  const rename = useRenameCategory();
  const remove = useDeleteCategory();

  const startEditing = (category: CategoryDto) => {
    setEditingId(category.id);
    setDraft(category.name);
    setDraftError(undefined);
    setRemoveError(undefined);
  };

  const stopEditing = () => {
    setEditingId(undefined);
    setDraft('');
    setDraftError(undefined);
  };

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
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setFieldErrors({ name: error.message });
        }
      },
    });
  };

  const submitRename = (event: FormEvent, id: string) => {
    event.preventDefault();
    const parsed = parseOrFieldErrors(renameCategorySchema, { name: draft });
    if (!parsed.ok) {
      setDraftError(parsed.fields['name']);
      return;
    }

    rename.mutate(
      { id, name: parsed.data.name },
      {
        onSuccess: stopEditing,
        onError: (error) => {
          setDraftError(error instanceof ApiError ? error.message : String(error));
        },
      },
    );
  };

  const removeCategory = (id: string) => {
    setRemoveError(undefined);
    remove.mutate(id, {
      onError: (error) => {
        setRemoveError(error instanceof ApiError ? error.message : String(error));
      },
    });
  };

  const conflictHandled = create.isError && Boolean(fieldErrors['name']);

  return (
    <Stack gap="4" w="full">
      <Wrap gap="2">
        {categories.map((category) =>
          editingId === category.id ? (
            <form key={category.id} onSubmit={(event) => submitRename(event, category.id)}>
              <Field.Root invalid={Boolean(draftError)}>
                <HStack gap="1" align="flex-start">
                  <Stack gap="1">
                    <Input
                      size="xs"
                      autoFocus
                      w="40"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') stopEditing();
                      }}
                    />
                    <Field.ErrorText fontSize="xs">{draftError}</Field.ErrorText>
                  </Stack>
                  <Button size="xs" type="submit" variant="outline" loading={rename.isPending}>
                    {t('categories.saveName')}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={stopEditing}>
                    {t('categories.cancelRename')}
                  </Button>
                </HStack>
              </Field.Root>
            </form>
          ) : (
            <Badge
              key={category.id}
              size="sm"
              variant={category.isCustom ? 'solid' : 'subtle'}
              colorPalette={category.isCustom ? 'orange' : 'gray'}
              borderRadius="full"
              pl="2.5"
              pr={isProtected(category) ? '2.5' : '1'}
              gap="1"
              {...(isProtected(category) ? { title: t('categories.protected') } : {})}
            >
              {category.name}
              {isProtected(category) ? null : (
                <>
                  <Button
                    size="2xs"
                    variant="ghost"
                    px="1"
                    minW="auto"
                    aria-label={`${t('categories.rename')} ${category.name}`}
                    title={t('categories.rename')}
                    onClick={() => startEditing(category)}
                  >
                    <EditIcon size={10} />
                  </Button>
                  <Button
                    size="2xs"
                    variant="ghost"
                    px="1"
                    minW="auto"
                    colorPalette="red"
                    aria-label={`${t('categories.remove')} ${category.name}`}
                    title={t('categories.remove')}
                    loading={remove.isPending && remove.variables === category.id}
                    onClick={() => removeCategory(category.id)}
                  >
                    <CloseIcon size={10} />
                  </Button>
                </>
              )}
            </Badge>
          ),
        )}
      </Wrap>

      {removeError ? (
        <Text fontSize="sm" color="red.fg">
          {removeError}
        </Text>
      ) : null}

      {create.isError && !conflictHandled ? <ErrorState error={create.error} /> : null}

      <form onSubmit={submit} noValidate>
        <Field.Root invalid={Boolean(fieldErrors['name'])}>
          <HStack align="flex-start" gap="2" maxW="md">
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
