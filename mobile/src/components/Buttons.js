import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radii, spacing } from '../theme';

const VARIANTS = {
  primary: { container: 'primary', text: 'primaryText', spinner: colors.primaryInk },
  spotify: { container: 'spotify', text: 'spotifyText', spinner: '#FFFFFF' },
  ghost: { container: 'ghost', text: 'ghostText', spinner: colors.ink },
};

function Button({ variant = 'primary', label, onPress, icon, loading, disabled }) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    Haptics.selectionAsync().catch(() => {});
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[v.container],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={styles[v.text]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export const PrimaryButton = (props) => <Button variant="primary" {...props} />;
export const SpotifyButton = (props) => <Button variant="spotify" {...props} />;
export const GhostButton = (props) => <Button variant="ghost" {...props} />;

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 150,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primary: { backgroundColor: colors.primary, borderColor: colors.primaryInk },
  primaryText: { color: colors.primaryInk, fontFamily: fonts.displaySemibold, fontSize: 16 },
  spotify: { backgroundColor: colors.spotify, borderColor: colors.spotifyDark },
  spotifyText: { color: '#FFFFFF', fontFamily: fonts.displaySemibold, fontSize: 16 },
  ghost: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  ghostText: { color: colors.ink, fontFamily: fonts.displaySemibold, fontSize: 16 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
