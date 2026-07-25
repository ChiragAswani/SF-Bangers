import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ArtistAvatar from './ArtistAvatar';
import { colors, fonts, houseColorForName, radii, spacing } from '../theme';

function formatShowDate(show) {
  if (!show?.date) return show?.dayOfWeek || 'Date TBD';
  try {
    const d = new Date(`${show.date}T00:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (e) {
    return show.date;
  }
}

export default function SimilarArtistCard({ item, image, selected, onToggle }) {
  const trim = houseColorForName(item.name);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onToggle();
  };

  const handleTicketPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(item.nextShow.ticketLink).catch(() => {});
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, selected && { borderColor: trim.bg, backgroundColor: `${trim.bg}18` }]}
    >
      {selected && (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark-circle" size={20} color={trim.bg} />
        </View>
      )}

      <View style={styles.top}>
        <ArtistAvatar uri={image} name={item.name} size={48} />
        <View style={styles.headline}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {typeof item.score === 'number' && (
            <Text style={[styles.score, { color: trim.bg }]}>{item.score}% match</Text>
          )}
        </View>
      </View>

      {typeof item.score === 'number' && (
        <View style={styles.scoreBarTrack}>
          <View style={[styles.scoreBarFill, { width: `${item.score}%`, backgroundColor: trim.bg }]} />
        </View>
      )}

      {item.reason ? (
        <Text style={styles.reason} numberOfLines={2}>
          {item.reason}
        </Text>
      ) : null}

      {item.nextShow ? (
        <View style={styles.showBlock}>
          <View style={styles.showRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.muted} />
            <Text style={styles.showText}>{formatShowDate(item.nextShow)}</Text>
          </View>
          {item.nextShow.venue ? (
            <View style={styles.showRow}>
              <Ionicons name="location-outline" size={13} color={colors.muted} />
              <Text style={styles.showText} numberOfLines={1}>
                {item.nextShow.venue}
              </Text>
            </View>
          ) : null}

          {item.nextShow.ticketLink ? (
            <Pressable onPress={handleTicketPress} style={styles.showRow} hitSlop={6}>
              <Ionicons name="link-outline" size={13} color={trim.bg} />
              <Text style={[styles.ticketText, { color: trim.bg }]}>
                Buy tickets{item.nextShow.price ? ` · ${item.nextShow.price}` : ''}
              </Text>
            </Pressable>
          ) : item.nextShow.ticketLink === undefined ? (
            <View style={styles.showRow}>
              <Ionicons name="hourglass-outline" size={13} color={colors.muted} />
              <Text style={styles.showTextMuted}>Finding tickets…</Text>
            </View>
          ) : (
            <View style={styles.showRow}>
              <Ionicons name="close-circle-outline" size={13} color={colors.muted} />
              <Text style={styles.showTextMuted}>No tickets found</Text>
            </View>
          )}

          {item.showCount > 1 ? (
            <Text style={styles.moreShows}>
              +{item.showCount - 1} more show{item.showCount - 1 > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.showTextMuted}>No upcoming show found.</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: 6,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headline: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  score: { fontFamily: fonts.bodyBold, fontSize: 11 },
  scoreBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: 4,
  },
  reason: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  showBlock: { gap: 3, marginTop: 2 },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  showText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 11, flexShrink: 1 },
  showTextMuted: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 11 },
  ticketText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  moreShows: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 1 },
});
