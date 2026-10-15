import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/state/AppState';
import type { TagKind } from '@/theme/themes';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'small' | 'label';

export function Txt({ variant = 'body', style, muted, ...rest }: TextProps & { variant?: Variant; muted?: boolean }) {
  const t = useTheme();
  const base: Record<Variant, TextStyle> = {
    // The scrapbook display face is handwriting, which reads small, so it gets a bigger size.
    display: { fontFamily: t.fonts.display, fontSize: t.id === 'scrapbook' ? 42 : 28, lineHeight: t.id === 'scrapbook' ? 44 : 34 },
    title: { fontFamily: t.fonts.heavy, fontSize: 22, lineHeight: 28 },
    heading: { fontFamily: t.fonts.bold, fontSize: 17, lineHeight: 23 },
    body: { fontFamily: t.fonts.regular, fontSize: 15.5, lineHeight: 23 },
    bodyStrong: { fontFamily: t.fonts.bold, fontSize: 15.5, lineHeight: 23 },
    small: { fontFamily: t.fonts.medium, fontSize: 13, lineHeight: 18 },
    label: { fontFamily: t.fonts.bold, fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  };
  return <Text {...rest} style={[base[variant], { color: muted ? t.colors.muted : t.colors.ink }, style]} />;
}

export function Card({
  children,
  style,
  tone = 'surface',
  tilt = 0,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'soft' | 'note';
  tilt?: number;
}) {
  const t = useTheme();
  const bg = tone === 'soft' ? t.colors.accentSoft : tone === 'note' ? t.colors.surfaceAlt : t.colors.surface;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: t.radius.card,
          padding: 16,
          gap: 10,
          transform: t.tilt && tilt ? [{ rotate: `${tilt}deg` }] : undefined,
        },
        tone === 'surface' && !t.dark && styles.shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function TagChip({ kind, label, onRemove }: { kind: TagKind; label: string; onRemove?: () => void }) {
  const t = useTheme();
  const c = t.colors.tags[kind];
  const icon: Record<TagKind, keyof typeof Ionicons.glyphMap> = {
    person: 'person-outline',
    place: 'location-outline',
    mood: 'happy-outline',
    task: 'checkbox-outline',
    topic: 'pricetag-outline',
  };
  return (
    <View style={[styles.chip, { backgroundColor: c.bg, borderRadius: t.radius.chip }]}>
      <Ionicons name={icon[kind]} size={12} color={c.fg} />
      <Text style={{ color: c.fg, fontFamily: t.fonts.bold, fontSize: 12.5 }}>{label}</Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${label}`}>
          <Ionicons name="close" size={13} color={c.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { primary: t.colors.accent, secondary: t.colors.accent2, ghost: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: t.colors.onAccent, secondary: t.colors.onAccent2, ghost: t.colors.ink, danger: t.colors.danger }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderRadius: t.id === 'scrapbook' ? 10 : 999,
          borderWidth: kind === 'ghost' || kind === 'danger' ? 1.5 : 0,
          borderColor: kind === 'danger' ? t.colors.danger : t.colors.line,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: t.fonts.bold, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

/** The big round mic. Pulses while listening. */
export function MicButton({ active, onPress, size = 96 }: { active: boolean; onPress: () => void; size?: number }) {
  const t = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const ring = size * 1.8;
  const isScrap = t.id === 'scrapbook';
  const fill = isScrap ? t.colors.accent2 : t.colors.accent;
  const iconColor = isScrap ? t.colors.onAccent2 : t.colors.onAccent;
  return (
    <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.abs, { width: ring, height: ring, borderRadius: ring / 2, backgroundColor: t.colors.accentSoft }]} />
      <View style={[styles.abs, { width: size * 1.4, height: size * 1.4, borderRadius: size, backgroundColor: t.colors.accentRing }]} />
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.abs,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 3,
              borderColor: fill,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
            },
          ]}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop recording' : 'Start talking'}
        style={({ pressed }) => [
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: fill,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
          !t.dark && styles.shadow,
        ]}
      >
        <Ionicons name={active ? 'stop' : 'mic'} size={size * 0.36} color={iconColor} />
      </Pressable>
    </View>
  );
}

export function Waveform({ levels, height = 30 }: { levels: number[]; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height }} accessibilityElementsHidden>
      {levels.map((v, i) => (
        <View
          key={i}
          style={{
            width: 4,
            borderRadius: 2,
            height: Math.max(4, v * height),
            backgroundColor: i > levels.length - 4 ? t.colors.accentRing : t.colors.accent,
          }}
        />
      ))}
    </View>
  );
}

export function Empty({ icon, title, body, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 20 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={28} color={t.colors.accent} />
      </View>
      <Txt variant="heading" style={{ textAlign: 'center' }}>{title}</Txt>
      <Txt muted style={{ textAlign: 'center', maxWidth: 300 }}>{body}</Txt>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#1F1A3A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 20 },
  abs: { position: 'absolute' },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
