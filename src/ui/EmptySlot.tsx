import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Rect } from '../multiview';
import { colors, focus, font, radius, spacing } from './theme';

export interface EmptySlotProps {
  rect: Rect;
  /** Slot position in the tile column (0-based). */
  index: number;
  locked: boolean;
  /** Total concurrent connections the line allows. */
  budget: number;
  onPress?: () => void;
  testID?: string;
}

export function lockedSlotText(index: number, budget: number): string {
  // Tile index i needs connection i + 2 (main occupies connection 1).
  return `Needs connection ${index + 2} · your line allows ${budget}`;
}

/**
 * Dashed placeholder in the tile column. Free slots invite the user to add a
 * driver; locked slots explain the connection budget.
 */
export function EmptySlot({ rect, index, locked, budget, onPress, testID }: EmptySlotProps) {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const id = testID ?? `empty-slot-${index}`;
  const frame = { left: rect.x, top: rect.y, width: rect.w, height: rect.h };

  if (locked) {
    return (
      <View testID={id} style={[styles.slot, styles.locked, frame]} accessibilityState={{ disabled: true }}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockedText}>{lockedSlotText(index, budget)}</Text>
      </View>
    );
  }

  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      tvParallaxProperties={{ enabled: false }}
      style={[styles.slot, frame, focused && styles.focused]}
    >
      <Text style={styles.plus}>+</Text>
      <Text style={styles.text}>Add a driver</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  locked: {
    borderColor: colors.line,
    opacity: 0.8,
  },
  focused: {
    borderStyle: 'solid',
    borderWidth: focus.borderWidth,
    borderColor: focus.borderColor,
  },
  plus: {
    color: colors.ink2,
    fontSize: font.size.xl,
    fontWeight: font.titleWeight,
    lineHeight: font.size.xl + 4,
  },
  text: {
    color: colors.ink2,
    fontSize: font.size.sm,
    fontWeight: font.titleWeight,
    marginTop: spacing.xs,
  },
  lockIcon: {
    fontSize: font.size.md,
    marginBottom: spacing.xs,
  },
  lockedText: {
    color: colors.ink3,
    fontSize: font.size.xs,
    fontWeight: font.bodyWeight,
    textAlign: 'center',
  },
});

export default EmptySlot;
