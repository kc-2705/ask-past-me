import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// Same purple as the launch screen, so the phone's splash flows straight into the intro.
const BRAND = '#6D4AE0';
const SOFT = '#E6DEFF';
const LOGO = 112;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type IntroKind = 'wave' | 'rewind';

type Props = { kind: IntroKind; onDone: () => void; onShown?: () => void };

/**
 * Opening animation.
 * - 'wave' (every day, about 2 s): a flat line moves like someone speaking,
 *   folds into the logo, rings pulse out, the name rises, then the logo zooms
 *   through to the app.
 * - 'rewind' (only when there is a note from this date last year, about 3 s):
 *   today's date spins back to one year ago, then the logo opens the app.
 * Tap to skip. Skipped when the phone asks for reduced motion.
 */
export function Intro({ kind, onDone, onShown }: Props) {
  const [reduce, setReduce] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => alive && setReduce(r))
      .catch(() => alive && setReduce(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduce) onDone();
  }, [reduce, onDone]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} onLayout={onShown}>
      {reduce === false ? kind === 'rewind' ? <Rewind onDone={onDone} /> : <Wave onDone={onDone} /> : null}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Skip intro" />
    </View>
  );
}

/* ---------- shared pieces ---------- */

function Logo() {
  return (
    <View style={styles.logo}>
      <Ionicons name="chatbubble" size={LOGO * 0.62} color="#FFFFFF" style={{ position: 'absolute' }} />
      <Ionicons name="mic" size={LOGO * 0.3} color={BRAND} style={{ marginBottom: LOGO * 0.06 }} />
    </View>
  );
}

function useValues(n: number) {
  const [vals] = useState(() => Array.from({ length: n }, () => new Animated.Value(0)));
  return vals;
}

const ease = Easing.out(Easing.cubic);
const to = (v: Animated.Value, value: number, duration: number, delay = 0, easing = ease) =>
  Animated.timing(v, { toValue: value, duration, delay, easing, useNativeDriver: true });

/** Logo pop + rings + name + tagline, then the zoom-through exit. Starts at `at` ms. */
function useReveal(title: string, at: number) {
  const [logo, exit, tagline] = useValues(3);
  const rings = useValues(2);
  const letters = useValues(title.length);
  // Built once: the date ticks in Rewind re-render this component many times.
  const [anim] = useState(() =>
    Animated.parallel([
      Animated.sequence([Animated.delay(at), Animated.spring(logo, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true })]),
      ...rings.map((r, i) => to(r, 1, 1000, at + 120 + i * 220, Easing.out(Easing.quad))),
      ...letters.map((l, i) => to(l, 1, 240, at + 180 + i * 35)),
      to(tagline, 1, 350, at + 520),
      to(exit, 1, 460, at + 750, Easing.in(Easing.cubic)),
    ]),
  );
  return { logo, exit, tagline, rings, letters, anim };
}

function Reveal({ title, sub, r }: { title: string; sub: string; r: ReturnType<typeof useReveal> }) {
  const logoScale = Animated.add(
    r.logo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
    r.exit.interpolate({ inputRange: [0, 1], outputRange: [0, 9] }),
  );
  const textFade = r.exit.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <View style={styles.center} pointerEvents="none">
      <View style={styles.logoBox}>
        {r.rings.map((ring, i) => (
          <Animated.View
            key={i}
            style={[
              styles.ring,
              {
                opacity: ring.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.45, 0] }),
                transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.7] }) }],
              },
            ]}
          />
        ))}
        <Animated.View style={{ opacity: r.logo, transform: [{ scale: logoScale }] }}>
          <Logo />
        </Animated.View>
      </View>
      <Animated.View style={[styles.titleRow, { opacity: textFade }]}>
        {title.split('').map((ch, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.title,
              {
                opacity: r.letters[i],
                transform: [{ translateY: r.letters[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              },
            ]}
          >
            {ch === ' ' ? ' ' : ch}
          </Animated.Text>
        ))}
      </Animated.View>
      <Animated.View style={{ opacity: Animated.multiply(r.tagline, textFade) }}>
        <Text style={styles.tagline}>{sub}</Text>
      </Animated.View>
    </View>
  );
}

/* ---------- daily: voice wave ---------- */

const BARS = 15;
const BAR_H = 80;
const REVEAL_AT = 1150;

