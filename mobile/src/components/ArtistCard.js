import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import ArtistAvatar from './ArtistAvatar';
import { colors, fonts, spacing } from '../theme';

export default function ArtistCard({ artist, index = 0, onRemove }) {
  const uri = artist?.images?.[0]?.url;

  const handleRemove = () => {
    Haptics.selectionAsync().catch(() => {});
    onRemove();
  };

  return (
    <Animated.View
      entering={ZoomIn.delay(index * 70).duration(320)}
      exiting={FadeIn.duration(150)}
      style={styles.card}
    >
      <View style={styles.avatarWrap}>
        <ArtistAvatar uri={uri} name={artist?.name} size={84} />
        {onRemove && (
          <Pressable onPress={handleRemove} style={styles.removeBadge} hitSlop={8}>
            <Ionicons name="close" size={13} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {artist?.name}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '30%',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  avatarWrap: {
    position: 'relative',
  },
  removeBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    textAlign: 'center',
  },
});
