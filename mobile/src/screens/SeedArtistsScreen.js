import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArtistCard from '../components/ArtistCard';
import DiscoveryLoader from '../components/DiscoveryLoader';
import { PrimaryButton, SpotifyButton } from '../components/Buttons';
import { colors, fonts, radii, spacing } from '../theme';
import { api } from '../api';
import { USE_SPOTIFY } from '../config';

const CANDIDATE_COUNT = 6;

// Stand-in pool for when Spotify's disabled — a broad, genre-varied set of
// well-known names so shuffling still feels meaningful. These only seed the
// similarity search, they aren't tied to the live show data, so any popular
// artist works fine here.
const FALLBACK_TOP_ARTISTS = [
  'Tame Impala',
  'Turnstile',
  'SZA',
  'Fontaines D.C.',
  'Kendrick Lamar',
  'Phoebe Bridgers',
  'Mac DeMarco',
  'Doja Cat',
  'The Strokes',
  'Bad Bunny',
  'Billie Eilish',
  'Tyler, The Creator',
  'boygenius',
  'King Gizzard & the Lizard Wizard',
  'Rex Orange County',
  'Beach House',
  'Charli XCX',
  'Frank Ocean',
  'Clairo',
  'Idles',
  'Japanese Breakfast',
  'Khruangbin',
  'MGMT',
  'Vampire Weekend',
  'Wet Leg',
  'Yaeji',
].map((name) => ({ id: `fallback:${name}`, name, images: [] }));

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
  // native safe-area inset reserves ~34pt for the home indicator — way more
  // than a floating pill needs to clear it, so use a tight fixed clearance
  // instead and only fall back to the inset on devices that have none
  const insets = useSafeAreaInsets();
  const floatingBottom = insets.bottom > 0 ? insets.bottom + 8 : spacing.xl;

  const [inputValue, setInputValue] = useState('');
  // the one running list — populated by manual search AND by tapping a
  // Spotify suggestion, so both paths feel like the same kind of "pick"
  const [addedArtists, setAddedArtists] = useState([]);

  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState('');
  const [candidates, setCandidates] = useState([]);
  // covers the App Engine cold-start delay on first load — skipped when
  // Spotify's enabled but not yet connected, since there's nothing to fetch
  // until the user taps Connect
  const [initialLoading, setInitialLoading] = useState(!(USE_SPOTIFY && !spotifyConnected));
  const shownIds = useRef(new Set());
  const poolFetchedRef = useRef(false);

  const addedNamesLower = useMemo(() => new Set(addedArtists.map((a) => a.name.toLowerCase())), [addedArtists]);

  useEffect(() => {
    if (!USE_SPOTIFY) {
      if (poolFetchedRef.current) return;
      poolFetchedRef.current = true;
      setPool(FALLBACK_TOP_ARTISTS);
      const { batch } = pickCandidates(FALLBACK_TOP_ARTISTS, addedNamesLower, new Set());
      setCandidates(batch);
      shownIds.current = new Set(batch.map((a) => a.id));
      loadFallbackImages().finally(() => setInitialLoading(false));
      return;
    }
    if (spotifyConnected && !poolFetchedRef.current) {
      poolFetchedRef.current = true;
      loadPool();
    }
    if (!spotifyConnected) {
      poolFetchedRef.current = false;
      setPool([]);
      setCandidates([]);
      setInitialLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyConnected]);

  // The fallback pool has no photos of its own — backfill real artist images
  // via Spotify's app-only client-credentials token, which (unlike user
  // OAuth login) isn't gated by Development Mode's allowlisted-user cap.
  async function loadFallbackImages() {
    try {
      const chunks = [];
      for (let i = 0; i < FALLBACK_TOP_ARTISTS.length; i += 15) {
        chunks.push(FALLBACK_TOP_ARTISTS.slice(i, i + 15));
      }
      const results = await Promise.all(
        chunks.map((chunk) => api.get('/generate/artist-images', { names: chunk.map((a) => a.name).join(',') }))
      );
      const imageByName = new Map();
      results.flat().forEach((r) => {
        if (r?.image) imageByName.set(r.name.toLowerCase(), r.image);
      });
      const applyImages = (a) => {
        const image = imageByName.get(a.name.toLowerCase());
        return image ? { ...a, images: [{ url: image }] } : a;
      };
      setPool((prev) => prev.map(applyImages));
      setCandidates((prev) => prev.map(applyImages));
    } catch (e) {
      // no images — the avatar's initial-letter fallback covers it
    }
  }

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
      setInitialLoading(false);
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

  const showConnectPrompt = USE_SPOTIFY && !spotifyConnected;
  const showPoolLoading = USE_SPOTIFY && spotifyConnected && poolLoading;
  const showPoolError = USE_SPOTIFY && spotifyConnected && !poolLoading && !!poolError;
  const showGrid = !showConnectPrompt && !showPoolLoading && !showPoolError && candidates.length > 0;

  if (initialLoading) {
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
        <Text style={styles.eyebrow}>Your Artists</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
            <View style={styles.spotifyHeaderLeft}>
              {USE_SPOTIFY ? (
                <FontAwesome name="spotify" size={18} color={colors.spotify} />
              ) : (
                <Ionicons name="flame" size={18} color={colors.primary} />
              )}
              <Text style={styles.spotifyHeaderText}>
                {USE_SPOTIFY
                  ? spotifyConnected
                    ? 'Tap to add from your Spotify'
                    : 'Or pull from Spotify'
                  : 'Tap to add a popular artist'}
              </Text>
            </View>
            {showGrid ? (
              <Pressable onPress={onShuffle} style={styles.shuffleBtn} hitSlop={8}>
                <Ionicons name="shuffle" size={16} color={colors.ink} />
              </Pressable>
            ) : null}
          </View>

          {showConnectPrompt ? (
            <View style={styles.spotifyConnectRow}>
              <SpotifyButton
                label="Connect Spotify"
                onPress={onConnectSpotify}
                loading={connecting}
                icon={<FontAwesome name="spotify" size={16} color="#FFFFFF" />}
              />
              {authError ? <Text style={styles.error}>{authError}</Text> : null}
            </View>
          ) : showPoolLoading ? (
            <View style={styles.poolLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : showPoolError ? (
            <Text style={styles.error}>{poolError}</Text>
          ) : !showGrid ? (
            <Text style={styles.mutedText}>You've added all your top artists!</Text>
          ) : (
            <View style={styles.grid}>
              {candidates.map((artist, idx) => (
                <ArtistCard key={artist.id} artist={artist} index={idx} onAdd={() => pickCandidate(artist)} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.actions, { bottom: floatingBottom }]}>
        <PrimaryButton
          label={addedArtists.length > 0 ? `Next (${addedArtists.length})` : 'Add an artist to continue'}
          disabled={addedArtists.length === 0}
          onPress={() => onNext(addedArtists)}
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
  spotifyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spotifyHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  spotifyHeaderText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, flexShrink: 1 },
  shuffleBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  spotifyConnectRow: { alignItems: 'flex-start', gap: spacing.sm },
  poolLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: spacing.sm },
  error: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 13 },
  mutedText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
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
