import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import ArtistAvatar from '../components/ArtistAvatar';
import LineupPoster from '../components/LineupPoster';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { colors, fonts, houseColorForName, radii, spacing } from '../theme';
import { formatShowDate } from '../utils/formatShowDate';
import { ticketSearchUrl } from '../utils/ticketSearchUrl';

function LineupCard({ item, onRemove }) {
  const trim = houseColorForName(item.name);

  const handleRemove = () => {
    Haptics.selectionAsync().catch(() => {});
    onRemove();
  };

  const handleTicketPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(ticketSearchUrl(item.name)).catch(() => {});
  };

  return (
    <View style={[styles.card, { borderColor: trim.bg }]}>
      <Pressable onPress={handleRemove} style={styles.removeBadge} hitSlop={8}>
        <Ionicons name="close" size={13} color="#FFFFFF" />
      </Pressable>

      <View style={styles.cardTop}>
        <ArtistAvatar uri={item.image} name={item.name} size={52} />
        <View style={styles.cardHeadline}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.matchedSeed ? (
            <Text style={[styles.cardSeed, { color: trim.bg }]} numberOfLines={1}>
              Similar to {item.matchedSeed}
            </Text>
          ) : null}
        </View>
      </View>

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
        </View>
      ) : (
        <Text style={styles.showTextMuted}>No upcoming show found.</Text>
      )}
    </View>
  );
}

export default function ReviewScreen({
  items,
  onBack,
  onGenerate,
  onConnectAndGenerate,
  onSkip,
  onStartOver,
  spotifyConnected,
  generating,
  error,
}) {
  // owns its own copy so the user can trim their lineup right up until they
  // commit — a real "review" step, not just a read-only recap
  const [lineup, setLineup] = useState(items);

  function removeItem(name) {
    setLineup((prev) => prev.filter((it) => it.name !== name));
  }

  function confirmStartOver() {
    Alert.alert('Start over?', 'This clears your current lineup and takes you back to the beginning.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start Over', style: 'destructive', onPress: onStartOver },
    ]);
  }

  // Sharing works the same whether or not Spotify is connected — the ticket
  // links are the actual point of the app, not a Spotify-only consolation.
  // Goes through the native share sheet (Messages, AirDrop, Save Image, ...)
  // rather than saving straight to Photos, so the user picks the destination.
  const posterRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    if (!shareError) return;
    const id = setTimeout(() => setShareError(''), 3000);
    return () => clearTimeout(id);
  }, [shareError]);

  async function handleShare() {
    setSharing(true);
    setShareError('');
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setShareError("Sharing isn't available on this device.");
        return;
      }
      const uri = await posterRef.current.capture();
      Haptics.selectionAsync().catch(() => {});
      await Sharing.shareAsync(uri, { UTI: 'public.png', dialogTitle: 'Share your lineup' });
    } catch (e) {
      setShareError("Couldn't share — please try again.");
    } finally {
      setSharing(false);
    }
  }

  const showCount = lineup.filter((it) => it.nextShow).length;

  if (lineup.length === 0) {
    return (
      <View style={styles.stage}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Pressable onPress={confirmStartOver} hitSlop={8}>
            <Text style={styles.startOverText}>Start over</Text>
          </Pressable>
        </View>
        <View style={styles.emptyCenter}>
          <Text style={styles.mutedText}>You've cleared your whole lineup.</Text>
          <GhostButton
            label="Back to discovery"
            onPress={onBack}
            icon={<Ionicons name="arrow-back" size={16} color={colors.ink} />}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      <View style={styles.hiddenPosterWrap} pointerEvents="none">
        <ViewShot ref={posterRef} options={{ format: 'png', quality: 1 }}>
          <LineupPoster items={lineup} />
        </ViewShot>
      </View>

      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={16} color={colors.ink} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Pressable onPress={confirmStartOver} hitSlop={8} disabled={generating}>
          <Text style={styles.startOverText}>Start over</Text>
        </Pressable>
      </View>

      <Text style={styles.eyebrow}>Your lineup</Text>
      <Text style={styles.title}>Your lineup is ready</Text>
      <Text style={styles.subhero}>Real shows, real tickets — here's what you're about to discover.</Text>

      <View style={styles.statRow}>
        <View style={styles.statPill}>
          <Ionicons name="people-outline" size={14} color={colors.primary} />
          <Text style={styles.statText}>
            {lineup.length} artist{lineup.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Ionicons name="ticket-outline" size={14} color={colors.primary} />
          <Text style={styles.statText}>
            {showCount} show{showCount === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {lineup.map((item) => (
          <LineupCard key={item.name} item={item} onRemove={() => removeItem(item.name)} />
        ))}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {spotifyConnected ? (
          <PrimaryButton
            label="Save Lineup to Spotify"
            onPress={() => onGenerate(lineup)}
            loading={generating}
            icon={<FontAwesome name="spotify" size={16} color={colors.primaryInk} />}
          />
        ) : (
          <>
            <PrimaryButton
              label="Connect Spotify to Save"
              onPress={() => onConnectAndGenerate(lineup)}
              loading={generating}
              icon={<FontAwesome name="spotify" size={16} color={colors.primaryInk} />}
            />
            <GhostButton label="Skip — just show me tickets" onPress={onSkip} disabled={generating} />
          </>
        )}

        <Pressable onPress={handleShare} style={styles.shareRow} hitSlop={8} disabled={sharing}>
          {sharing ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Ionicons name="share-outline" size={15} color={colors.muted} />
          )}
          <Text style={styles.shareText}>Share your lineup</Text>
        </Pressable>
        {shareError ? <Text style={styles.saveMessage}>{shareError}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { color: colors.ink, fontFamily: fonts.bodySemibold, fontSize: 14 },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 26, marginTop: 4 },
  subhero: {
    color: colors.muted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  statText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg, paddingTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: 6,
  },
  removeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: 24 },
  cardHeadline: { flex: 1, gap: 2 },
  cardName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15 },
  cardSeed: { fontFamily: fonts.bodySemibold, fontSize: 11 },
  showBlock: { gap: 3, marginTop: 2 },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  showText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12, flexShrink: 1 },
  showTextMuted: { color: colors.muted2, fontFamily: fonts.bodyMedium, fontSize: 12 },
  ticketText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mutedText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  error: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  actions: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  startOverText: {
    color: colors.muted,
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: spacing.xs,
  },
  hiddenPosterWrap: { position: 'absolute', top: -10000, left: 0 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  shareText: {
    color: colors.muted,
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
  },
  saveMessage: {
    color: colors.muted,
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    textAlign: 'center',
  },
});
