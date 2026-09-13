import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from './theme';

export interface ToastProps {
  message: string | null;
  testID?: string;
}

/** Transient message pill centred near the top of the screen. */
export function Toast({ message, testID = 'toast' }: ToastProps) {
  if (!message) {
    return null;
  }
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill} testID={testID} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: spacing.band,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  text: {
    color: colors.ink,
    fontSize: font.size.sm,
    fontWeight: font.titleWeight,
  },
});

export default Toast;
