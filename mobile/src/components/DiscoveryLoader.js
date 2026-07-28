import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import GlowBackground from './GlowBackground';
import { fonts, house, spacing } from '../theme';

const PHRASES = [
  'Discovering new music for you…',
  'Matching your music preferences…',
  'Hunting for hidden gems and popular artists…',
  'Curating your next favorite artist…',
  "Scouting who's playing near you…",
  'Connecting the dots between artists…',
];

const PHRASE_INTERVAL_MS = 2200;

export default function DiscoveryLoader() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * PHRASES.length));

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % PHRASES.length);
    }, PHRASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 3400, easing: Easing.linear }), -1, false);
  }, [rotation]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  const trim = house[index % house.length];

  return (
    <View style={styles.stage}>
      <GlowBackground />

      <Animated.View style={[styles.iconRing, spinStyle, { borderColor: trim.bg }]}>
        <Ionicons name="disc-outline" size={26} color={trim.bg} />
      </Animated.View>

      <Animated.Text
        key={index}
        entering={FadeIn.duration(320)}
        exiting={FadeOut.duration(220)}
        style={[styles.phrase, { color: trim.bg }]}
      >
        {PHRASES[index]}
      </Animated.Text>

      <View style={styles.dotRow}>
        {PHRASES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && [styles.dotActive, { backgroundColor: trim.bg }]]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phrase: {
    fontFamily: fonts.displaySemibold,
    fontSize: 20,
    textAlign: 'center',
    minHeight: 28,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(43, 35, 51, 0.16)',
  },
  dotActive: {
    width: 16,
  },
});
