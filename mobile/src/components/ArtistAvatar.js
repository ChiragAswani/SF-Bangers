import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { fonts, houseColorForName } from '../theme';

export default function ArtistAvatar({ uri, name, size = 64 }) {
  const initial = name?.[0]?.toUpperCase() || '?';
  const trim = houseColorForName(name);

  return (
    <View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderColor: trim.bg },
      ]}
    >
      <View style={[styles.wrap, { width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallback, { backgroundColor: trim.bg }]}>
            <Text style={[styles.fallbackText, { fontSize: size * 0.38, color: trim.on }]}>{initial}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: {
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontFamily: fonts.displaySemibold,
  },
});
