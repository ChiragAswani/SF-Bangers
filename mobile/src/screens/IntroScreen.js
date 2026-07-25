import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import GlowBackground from '../components/GlowBackground';
import { PrimaryButton } from '../components/Buttons';
import { colors, fonts, house, spacing } from '../theme';

export default function IntroScreen({ onGetStarted }) {
  return (
    <View style={styles.stage}>
      <GlowBackground />
      <Animated.View entering={FadeInDown.duration(500)} style={styles.content}>
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: house[0].bg }]} />
          <View style={[styles.chip, { backgroundColor: house[1].bg }]} />
          <View style={[styles.chip, { backgroundColor: house[2].bg }]} />
          <View style={[styles.chip, { backgroundColor: house[4].bg }]} />
        </View>
        <Text style={styles.eyebrow}>SF Bangers</Text>
        <Text style={styles.hero}>Find your next favorite hidden gem</Text>
        <Text style={styles.subhero}>
          Tell us who you already love and we'll match you with similar artists — the low-key,
          under-the-radar ones included — who are already playing live in SF. Then go get tickets.
        </Text>
        <PrimaryButton
          label="Get Started"
          onPress={onGetStarted}
          icon={<Ionicons name="arrow-forward" size={16} color={colors.primaryInk} />}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.xs,
  },
  chip: {
    width: 22,
    height: 22,
    borderRadius: 6,
    transform: [{ rotate: '-4deg' }],
  },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hero: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 34,
    textAlign: 'center',
  },
  subhero: {
    color: colors.muted,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
});
