export type ThemeId = 'lilac' | 'night' | 'scrapbook';

export type TagKind = 'person' | 'place' | 'mood' | 'task' | 'topic';

export type Theme = {
  id: ThemeId;
  name: string;
  tagline: string;
  dark: boolean;
  colors: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    ink: string;
    muted: string;
    line: string;
    accent: string;
    onAccent: string;
    accentSoft: string;
    accentRing: string;
    accent2: string;
    onAccent2: string;
    danger: string;
    tags: Record<TagKind, { bg: string; fg: string }>;
  };
  fonts: {
    regular: string;
    medium: string;
    bold: string;
    heavy: string;
    // Used for big headings. The scrapbook theme swaps in a handwriting face.
    display: string;
  };
  radius: { card: number; chip: number };
  // Scrapbook cards sit slightly tilted, like photos taped into a diary.
  tilt: boolean;
};

export const themes: Record<ThemeId, Theme> = {
  lilac: {
    id: 'lilac',
    name: 'Calm Lilac',
    tagline: 'Soft and friendly',
    dark: false,
    colors: {
      bg: '#F3F0FA',
      surface: '#FFFFFF',
      surfaceAlt: '#E6DEFF',
      ink: '#241F3A',
      muted: '#5F5980',
      line: '#E4DFF2',
      accent: '#6D4AE0',
      onAccent: '#FFFFFF',
      accentSoft: '#E6DEFF',
      accentRing: '#D3C6FF',
      accent2: '#4F2FC0',
      onAccent2: '#FFFFFF',
      danger: '#C2334D',
      tags: {
        person: { bg: '#FFE3D3', fg: '#8A3B12' },
        place: { bg: '#D7F2E6', fg: '#1E6B4C' },
        mood: { bg: '#F1EEF8', fg: '#5F5980' },
        task: { bg: '#FFF1C7', fg: '#7A5600' },
        topic: { bg: '#E6DEFF', fg: '#4F2FC0' },
      },
    },
    fonts: {
      regular: 'PlusJakartaSans_400Regular',
      medium: 'PlusJakartaSans_600SemiBold',
      bold: 'PlusJakartaSans_700Bold',
      heavy: 'PlusJakartaSans_800ExtraBold',
      display: 'PlusJakartaSans_800ExtraBold',
    },
    radius: { card: 20, chip: 999 },
    tilt: false,
  },
  night: {
    id: 'night',
    name: 'Night Voice',
    tagline: 'Dark and calm, for evenings',
    dark: true,
    colors: {
      bg: '#0F1630',
      surface: '#18224A',
      surfaceAlt: '#1C2A5C',
      ink: '#EEF1FF',
      muted: '#A3ADD6',
      line: '#2A3566',
      accent: '#FFB38A',
      onAccent: '#0F1630',
      accentSoft: '#2A2E55',
      accentRing: '#24305F',
      accent2: '#7FD8D2',
      onAccent2: '#0F1630',
      danger: '#FF8A9A',
      tags: {
        person: { bg: '#3A2D3F', fg: '#FFB38A' },
        place: { bg: '#1D3A4A', fg: '#7FD8D2' },
        mood: { bg: '#24305F', fg: '#C9D0F0' },
        task: { bg: '#3A3520', fg: '#FFD97A' },
        topic: { bg: '#24305F', fg: '#EEF1FF' },
      },
    },
    fonts: {
      regular: 'Sora_300Light',
      medium: 'Sora_400Regular',
      bold: 'Sora_600SemiBold',
      heavy: 'Sora_700Bold',
      display: 'Sora_300Light',
    },
    radius: { card: 20, chip: 999 },
    tilt: false,
  },
  scrapbook: {
    id: 'scrapbook',
    name: 'Scrapbook',
    tagline: 'Playful, like a paper diary',
    dark: false,
    colors: {
      bg: '#EEF3F9',
      surface: '#FFFFFF',
      surfaceAlt: '#FFF6CC',
      ink: '#1F2A37',
      muted: '#556274',
      line: '#D9E2EE',
      accent: '#2F6FC4',
      onAccent: '#FFFFFF',
      accentSoft: '#CFE0F5',
      accentRing: '#E2ECF8',
      accent2: '#FFD54A',
      onAccent2: '#1F2A37',
      danger: '#C2334D',
      tags: {
        person: { bg: '#FFD54A', fg: '#1F2A37' },
        place: { bg: '#CDEBD9', fg: '#1F2A37' },
        mood: { bg: '#FFC2CD', fg: '#1F2A37' },
        task: { bg: '#CFE0F5', fg: '#1F2A37' },
        topic: { bg: '#FFF6CC', fg: '#1F2A37' },
      },
    },
    fonts: {
      regular: 'DMSans_400Regular',
      medium: 'DMSans_500Medium',
      bold: 'DMSans_700Bold',
      heavy: 'DMSans_700Bold',
      display: 'Caveat_700Bold',
    },
    radius: { card: 6, chip: 4 },
    tilt: true,
  },
};

export const themeList: Theme[] = [themes.lilac, themes.night, themes.scrapbook];
