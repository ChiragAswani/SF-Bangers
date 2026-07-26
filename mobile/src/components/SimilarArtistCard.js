import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ArtistAvatar from './ArtistAvatar';
import { colors, fonts, houseColorForName, radii, spacing } from '../theme';
import { formatShowDate } from '../utils/formatShowDate';
import { ticketSearchUrl } from '../utils/ticketSearchUrl';

function PreviewControl({ preview, isActive, isPlaying, progress, onTogglePlay, trim }) {
  // previews aren't fetched yet — leave the row's height reserved so the
  // card doesn't jump once they load in
  if (preview === undefined) {
    return <View style={styles.previewRow} />;
  }

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onTogglePlay();
  };

  if (!preview?.previewUrl) {
    return (
      <View style={styles.previewRow}>
        <View style={[styles.playBtn, styles.playBtnDisabled]}>
          <Ionicons name="musical-notes" size={13} color={colors.muted2} />
        </View>
        <Text style={styles.previewMuted}>No preview available</Text>
      </View>
    );
  }

  return (
    <Pressable onPress={handlePress} style={styles.previewRow} hitSlop={6}>
      <View style={[styles.playBtn, { backgroundColor: trim.bg }]}>
        <Ionicons
          name={isActive && isPlaying ? 'pause' : 'play'}
          size={14}
          color={trim.on}
          style={!(isActive && isPlaying) ? styles.playIconOffset : null}
        />
      </View>
      <View style={styles.previewTextCol}>
        <Text style={styles.previewTrackName} numberOfLines={1}>
          {preview.trackName || 'Preview a track'}
        </Text>
        <View style={styles.previewBarTrack}>
          <View
            style={[
              styles.previewBarFill,
              { width: `${isActive ? Math.min(100, Math.max(0, progress * 100)) : 0}%`, backgroundColor: trim.bg },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

export default function SimilarArtistCard({ item, image, preview, selected, isActive, isPlaying, progress, onToggle, onTogglePlay }) {
  const trim = houseColorForName(item.name);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onToggle();
  };

  const handleTicketPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(ticketSearchUrl(item.name)).catch(() => {});
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

      {item.matchedSeed ? (
        <View style={[styles.seedTag, { backgroundColor: `${trim.bg}18` }]}>
          <Ionicons name="sparkles" size={11} color={trim.bg} />
          <Text style={[styles.seedTagText, { color: trim.bg }]} numberOfLines={1}>
            Similar to {item.matchedSeed}
          </Text>
        </View>
      ) : null}

      {typeof item.score === 'number' && (
        <View style={styles.scoreBarTrack}>
          <View style={[styles.scoreBarFill, { width: `${item.score}%`, backgroundColor: trim.bg }]} />
        </View>
      )}

      <PreviewControl
        preview={preview}
        isActive={isActive}
        isPlaying={isPlaying}
        progress={progress}
        onTogglePlay={onTogglePlay}
        trim={trim}
      />

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

          <Pressable onPress={handleTicketPress} style={styles.showRow} hitSlop={6}>
            <Ionicons name="link-outline" size={13} color={trim.bg} />
            <Text style={[styles.ticketText, { color: trim.bg }]}>
              Find tickets{item.nextShow.price ? ` · ${item.nextShow.price}` : ''}
            </Text>
          </Pressable>

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
    width: '100%',
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
  name: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  score: { fontFamily: fonts.bodyBold, fontSize: 11 },
  seedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  seedTagText: { fontFamily: fonts.bodySemibold, fontSize: 10 },
  scoreBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 34,
  },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  playIconOffset: {
    marginLeft: 2,
  },
  previewTextCol: { flex: 1, gap: 4 },
  previewTrackName: { color: colors.ink, fontFamily: fonts.bodySemibold, fontSize: 12 },
  previewBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  previewBarFill: { height: 3 },
  previewMuted: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 12 },
  reason: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  showBlock: { gap: 3, marginTop: 2 },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  showText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12, flexShrink: 1 },
  showTextMuted: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 12 },
  ticketText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  moreShows: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 1 },
});
