import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ModeToggle from '../components/ModeToggle';
import ArtistGroup from '../components/ArtistGroup';
import { PrimaryButton } from '../components/Buttons';
import { colors, fonts, spacing } from '../theme';
import { api } from '../api';

export default function SimilarSelectionScreen({ topArtists, onBack, onNext }) {
  const [expandedId, setExpandedId] = useState(null);
  const [similarByTopArtistId, setSimilarByTopArtistId] = useState({});
  const [selections, setSelections] = useState({});
  // hidden gems is the house style — surfacing low-key acts over the obvious picks
  const [discoveryMode, setDiscoveryMode] = useState('hidden-gems');

  async function fetchTicketLinksForGroup(id, items) {
    const events = items
      .filter((item) => item.nextShow && item.nextShow.venue && item.nextShow.date)
      .map((item) => ({ artist: item.name, venue: item.nextShow.venue, date: item.nextShow.date }));
    if (events.length === 0) return;

    function applyTicketInfo(infoByArtist) {
      setSimilarByTopArtistId((prev) => {
        const group = prev[id];
        if (!group) return prev;
        const updatedItems = group.items.map((it) => {
          if (!it.nextShow) return it;
          const info = infoByArtist.get(it.name);
          return {
            ...it,
            nextShow: { ...it.nextShow, ticketLink: info?.ticketLink ?? null, price: info?.price ?? null },
          };
        });
        return { ...prev, [id]: { ...group, items: updatedItems } };
      });
    }

    try {
      const resp = await api.post('/ticket-links', { events });
      applyTicketInfo(new Map((resp?.results || []).map((r) => [r.artist, r])));
    } catch (e) {
      applyTicketInfo(new Map());
    }
  }

  async function loadSimilarForGroup(topArtist, mode) {
    const id = topArtist.id;
    setSimilarByTopArtistId((prev) => ({ ...prev, [id]: { loading: true, error: '', items: [], images: {} } }));

    try {
      const items = (await api.get('/similar-artists', { artist: topArtist.name, mode })) || [];

      setSimilarByTopArtistId((prev) => ({ ...prev, [id]: { loading: false, error: '', items, images: {} } }));

      if (items.length) {
        const names = items.map((i) => i.name).join(',');
        api
          .get('/generate/artist-images', { names })
          .then((imgResp) => {
            const imageMap = {};
            (imgResp || []).forEach((r) => {
              if (r.image) imageMap[r.name] = r.image;
            });
            setSimilarByTopArtistId((prev) => ({ ...prev, [id]: { ...prev[id], images: imageMap } }));
          })
          .catch(() => {});

        fetchTicketLinksForGroup(id, items);
      }
    } catch (e) {
      setSimilarByTopArtistId((prev) => ({
        ...prev,
        [id]: { loading: false, error: "Couldn't load similar artists.", items: [], images: {} },
      }));
    }
  }

  function toggleExpanded(topArtist) {
    const id = topArtist.id;
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (similarByTopArtistId[id]) return; // already loaded/loading
    loadSimilarForGroup(topArtist, discoveryMode);
  }

  // the search flow hands us exactly one seed artist — skip the extra tap
  // and open it immediately instead of making the user expand a lone group
  useEffect(() => {
    if (topArtists.length === 1) {
      toggleExpanded(topArtists[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDiscoveryModeChange(mode) {
    if (mode === discoveryMode) return;
    setDiscoveryMode(mode);
    // rankings depend on mode — drop cached results so re-opening a group re-fetches;
    // selections are kept since they refer to artist names, not to the cached list
    setSimilarByTopArtistId({});
    if (expandedId) {
      const topArtist = topArtists.find((a) => a.id === expandedId);
      if (topArtist) loadSimilarForGroup(topArtist, mode);
    }
  }

  function toggleSelection(topArtistId, name) {
    setSelections((prev) => {
      const current = new Set(prev[topArtistId] || []);
      if (current.has(name)) current.delete(name);
      else current.add(name);
      return { ...prev, [topArtistId]: current };
    });
  }

  const allSelectedArtists = useMemo(() => {
    const set = new Set();
    Object.values(selections).forEach((s) => s.forEach((name) => set.add(name)));
    return [...set];
  }, [selections]);

  return (
    <View style={styles.stage}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={16} color={colors.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <Text style={styles.eyebrow}>Discover</Text>
      <Text style={styles.title}>Tap an artist to find similar SF shows</Text>
      <Text style={styles.subhero}>
        Pick as many as you want from each group — they'll all end up in your playlist.
      </Text>

      <ModeToggle mode={discoveryMode} onChange={onDiscoveryModeChange} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {topArtists.map((topArtist) => (
          <ArtistGroup
            key={topArtist.id}
            topArtist={topArtist}
            isOpen={expandedId === topArtist.id}
            group={similarByTopArtistId[topArtist.id]}
            selectedNames={selections[topArtist.id]}
            onToggleOpen={() => toggleExpanded(topArtist)}
            onToggleSelect={(name) => toggleSelection(topArtist.id, name)}
          />
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          label={`Review (${allSelectedArtists.length} selected)`}
          disabled={allSelectedArtists.length === 0}
          onPress={() => onNext(allSelectedArtists)}
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
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  actions: { alignItems: 'center', paddingVertical: spacing.md },
});
