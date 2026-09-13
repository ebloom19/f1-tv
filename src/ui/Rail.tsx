import React from 'react';
import { ScrollView, StyleSheet, Text, TVFocusGuideView, View } from 'react-native';
import type { Rect } from '../multiview';
import { colors, font, spacing } from './theme';

export interface RailProps {
  rect: Rect;
  title: string;
  hint: string;
  testID?: string;
  children?: React.ReactNode;
}

/**
 * Bottom band: title, hint text and a horizontally scrolling row of chips.
 * The chips live inside a `TVFocusGuideView` with `autoFocus` so the remote
 * lands on the first chip when the band gains focus.
 */
export function Rail({ rect, title, hint, testID = 'rail', children }: RailProps) {
  return (
    <View
      testID={testID}
      style={[styles.band, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint} numberOfLines={1}>
          {hint}
        </Text>
      </View>
      <TVFocusGuideView autoFocus style={styles.guide}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="always"
        >
          {children}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.band,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: font.size.md,
    fontWeight: font.titleWeight,
    letterSpacing: 2,
  },
  hint: {
    flex: 1,
    textAlign: 'right',
    color: colors.ink3,
    fontSize: font.size.sm,
    fontWeight: font.bodyWeight,
    marginLeft: spacing.lg,
  },
  guide: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.band,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
});

export default Rail;
