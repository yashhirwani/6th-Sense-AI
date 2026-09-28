import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCodeScannerOutputs, type CodeFormat } from '@/services/camera/useCodeScanner';
import { AppHeader } from '@/components/AppHeader';
import { PerceptionCamera } from '@/components/camera/PerceptionCamera';
import { Icon } from '@/components/icons/Icon';
import { Badge, Card, SectionHeading, SegmentedRadio } from '@/components/ui';
import { assistant } from '@/services/assistant/assistant';
import { tts } from '@/services/audio/tts';
import { haptic } from '@/services/haptics';
import { navigation, parseLocationCode } from '@/services/navigation/navigation';
import { runScan, type ScanMode, type ScanResult } from '@/services/scanner';
import { recentScans, type ScanRow } from '@/services/scans';
import { relativeTime } from '@/services/memory';

const PRODUCT_FORMATS: CodeFormat[] = ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'qr-code'];

const TIPS: Record<ScanMode, string> = {
  text: 'Hold the page flat, about 30 cm away. Keep the whole page in view.',
  product: 'Show the barcode first, then the front label. Turn the pack slowly.',
  currency: 'Hold one note flat, about 25 cm away, in good light.',
  medicine: 'Turn the box or bottle slowly so the name and expiry face the camera.',
};

const MODE_ICON: Record<ScanMode, string> = { text: 'menu_book', product: 'barcode_scanner', currency: 'payments', medicine: 'medication' };
const KIND_ICON: Record<string, string> = { document: 'menu_book', product: 'barcode_scanner', currency: 'payments', medicine: 'medication' };

