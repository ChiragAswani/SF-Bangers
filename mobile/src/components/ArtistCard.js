import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import ArtistAvatar from './ArtistAvatar';
import { colors, fonts, spacing } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Two modes, both driven by whichever handler is passed in:
// - onRemove: already in your list — tap the small badge to take it back out
// - onAdd: a suggestion — tap anywhere on the card to add it to your list
export default function ArtistCard({ artist, index = 0, onRemove, onAdd }) {
  const uri = artist?.images?.[0]?.url;
  const entering = ZoomIn.delay(index * 70).duration(320);
  const exiting = FadeOut.duration(150);

  const handleRemove = () => {
    Haptics.selectionAsync().catch(() => {});
    onRemove();
  };

  const handleAdd = () => {
    Haptics.selectionAsync().catch(() => {});
    onAdd();
  };

  const inner = (
    <>
      <View style={styles.avatarWrap}>
        <ArtistAvatar uri={uri} name={artist?.name} size={84} />
        {onRemove && (
          <Pressable onPress={handleRemove} style={styles.removeBadge} hitSlop={8}>
            <Ionicons name="close" size={13} color="#FFFFFF" />
          </Pressable>
        )}
        {onAdd && (
          <View style={[styles.removeBadge, styles.addBadge]}>
            <Ionicons name="add" size={15} color="#FFFFFF" />
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {artist?.name}
      </Text>
    </>
  );

  if (onAdd) {
    return (
      <AnimatedPressable entering={entering} exiting={exiting} onPress={handleAdd} style={styles.card}>
        {inner}
      </AnimatedPressable>
    );
  }

  return (
    <Animated.View entering={entering} exiting={exiting} style={styles.card}>
      {inner}
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
  addBadge: {
    backgroundColor: colors.primary,
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    textAlign: 'center',
  },
});
