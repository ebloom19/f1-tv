import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle, StyleProp } from 'react-native';
import { colors, focus, font, radius, spacing } from './theme';

export interface FocusButtonProps {
  title: string;
  onPress?: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
  variant?: 'primary' | 'default' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * TV-friendly button: scales up and gains a white border when focused by the remote.
 */
export function FocusButton({
  title,
  onPress,
  onLongPress,
  hasTVPreferredFocus,
  variant = 'default',
  disabled = false,
  style,
  testID,
}: FocusButtonProps) {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: focused }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      onBlur={onBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      tvParallaxProperties={{ enabled: false }}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        focused && styles.focused,
        focused && { transform: [{ scale: focus.scale }] },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, variant === 'primary' && styles.labelPrimary]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
    borderWidth: focus.borderWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.line,
  },
  focused: {
    borderColor: focus.borderColor,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    color: colors.ink,
    fontSize: font.size.md,
    fontWeight: font.titleWeight,
  },
  labelPrimary: {
    color: colors.white,
  },
});

export default FocusButton;
