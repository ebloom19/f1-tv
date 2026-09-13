/**
 * Pitwall — personal F1 multiview for Apple TV / Google TV.
 *
 * No navigation library: this component switches between the three screens by state.
 * Credentials come from `src/config/env.generated.ts` (written by scripts/gen-env.js) or the
 * in-app Connect screen; accounts and the connection pool live in memory only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { buildCatalogue } from './src/catalogue/build';
import type { F1Catalogue } from './src/catalogue/types';
import { getConfiguredCredentials } from './src/config/env';
import type { SourceId } from './src/multiview/types';
import { ConnectionPool } from './src/provider/pool';
import { XtreamClient } from './src/provider/xtream/client';
import type { XtreamAccount, XtreamCredentials } from './src/provider/xtream/types';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { SessionHubScreen } from './src/screens/SessionHubScreen';
import { WatchScreen } from './src/screens/WatchScreen';
import type { WatchSelection } from './src/screens/WatchScreen';
import { colors, font } from './src/ui/theme';

export type Screen = 'boot' | 'connect' | 'hub' | 'watch';

export const USER_AGENT = Platform.OS === 'android' ? 'Pitwall/1.0 (AndroidTV)' : 'Pitwall/1.0 (AppleTV; tvOS)';

/** The slice of XtreamClient the app shell needs (lets tests inject a fake). */
export type XtreamClientLike = Pick<XtreamClient, 'authenticate' | 'getLiveStreams' | 'getLiveCategories'>;

export interface AppProps {
  /** Overrides `getConfiguredCredentials()`; pass `null` to force the Connect screen. */
  configuredCredentials?: XtreamCredentials | null;
  /** Client factory for API calls (auth + catalogue). Defaults to a real `XtreamClient`. */
  createClient?: (creds: XtreamCredentials) => XtreamClientLike;
}

interface WatchTarget {
  main: SourceId;
  docked: SourceId[];
}

function defaultCreateClient(creds: XtreamCredentials): XtreamClientLike {
  return new XtreamClient(creds, { userAgent: USER_AGENT });
}

export function App({ configuredCredentials, createClient = defaultCreateClient }: AppProps) {
  const [screen, setScreen] = useState<Screen>('boot');
  const [accounts, setAccounts] = useState<XtreamAccount[]>([]);
  const [catalogue, setCatalogue] = useState<F1Catalogue | null>(null);
  const [watch, setWatch] = useState<WatchTarget | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;

  const initialCreds = useMemo<XtreamCredentials | null>(
    () => (configuredCredentials === undefined ? getConfiguredCredentials() : configuredCredentials),
    [configuredCredentials],
  );

  const pool = useMemo(() => new ConnectionPool(accounts, { userAgent: USER_AGENT }), [accounts]);

  // Boot: authenticate the baked-in line automatically, else ask for one.
  useEffect(() => {
    let cancelled = false;
    if (!initialCreds) {
      setScreen('connect');
      return undefined;
    }
    createClientRef.current(initialCreds)
      .authenticate()
      .then(account => {
        if (!cancelled) {
          setAccounts([account]);
          setScreen('hub');
        }
      })
      .catch(err => {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
          setScreen('connect');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialCreds]);

  const authenticate = useCallback((creds: XtreamCredentials) => createClientRef.current(creds).authenticate(), []);

  const addAccount = useCallback((account: XtreamAccount) => {
    setAccounts(prev => {
      const key = `${account.credentials.baseUrl}|${account.credentials.username}`;
      const rest = prev.filter(a => `${a.credentials.baseUrl}|${a.credentials.username}` !== key);
      return [...rest, account];
    });
    setBootError(null);
  }, []);

  const loadCatalogue = useCallback(async () => {
    const primary = accounts[0];
    if (!primary) {
      throw new Error('No account configured');
    }
    const client = createClientRef.current(primary.credentials);
    const [streams, categories] = await Promise.all([client.getLiveStreams(), client.getLiveCategories()]);
    return buildCatalogue(streams, categories);
  }, [accounts]);

  const startWatch = useCallback((selection: WatchSelection) => {
    setWatch({ main: selection.main, docked: selection.docked ?? [] });
    setScreen('watch');
  }, []);

  const exitWatch = useCallback(() => {
    setWatch(null);
    setScreen('hub');
  }, []);

  const goHub = useCallback(() => setScreen('hub'), []);
  const goConnect = useCallback(() => setScreen('connect'), []);

  let body: React.ReactNode;
  switch (screen) {
    case 'boot':
      body = (
        <View style={styles.boot} testID="boot-screen">
          <Text style={styles.bootText}>Pitwall</Text>
        </View>
      );
      break;
    case 'connect':
      body = (
        <ConnectScreen
          initial={accounts.length ? null : initialCreds}
          accounts={accounts}
          authenticate={authenticate}
          onSave={addAccount}
          onDone={goHub}
        />
      );
      break;
    case 'watch':
      body =
        watch && catalogue ? (
          <WatchScreen
            pool={pool}
            catalogue={catalogue}
            initialMain={watch.main}
            initialDocked={watch.docked}
            onExit={exitWatch}
          />
        ) : null;
      break;
    default:
      body = (
        <SessionHubScreen
          accounts={accounts}
          budget={pool.budget}
          catalogue={catalogue}
          loadCatalogue={loadCatalogue}
          onCatalogue={setCatalogue}
          onWatch={startWatch}
          onSettings={goConnect}
        />
      );
  }

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      <View style={styles.root}>
        {body}
        {bootError && screen === 'connect' ? (
          <Text style={styles.bootError} testID="boot-error">
            {`Automatic sign-in failed: ${bootError}`}
          </Text>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  bootText: {
    color: colors.ink,
    fontSize: font.size.hero,
    fontWeight: font.abbrWeight,
    letterSpacing: 6,
  },
  bootError: {
    position: 'absolute',
    left: 96,
    bottom: 48,
    color: colors.warn,
    fontSize: font.size.sm,
  },
});

export default App;
