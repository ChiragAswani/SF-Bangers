import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ArtistCard from '../components/ArtistCard';
import { GhostButton, PrimaryButton, SpotifyButton } from '../components/Buttons';
import { colors, fonts, radii, spacing } from '../theme';
import { api } from '../api';

const SPOTIFY_BATCH_SIZE = 6;

// picks `count` artists from the pool the user hasn't seen yet; once the pool
// is exhausted it resets so shuffling never just dead-ends
function pickBatch(pool, shownIds, count = SPOTIFY_BATCH_SIZE) {
  let candidates = pool.filter((a) => !shownIds.has(a.id));
  let resetting = false;
  if (candidates.length < count) {
    candidates = pool;
    resetting = true;
  }
  const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
  return { batch: shuffled, resetting };
}

export default function SeedArtistsScreen({
  onBack,
  onNext,
  spotifyConnected,
  connecting,
  authError,
  onConnectSpotify,
  onSpotifySessionExpired,
}) {
  const [inputValue, setInputValue] = useState('');
  const [manualArtists, setManualArtists] = useState([]);

  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState('');
  const [spotifyBatch, setSpotifyBatch] = useState([]);
  const shownIds = useRef(new Set());
  const poolFetchedRef = useRef(false);

  useEffect(() => {
    if (spotifyConnected && !poolFetchedRef.current) {
      poolFetchedRef.current = true;
      loadPool();
    }
    if (!spotifyConnected) {
      poolFetchedRef.current = false;
      setPool([]);
      setSpotifyBatch([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyConnected]);

  async function loadPool() {
    setPoolLoading(true);
    setPoolError('');
    try {
      const resp = await api.get('/generate/top-artists');
      const artists = resp?.artists || [];
      setPool(artists);
      const { batch } = pickBatch(artists, new Set());
      setSpotifyBatch(batch);
      shownIds.current = new Set(batch.map((a) => a.id));
    } catch (e) {
      if (e.status === 401) {
        onSpotifySessionExpired?.();
        return;
      }
      setPoolError("Couldn't load your top artists.");
    } finally {
      setPoolLoading(false);
    }
  }

  function onShuffle() {
    if (!pool.length) return;
    Haptics.selectionAsync().catch(() => {});
    const { batch, resetting } = pickBatch(pool, shownIds.current);
    setSpotifyBatch(batch);
    shownIds.current = resetting
      ? new Set(batch.map((a) => a.id))
      : new Set([...shownIds.current, ...batch.map((a) => a.id)]);
  }

  async function addManual() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setInputValue('');

    const exists = manualArtists.some((a) => a.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;

    Haptics.selectionAsync().catch(() => {});
    const id = `search:${trimmed}`;
    setManualArtists((prev) => [...prev, { id, name: trimmed, images: [] }]);

    try {
      const resp = await api.get('/generate/artist-images', { names: trimmed });
      const image = resp?.[0]?.image;
      if (image) {
        setManualArtists((prev) =>
          prev.map((a) => (a.id === id ? { ...a, images: [{ url: image }] } : a))
        );
      }
    } catch (e) {
      // no image found — the avatar's initial-letter fallback covers it
    }
  }

  function removeManual(id) {
    setManualArtists((prev) => prev.filter((a) => a.id !== id));
  }

  // the combined seed list Next hands off — manual entries plus whichever
  // Spotify artists are currently shuffled into view, deduped by name
  const combinedArtists = useMemo(() => {
    const spotifyLowerNames = new Set(spotifyConnected ? spotifyBatch.map((a) => a.name.toLowerCase()) : []);
    const manual = manualArtists.filter((a) => !spotifyLowerNames.has(a.name.toLowerCase()));
    return [...manual, ...(spotifyConnected ? spotifyBatch : [])];
  }, [manualArtists, spotifyBatch, spotifyConnected]);

  return (
    <View style={styles.stage}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={16} color={colors.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Your Artists</Text>
        <Text style={styles.title}>Who do you want similar shows for?</Text>
        <Text style={styles.subhero}>Search as many as you like, or pull in your Spotify favorites below.</Text>

        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="e.g. Turnstile, SZA, Fontaines D.C."
            placeholderTextColor={colors.muted2}
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={addManual}
          />
          <Pressable onPress={addManual} disabled={!inputValue.trim()} hitSlop={8}>
            <Ionicons name="add-circle" size={26} color={inputValue.trim() ? colors.primary : colors.muted2} />
          </Pressable>
        </View>

        {manualArtists.length > 0 && (
          <View style={[styles.grid, styles.manualGrid]}>
            {manualArtists.map((artist, idx) => (
              <ArtistCard key={artist.id} artist={artist} index={idx} onRemove={() => removeManual(artist.id)} />
            ))}
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.spotifySection}>
          <View style={styles.spotifyHeader}>
            <Ionicons name="logo-spotify" size={18} color={colors.spotify} />
            <Text style={styles.spotifyHeaderText}>
              {spotifyConnected ? 'From your Spotify' : 'Or pull from Spotify'}
            </Text>
          </View>

          {!spotifyConnected ? (
            <View style={styles.spotifyConnectRow}>
              <SpotifyButton
                label="Connect Spotify"
                onPress={onConnectSpotify}
                loading={connecting}
                icon={<Ionicons name="logo-spotify" size={16} color="#FFFFFF" />}
              />
              {authError ? <Text style={styles.error}>{authError}</Text> : null}
            </View>
          ) : poolLoading ? (
            <View style={styles.poolLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : poolError ? (
            <Text style={styles.error}>{poolError}</Text>
          ) : (
            <>
              <View style={styles.grid}>
                {spotifyBatch.map((artist, idx) => (
                  <ArtistCard key={artist.id} artist={artist} index={idx} />
                ))}
              </View>
              <GhostButton
                label="Shuffle"
                onPress={onShuffle}
                icon={<Ionicons name="shuffle" size={16} color={colors.ink} />}
              />
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          label={combinedArtists.length > 0 ? `Next (${combinedArtists.length})` : 'Add an artist to continue'}
          disabled={combinedArtists.length === 0}
          onPress={() => onNext(combinedArtists)}
          icon={<Ionicons name="arrow-forward" size={16} color={colors.primaryInk} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.sm, alignSelf: 'flex-start' },
  backText: { color: colors.ink, fontFamily: fonts.bodySemibold, fontSize: 14 },
  scrollContent: { paddingBottom: spacing.lg },
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
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.bodySemibold,
    fontSize: 16,
  },
  manualGrid: { marginTop: spacing.md },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  spotifySection: { gap: spacing.md },
  spotifyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spotifyHeaderText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  spotifyConnectRow: { alignItems: 'flex-start', gap: spacing.sm },
  poolLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  error: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 13 },
  actions: { alignItems: 'center', paddingVertical: spacing.md },
});
