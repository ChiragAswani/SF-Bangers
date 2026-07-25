import React from 'react';
import { StyleSheet, View } from 'react-native';
import { house } from '../theme';

// Soft scattered color blobs standing in for a row of painted ladies fading
// into the fog — decorative, low-opacity, never competes with foreground text.
export default function GlowBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.blob, styles.blobA, { backgroundColor: house[1].bg }]} />
      <View style={[styles.blob, styles.blobB, { backgroundColor: house[2].bg }]} />
      <View style={[styles.blob, styles.blobC, { backgroundColor: house[4].bg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.16,
  },
  blobA: {
    width: 260,
    height: 260,
    top: -80,
    left: -70,
  },
  blobB: {
    width: 220,
    height: 220,
    top: 60,
    right: -90,
  },
  blobC: {
    width: 300,
    height: 300,
    bottom: -140,
    left: -80,
  },
});
