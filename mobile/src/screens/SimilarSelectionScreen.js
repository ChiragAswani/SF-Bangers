import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import ModeToggle from '../components/ModeToggle';
import SimilarArtistCard from '../components/SimilarArtistCard';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { colors, fonts, spacing } from '../theme';
import { api } from '../api';

const TICKET_CHUNK_SIZE = 8;

export default function SimilarSelectionScreen({ topArtists, onBack, onNext }) {
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

  async function fetchTicketLinks(results) {
    const events = results
      .filter((it) => it.nextShow && it.nextShow.venue && it.nextShow.date)
      .map((it) => ({ artist: it.name, venue: it.nextShow.venue, date: it.nextShow.date }));
    if (events.length === 0) return;

    const chunks = [];
    for (let i = 0; i < events.length; i += TICKET_CHUNK_SIZE) {
      chunks.push(events.slice(i, i + TICKET_CHUNK_SIZE));
    }

    const infoByArtist = new Map();
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const resp = await api.post('/ticket-links', { events: chunk });
          (resp?.results || []).forEach((r) => infoByArtist.set(r.artist, r));
        } catch (e) {
          // leave these artists without an entry — handled as "no tickets found" below
        }
      })
    );

    setItems((prev) =>
      prev.map((it) => {
        if (!it.nextShow) return it;
        const info = infoByArtist.get(it.name);
        return { ...it, nextShow: { ...it.nextShow, ticketLink: info?.ticketLink ?? null, price: info?.price ?? null } };
      })
    );
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

        fetchTicketLinks(results);
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

  const selectedArtists = [...selections];

  return (
    <View style={styles.stage}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={16} color={colors.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <Text style={styles.eyebrow}>Discover</Text>
      <Text style={styles.title}>Similar artists playing in SF</Text>
      <Text style={styles.subhero}>
        Listen to a preview right here, then pick who you want to see and grab tickets.
      </Text>

      <ModeToggle mode={discoveryMode} onChange={onDiscoveryModeChange} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
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
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
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

      <View style={styles.actions}>
        <PrimaryButton
          label={`Review (${selectedArtists.length} selected)`}
          disabled={selectedArtists.length === 0}
          onPress={() => onNext(selectedArtists)}
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
  listContent: { paddingBottom: spacing.lg },
  actions: { alignItems: 'center', paddingVertical: spacing.md },
});
