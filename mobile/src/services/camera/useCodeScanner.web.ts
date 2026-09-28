export type CodeFormat = 'qr-code' | 'ean-13' | 'ean-8' | 'upc-a' | 'upc-e';

/** Web preview: ML Kit barcode scanning is phone-only. */
export function useCodeScannerOutputs(_formats: CodeFormat[], _onCodes: (values: string[]) => void): never[] {
  return [];
}
