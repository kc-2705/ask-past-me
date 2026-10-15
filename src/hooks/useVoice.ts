import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Directory, File, Paths } from 'expo-file-system';

export type VoiceStatus = 'idle' | 'listening' | 'stopping';

const LEVELS = 28;
const androidApi = Platform.OS === 'android' ? Number(Platform.Version) : 0;
// Continuous listening and saving audio need Android 13 (API 33) or newer.
const supportsContinuous = Platform.OS !== 'android' || androidApi >= 33;

/**
 * Speech-to-text for journaling.
 * - Keeps listening until the person taps stop. On older Android phones the
 *   recognizer stops after each pause, so it is restarted automatically.
 * - Saves the recording (when the phone supports it) so the note can be replayed.
 * - Exposes volume levels for a live waveform.
 */
export function useVoice(opts: { lang: string; keepAudio: boolean; continuous: boolean }) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [levels, setLevels] = useState<number[]>(() => Array(LEVELS).fill(0));
  const [audio, setAudio] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const wanted = useRef(false);
  const restarts = useRef(0);
  // Speech events are global: every screen using this hook hears them. Only
  // the instance that started listening should react.
  const owner = useRef(false);
  const endedAt = useRef(0);
  // Mirrors `interim` so handlers can read it without nesting state updates.
  const interimRef = useRef('');
  const setInterimBoth = (t: string) => {
    interimRef.current = t;
    setInterim(t);
  };
  const flushInterim = () => {
    const i = interimRef.current;
    if (i) setFinalText((prev) => joinText(prev, i));
    setInterimBoth('');
  };

  const begin = useCallback(() => {
    const canRecord = opts.keepAudio && supportsContinuous && ExpoSpeechRecognitionModule.supportsRecording();
    ExpoSpeechRecognitionModule.start({
      lang: opts.lang,
      interimResults: true,
      continuous: opts.continuous && supportsContinuous,
      addsPunctuation: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      recordingOptions: canRecord ? { persist: true } : undefined,
      androidIntentOptions: {
        // Give people time to think between sentences.
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
      },
    });
  }, [opts.lang, opts.keepAudio, opts.continuous]);

  const start = useCallback(async () => {
    setError(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError('Microphone permission is off. Turn it on in your phone settings to talk to the app.');
      return false;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError('Speech recognition is not available on this phone. Install or update the Google app, then try again.');
      return false;
    }
    setFinalText('');
    setInterimBoth('');
    setAudio([]);
    setLevels(Array(LEVELS).fill(0));
    wanted.current = true;
    owner.current = true;
    restarts.current = 0;
    setStartedAt(Date.now());
    setStatus('listening');
    begin();
    return true;
  }, [begin]);

  const stop = useCallback(() => {
    if (!wanted.current) return;
    wanted.current = false;
    setStatus('stopping');
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const reset = useCallback(() => {
    setFinalText('');
    setInterimBoth('');
    setAudio([]);
    setStartedAt(null);
  }, []);

  const cancel = useCallback(() => {
    if (!owner.current && !wanted.current) return reset();
    wanted.current = false;
    owner.current = false;
    ExpoSpeechRecognitionModule.abort();
    setStatus('idle');
    setFinalText('');
    setInterimBoth('');
    setAudio([]);
    setStartedAt(null);
  }, [reset]);

  useSpeechRecognitionEvent('result', (e) => {
    if (!owner.current) return;
    const t = e.results[0]?.transcript?.trim() ?? '';
    if (e.isFinal) {
      if (t) setFinalText((prev) => joinText(prev, t));
      setInterimBoth('');
    } else {
      setInterimBoth(t);
    }
  });

  useSpeechRecognitionEvent('volumechange', (e) => {
    if (!owner.current) return;
    const v = Math.max(0, Math.min(1, (e.value + 2) / 12));
    setLevels((prev) => [...prev.slice(1), v]);
  });

  useSpeechRecognitionEvent('audioend', (e) => {
    // The file can arrive just after 'end', so accept it for a moment afterwards.
    if (!e.uri || (!owner.current && Date.now() - endedAt.current > 3000)) return;
    const uri = e.uri;
    // Move the recording out of the cache folder so the phone does not clear it.
    try {
      const dir = new Directory(Paths.document, 'audio');
      if (!dir.exists) dir.create();
      const dest = new File(dir, `note-${Date.now()}.wav`);
      new File(uri)
        .copy(dest)
        .then(() => setAudio((a) => [...a, dest.uri]))
        .catch(() => setAudio((a) => [...a, uri]));
    } catch {
      setAudio((a) => [...a, uri]);
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!owner.current) return;
    // Silence or a timeout is normal while thinking; the 'end' handler restarts.
    if (e.error === 'no-speech' || e.error === 'speech-timeout' || e.error === 'aborted') return;
    if (e.error === 'not-allowed') setError('Microphone permission is off. Turn it on in your phone settings.');
    else if (e.error === 'network') setError('Speech needs an internet connection on this phone. Check your connection and try again.');
    else if (e.error === 'busy') setError('The microphone is busy in another app. Close it and try again.');
    else setError(`Listening stopped: ${e.message || e.error}`);
    wanted.current = false;
  });

  useSpeechRecognitionEvent('end', () => {
    if (!owner.current) return;
    if (wanted.current && restarts.current < 200) {
      // The recognizer stopped on its own (a pause or an older phone). Keep going.
      restarts.current += 1;
      flushInterim();
      setTimeout(() => wanted.current && begin(), 150);
      return;
    }
    // Keep any words that never got a final result.
    flushInterim();
    wanted.current = false;
    owner.current = false;
    endedAt.current = Date.now();
    setStatus('idle');
  });

  return { status, finalText, interim, levels, audio, error, startedAt, start, stop, cancel, reset, setFinalText };
}

function joinText(prev: string, next: string) {
  if (!prev) return capitalize(next);
  const needsStop = !/[.!?]$/.test(prev);
  return `${prev}${needsStop ? '.' : ''} ${capitalize(next)}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