export default function ScanScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<ScanMode>('text');
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ScanRow[]>([]);
  const barcodeRef = useRef<{ value: string; at: number } | null>(null);

  useEffect(() => {
    const m = params.mode;
    if (m === 'product' || m === 'currency' || m === 'medicine' || m === 'text') setMode(m);
  }, [params.mode]);

  useFocusEffect(
    useCallback(() => {
      setRecent(recentScans());
    }, []),
  );

  const onBarcode = useCallback(
    (codes: string[]) => {
      const code = codes[0];
      if (!code) return;
      if (parseLocationCode(code)) {
        void navigation.localizeFromCode(code);
        return;
      }
      if (mode !== 'product') return;
      const prev = barcodeRef.current;
      if (prev?.value === code && Date.now() - prev.at < 10000) return;
      barcodeRef.current = { value: code, at: Date.now() };
      haptic('object');
      tts.speak('Barcode found. Press Scan now for product details.', { priority: 'high', log: false, replayable: false });
    },
    [mode],
  );
  const extra = useCodeScannerOutputs(PRODUCT_FORMATS, onBarcode);

  const scan = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPartial('');
    try {
      const bc = barcodeRef.current && Date.now() - barcodeRef.current.at < 60000 ? barcodeRef.current.value : null;
      const r = await runScan(mode, mode === 'product' ? bc : null, setPartial);
      setResult(r);
      setRecent(recentScans());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      haptic('error');
      tts.speak(msg, { priority: 'high' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Scanner Hub" />
      <ScrollView contentContainerClassName="px-margin pt-space-sm pb-space-md gap-space-md" showsVerticalScrollIndicator={false}>
        <SegmentedRadio<ScanMode>
          label="Scan mode"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setResult(null);
            setError(null);
            tts.speak(`${m === 'text' ? 'Read text' : m === 'currency' ? 'Money' : m} mode. ${TIPS[m]}`, { priority: 'high', log: false, replayable: false });
          }}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'product', label: 'Product' },
            { value: 'currency', label: 'Money' },
            { value: 'medicine', label: 'Medicine' },
          ]}
        />

        <View className="relative w-full rounded-xl overflow-hidden bg-inverse-surface shadow-md" style={{ aspectRatio: 3 / 4 }}>
          <PerceptionCamera
            owner="scan"
            showPreview
            enableDetection={false}
            extraOutputs={extra}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            permissionFallback={
              <View className="absolute inset-0 items-center justify-center p-space-md">
                <Text className="font-body-md text-body-md text-inverse-on-surface text-center">Allow camera access on the Home screen to scan.</Text>
              </View>
            }
          />
          <View pointerEvents="none" className="absolute left-6 right-6 top-10 bottom-24 rounded-xl border-2 border-inverse-on-surface/70" />
          <View className="absolute left-3 right-3 bottom-3 flex-row items-center gap-1.5 bg-inverse-surface/90 px-2.5 py-1.5 rounded-md">
            <Icon name={MODE_ICON[mode]} size={18} className="text-inverse-on-surface" />
            <Text className="font-label-sm text-label-sm text-inverse-on-surface flex-1">{TIPS[mode]}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Scanning, please wait' : `Scan now in ${mode} mode`}
          accessibilityState={{ busy }}
          onPress={() => void scan()}
          className={`w-full min-h-[64px] rounded-lg flex-row items-center justify-center gap-3 shadow-md active:scale-[0.98] ${busy ? 'bg-primary-container' : 'bg-primary'}`}
        >
          <Icon name={busy ? 'hourglass_top' : 'document_scanner'} size={28} filled className="text-on-primary" />
          <Text className="font-headline-sm text-headline-sm text-on-primary">{busy ? 'Scanning…' : 'Scan now'}</Text>
        </Pressable>

        {busy && partial ? (
          <Card className="p-space-md">
            <Text accessibilityLiveRegion="polite" className="font-body-md text-body-md text-on-surface">
              {partial}
            </Text>
          </Card>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" className="flex-row items-center gap-space-xs px-3.5 py-2.5 rounded-xl bg-error-container">
            <Icon name="error" filled className="text-on-error-container" />
            <Text className="font-label-sm text-label-sm text-on-error-container flex-1">{error}</Text>
          </View>
        ) : null}

        {result && !busy ? <ResultCard r={result} /> : null}

        <View className="gap-space-xs">
          <SectionHeading title="Recent Scans" right={recent.length ? `${recent.length} saved` : undefined} upper />
          {recent.length === 0 ? (
            <Text className="font-body-md text-body-md text-on-surface-variant px-1">Your scans will appear here.</Text>
          ) : (
            recent.slice(0, 6).map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`${r.kind}: ${r.title ?? ''}, ${relativeTime(r.created_at)}. Double tap to read aloud.`}
                onPress={() => tts.speak(r.text ?? r.title ?? '', { priority: 'high' })}
                className="flex-row items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-lowest shadow-sm active:bg-surface-container"
              >
                <View className="w-11 h-11 rounded-lg bg-surface-container items-center justify-center">
                  <Icon name={KIND_ICON[r.kind] ?? 'description'} className="text-primary" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-label-md text-label-md text-on-surface">
                    {r.title || 'Untitled'}
                  </Text>
                  <Text className="font-body-sm text-body-sm text-on-surface-variant">{relativeTime(r.created_at)}</Text>
                </View>
                <Icon name="play_circle" size={22} className="text-primary" />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ResultCard({ r }: { r: ScanResult }) {
  const shown = r.fields.filter((f) => f.value != null);
  const missing = r.fields.filter((f) => f.value == null);
  return (
    <Card className="p-space-md gap-space-sm" label="Scan result">
      <View className="flex-row items-start justify-between gap-2">
        <Text accessibilityRole="header" className="font-headline-sm text-headline-sm text-on-surface flex-1">
          {r.title}
        </Text>
        <Badge className={r.source === 'cloud' ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-fixed text-on-tertiary-fixed'}>{r.source === 'cloud' ? 'Cloud AI' : r.source === 'local-llm' ? 'Local AI' : 'On-device'}</Badge>
      </View>
      <Text className="font-body-md text-body-md text-on-surface">{r.summary}</Text>
      {shown.map((f) => (
        <View key={f.label} accessible className="bg-surface-container-low rounded-lg p-space-sm">
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{f.label}</Text>
          <Text className="font-body-md text-body-md text-on-surface">{f.value}</Text>
        </View>
      ))}
      {missing.length > 0 && r.mode !== 'text' ? (
        <Text className="font-body-sm text-body-sm text-on-surface-variant">Not found on label: {missing.map((f) => f.label.toLowerCase()).join(', ')}.</Text>
      ) : null}
      {r.warnings?.map((w) => (
        <View key={w} className="flex-row gap-2 items-start bg-tertiary-fixed rounded-lg p-space-sm">
          <Icon name="info" size={20} className="text-on-tertiary-fixed-variant" />
          <Text className="font-body-sm text-body-sm text-on-tertiary-fixed-variant flex-1">{w}</Text>
        </View>
      ))}
      <View className="flex-row gap-2">
        <Pressable accessibilityRole="button" onPress={() => tts.speak(r.summary, { priority: 'high' })} className="flex-1 min-h-[52px] rounded-lg bg-surface-container flex-row items-center justify-center gap-2 active:bg-surface-container-high">
          <Icon name="volume_up" size={20} className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">Read aloud</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ask a question about this item" onPress={() => assistant.toggleVoice('What would you like to know about it?')} className="flex-1 min-h-[52px] rounded-lg bg-surface-container flex-row items-center justify-center gap-2 active:bg-surface-container-high">
          <Icon name="forum" size={20} className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">Ask about it</Text>
        </Pressable>
      </View>
    </Card>
  );
}
