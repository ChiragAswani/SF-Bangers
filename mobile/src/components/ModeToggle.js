import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, house, radii, spacing } from '../theme';

const MODES = [
  {
    key: 'blowing-up',
    icon: 'flame-outline',
    activeIcon: 'flame',
    name: 'Blowing Up',
    desc: 'Buzzing acts on the rise',
    trim: house[0], // coral
  },
  {
    key: 'hidden-gems',
    icon: 'compass-outline',
    activeIcon: 'compass',
    name: 'Hidden Gems',
    desc: 'Deep cuts, off the radar',
    trim: house[1], // teal
  },
];

export default function ModeToggle({ mode, onChange }) {
  return (
    <View style={styles.row}>
      {MODES.map((m) => {
        const active = mode === m.key;
        return (
          <Pressable
            key={m.key}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(m.key);
            }}
            style={[styles.option, active && { borderColor: m.trim.bg, backgroundColor: `${m.trim.bg}22` }]}
          >
            <Ionicons name={active ? m.activeIcon : m.icon} size={18} color={active ? m.trim.bg : colors.muted} />
            <View style={styles.textCol}>
              <Text style={[styles.name, active && { color: m.trim.bg }]}>{m.name}</Text>
              <Text style={styles.desc}>{m.desc}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
  },
  textCol: { flexShrink: 1 },
  name: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 13 },
  desc: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 1 },
});
