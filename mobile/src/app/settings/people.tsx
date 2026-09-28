import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PerceptionCamera } from '@/components/camera/PerceptionCamera';
import { Icon } from '@/components/icons/Icon';
import { SubHeader } from '@/components/SubHeader';
import { Button, Card, SectionHeading, Toggle } from '@/components/ui';
import { api } from '@/services/api/client';
import type { KnownPerson } from '@/services/api/types';
import { tts } from '@/services/audio/tts';
import { captureForUpload } from '@/services/camera/cameraRegistry';
import { haptic } from '@/services/haptics';
import { useSettings } from '@/state/settings';

const SAMPLES = 3;

/**
 * Social assistant: enrol people who have AGREED to be recognised. Only face embeddings are stored on
 * the server (no photos). Identification is only reported above a confidence threshold.
 */
export default function PeopleScreen() {
  const faceRecognition = useSettings((s) => s.faceRecognition);
  const cloud = useSettings((s) => s.cloudProcessing);
  const update = useSettings((s) => s.update);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [samples, setSamples] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPeople(await api<KnownPerson[]>('/v1/faces'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (faceRecognition && cloud) void load();
  }, [faceRecognition, cloud, load]);

  const capture = async () => {
    try {
      const img = await captureForUpload(1024);
      setSamples((s) => [...s, img.base64]);
      haptic('success');
      tts.speak(samples.length + 1 < SAMPLES ? `Photo ${samples.length + 1} taken. Ask them to turn slightly and take another.` : 'All photos taken. Press enrol.', { priority: 'high', log: false });
    } catch (e) {
      setError(String(e));
    }
  };

  const enrol = async () => {
    if (!consent || !name.trim() || samples.length < SAMPLES) return;
    setBusy(true);
    try {
      await api('/v1/faces', { method: 'POST', body: { name: name.trim(), images_b64: samples, consent: true }, timeoutMs: 60000 });
      tts.speak(`${name} enrolled.`, { priority: 'high', log: false });
      setName('');
      setSamples([]);
      setConsent(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      tts.speak('Enrolment failed. Make sure one face is clearly visible.', { priority: 'high', log: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <SubHeader title="Known People" subtitle={faceRecognition ? 'Face recognition on' : 'Face recognition off'} />
      <ScrollView contentContainerClassName="px-margin py-space-md gap-space-lg" keyboardShouldPersistTaps="handled">
        <Card className="p-space-md gap-space-sm">
          <View className="flex-row items-center justify-between gap-space-sm">
            <View className="flex-1">
              <Text className="font-label-md text-label-md text-on-surface">Recognise people I enrol</Text>
              <Text className="font-body-sm text-body-sm text-on-surface-variant">Names are only spoken when the match is confident; otherwise you'll hear “someone”.</Text>
            </View>
            <Toggle label="Recognise people I enrol" value={faceRecognition} onChange={(v) => update({ faceRecognition: v })} />
          </View>
          {!cloud ? <Text className="font-body-sm text-body-sm text-tertiary">Needs cloud processing (Settings → Privacy).</Text> : null}
        </Card>

        {faceRecognition && cloud ? (
          <>
            <View className="gap-space-xs">
              <SectionHeading title="Enrolled" upper right={`${people.length}`} />
              {error ? <Text className="font-body-sm text-body-sm text-error">{error}</Text> : null}
              {people.map((p) => (
                <View key={p.id} className="flex-row items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-lowest shadow-sm">
                  <View className="w-11 h-11 rounded-lg bg-secondary-container items-center justify-center">
                    <Icon name="person" className="text-on-secondary-container" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-label-md text-label-md text-on-surface">{p.name}</Text>
                    <Text className="font-body-sm text-body-sm text-on-surface-variant">{p.samples} face samples</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${p.name} and delete their face data`}
                    onPress={async () => {
                      await api(`/v1/faces/${p.id}`, { method: 'DELETE' });
                      await load();
                    }}
                    className="w-11 h-11 items-center justify-center rounded-lg bg-surface-container"
                  >
                    <Icon name="delete" className="text-error" />
                  </Pressable>
                </View>
              ))}
            </View>

            <View className="gap-space-sm">
              <SectionHeading title="Enrol someone" upper />
              <View className="w-full rounded-xl overflow-hidden bg-inverse-surface" style={{ aspectRatio: 3 / 4 }}>
                <PerceptionCamera owner="people" showPreview enableDetection={false} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
              </View>
              <Text className="font-body-sm text-body-sm text-on-surface-variant">Ask a sighted helper or the person to frame their face. {samples.length}/{SAMPLES} photos taken.</Text>
              <Button title={`Take photo ${Math.min(samples.length + 1, SAMPLES)} of ${SAMPLES}`} icon="photo_camera" variant="secondary" onPress={() => void capture()} />
              <TextInput accessibilityLabel="Person's name" placeholder="Name" value={name} onChangeText={setName} className="min-h-[56px] px-space-sm rounded-lg border-2 border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface" />
              <View className="flex-row items-center justify-between gap-space-sm min-h-[48px]">
                <Text className="font-label-md text-label-md text-on-surface flex-1">This person agreed to be recognised by my assistant</Text>
                <Toggle label="Consent given" value={consent} onChange={setConsent} />
              </View>
              <Button title={busy ? 'Enrolling…' : 'Enrol'} icon="how_to_reg" onPress={() => void enrol()} className={!consent || !name.trim() || samples.length < SAMPLES ? 'opacity-50' : ''} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
