import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import GlowBackground from '../components/GlowBackground';
import { GhostButton, SpotifyButton } from '../components/Buttons';
import { colors, fonts, house, spacing } from '../theme';

async function openInSpotify(playlistId) {
  const appUrl = `spotify:playlist:${playlistId}`;
  const webUrl = `https://open.spotify.com/playlist/${playlistId}`;
  try {
    await Linking.openURL(appUrl);
  } catch (e) {
    await Linking.openURL(webUrl).catch(() => {});
  }
}

export default function ResultScreen({ playlistId, onDone }) {
  return (
    <View style={styles.stage}>
      <GlowBackground />
      <Animated.View entering={ZoomIn.duration(400)} style={styles.content}>
        <Ionicons name="checkmark-circle" size={56} color={house[5].bg} />
        <Text style={styles.eyebrow}>All done</Text>
        <Text style={styles.hero}>{playlistId ? 'Your SF mix is ready' : 'Nice picks'}</Text>
        <Text style={styles.subhero}>
          {playlistId
            ? 'One track from each artist you picked, saved straight to your Spotify.'
            : 'Now go grab tickets before these hidden gems blow up.'}
        </Text>

        <View style={styles.actions}>
          {playlistId ? (
            <SpotifyButton
              label="Open in Spotify"
              onPress={() => openInSpotify(playlistId)}
              icon={<FontAwesome name="spotify" size={18} color="#FFFFFF" />}
            />
          ) : null}
          <GhostButton label="Done" onPress={onDone} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  hero: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 30,
    textAlign: 'center',
  },
  subhero: {
    color: colors.muted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
