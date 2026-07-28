import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ArtistCard from '../components/ArtistCard';
import { GhostButton, PrimaryButton, SpotifyButton } from '../components/Buttons';
import { colors, fonts, radii, spacing } from '../theme';
import { api } from '../api';

const CANDIDATE_COUNT = 6;

// picks `count` pool artists to browse, preferring ones not already added and
// not recently shown; once those run out it resets so shuffling never dead-ends
function pickCandidates(pool, excludeNamesLower, shownIds, count = CANDIDATE_COUNT) {
  const available = pool.filter((a) => !excludeNamesLower.has(a.name.toLowerCase()));
  let fresh = available.filter((a) => !shownIds.has(a.id));
  let resetting = false;
  if (fresh.length < count) {
    fresh = available;
    resetting = true;
  }
  const shuffled = [...fresh].sort(() => Math.random() - 0.5).slice(0, count);
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
  // the one running list — populated by manual search AND by tapping a
  // Spotify suggestion, so both paths feel like the same kind of "pick"
  const [addedArtists, setAddedArtists] = useState([]);

  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const shownIds = useRef(new Set());
  const poolFetchedRef = useRef(false);

  const addedNamesLower = useMemo(() => new Set(addedArtists.map((a) => a.name.toLowerCase())), [addedArtists]);

  useEffect(() => {
    if (spotifyConnected && !poolFetchedRef.current) {
      poolFetchedRef.current = true;
      loadPool();
    }
    if (!spotifyConnected) {
      poolFetchedRef.current = false;
      setPool([]);
      setCandidates([]);
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
      const { batch } = pickCandidates(artists, addedNamesLower, new Set());
      setCandidates(batch);
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
    const { batch, resetting } = pickCandidates(pool, addedNamesLower, shownIds.current);
    setCandidates(batch);
    shownIds.current = resetting
      ? new Set(batch.map((a) => a.id))
      : new Set([...shownIds.current, ...batch.map((a) => a.id)]);
  }

  function addArtist(artist) {
    setAddedArtists((prev) => {
      if (prev.some((a) => a.name.toLowerCase() === artist.name.toLowerCase())) return prev;
      return [...prev, artist];
    });
  }

  function removeAdded(id) {
    setAddedArtists((prev) => prev.filter((a) => a.id !== id));
  }

  async function addManual() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setInputValue('');
    if (addedNamesLower.has(trimmed.toLowerCase())) return;

    Haptics.selectionAsync().catch(() => {});
    const id = `search:${trimmed}`;
    addArtist({ id, name: trimmed, images: [] });
    // if this name is currently sitting in the Spotify suggestions, drop it
    // from there so it isn't offered twice
    setCandidates((prev) => prev.filter((a) => a.name.toLowerCase() !== trimmed.toLowerCase()));

    try {
      const resp = await api.get('/generate/artist-images', { names: trimmed });
      const image = resp?.[0]?.image;
      if (image) {
        setAddedArtists((prev) => prev.map((a) => (a.id === id ? { ...a, images: [{ url: image }] } : a)));
      }
    } catch (e) {
      // no image found — the avatar's initial-letter fallback covers it
    }
  }

  // tapping a suggestion moves it straight into Your Artists, then pulls in
  // one replacement so the browse grid stays full
  function pickCandidate(artist) {
    addArtist(artist);
    setCandidates((prev) => {
      const remaining = prev.filter((a) => a.id !== artist.id);
      const usedNames = new Set([...addedNamesLower, artist.name.toLowerCase(), ...remaining.map((a) => a.name.toLowerCase())]);
      const replacement =
        pool.find((a) => !usedNames.has(a.name.toLowerCase()) && !shownIds.current.has(a.id)) ||
        pool.find((a) => !usedNames.has(a.name.toLowerCase()));
      if (replacement) {
        shownIds.current.add(replacement.id);
        return [...remaining, replacement];
      }
      return remaining;
    });
  }

  return (
    <View style={styles.stage}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={15} color={colors.primary} />
        </Pressable>
        <Text style={styles.eyebrow}>Your Artists</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Who do you want similar shows for?</Text>
        <Text style={styles.subhero}>Search as many as you like, or tap in favorites from your Spotify below.</Text>

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

        {addedArtists.length > 0 && (
          <View style={[styles.grid, styles.addedGrid]}>
            {addedArtists.map((artist, idx) => (
              <ArtistCard key={artist.id} artist={artist} index={idx} onRemove={() => removeAdded(artist.id)} />
            ))}
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.spotifySection}>
          <View style={styles.spotifyHeader}>
            <FontAwesome name="spotify" size={18} color={colors.spotify} />
            <Text style={styles.spotifyHeaderText}>
              {spotifyConnected ? 'Tap to add from your Spotify' : 'Or pull from Spotify'}
            </Text>
          </View>

          {!spotifyConnected ? (
            <View style={styles.spotifyConnectRow}>
              <SpotifyButton
                label="Connect Spotify"
                onPress={onConnectSpotify}
                loading={connecting}
                icon={<FontAwesome name="spotify" size={16} color="#FFFFFF" />}
              />
              {authError ? <Text style={styles.error}>{authError}</Text> : null}
            </View>
          ) : poolLoading ? (
            <View style={styles.poolLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : poolError ? (
            <Text style={styles.error}>{poolError}</Text>
          ) : candidates.length === 0 ? (
            <Text style={styles.mutedText}>You've added all your top artists!</Text>
          ) : (
            <>
              <View style={styles.grid}>
                {candidates.map((artist, idx) => (
                  <ArtistCard key={artist.id} artist={artist} index={idx} onAdd={() => pickCandidate(artist)} />
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
          label={addedArtists.length > 0 ? `Next (${addedArtists.length})` : 'Add an artist to continue'}
          disabled={addedArtists.length === 0}
          onPress={() => onNext(addedArtists)}
          icon={<Ionicons name="arrow-forward" size={16} color={colors.primaryInk} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  backBtn: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: spacing.xl * 2 },
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
  addedGrid: { marginTop: spacing.md },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: spacing.sm },
  error: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 13 },
  mutedText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xs,
    alignItems: 'center',
  },
});
