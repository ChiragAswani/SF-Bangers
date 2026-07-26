import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import ArtistAvatar from './ArtistAvatar';
import SimilarArtistCard from './SimilarArtistCard';
import { colors, fonts, houseColorForName, radii, spacing } from '../theme';

export default function ArtistGroup({ topArtist, isOpen, group, selectedNames, playback, onToggleOpen, onToggleSelect }) {
  const handleHeaderPress = () => {
    Haptics.selectionAsync().catch(() => {});
    onToggleOpen();
  };

  const selectedCount = selectedNames?.size || 0;
  const trim = houseColorForName(topArtist?.name);

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={[styles.group, { borderLeftColor: trim.bg }]}>
      <Pressable onPress={handleHeaderPress} style={[styles.header, isOpen && styles.headerOpen]}>
        <View style={styles.headerLeft}>
          <ArtistAvatar uri={topArtist?.images?.[0]?.url} name={topArtist?.name} size={40} />
          <Text style={styles.headerName} numberOfLines={1}>
            {topArtist?.name}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {selectedCount > 0 && (
            <View style={[styles.badge, { backgroundColor: `${trim.bg}26` }]}>
              <Text style={[styles.badgeText, { color: trim.bg }]}>{selectedCount} selected</Text>
            </View>
          )}
          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
        </View>
      </Pressable>

      {isOpen && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.body}>
          {group?.loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={trim.bg} />
            </View>
          ) : group?.error ? (
            <Text style={styles.errorText}>{group.error}</Text>
          ) : group?.items?.length ? (
            <View style={styles.similarList}>
              {group.items.map((item) => {
                const isActive = playback?.playingName === item.name;
                return (
                  <SimilarArtistCard
                    key={item.name}
                    item={item}
                    image={group.images?.[item.name]}
                    preview={group.previews?.[item.name]}
                    selected={selectedNames?.has(item.name)}
                    isActive={isActive}
                    isPlaying={isActive && !!playback?.playing}
                    progress={isActive && playback?.duration ? playback.currentTime / playback.duration : 0}
                    onToggle={() => onToggleSelect(item.name)}
                    onTogglePlay={() => playback?.onToggle(item.name, group.previews?.[item.name]?.previewUrl)}
                  />
                );
              })}
            </View>
          ) : (
            <Text style={styles.mutedText}>No similar artists found.</Text>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderLeftWidth: 6,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  headerOpen: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  headerName: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 10 },
  body: { padding: spacing.sm },
  center: { paddingVertical: spacing.lg, alignItems: 'center' },
  errorText: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 12 },
  mutedText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  similarList: { flexDirection: 'column' },
});
