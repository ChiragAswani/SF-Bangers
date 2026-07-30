import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import LineupPoster from '../components/LineupPoster';
import SimilarArtistCard from '../components/SimilarArtistCard';
import { DangerButton, GhostButton, PrimaryButton, SpotifyButton } from '../components/Buttons';
import { colors, fonts, radii, spacing } from '../theme';
import { USE_SPOTIFY } from '../config';

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
  // native safe-area inset reserves ~34pt for the home indicator — way more
  // than a floating pill needs to clear it, so use a tight fixed clearance
  // instead and only fall back to the inset on devices that have none
  const insets = useSafeAreaInsets();
  const floatingBottom = insets.bottom > 0 ? insets.bottom + 8 : spacing.xl;

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

  // In-house sheet (not the native Alert) so the confirm matches the app's
  // own look and feel rather than the OS system dialog.
  const [startOverSheetOpen, setStartOverSheetOpen] = useState(false);

  function handleStartOverConfirm() {
    setStartOverSheetOpen(false);
    onStartOver();
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

  // Single entry point — tapping the floating button opens an in-house
  // bottom sheet (not the native Alert) so the choice matches the app's
  // own look and feel rather than the OS system dialog.
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  function handleSpotifyChoice() {
    setShareSheetOpen(false);
    if (spotifyConnected) onGenerate(lineup);
    else onConnectAndGenerate(lineup);
  }

  function handleShareChoice() {
    setShareSheetOpen(false);
    handleShare();
  }

  const showCount = lineup.filter((it) => it.nextShow).length;

  const startOverSheet = (
    <Modal
      visible={startOverSheetOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setStartOverSheetOpen(false)}
    >
      <Pressable style={styles.sheetBackdrop} onPress={() => setStartOverSheetOpen(false)} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Start over?</Text>
        <Text style={styles.sheetSubtitle}>
          This clears your current lineup and takes you back to the beginning.
        </Text>

        <DangerButton
          label="Start Over"
          onPress={handleStartOverConfirm}
          icon={<Ionicons name="arrow-back" size={16} color="#FFFFFF" />}
          style={styles.sheetButton}
        />

        <Pressable onPress={() => setStartOverSheetOpen(false)} hitSlop={8} style={styles.sheetCancel}>
          <Text style={styles.sheetCancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );

  if (lineup.length === 0) {
    return (
      <View style={styles.stage}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={15} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => setStartOverSheetOpen(true)} hitSlop={8}>
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
        {startOverSheet}
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
        <Pressable onPress={() => setStartOverSheetOpen(true)} hitSlop={8} disabled={generating}>
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

      <View style={[styles.actions, { bottom: floatingBottom }]}>
        {error ? <Text style={styles.saveMessage}>{error}</Text> : null}
        {shareError ? <Text style={styles.saveMessage}>{shareError}</Text> : null}
        <PrimaryButton
          label="Share your lineup"
          onPress={USE_SPOTIFY ? () => setShareSheetOpen(true) : handleShare}
          loading={sharing || generating}
          icon={<Ionicons name="share-outline" size={16} color={colors.primaryInk} />}
          style={styles.floatingShadow}
        />
      </View>

      <Modal
        visible={shareSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setShareSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShareSheetOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Share your lineup</Text>
          <Text style={styles.sheetSubtitle}>Save it to Spotify, or share the poster with friends.</Text>

          <SpotifyButton
            label={spotifyConnected ? 'Save to Spotify' : 'Connect Spotify to save'}
            onPress={handleSpotifyChoice}
            icon={<FontAwesome name="spotify" size={16} color="#FFFFFF" />}
            style={styles.sheetButton}
          />
          <GhostButton
            label="Share"
            onPress={handleShareChoice}
            icon={<Ionicons name="share-outline" size={16} color={colors.ink} />}
            style={styles.sheetButton}
          />

          <Pressable onPress={() => setShareSheetOpen(false)} hitSlop={8} style={styles.sheetCancel}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>

      {startOverSheet}
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
  listContent: { paddingBottom: spacing.xl * 2, paddingTop: spacing.sm },
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mutedText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.sm,
  },
  floatingShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  startOverText: {
    color: colors.muted,
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: spacing.xs,
  },
  hiddenPosterWrap: { position: 'absolute', top: -10000, left: 0 },
  saveMessage: {
    color: colors.muted,
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    textAlign: 'center',
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(43, 35, 51, 0.45)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 20,
    textAlign: 'center',
  },
  sheetSubtitle: {
    color: colors.muted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  sheetButton: { width: '100%' },
  sheetCancel: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  sheetCancelText: {
    color: colors.muted,
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
  },
});
