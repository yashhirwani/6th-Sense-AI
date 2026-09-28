import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { SubHeader } from '@/components/SubHeader';
import { ActionRow, Card, SectionHeading, SegmentedRadio, Toggle } from '@/components/ui';
import { probeBackend } from '@/services/api/client';
import { tts } from '@/services/audio/tts';
import { haptic } from '@/services/haptics';
import { useAssistant } from '@/state/assistant';
import { useSettings, type HapticStrength, type Language, type SpeechRate, type TextScale } from '@/state/settings';

export default function SettingsScreen() {
  const s = useSettings();
  const online = useAssistant((x) => x.backendOnline);
  const caps = useAssistant((x) => x.capabilities);
  const [url, setUrl] = useState(s.backendUrl);
  const [testing, setTesting] = useState(false);

  const testServer = async () => {
    setTesting(true);
    s.update({ backendUrl: url.trim() });
    const c = await probeBackend();
    setTesting(false);
    tts.speak(c ? `Connected to the server. ${c.llm.available ? `Cloud reasoning with ${c.llm.model}.` : 'Cloud reasoning is not configured.'}` : 'Could not reach the server at that address.', { priority: 'high' });
  };

  return (
    <View className="flex-1 bg-surface">
      <SubHeader title="Profile & Voice Preferences" subtitle="Everything here can also be changed by voice" />
      <ScrollView contentContainerClassName="px-margin py-space-md gap-space-lg" showsVerticalScrollIndicator={false}>
        <View className="gap-space-sm">
          <SectionHeading title="Voice & Feedback" upper />
          <Card className="p-space-md gap-space-md">
            <Row label="Speech speed" icon="speed">
              <SegmentedRadio<SpeechRate> label="Speech speed" value={s.speechRate} onChange={(v) => s.update({ speechRate: v })} options={[{ value: 1, label: '1.0x' }, { value: 1.25, label: '1.25x' }, { value: 1.5, label: '1.5x' }]} />
            </Row>
            <Row label="Haptic strength" icon="touch_app">
              <SegmentedRadio<HapticStrength>
                label="Haptic strength"
                value={s.hapticStrength}
                activeClass="bg-secondary"
                activeText="text-on-secondary"
                onChange={(v) => {
                  s.update({ hapticStrength: v });
                  haptic('object', v);
                }}
                options={[{ value: 'gentle', label: 'Gentle' }, { value: 'crisp', label: 'Crisp' }, { value: 'strong', label: 'Strong' }]}
              />
            </Row>
            <Row label="Language" icon="translate">
              <SegmentedRadio<Language> label="Language" value={s.language} onChange={(v) => s.update({ language: v })} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
            </Row>
            <Row label="Text size" icon="format_size">
              <SegmentedRadio<TextScale> label="Text size" value={s.textScale} onChange={(v) => s.update({ textScale: v })} options={[{ value: 'default', label: 'Default' }, { value: 'large', label: 'Large' }, { value: 'xl', label: 'XL' }]} />
            </Row>
            <SwitchRow label="Voice announcements" hint="When off, alerts use sounds and vibration only" value={s.voiceEnabled} onChange={(v) => s.update({ voiceEnabled: v })} />
            <SwitchRow label="Stereo spatial cues" hint="Alert sounds come from the object's direction (use headphones)" value={s.spatialAudio} onChange={(v) => s.update({ spatialAudio: v })} />
            <SwitchRow label="High contrast (dark)" value={s.highContrast} onChange={(v) => s.update({ highContrast: v })} />
          </Card>
        </View>

        <View className="gap-space-sm">
          <SectionHeading title="Safety" upper />
          <Card className="p-space-md gap-space-md">
            <SwitchRow label="Possible-fall detection" hint="Uses the motion sensor while the app is open" value={s.fallDetection} onChange={(v) => s.update({ fallDetection: v })} />
            <Row label={`Countdown before alerting: ${s.emergencyCountdownSec}s`} icon="timer">
              <SegmentedRadio<number> label="Countdown" value={s.emergencyCountdownSec} onChange={(v) => s.update({ emergencyCountdownSec: v })} options={[{ value: 8, label: '8s' }, { value: 15, label: '15s' }, { value: 30, label: '30s' }]} />
            </Row>
          </Card>
          <ActionRow icon="contact_emergency" tileClass="bg-primary-fixed" iconClass="text-on-primary-fixed" title="Emergency contacts" subtitle="Who is alerted, and how" onPress={() => router.push('/settings/contacts')} />
        </View>

        <View className="gap-space-sm">
          <SectionHeading title="Privacy & Data" upper />
          <Card className="p-space-md gap-space-md">
            <SwitchRow
              label="Cloud AI processing"
              hint="Off = nothing leaves the phone: on-device detection, OCR and speech only"
              value={s.cloudProcessing}
              onChange={(v) => {
                s.update({ cloudProcessing: v });
                tts.speak(v ? 'Cloud processing on.' : 'Cloud processing off. Only on-device features will be used.', { priority: 'high', log: false });
              }}
            />
            <SwitchRow label="Remember where I leave things" hint="Stores object sightings with time and place on this phone" value={s.memoryEnabled} onChange={(v) => s.update({ memoryEnabled: v })} />
            <SwitchRow label="Recognise people I enrol" hint="Off by default. Only people who agreed to be enrolled" value={s.faceRecognition} onChange={(v) => s.update({ faceRecognition: v })} />
          </Card>
          <ActionRow icon="neurology" tileClass="bg-secondary-fixed" iconClass="text-on-secondary-fixed" title="Memories" subtitle="Review and delete what the assistant remembers" onPress={() => router.push('/settings/memories')} />
          <ActionRow icon="group" tileClass="bg-tertiary-fixed" iconClass="text-on-tertiary-fixed" title="Known people" subtitle={s.faceRecognition ? 'Enrol or remove people' : 'Face recognition is off'} onPress={() => router.push('/settings/people')} />
          <ActionRow icon="delete_forever" tileClass="bg-error-container" iconClass="text-on-error-container" title="Privacy & delete my data" subtitle="What is stored, and erase it" onPress={() => router.push('/settings/privacy')} />
        </View>

        <View className="gap-space-sm">
          <SectionHeading title="AI Server" upper />
          <Card className="p-space-md gap-space-sm">
            <View className="flex-row items-center gap-2">
              <View className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-secondary' : online === false ? 'bg-error' : 'bg-outline'}`} />
              <Text className="font-label-md text-label-md text-on-surface">{online ? 'Connected' : online === false ? 'Not reachable' : 'Unknown'}</Text>
            </View>
            {online ? (
              <Text className="font-body-sm text-body-sm text-on-surface-variant">
                {[caps.llm ? 'Cloud vision AI' : null, caps.localLlm ? 'Local AI' : null, caps.ocr ? 'OCR' : null, caps.openVocab ? 'Extended hazards' : null, caps.faces ? 'Face ID' : null, caps.product ? 'Product lookup' : null, caps.sms ? 'Automatic SMS alerts' : null].filter(Boolean).join(' • ') || 'No AI engines available on the server'}
              </Text>
            ) : null}
            <Text className="font-label-sm text-label-sm text-on-surface-variant">Server address</Text>
            <TextInput
              accessibilityLabel="Server address"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              className="min-h-[56px] px-space-sm rounded-lg border-2 border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface"
            />
            <Pressable accessibilityRole="button" onPress={() => void testServer()} className="min-h-[52px] rounded-lg bg-primary items-center justify-center active:opacity-90">
              <Text className="font-label-md text-label-md text-on-primary">{testing ? 'Testing…' : 'Save & test connection'}</Text>
            </Pressable>
          </Card>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replay the onboarding and calibration screen"
          onPress={() => {
            s.update({ onboarded: false });
            router.replace('/onboarding');
          }}
          className="min-h-[52px] rounded-lg bg-surface-container flex-row items-center justify-center gap-2"
        >
          <Icon name="restart_alt" size={20} className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">Run setup again</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} size={18} className="text-on-surface" />
        <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
      </View>
      {children}
    </View>
  );
}

function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center justify-between gap-space-sm min-h-[48px]">
      <View className="flex-1">
        <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
        {hint ? <Text className="font-body-sm text-body-sm text-on-surface-variant">{hint}</Text> : null}
      </View>
      <Toggle label={label} value={value} onChange={onChange} />
    </View>
  );
}
