import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import LineupPoster from '../components/LineupPoster';
import SimilarArtistCard from '../components/SimilarArtistCard';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { colors, fonts, radii, spacing } from '../theme';

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
  // footer sits in normal flow (not floating), so it needs its own
  // safe-area clearance now that the app-level SafeAreaView only reserves
  // the top edge
  const insets = useSafeAreaInsets();

  // owns its own copy so the user can trim their lineup right up until they
  // commit — a real "review" step, not just a read-only recap
  const [lineup, setLineup] = useState(items);

  function removeItem(name) {
    setLineup((prev) => prev.filter((it) => it.name !== name));
  }

  // one shared player for the whole screen so starting a new preview always
  // stops whatever was playing before — never two clips at once
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const playerStatus = useAudioPlayerStatus(player);
  const [playingName, setPlayingName] = useState(null);

  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingName(null);
  }, [playerStatus.didJustFinish]);

  function togglePreview(name, previewUrl) {
    if (!previewUrl) return;
    if (playingName === name) {
      if (playerStatus.playing) player.pause();
      else player.play();
      return;
    }
    player.replace(previewUrl);
    player.play();
    setPlayingName(name);
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
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={15} color={colors.primary} />
          </Pressable>
          <Pressable onPress={confirmStartOver} hitSlop={8}>
            <Text style={styles.startOverText}>Start over</Text>
          </Pressable>
        </View>
        <View style={styles.emptyCenter}>
          <Text style={styles.mutedText}>You've cleared your whole lineup.</Text>
          <GhostButton
            label="Back to discovery"
            onPress={onStartOver}
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
        <View style={styles.headerLeft}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={15} color={colors.primary} />
          </Pressable>
          <Text style={styles.eyebrow}>Your lineup</Text>
        </View>
        <Pressable onPress={confirmStartOver} hitSlop={8} disabled={generating}>
          <Text style={styles.startOverText}>Start over</Text>
        </Pressable>
      </View>

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

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {lineup.map((item) => {
          const isActive = playingName === item.name;
          return (
            <SimilarArtistCard
              key={item.name}
              item={item}
              image={item.image}
              preview={item.preview}
              isActive={isActive}
              isPlaying={isActive && playerStatus.playing}
              progress={isActive && playerStatus.duration ? playerStatus.currentTime / playerStatus.duration : 0}
              onRemove={() => removeItem(item.name)}
              onTogglePlay={() => togglePreview(item.name, item.preview?.previewUrl)}
            />
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  backBtn: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
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
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mutedText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  error: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  actions: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
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
