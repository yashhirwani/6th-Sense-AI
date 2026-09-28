import { ScrollView, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { CameraViewport } from '@/components/camera/CameraViewport';
import { Icon } from '@/components/icons/Icon';
import { Ping } from '@/components/motion';
import { NarrationCard } from '@/components/NarrationCard';
import { ActionTile } from '@/components/ui';
import { VoiceOrb } from '@/components/VoiceOrb';
import { assistant } from '@/services/assistant/assistant';
import { isPathClear } from '@/services/perception/hazards';
import { lightQuality, useAmbientLight } from '@/services/sensors';
import { useAssistant, type AssistantStatus } from '@/state/assistant';
import { usePerception } from '@/state/perception';
import { useSettings } from '@/state/settings';

const STATE_TEXT: Record<AssistantStatus, string> = {
  idle: 'Voice AI Active • Scanning',
  listening: 'Listening to voice input...',
  processing: 'Processing Multimodal Stream...',
  speaking: 'Speaking Spatial Narration...',
  error: 'Voice AI • Tap to retry',
};

export default function HomeScreen() {
  const focused = useIsFocused();
  useAmbientLight(focused);
  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Home Assistant" />
      <ScrollView contentContainerClassName="px-margin pb-6 gap-space-md" showsVerticalScrollIndicator={false}>
        <StatusBar />
        <CameraViewport />
        <NarrationCard />
        <VoiceOrb />
        <QuickActions />
        <EnvironmentFooter />
      </ScrollView>
    </View>
  );
}

/** "Status & Environmental Telemetry Bar" + hazard / clear-space banner. */
function StatusBar() {
  const status = useAssistant((s) => s.status);
  const spatial = useSettings((s) => s.spatialAudio);
  const hazards = usePerception((s) => s.hazards);
  const detections = usePerception((s) => s.detections);
  const detectorState = usePerception((s) => s.detectorState);
  const cameraActive = usePerception((s) => s.cameraActive);
  const top = hazards[0];

  let banner: { cls: string; text: string; icon: string; textCls: string };
  if (top && (top.severity === 'critical' || top.severity === 'warning')) {
    banner = top.severity === 'critical'
      ? { cls: 'bg-error-container', textCls: 'text-on-error-container', icon: 'warning', text: top.message }
      : { cls: 'bg-tertiary-fixed', textCls: 'text-on-tertiary-fixed-variant', icon: 'warning', text: top.message };
  } else if (!cameraActive || detectorState !== 'ready') {
    banner = { cls: 'bg-surface-container-high', textCls: 'text-on-surface-variant', icon: 'photo_camera', text: detectorState === 'error' || detectorState === 'unavailable' ? 'Obstacle detection unavailable on this device' : 'Starting camera and obstacle detection…' };
  } else if (top) {
    banner = { cls: 'bg-surface-container-high', textCls: 'text-on-surface', icon: 'info', text: top.message };
  } else if (isPathClear(detections)) {
    banner = { cls: 'bg-secondary-fixed', textCls: 'text-on-secondary-fixed-variant', icon: 'verified_user', text: 'Area appears clear • No obstacles detected within 3m ahead' };
  } else {
    banner = { cls: 'bg-surface-container-high', textCls: 'text-on-surface', icon: 'info', text: 'Objects ahead • Tap the orb for details' };
  }

  return (
    <View accessibilityLabel="Sensory state and safety alerts" className="flex-col gap-space-xs pt-2">
      <View className="flex-row items-center justify-between gap-space-xs flex-wrap">
        <View className="flex-row items-center gap-space-xs px-3 py-1.5 rounded-full bg-surface-container-high shadow-sm">
          {status === 'idle' ? <Ping className="bg-primary" size={10} /> : <View className="w-2.5 h-2.5 rounded-full bg-primary" />}
          <Text className="font-label-sm text-label-sm text-on-surface">{STATE_TEXT[status]}</Text>
        </View>
        <View accessibilityLabel={spatial ? 'Stereo spatial audio cues on' : 'Spatial audio off'} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest shadow-sm">
          <Icon name="headphones" size={18} filled className={spatial ? 'text-secondary' : 'text-outline'} />
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{spatial ? 'Stereo Spatial' : 'Spatial Off'}</Text>
        </View>
      </View>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite" className={`flex-row items-center gap-space-xs px-3.5 py-2.5 rounded-xl shadow-sm ${banner.cls}`}>
        <Icon name={banner.icon} size={22} filled className={banner.textCls} />
        <Text className={`font-label-sm text-label-sm flex-1 ${banner.textCls}`}>{banner.text}</Text>
      </View>
    </View>
  );
}

function QuickActions() {
  return (
    <View accessibilityLabel="Instant voice assistive modes" className="flex-col gap-space-sm">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-headline-sm text-headline-sm text-on-surface">
          Quick Actions
        </Text>
        <Text className="font-label-sm text-label-sm text-on-surface-variant">Voice or Tap</Text>
      </View>
      <View className="flex-row gap-space-sm">
        <ActionTile icon="visibility" title="Describe" hint="“What is around me?”" a11y="Describe Scene. What is around me?" onPress={() => assistant.quick('describe')} />
        <ActionTile icon="search_insights" title="Find Object" hint="“Keys, door, chair”" a11y="Find Object. Locate keys, door, or chair" tileClass="bg-secondary-fixed" iconClass="text-secondary" onPress={() => assistant.quick('find')} />
      </View>
      <View className="flex-row gap-space-sm">
        <ActionTile icon="menu_book" title="Read Text" hint="“Signs, pages, tags”" a11y="Read Text. Signs, documents, and labels" onPress={() => assistant.quick('read')} />
        <ActionTile icon="near_me" title="Navigate" hint="“Guide to exit”" a11y="Navigate. Guide me to exit or hallway" onPress={() => assistant.quick('navigate')} />
      </View>
      <View className="flex-row gap-space-sm">
        <ActionTile icon="chat_spark" title="Ask AI" hint="“Explain this board”" a11y="Ask AI. Open conversational query" onPress={() => assistant.quick('ask')} />
        <ActionTile icon="barcode_scanner" title="Scan Item" hint="“Medicine, bills”" a11y="Scan Item. Barcodes, medicine labels, currency" onPress={() => assistant.quick('scan')} />
      </View>
    </View>
  );
}

/** "Environmental Lighting & Spatial Calibration Footer Pill" - real light sensor + honest depth source. */
function EnvironmentFooter() {
  const lux = usePerception((s) => s.lux);
  return (
    <View className="flex-row items-center justify-between bg-surface-container-low px-space-md py-3 rounded-xl shadow-sm mt-1">
      <View className="flex-row items-center gap-2 flex-1">
        <Icon name="wb_sunny" size={20} className="text-tertiary" />
        <Text className="font-label-sm text-label-sm text-on-surface-variant flex-shrink">
          {lux == null ? 'Ambient Light: sensor unavailable' : `Ambient Light: ${lux} Lux (${lightQuality(lux)})`}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Icon name="compass_calibration" size={18} className="text-secondary" />
        <Text className="font-label-sm text-label-sm font-semibold text-on-surface">Depth: Estimated</Text>
      </View>
    </View>
  );
}
