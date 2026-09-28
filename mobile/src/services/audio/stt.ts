import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { create } from 'zustand';
import { getSettings } from '@/state/settings';

/** Mic level (0..1) for the orb waveform while listening. */
export const useMicLevel = create<{ level: number }>(() => ({ level: 0 }));

const LANG: Record<string, string> = { en: 'en-IN', hi: 'hi-IN' };

export type ListenResult =
  | { ok: true; transcript: string; confidence: number }
  | { ok: false; reason: 'no-speech' | 'permission' | 'unavailable' | 'aborted' | 'error'; message?: string };

let active: { resolve: (r: ListenResult) => void; subs: { remove(): void }[] } | null = null;

export async function ensureSpeechPermission(): Promise<boolean> {
  try {
    const cur = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

export function isSttAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/**
 * Listen for one utterance using the platform recogniser (Android SpeechRecognizer / iOS SFSpeechRecognizer).
 * When "cloud processing" is off and the device supports it, recognition is forced on-device.
 */
export async function listenOnce(onPartial?: (text: string) => void): Promise<ListenResult> {
  if (active) stopListening();
  if (!isSttAvailable()) return { ok: false, reason: 'unavailable', message: 'Speech recognition is not available on this device.' };
  if (!(await ensureSpeechPermission())) return { ok: false, reason: 'permission', message: 'Microphone permission is needed to hear you.' };

  const { language, cloudProcessing } = getSettings();
  let onDevice = false;
  try {
    onDevice = !cloudProcessing && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    onDevice = false;
  }

  return new Promise<ListenResult>((resolve) => {
    let best = '';
    let bestConf = 0;
    let finished = false;
    const finish = (r: ListenResult) => {
      if (finished) return;
      finished = true;
      active?.subs.forEach((s) => s.remove());
      active = null;
      useMicLevel.setState({ level: 0 });
      resolve(r);
    };

    const subs = [
      ExpoSpeechRecognitionModule.addListener('result', (e) => {
        const r = e.results[0];
        if (!r) return;
        best = r.transcript;
        bestConf = r.confidence;
        onPartial?.(r.transcript);
        if (e.isFinal) finish(best.trim() ? { ok: true, transcript: best.trim(), confidence: bestConf } : { ok: false, reason: 'no-speech' });
      }),
      ExpoSpeechRecognitionModule.addListener('error', (e) => {
        if (e.error === 'no-speech' || e.error === 'speech-timeout') finish({ ok: false, reason: 'no-speech' });
        else if (e.error === 'aborted') finish({ ok: false, reason: 'aborted' });
        else if (e.error === 'not-allowed') finish({ ok: false, reason: 'permission', message: e.message });
        else finish({ ok: false, reason: 'error', message: e.message });
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        finish(best.trim() ? { ok: true, transcript: best.trim(), confidence: bestConf } : { ok: false, reason: 'no-speech' });
      }),
      ExpoSpeechRecognitionModule.addListener('volumechange', (e) => {
        useMicLevel.setState({ level: Math.max(0, Math.min(1, (e.value + 2) / 12)) });
      }),
    ];
    active = { resolve: finish, subs };

    try {
      ExpoSpeechRecognitionModule.start({
        lang: LANG[language] ?? 'en-IN',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: onDevice,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      });
    } catch (e) {
      finish({ ok: false, reason: 'error', message: String(e) });
    }
  });
}

/** Stop and return what was heard so far (push-to-talk release). */
export function stopListening() {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    /* noop */
  }
}

export function abortListening() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    /* noop */
  }
  active?.resolve({ ok: false, reason: 'aborted' });
}
