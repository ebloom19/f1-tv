import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TVFocusGuideView, View } from 'react-native';
import type { DriverEntry, F1Catalogue, F1Channel } from '../catalogue/types';
import { makeSourceId } from '../multiview/types';
import type { SourceId } from '../multiview/types';
import type { XtreamAccount } from '../provider/xtream/types';
import { DriverChip } from '../ui/DriverChip';
import { FocusButton } from '../ui/FocusButton';
import { colors, font, radius, spacing } from '../ui/theme';
import { formatExpiry } from './ConnectScreen';
import type { WatchSelection } from './WatchScreen';

export interface SessionHubScreenProps {
  accounts: XtreamAccount[];
  /** Σ maxConnections across the pool. */
  budget: number;
  catalogue: F1Catalogue | null;
  /** Fetches streams + categories and builds the catalogue (called on mount when none is cached). */
  loadCatalogue: () => Promise<F1Catalogue>;
  onCatalogue: (catalogue: F1Catalogue) => void;
  onWatch: (selection: WatchSelection) => void;
  onSettings: () => void;
}

export function accountLine(accounts: XtreamAccount[], budget: number): string {
  const label = accounts.map(a => a.credentials.label ?? a.credentials.baseUrl).join(' + ') || 'No line';
  const expiry = accounts.reduce<Date | null>((soonest, a) => {
    if (!a.expiresAt) {
      return soonest;
    }
    return !soonest || a.expiresAt < soonest ? a.expiresAt : soonest;
  }, null);
  return `${label} · ${budget} connection${budget === 1 ? '' : 's'} · expires ${formatExpiry(expiry)}`;
}

/** What to watch when the user picks a driver (or data screen) from the hub. */
export function selectionFor(catalogue: F1Catalogue, budget: number, id: SourceId): WatchSelection {
  const world = catalogue.defaultWorldFeed ? makeSourceId('world', catalogue.defaultWorldFeed.streamId) : null;
  if (budget <= 1 || !world) {
    return { main: id };
  }
  return { main: world, docked: [id] };
}

function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Landing screen: account line, "Watch" hero for the default world feed, alternative world
 * feeds, the 20-driver grid, data screens and Settings.
 */
export function SessionHubScreen({
  accounts,
  budget,
  catalogue,
  loadCatalogue,
  onCatalogue,
  onWatch,
  onSettings,
}: SessionHubScreenProps) {
  const [loading, setLoading] = useState(catalogue === null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (catalogue && reloadTick === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCatalogue()
      .then(c => {
        if (!cancelled && mounted.current) {
          onCatalogue(c);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled && mounted.current) {
          setError(errorText(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // Reload only on mount / explicit retry, not when the parent hands back the catalogue we produced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick]);

  const retry = useCallback(() => setReloadTick(t => t + 1), []);

  const watchWorld = useCallback(
    (ch: F1Channel) => onWatch({ main: makeSourceId('world', ch.streamId) }),
    [onWatch],
  );
  const watchDriver = useCallback(
    (d: DriverEntry) => {
      if (catalogue) {
        onWatch(selectionFor(catalogue, budget, makeSourceId('driver', d.abbr)));
      }
    },
    [budget, catalogue, onWatch],
  );
  const watchData = useCallback(
    (ch: F1Channel) => {
      if (catalogue) {
        onWatch(selectionFor(catalogue, budget, makeSourceId('data', ch.streamId)));
      }
    },
    [budget, catalogue, onWatch],
  );

  const defaultWorld = catalogue?.defaultWorldFeed ?? null;
  const altWorlds = catalogue ? catalogue.worldFeeds.filter(c => c !== defaultWorld) : [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} testID="hub-screen">
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>Pitwall</Text>
          <Text style={styles.accountLine} testID="hub-account">
            {accountLine(accounts, budget)}
          </Text>
        </View>
        <FocusButton title="Settings" variant="ghost" onPress={onSettings} testID="hub-settings" />
      </View>

      {loading ? (
        <View style={styles.status} testID="hub-loading">
          <Text style={styles.statusText}>Loading channels…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.status} testID="hub-error">
          <Text style={styles.errorText}>{`Could not load channels: ${error}`}</Text>
          <FocusButton title="Retry" variant="primary" onPress={retry} hasTVPreferredFocus testID="hub-retry" />
        </View>
      ) : null}

      {catalogue ? (
        <>
          <TVFocusGuideView autoFocus style={styles.hero}>
            <View style={styles.heroText}>
              <Text style={styles.heroKicker}>WORLD FEED</Text>
              <Text style={styles.heroTitle}>{defaultWorld ? defaultWorld.label : 'No world feed found'}</Text>
              <Text style={styles.heroHint}>
                {budget <= 1
                  ? 'Single connection: pick any feed, Select switches between them.'
                  : `Up to ${Math.min(3, budget)} pictures: add onboards from the rail.`}
              </Text>
            </View>
            <FocusButton
              title="Watch"
              variant="primary"
              disabled={!defaultWorld}
              hasTVPreferredFocus
              onPress={() => defaultWorld && watchWorld(defaultWorld)}
              style={styles.heroButton}
              testID="hub-watch"
            />
          </TVFocusGuideView>

          {altWorlds.length ? (
            <Section title="Other world feeds">
              <View style={styles.row}>
                {altWorlds.map(ch => (
                  <FocusButton
                    key={ch.streamId}
                    title={ch.label}
                    onPress={() => watchWorld(ch)}
                    style={styles.rowButton}
                    testID={`hub-world-${ch.streamId}`}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          <Section title={`Onboards · ${catalogue.drivers.length} drivers`}>
            <TVFocusGuideView autoFocus style={styles.grid} testID="hub-drivers">
              {catalogue.drivers.map(d => (
                <View key={d.abbr} style={styles.gridCell}>
                  <DriverChip
                    abbr={d.abbr}
                    name={d.lastName}
                    color={d.color}
                    onPress={() => watchDriver(d)}
                    testID={`hub-driver-${d.abbr}`}
                  />
                </View>
              ))}
            </TVFocusGuideView>
          </Section>

          {catalogue.data.length ? (
            <Section title="Data screens">
              <View style={styles.row}>
                {catalogue.data.map(ch => (
                  <FocusButton
                    key={ch.streamId}
                    title={ch.label}
                    onPress={() => watchData(ch)}
                    style={styles.rowButton}
                    testID={`hub-data-${ch.streamId}`}
                  />
                ))}
              </View>
            </Section>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerText: {
    flex: 1,
  },
  brand: {
    color: colors.ink,
    fontSize: font.size.xl,
    fontWeight: font.abbrWeight,
    letterSpacing: 4,
  },
  accountLine: {
    color: colors.ink3,
    fontSize: font.size.sm,
    marginTop: spacing.xs,
  },
  status: {
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  statusText: {
    color: colors.ink2,
    fontSize: font.size.md,
  },
  errorText: {
    color: colors.live,
    fontSize: font.size.sm,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  heroText: {
    flex: 1,
  },
  heroKicker: {
    color: colors.live,
    fontSize: font.size.xs,
    fontWeight: font.titleWeight,
    letterSpacing: 3,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: font.size.lg,
    fontWeight: font.titleWeight,
    marginTop: spacing.xs,
  },
  heroHint: {
    color: colors.ink3,
    fontSize: font.size.sm,
    marginTop: spacing.xs,
  },
  heroButton: {
    minWidth: 220,
    paddingVertical: spacing.md,
    marginLeft: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.ink2,
    fontSize: font.size.sm,
    fontWeight: font.titleWeight,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  rowButton: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    marginBottom: spacing.md,
  },
});

export default SessionHubScreen;
