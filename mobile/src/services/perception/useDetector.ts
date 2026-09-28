import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { loadTensorflowModel, type TensorflowModel, type TensorflowModelDelegate } from 'react-native-fast-tflite';
import { perceptionStore } from '@/state/perception';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_ASSET = require('../../../assets/models/yolo11n_320.tflite');

let cached: Promise<{ model: TensorflowModel; delegate: string }> | null = null;

/** Try hardware acceleration first, then fall back to the CPU (XNNPACK) path. */
async function loadWithFallback() {
  const attempts: TensorflowModelDelegate[][] = Platform.OS === 'ios' ? [['core-ml'], []] : [['android-gpu'], []];
  let lastErr: unknown;
  for (const delegates of attempts) {
    try {
      const model = await loadTensorflowModel(MODEL_ASSET, delegates);
      return { model, delegate: delegates[0] ?? 'cpu' };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Loads the on-device YOLO11n detector once for the app lifetime. */
export function useDetector() {
  const [model, setModel] = useState<TensorflowModel | null>(null);
  useEffect(() => {
    let alive = true;
    perceptionStore.getState().setDetector('loading');
    cached ??= loadWithFallback();
    cached
      .then(({ model: m, delegate }) => {
        if (!alive) return;
        if (__DEV__) console.log(`[detector] YOLO11n loaded (${delegate})`, m.inputs, m.outputs);
        setModel(m);
        perceptionStore.getState().setDetector('ready');
      })
      .catch((e) => {
        cached = null;
        if (!alive) return;
        perceptionStore.getState().setDetector('error', `Could not load the on-device detector: ${String(e)}`);
      });
    return () => {
      alive = false;
    };
  }, []);
  return model;
}
