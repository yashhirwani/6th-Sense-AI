import { useCallback, useEffect, useState } from 'react';

export type PermKey = 'camera' | 'microphone' | 'location' | 'motion';
export type PermStatus = 'granted' | 'denied' | 'undetermined';

/** Web preview: browser permission prompts (getUserMedia / geolocation). Motion sensors are phone-only. */
async function status(key: PermKey): Promise<PermStatus> {
  if (key === 'motion') return 'undetermined';
  const name = key === 'location' ? 'geolocation' : key;
  try {
    const r = await navigator.permissions.query({ name: name as PermissionName });
    return r.state === 'granted' ? 'granted' : r.state === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export async function requestPermission(key: PermKey): Promise<boolean> {
  try {
    if (key === 'camera' || key === 'microphone') {
      const stream = await navigator.mediaDevices.getUserMedia(key === 'camera' ? { video: true } : { audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    }
    if (key === 'location') {
      return await new Promise<boolean>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { timeout: 10000 },
        ),
      );
    }
  } catch {
    return false;
  }
  return false;
}

export function usePermissions(keys: PermKey[]) {
  const [state, setState] = useState<Record<string, PermStatus>>({});
  const refresh = useCallback(async () => {
    const entries = await Promise.all(keys.map(async (k) => [k, await status(k)] as const));
    setState(Object.fromEntries(entries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(',')]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { state, refresh };
}
