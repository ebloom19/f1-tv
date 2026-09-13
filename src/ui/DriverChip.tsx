import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, focus, font, radius, spacing } from './theme';

export type ChipState = 'idle' | 'docked' | 'main';

export interface DriverChipProps {
  /** Three-letter driver abbreviation (or short code for non-driver chips). */
  abbr: string;
  /** Secondary line — usually the driver's last name. */
  name: string;
  /** Team colour, drawn as a vertical bar on the left edge. */
  color: string;
  state?: ChipState;
  hasTVPreferredFocus?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onFocus?: () => void;
  testID?: string;
}

const STATE_LABEL: Record<ChipState, string | null> = {
  idle: null,
  docked: 'ON',
  main: 'MAIN',
};

/**
 * A rail chip. Focus scales the chip 1.08× and draws a white border (SPEC).
 */
export function DriverChip({
  abbr,
  name,
  color,
  state = 'idle',
  hasTVPreferredFocus,
  onPress,
  onLongPress,
  onFocus,
  testID,
}: DriverChipProps) {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocus?.();
  }, [onFocus]);
  const handleBlur = useCallback(() => setFocused(false), []);
  const badge = STATE_LABEL[state];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${abbr} ${name}`}
      accessibilityState={{ selected: state !== 'idle' }}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      tvParallaxProperties={{ enabled: false }}
      style={[
        styles.chip,
        state === 'docked' && styles.docked,
        state === 'main' && styles.main,
        focused && styles.focused,
        focused && { transform: [{ scale: focus.scale }] },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.body}>
        <Text style={styles.abbr} numberOfLines={1}>
          {abbr}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {badge ? (
        <View style={[styles.badge, state === 'main' && styles.badgeMain]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 168,
    height: 84,
    marginRight: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
    borderWidth: focus.borderWidth,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  docked: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
  },
  main: {
    backgroundColor: colors.panel,
    borderColor: colors.accent,
  },
  focused: {
    borderColor: focus.borderColor,
  },
  bar: {
    width: 8,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  abbr: {
    color: colors.ink,
    fontSize: font.size.lg,
    fontWeight: font.abbrWeight,
    letterSpacing: 1,
  },
  name: {
    color: colors.ink2,
    fontSize: font.size.xs,
    fontWeight: font.bodyWeight,
    marginTop: 2,
  },
  badge: {
    marginRight: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.line,
  },
  badgeMain: {
    backgroundColor: colors.accent,
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: font.titleWeight,
    letterSpacing: 1,
  },
});

export default DriverChip;
