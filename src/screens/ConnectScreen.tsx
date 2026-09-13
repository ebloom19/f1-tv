import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { XtreamAccount, XtreamCredentials } from '../provider/xtream/types';
import { normalizeBaseUrl } from '../provider/xtream/urls';
import { FocusButton } from '../ui/FocusButton';
import { colors, font, radius, spacing } from '../ui/theme';

export interface ConnectScreenProps {
  /** Pre-filled values (from env.generated.ts or the account being edited). */
  initial?: Partial<XtreamCredentials> | null;
  /** Lines already in the pool, shown at the bottom. */
  accounts: XtreamAccount[];
  /** Runs `XtreamClient.authenticate()` for the given (already normalised) credentials. */
  authenticate: (creds: XtreamCredentials) => Promise<XtreamAccount>;
  /** Called with the verified account when the user keeps it ("Use this line" / "Add another line"). */
  onSave: (account: XtreamAccount) => void;
  /** Leave the screen (only offered when at least one line exists). */
  onDone: () => void;
}

export function formatExpiry(date: Date | null): string {
  if (!date) {
    return 'never';
  }
  return date.toISOString().slice(0, 10);
}

function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Credentials form for an Xtream line. "Test & save" authenticates and shows the
 * connection budget and expiry; the line can then be used or another one added.
 */
export function ConnectScreen({ initial, accounts, authenticate, onSave, onDone }: ConnectScreenProps) {
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<XtreamAccount | null>(null);

  const canSubmit = useMemo(
    () => baseUrl.trim().length > 0 && username.trim().length > 0 && password.length > 0 && !busy,
    [baseUrl, username, password, busy],
  );

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    const creds: XtreamCredentials = {
      baseUrl: normalizeBaseUrl(baseUrl),
      username: username.trim(),
      password,
      label: label.trim() || undefined,
    };
    setBusy(true);
    setError(null);
    setVerified(null);
    try {
      const account = await authenticate(creds);
      setVerified(account);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [authenticate, baseUrl, canSubmit, label, password, username]);

  const useLine = useCallback(() => {
    if (verified) {
      onSave(verified);
      onDone();
    }
  }, [onDone, onSave, verified]);

  const addAnother = useCallback(() => {
    if (verified) {
      onSave(verified);
      setVerified(null);
      setBaseUrl('');
      setUsername('');
      setPassword('');
      setLabel('');
    }
  }, [onSave, verified]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} testID="connect-screen">
      <Text style={styles.brand}>Pitwall</Text>
      <Text style={styles.title}>Connect your IPTV line</Text>
      <Text style={styles.subtitle}>Xtream Codes panel · credentials stay on this device</Text>

      <View style={styles.form}>
        <Field
          label="Server URL"
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="http://panel.example.com:80"
          autoCapitalize="none"
          keyboardType="url"
          testID="connect-url"
        />
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          testID="connect-username"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          secureTextEntry
          testID="connect-password"
        />
        <Field
          label="Label (optional)"
          value={label}
          onChangeText={setLabel}
          placeholder="Living room line"
          testID="connect-label"
        />

        <View style={styles.actions}>
          <FocusButton
            title={busy ? 'Testing…' : 'Test & save'}
            variant="primary"
            onPress={submit}
            disabled={!canSubmit}
            hasTVPreferredFocus
            testID="connect-save"
          />
          {accounts.length > 0 ? <FocusButton title="Back" variant="ghost" onPress={onDone} testID="connect-back" /> : null}
        </View>

        {error ? (
          <Text style={styles.error} testID="connect-error">
            {error}
          </Text>
        ) : null}

        {verified ? (
          <View style={styles.result} testID="connect-result">
            <Text style={styles.resultTitle}>Connected</Text>
            <Text style={styles.resultLine}>
              {`${verified.credentials.label ?? verified.credentials.baseUrl} · ${verified.maxConnections} connection${
                verified.maxConnections === 1 ? '' : 's'
              } · expires ${formatExpiry(verified.expiresAt)}`}
            </Text>
            <Text style={styles.resultHint}>
              {verified.maxConnections === 1
                ? 'One connection: Pitwall will switch feeds instead of showing tiles. Add a second line to unlock multiview.'
                : `Up to ${Math.min(3, verified.maxConnections)} pictures at once.`}
            </Text>
            <View style={styles.actions}>
              <FocusButton title="Use this line" variant="primary" onPress={useLine} testID="connect-use" />
              <FocusButton title="Add another line" onPress={addAnother} testID="connect-add" />
            </View>
          </View>
        ) : null}
      </View>

      {accounts.length > 0 ? (
        <View style={styles.pool} testID="connect-pool">
          <Text style={styles.poolTitle}>Lines in the pool</Text>
          {accounts.map((a, i) => (
            <Text key={`${a.credentials.baseUrl}/${a.credentials.username}/${i}`} style={styles.poolLine}>
              {`${a.credentials.label ?? a.credentials.baseUrl} · ${a.maxConnections} connection${
                a.maxConnections === 1 ? '' : 's'
              } · expires ${formatExpiry(a.expiresAt)}`}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'url';
  testID: string;
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, autoCapitalize, keyboardType, testID }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.band * 2,
    paddingVertical: spacing.band,
  },
  brand: {
    color: colors.accent,
    fontSize: font.size.md,
    fontWeight: font.abbrWeight,
    letterSpacing: 4,
  },
  title: {
    color: colors.ink,
    fontSize: font.size.xl,
    fontWeight: font.titleWeight,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.ink3,
    fontSize: font.size.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  form: {
    maxWidth: 820,
  },
  field: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    color: colors.ink2,
    fontSize: font.size.sm,
    fontWeight: font.titleWeight,
    marginBottom: spacing.sm,
  },
  input: {
    color: colors.ink,
    fontSize: font.size.md,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  inputFocused: {
    borderColor: colors.white,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.live,
    fontSize: font.size.sm,
    marginTop: spacing.lg,
  },
  result: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  resultTitle: {
    color: colors.ok,
    fontSize: font.size.md,
    fontWeight: font.titleWeight,
  },
  resultLine: {
    color: colors.ink,
    fontSize: font.size.sm,
    marginTop: spacing.sm,
  },
  resultHint: {
    color: colors.ink3,
    fontSize: font.size.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  pool: {
    marginTop: spacing.xl,
  },
  poolTitle: {
    color: colors.ink2,
    fontSize: font.size.sm,
    fontWeight: font.titleWeight,
    marginBottom: spacing.sm,
  },
  poolLine: {
    color: colors.ink3,
    fontSize: font.size.xs,
    marginBottom: spacing.xs,
  },
});

export default ConnectScreen;
