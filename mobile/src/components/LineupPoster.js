import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, house, houseColorForName, spacing } from '../theme';
import { formatShowDate } from '../utils/formatShowDate';

// Text-only by design — no artist photos. Rendered off-screen for capture,
// and remote images may not have finished loading by the time the capture
// fires, which would bake broken image placeholders into the saved poster.
export default function LineupPoster({ items }) {
  return (
    <View style={styles.poster} collapsable={false}>
      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: house[0].bg }]} />
        <View style={[styles.chip, { backgroundColor: house[1].bg }]} />
        <View style={[styles.chip, { backgroundColor: house[2].bg }]} />
        <View style={[styles.chip, { backgroundColor: house[4].bg }]} />
      </View>

      <Text style={styles.eyebrow}>Gigly</Text>
      <Text style={styles.title}>My Lineup</Text>
      <Text style={styles.subtitle}>
        {items.length} new artist{items.length === 1 ? '' : 's'} to discover
      </Text>

      <View style={styles.divider} />

      <View style={styles.listWrap}>
        {items.map((item) => {
          const trim = houseColorForName(item.name);
          return (
            <View key={item.name} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: trim.bg }]} />
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowDate}>{item.nextShow ? formatShowDate(item.nextShow) : 'TBD'}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.divider} />
      <Text style={styles.footer}>Discover yours at getgigly.io</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: 360,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  chip: { width: 16, height: 16, borderRadius: 4, transform: [{ rotate: '-4deg' }] },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 30,
    marginTop: 4,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  divider: {
    height: 2,
    width: '100%',
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  listWrap: { width: '100%', gap: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowName: { flex: 1, color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowDate: { color: colors.muted, fontFamily: fonts.bodySemibold, fontSize: 12 },
  footer: {
    color: colors.muted2,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    marginTop: spacing.md,
  },
});
