import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModeToggle from '../components/ModeToggle';
import SimilarArtistCard from '../components/SimilarArtistCard';
import DiscoveryLoader from '../components/DiscoveryLoader';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { colors, fonts, spacing } from '../theme';
import { api } from '../api';

export default function SimilarSelectionScreen({ topArtists, onBack, onNext }) {
  // native safe-area inset reserves ~34pt for the home indicator — way more
  // than a floating pill needs to clear it, so use a tight fixed clearance
  // instead and only fall back to the inset on devices that have none
  const insets = useSafeAreaInsets();
  const floatingBottom = insets.bottom > 0 ? insets.bottom + 8 : spacing.xl;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selections, setSelections] = useState(new Set());
  // hidden gems is the house style — surfacing low-key acts over the obvious picks
  const [discoveryMode, setDiscoveryMode] = useState('hidden-gems');

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

  async function loadResults(mode) {
    setLoading(true);
    setError('');
    try {
      const names = topArtists.map((a) => a.name).join(',');
      const results = (await api.get('/similar-artists', { artists: names, mode })) || [];
      setItems(results.map((r) => ({ ...r, image: null, preview: undefined })));
      setLoading(false);

      if (results.length) {
        const namesForExtras = results.map((r) => r.name).join(',');

        api
          .get('/generate/artist-images', { names: namesForExtras })
          .then((imgResp) => {
            const imageMap = {};
            (imgResp || []).forEach((r) => {
              if (r.image) imageMap[r.name] = r.image;
            });
            setItems((prev) => prev.map((it) => (imageMap[it.name] ? { ...it, image: imageMap[it.name] } : it)));
          })
          .catch(() => {});

        api
          .get('/generate/artist-preview', { names: namesForExtras })
          .then((previewResp) => {
            const previewMap = {};
            (previewResp || []).forEach((r) => {
              previewMap[r.name] = r;
            });
            setItems((prev) => prev.map((it) => ({ ...it, preview: previewMap[it.name] || null })));
          })
          .catch(() => {});
      }
    } catch (e) {
      setError("Couldn't load similar artists. Please try again.");
      setLoading(false);
    }
  }

  useEffect(() => {
    loadResults(discoveryMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDiscoveryModeChange(mode) {
    if (mode === discoveryMode) return;
    setDiscoveryMode(mode);
    // selections are kept since they refer to artist names, not this list
    loadResults(mode);
  }

  function toggleSelection(name) {
    setSelections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // hand off the full item — photo, show, tickets — not just the name, so
  // Review can actually show what you're about to go see
  const selectedItems = items.filter((it) => selections.has(it.name));

  if (loading) {
    return (
      <View style={styles.stage}>
        <Pressable onPress={onBack} style={[styles.backBtn, styles.backBtnStandalone]} hitSlop={12}>
          <Ionicons name="chevron-back" size={15} color={colors.primary} />
        </Pressable>
        <DiscoveryLoader />
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={15} color={colors.primary} />
        </Pressable>
        <Text style={styles.eyebrow}>Discover</Text>
      </View>
      <Text style={styles.title}>Artists playing in the Bay Area</Text>
      <Text style={styles.subhero}>
        Listen to a preview right here, then pick who you want to see and grab tickets.
      </Text>

      <ModeToggle mode={discoveryMode} onChange={onDiscoveryModeChange} />

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <GhostButton
            label="Try again"
            onPress={() => loadResults(discoveryMode)}
            icon={<Ionicons name="refresh" size={16} color={colors.ink} />}
          />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.mutedText}>No similar artists found.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => {
            const isActive = playingName === item.name;
            return (
              <SimilarArtistCard
                key={item.name}
                item={item}
                image={item.image}
                preview={item.preview}
                selected={selections.has(item.name)}
                isActive={isActive}
                isPlaying={isActive && playerStatus.playing}
                progress={isActive && playerStatus.duration ? playerStatus.currentTime / playerStatus.duration : 0}
                onToggle={() => toggleSelection(item.name)}
                onTogglePlay={() => togglePreview(item.name, item.preview?.previewUrl)}
              />
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.actions, { bottom: floatingBottom }]}>
        <PrimaryButton
          label={`Review (${selectedItems.length} selected)`}
          disabled={selectedItems.length === 0}
          onPress={() => onNext(selectedItems)}
          icon={<Ionicons name="arrow-forward" size={16} color={colors.primaryInk} />}
          style={styles.floatingShadow}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  backBtn: { alignItems: 'center', justifyContent: 'center' },
  backBtnStandalone: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 24, marginTop: 4 },
  subhero: {
    color: colors.muted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginTop: 6,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errorText: { color: colors.danger, fontFamily: fonts.bodyMedium, textAlign: 'center' },
  mutedText: { color: colors.muted, fontFamily: fonts.bodyMedium },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.xl * 2 },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
});