function Wave({ onDone }: { onDone: () => void }) {
  const [line] = useValues(1);
  const heights = useValues(BARS);
  const [fold] = useValues(1);
  const reveal = useReveal('Ask Past Me', REVEAL_AT);
  const [layer] = useState(() => new Animated.Value(1));

  useEffect(() => {
    heights.forEach((h) => h.setValue(0.04));
    const mid = (BARS - 1) / 2;
    // A few quick random "speaking" steps, louder in the middle like a real voice.
    const talk = Array.from({ length: 7 }, () =>
      Animated.parallel(
        heights.map((h, i) => {
          const edge = 1 - Math.abs(i - mid) / (mid + 2);
          return to(h, 0.12 + Math.random() * 0.88 * edge, 105, 0, Easing.inOut(Easing.quad));
        }),
      ),
    );
    const all = Animated.parallel([
      to(line, 1, 300),
      Animated.sequence([Animated.delay(320), ...talk]),
      to(fold, 1, 320, 1080, Easing.inOut(Easing.cubic)),
      reveal.anim,
      to(layer, 0, 320, REVEAL_AT + 900),
    ]);
    all.start(({ finished }) => finished && onDone());
    return () => all.stop();
  }, [line, heights, fold, reveal.anim, layer, onDone]);

  const mid = (BARS - 1) / 2;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: layer }]}>
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={[styles.bars, { transform: [{ scaleX: line }] }]}>
          {heights.map((h, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  backgroundColor: i % 2 ? SOFT : '#FFFFFF',
                  opacity: fold.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.6, 0] }),
                  transform: [
                    // Fold every bar into the centre, where the logo appears.
                    { translateX: fold.interpolate({ inputRange: [0, 1], outputRange: [0, (mid - i) * 10] }) },
                    { scaleY: Animated.multiply(h, fold.interpolate({ inputRange: [0, 1], outputRange: [1, 0.1] })) },
                  ],
                },
              ]}
            />
          ))}
        </Animated.View>
      </View>
      <Reveal title="Ask Past Me" sub="Say it. Find it later." r={reveal} />
    </Animated.View>
  );
}

/* ---------- special days: rewind to one year ago ---------- */

const SPIN_MS = 1600;
const REWIND_REVEAL_AT = 2050;

function Rewind({ onDone }: { onDone: () => void }) {
  const [today] = useState(() => new Date());
  const [shown, setShown] = useState(today);
  const [spin, label, dateOut] = useValues(3);
  const reveal = useReveal('Ask Past Me', REWIND_REVEAL_AT);
  const [layer] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // Step the date back a year: slow, then fast, then slow again as it lands.
    const frames = 32;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let f = 1; f <= frames; f++) {
      const p = f / frames;
      const daysBack = Math.round(365 * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2));
      t += 16 + 70 * Math.pow(Math.abs(p - 0.5) * 2, 3);
      timers.push(
        setTimeout(() => {
          const d = new Date(today);
          d.setDate(d.getDate() - daysBack);
          setShown(d);
        }, t),
      );
    }
    const all = Animated.parallel([
      to(spin, 1, SPIN_MS, 0, Easing.bezier(0.3, 0.6, 0.4, 1)),
      to(label, 1, 300, SPIN_MS + 100),
      to(dateOut, 1, 300, REWIND_REVEAL_AT - 150),
      reveal.anim,
      to(layer, 0, 320, REWIND_REVEAL_AT + 900),
    ]);
    all.start(({ finished }) => finished && onDone());
    return () => {
      timers.forEach(clearTimeout);
      all.stop();
    };
  }, [today, spin, label, dateOut, reveal.anim, layer, onDone]);

  const fadeDate = dateOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: layer }]}>
      <Animated.View
        style={[styles.center, { opacity: fadeDate, transform: [{ scale: dateOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }) }] }]}
        pointerEvents="none"
      >
        <View style={styles.dial} />
        <Animated.View
          style={[styles.arc, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-1440deg'] }) }] }]}
        />
        <Text style={styles.date}>{`${shown.getDate()} ${MONTHS[shown.getMonth()]}`}</Text>
        <Text style={styles.year}>{shown.getFullYear()}</Text>
        <Animated.Text style={[styles.label, { opacity: label }]}>One year ago today</Animated.Text>
      </Animated.View>
      <Reveal title="Ask Past Me" sub="Every day, remembered." r={reveal} />
    </Animated.View>
  );
}

const DIAL = 210;

const styles = StyleSheet.create({
  layer: { backgroundColor: BRAND, zIndex: 100, elevation: 100 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 14 },
  logoBox: { width: LOGO, height: LOGO, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  logo: { width: LOGO, height: LOGO, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: LOGO, height: LOGO, borderRadius: LOGO / 2, borderWidth: 2, borderColor: '#FFFFFF' },
  titleRow: { flexDirection: 'row' },
  title: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 34, color: '#FFFFFF', letterSpacing: 0.5 },
  tagline: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: SOFT, letterSpacing: 0.3 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 6, height: BAR_H },
  bar: { width: 8, height: BAR_H, borderRadius: 4 },
  dial: { position: 'absolute', width: DIAL, height: DIAL, borderRadius: DIAL / 2, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' },
  arc: {
    position: 'absolute',
    width: DIAL,
    height: DIAL,
    borderRadius: DIAL / 2,
    borderWidth: 4,
    borderColor: 'transparent',
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
  },
  date: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 46, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  year: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, letterSpacing: 2, color: SOFT, marginTop: -8 },
  label: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#FFD2B8' },
});
