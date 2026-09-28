import { useMemo, useRef } from 'react';
import type { CameraOutput } from 'react-native-vision-camera';
import { useBarcodeScannerOutput, type TargetBarcodeFormat } from 'react-native-vision-camera-barcode-scanner';

export type CodeFormat = Extract<TargetBarcodeFormat, 'qr-code' | 'ean-13' | 'ean-8' | 'upc-a' | 'upc-e'>;

/** ML Kit barcode/QR scanning attached to the live camera. Returns extra outputs for <PerceptionCamera>. */
export function useCodeScannerOutputs(formats: CodeFormat[], onCodes: (values: string[]) => void): CameraOutput[] {
  const cb = useRef(onCodes);
  cb.current = onCodes;
  const output = useBarcodeScannerOutput({
    barcodeFormats: formats,
    onBarcodeScanned: (codes) => {
      const values = codes.map((c) => c.rawValue).filter((v): v is string => !!v);
      if (values.length) cb.current(values);
    },
    onError: () => {},
  });
  return useMemo(() => [output], [output]);
}
