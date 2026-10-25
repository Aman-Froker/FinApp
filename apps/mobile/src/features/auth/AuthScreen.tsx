import { signInBodySchema, signUpBodySchema } from '@finapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, TextField } from '@/components';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { space } from '@/theme/tokens';

type Mode = 'sign-in' | 'sign-up';

const copy = {
  'sign-in': {
    title: 'Welcome back',
    body: 'Sign in to see your accounts.',
    action: 'Sign in',
    switchText: 'New here?',
    switchLabel: 'Create an account',
    switchHref: '/sign-up' as const,
    schema: signInBodySchema,
  },
  'sign-up': {
    title: 'Create your account',
    body: 'Your data stays yours. Every figure you see comes from your own records.',
    action: 'Create account',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchHref: '/sign-in' as const,
    schema: signUpBodySchema,
  },
};

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'email_taken') return 'An account with this email already exists.';
    if (err.code === 'invalid_credentials') return 'Email or password is incorrect.';
    if (err.status === 429) return 'Too many attempts. Try again in a few minutes.';
    return err.message;
  }
  return 'Could not reach the server. Check your connection and try again.';
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const c = copy[mode];
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = c.schema.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'email' | 'password';
        next[key] ??= issue.message;
      }
      setFieldError(next);
      return;
    }
    setFieldError({});
    setBusy(true);
    try {
      await (mode === 'sign-in' ? auth.signIn : auth.signUp)(parsed.data.email, parsed.data.password);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl }]}
      >
        <Text variant="display" accessibilityRole="header">
          {c.title}
        </Text>
        <Text variant="body" color="textSecondary">
          {c.body}
        </Text>
        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={fieldError.email}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={fieldError.password}
            helper={mode === 'sign-up' ? 'At least 10 characters.' : undefined}
            secureTextEntry
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {error ? (
            <Text variant="caption" color="negative" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button label={c.action} onPress={submit} loading={busy} fullWidth />
        </View>
        <View style={styles.switchRow}>
          <Text variant="caption" color="textSecondary">
            {c.switchText}
          </Text>
          <Button variant="ghost" label={c.switchLabel} onPress={() => router.replace(c.switchHref)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.md },
  form: { gap: space.lg, marginTop: space.xl },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.lg },
});
