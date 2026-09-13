import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Rect } from '../multiview';
import { colors, focus, font, radius, spacing } from './theme';

export interface OnboardTileProps {
  rect: Rect;
  /** Driver abbreviation shown in the header, e.g. "VER". */
  abbr: string;
  /** Header suffix, defaults to "ONBOARD". */
  kindLabel?: string;
  color: string;
  isAudio: boolean;
  hasTVPreferredFocus?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
  /** The video player (or placeholder) rendered inside the tile. */
  children?: React.ReactNode;
}

/**
 * Absolutely positioned tile in the right column. Header: team colour swatch,
 * "VER ONBOARD · LIVE"; an AUDIO badge when this tile is the audio source.
 */
export function OnboardTile({
  rect,
  abbr,
  kindLabel = 'ONBOARD',
  color,
  isAudio,
  hasTVPreferredFocus,
  onPress,
  onLongPress,
  testID,
  children,
}: OnboardTileProps) {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${abbr} ${kindLabel.toLowerCase()}`}
      accessibilityState={{ selected: isAudio }}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      onBlur={onBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      tvParallaxProperties={{ enabled: false }}
      style={[
        styles.tile,
        { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
        focused && styles.focused,
      ]}
    >
      <View style={styles.videoSlot}>{children}</View>
      <View style={styles.header} pointerEvents="none">
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={styles.headerText} numberOfLines={1}>
          <Text style={styles.abbr}>{abbr}</Text>
          {` ${kindLabel} · `}
          <Text style={styles.live}>LIVE</Text>
        </Text>
        {isAudio ? (
          <View style={styles.audioBadge} testID={testID ? `${testID}-audio` : undefined}>
            <Text style={styles.audioText}>AUDIO</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    backgroundColor: colors.black,
    borderWidth: focus.borderWidth,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  focused: {
    borderColor: focus.borderColor,
  },
  videoSlot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black,
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.scrim,
  },
  swatch: {
    width: 6,
    height: 22,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  headerText: {
    flex: 1,
    color: colors.ink,
    fontSize: font.size.xs,
    fontWeight: font.titleWeight,
    letterSpacing: 1,
  },
  abbr: {
    fontWeight: font.abbrWeight,
    color: colors.white,
  },
  live: {
    color: colors.live,
  },
  audioBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.ok,
  },
  audioText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: font.abbrWeight,
    letterSpacing: 1,
  },
});

export default OnboardTile;
