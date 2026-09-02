import { useState, type FormEvent } from 'react';
import { Box, Button, Field, Flex, Input, Stack, Text } from '@chakra-ui/react';
import { loginSchema, parseOrFieldErrors, signupSchema, type FieldErrors } from '@expense/shared';
import { useLogin, useSignup } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import {
  Brand,
  ErrorState,
  Rise,
} from '../components';

import { useT } from '../i18n';

type Mode = 'login' | 'signup';

/**
 * The same schema on the client and the server.
 *
 * This is the concrete payoff of `packages/shared`: the rule "a password is at
 * least 10 characters" exists ONCE. Validating here is a courtesy (instant
 * feedback, no round-trip); the validation that counts is the server's, which
 * runs the same schema again in `parseInput`. The client is convenience, never
 * the security boundary.
 */
export function AuthPage() {
  const t = useT();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { signIn } = useAuth();
  const login = useLogin();
  const signup = useSignup();
  const active = mode === 'login' ? login : signup;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const schema = mode === 'login' ? loginSchema : signupSchema;
    const parsed = parseOrFieldErrors(schema, { email, password });

    if (!parsed.ok) {
      setFieldErrors(parsed.fields);
      return;
    }
    setFieldErrors({});

    active.mutate(parsed.data, {
      onSuccess: signIn,
      // A 422 from the server carries per-field errors; any other status falls
      // through to <ErrorState>, which knows how to explain a 401 or a network
      // failure.
      onError: (error) => {
        const fields = error instanceof Error && 'fields' in error ? error.fields : undefined;
        if (fields) setFieldErrors(fields as FieldErrors);
      },
    });
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setFieldErrors({});
    login.reset();
    signup.reset();
  };

  return (
    <Flex minH="100dvh" bg="bg">
      {/*
        The artwork panel is the first thing anyone sees, and it is hidden below
        lg rather than shrunk. A decorative half-screen on a phone would push the
        actual form below the fold to show a picture.
      */}
      <Box
        display={{ base: 'none', lg: 'block' }}
        flex="1"
        position="relative"
        backgroundImage="url('/sidebar-art.jpg')"
        backgroundSize="cover"
        backgroundPosition="center"
        borderRightWidth="1px"
        borderColor="border"
      >
        <Stack position="absolute" inset="0" p="10" justify="space-between">
          <Brand size={30} />
          <Stack gap="3" maxW="sm">
            <Text fontSize="2xl" fontWeight="semibold" letterSpacing="-0.02em" lineHeight="1.25">
              {t('auth.pitchTitle')}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {t('auth.pitchBody')}
            </Text>
          </Stack>
        </Stack>
      </Box>

      <Flex flex="1" align="center" justify="center" px="4" py="10" minW="0">
      <Rise>
      <Stack gap="8" w="full" maxW="sm">
        <Stack gap="5" align="center" textAlign="center">
          <Box display={{ base: 'block', lg: 'none' }}>
            <Brand size={34} />
          </Box>
          <Stack gap="2">
            <Text fontSize="2xl" fontWeight="semibold" letterSpacing="-0.02em" lineHeight="1.2">
              {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {t('auth.tagline')}
            </Text>
          </Stack>
        </Stack>

        <Box
          borderWidth="1px"
          borderColor="border"
          borderRadius="panel"
          bg="bg.panel"
          px={{ base: '5', sm: '7' }}
          py="7"
        >
          <Stack gap="5">
            {active.isError && !Object.keys(fieldErrors).length ? (
              <ErrorState error={active.error} />
            ) : null}

            <form onSubmit={submit} noValidate>
              <Stack gap="4">
                <Field.Root invalid={Boolean(fieldErrors['email'])}>
                  <Field.Label fontSize="sm">{t('auth.email')}</Field.Label>
                  <Input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                  <Field.ErrorText>{fieldErrors['email']}</Field.ErrorText>
                </Field.Root>

                <Field.Root invalid={Boolean(fieldErrors['password'])}>
                  <Field.Label fontSize="sm">{t('auth.password')}</Field.Label>
                  <Input
                    type="password"
                    name="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  {mode === 'signup' && !fieldErrors['password'] ? (
                    <Field.HelperText>{t('auth.passwordHint')}</Field.HelperText>
                  ) : null}
                  <Field.ErrorText>{fieldErrors['password']}</Field.ErrorText>
                </Field.Root>

                <Button
                  type="submit"
                  
                  loading={active.isPending}
                  w="full"
                  mt="1"
                >
                  {mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Box>

        <Text fontSize="sm" color="fg.muted" textAlign="center">
          {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
          <Button
            variant="plain"
            size="sm"
            
            height="auto"
            padding="0"
            fontWeight="medium"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? t('auth.signUp') : t('auth.signIn')}
          </Button>
        </Text>

        <Text fontSize="xs" color="fg.subtle" textAlign="center">
          {t('auth.builtBy')}
        </Text>
      </Stack>
      </Rise>
      </Flex>
    </Flex>
  );
}
