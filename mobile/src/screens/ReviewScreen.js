import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { colors, fonts, houseColorForName, radii, spacing } from '../theme';

export default function ReviewScreen({
  artists,
  onBack,
  onGenerate,
  onConnectAndGenerate,
  onSkip,
  spotifyConnected,
  generating,
  error,
}) {
  return (
    <View style={styles.stage}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={16} color={colors.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <Text style={styles.eyebrow}>Your mix</Text>
      <Text style={styles.title}>{artists.length} artists, one song each</Text>

      <ScrollView contentContainerStyle={styles.chipWrap}>
        {artists.map((name) => {
          const trim = houseColorForName(name);
          return (
            <View style={[styles.chip, { borderColor: trim.bg, backgroundColor: `${trim.bg}1a` }]} key={name}>
              <Text style={[styles.chipText, { color: colors.ink }]}>{name}</Text>
            </View>
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {spotifyConnected ? (
          <PrimaryButton
            label="Generate Playlist"
            onPress={onGenerate}
            loading={generating}
            icon={<FontAwesome name="spotify" size={16} color={colors.primaryInk} />}
          />
        ) : (
          <>
            <PrimaryButton
              label="Connect Spotify to Save"
              onPress={onConnectAndGenerate}
              loading={generating}
              icon={<FontAwesome name="spotify" size={16} color={colors.primaryInk} />}
            />
            <GhostButton label="Skip — just show me tickets" onPress={onSkip} disabled={generating} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.sm, alignSelf: 'flex-start' },
  backText: { color: colors.ink, fontFamily: fonts.bodySemibold, fontSize: 14 },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 24, marginTop: 4, marginBottom: spacing.lg },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  error: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 13, textAlign: 'center', marginTop: spacing.md },
  actions: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
});
