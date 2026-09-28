import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCodeScannerOutputs, type CodeFormat } from '@/services/camera/useCodeScanner';
import { AppHeader } from '@/components/AppHeader';
import { PerceptionCamera } from '@/components/camera/PerceptionCamera';
import { Icon } from '@/components/icons/Icon';
import { Ping } from '@/components/motion';
import { RadarView } from '@/components/RadarView';
import { Badge, Card } from '@/components/ui';
import { assistant } from '@/services/assistant/assistant';
import { spatialAudio } from '@/services/audio/spatialAudio';
import { tts } from '@/services/audio/tts';
import { haptic } from '@/services/haptics';
import { navigation, parseLocationCode } from '@/services/navigation/navigation';
import { spokenBearing, spokenDistance } from '@/services/perception/geometry';
import type { Detection } from '@/services/perception/types';
import { relativeTime } from '@/services/memory';
import { useAssistant } from '@/state/assistant';
import { useNavigation } from '@/state/navigation';
import { usePerception } from '@/state/perception';
import { useSettings } from '@/state/settings';

const QR_FORMATS: CodeFormat[] = ['qr-code'];

export default function ExploreScreen() {
  const detections = usePerception((s) => s.detections);
  const [lastCode, setLastCode] = useState<string | null>(null);

  // Location codes are read continuously by the (headless) camera while Explore is open.
  const extra = useCodeScannerOutputs(QR_FORMATS, (values) => {
    const v = values.find((x) => parseLocationCode(x));
    if (v && v !== lastCode) {
      setLastCode(v);
      void navigation.localizeFromCode(v);
    }
  });

  const sorted = useMemo(() => [...detections].sort((a, b) => (a.distanceM ?? 99) - (b.distanceM ?? 99)), [detections]);

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Scene Explore" />
      <PerceptionCamera owner="explore" showPreview={false} extraOutputs={extra} />
      <ScrollView contentContainerClassName="px-margin pt-space-sm pb-space-md gap-space-md" showsVerticalScrollIndicator={false}>
        <LocalizationCard />
        <Card className="p-space-md gap-space-sm" label="Spatial Orientation Radar">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Icon name="radar" size={20} className="text-primary" />
              <Text className="font-label-md text-label-md text-on-surface">Sensory Iris Spatial Depth</Text>
            </View>
            <RadarStatus />
          </View>
          <RadarView detections={sorted} />
        </Card>
        <NavCueCard nearest={sorted.find((d) => d.bearing === 'front')} />
        <ObjectList detections={sorted.slice(0, 4)} total={detections.length} />
        <VoiceClarifications />
      </ScrollView>
    </View>
  );
}

function RadarStatus() {
  const fps = usePerception((s) => s.fps);
  const state = usePerception((s) => s.detectorState);
  return <Text className="font-label-sm text-label-sm text-on-surface-variant">{state === 'ready' ? `FOV ~54° • ${fps.toFixed(0)} FPS` : 'Detector starting…'}</Text>;
}

/** "Indoor Anchor & Beacon Status Header Card" - bound to real QR / AprilTag localization. */
function LocalizationCard() {
  const nav = useNavigation();
  const spatial = useSettings((s) => s.spatialAudio);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const locked = nav.place && nav.node;
  const method = nav.method === 'qr' ? 'QR Code' : nav.method === 'apriltag' ? 'AprilTag' : 'GPS';

  return (
    <Card className="p-space-md gap-space-xs" label="Indoor localization context">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-space-xs">
          <View className={`w-8 h-8 rounded-full items-center justify-center ${locked ? 'bg-secondary-container' : 'bg-surface-container-high'}`}>
            <Icon name="pin_drop" size={20} filled className={locked ? 'text-on-secondary-container' : 'text-on-surface-variant'} />
          </View>
          <Text className={`font-label-sm text-label-sm uppercase tracking-wider ${locked ? 'text-secondary' : 'text-on-surface-variant'}`}>{locked ? `${method} Anchor Locked` : 'No Indoor Anchor'}</Text>
        </View>
        {locked && nav.lockedAt ? (
          <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container">
            <Ping className="bg-secondary" size={8} />
            <Text className="font-label-sm text-label-sm font-semibold text-on-surface-variant">{relativeTime(nav.lockedAt)}</Text>
          </View>
        ) : null}
      </View>
      <View className="mt-1">
        <Text accessibilityRole="header" className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
          {locked ? nav.node!.name : nav.outdoor?.street ?? 'Location unknown'}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <Icon name="domain" size={18} className="text-tertiary" />
          <Text className="font-body-md text-body-md text-on-surface-variant flex-1">
            {locked ? [nav.place!.name, nav.place!.building, nav.place!.floor].filter(Boolean).join(' • ') : 'Point the camera at a 6th Sense location code to locate yourself indoors.'}
          </Text>
        </View>
      </View>
      {!locked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Look for a location code or AprilTag with the camera"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            haptic('tap');
            const ok = await navigation.localizeFromCamera();
            setBusy(false);
            if (!ok) tts.speak('No location code found. Hold the phone up and slowly turn around.', { priority: 'high' });
          }}
          className="mt-space-xs min-h-[48px] rounded-lg bg-surface-container flex-row items-center justify-center gap-2 active:bg-surface-container-high"
        >
          <Icon name="qr_code_scanner" size={20} className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">{busy ? 'Looking…' : 'Locate me with the camera'}</Text>
        </Pressable>
      ) : null}
      <View className="mt-space-xs flex-row items-center justify-between bg-surface-container-low rounded-lg p-space-sm">
        <View className="flex-row items-center gap-2">
          <Icon name="hearing" size={22} className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">Spatial Audio Engine</Text>
        </View>
        <Badge className={spatial ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}>{spatial ? 'Stereo Active' : 'Off'}</Badge>
      </View>
    </Card>
  );
}

/** "Live Audio Navigation Guidance Strip". Real route guidance when navigating, otherwise live path advice. */
function NavCueCard({ nearest }: { nearest?: Detection }) {
  const nav = useNavigation();
  const step = nav.active ? nav.route?.steps[nav.stepIndex] : undefined;
  const total = nav.route?.total_m ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((nav.walkedM / total) * 100)) : 0;

  const cue = step
    ? step.instruction
    : nearest && nearest.distanceM != null && nearest.distanceM < 2.5
      ? `${cap(nearest.name)} ${spokenDistance(nearest.distanceM)} ahead. Step ${nearest.angleDeg < 0 ? 'to the right' : 'to the left'} to pass it.`
      : 'Path ahead looks clear of detected obstacles.';

  return (
    <View accessibilityLabel="Real-time Voice Navigation Directives" className="bg-primary rounded-xl p-space-md shadow-md gap-space-sm">
      <View className="flex-row items-center gap-space-xs">
        <View className="w-10 h-10 rounded-full bg-primary-container items-center justify-center">
          <Icon name="volume_up" className="text-on-primary-container" />
        </View>
        <View className="flex-1">
          <Text className="font-label-sm text-label-sm uppercase tracking-wider text-on-primary opacity-90">{step ? `Audio Nav Cue • to ${nav.destination}` : 'Audio Nav Cue'}</Text>
          <Text accessibilityLiveRegion="polite" className="font-label-lg text-label-lg font-bold text-on-primary">
            “{cue}”
          </Text>
        </View>
      </View>
      <View className="bg-primary-container/80 rounded-lg p-space-sm flex-row items-center justify-between gap-space-sm">
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          <Icon name="vibration" size={20} className="text-on-primary-container" />
          <Text numberOfLines={1} className="font-body-sm text-body-sm text-on-primary-container flex-1">
            {nav.lastCue ?? 'Left: two pulses • Right: three pulses'}
          </Text>
        </View>
        <View className="bg-surface-container-lowest px-2 py-0.5 rounded">
          <Text className="font-label-sm text-label-sm text-primary font-bold">Haptic Cue</Text>
        </View>
      </View>
      {nav.active ? (
        <View className="gap-1.5 mt-1">
          <View className="flex-row justify-between items-center">
            <Text className="font-label-md text-label-md text-on-primary">Waypoint {nav.stepIndex + 1} of {nav.route?.steps.length}</Text>
            <Text className="font-label-md text-label-md font-bold text-on-primary">{Math.max(0, total - nav.walkedM).toFixed(1)} m remaining</Text>
          </View>
          <View className="w-full h-3 rounded-full bg-on-primary/25 overflow-hidden" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View className="h-full bg-secondary-fixed rounded-full" style={{ width: `${pct}%` }} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => navigation.stop()} className="self-start mt-1 min-h-[44px] px-3 rounded-lg bg-primary-container justify-center">
            <Text className="font-label-md text-label-md text-on-primary-container">Stop navigation</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start indoor navigation. You will be asked where to go."
          onPress={() => assistant.quick('navigate')}
          className="self-start min-h-[44px] px-3 rounded-lg bg-primary-container flex-row items-center gap-1.5"
        >
          <Icon name="navigation" size={18} className="text-on-primary-container" />
          <Text className="font-label-md text-label-md text-on-primary-container">Navigate to…</Text>
        </Pressable>
      )}
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Real-time Spatial Object Breakdown" - live tracked objects with contextual actions. */
function ObjectList({ detections, total }: { detections: Detection[]; total: number }) {
  return (
    <View accessibilityLabel="Detected spatial objects list" className="gap-space-sm">
      <View className="flex-row items-center justify-between px-0.5">
        <Text accessibilityRole="header" className="font-headline-sm text-headline-sm text-on-surface">
          Spatial Obstacles & Entities
        </Text>
        <Text className="font-label-sm text-label-sm text-on-surface-variant font-medium">{total} items tracked</Text>
      </View>
      {detections.length === 0 ? (
        <Card className="p-space-md flex-row items-center gap-space-sm">
          <Icon name="visibility" className="text-outline" />
          <Text className="font-body-md text-body-md text-on-surface-variant flex-1">Nothing detected yet. Hold the phone at chest height and turn slowly.</Text>
        </Card>
      ) : (
        detections.map((d) => <ObjectCard key={d.id} d={d} />)
      )}
    </View>
  );
}

function ObjectCard({ d }: { d: Detection }) {
  const inPath = d.bearing === 'front' && d.distanceM != null && d.distanceM < 2;
  const isPerson = d.label === 'person';
  const furniture = ['chair', 'couch', 'bench', 'dining table', 'bed', 'toilet'].includes(d.label);
  const where = `${d.distanceM != null ? `${d.distanceM.toFixed(1)} m away` : 'Distance unknown'} • ${d.bearing === 'front' ? 'Directly in front' : `To your ${cap(d.bearing)}`}`;

  const badge = inPath
    ? { cls: 'bg-error-container text-on-error-container', text: 'Front Obstacle' }
    : isPerson
      ? { cls: 'bg-secondary-container text-on-secondary-container', text: `${Math.round(d.confidence * 100)}% Confidence` }
      : furniture
        ? { cls: 'bg-tertiary-fixed text-on-tertiary-fixed', text: 'Stationary' }
        : { cls: 'bg-surface-container-high text-on-surface-variant', text: `${Math.round(d.confidence * 100)}%` };

  const speakWhere = () => {
    spatialAudio.play('object', { angleDeg: d.angleDeg });
    tts.speak(`${cap(d.name)}, ${[spokenDistance(d.distanceM), spokenBearing(d.bearing)].filter(Boolean).join(' ')}.`, { priority: 'high', bearing: d.bearing, earcon: null });
  };

  let action: { label: string; icon: string; primary: boolean; a11y: string; onPress: () => void };
  if (inPath) {
    const side = d.angleDeg < 0 ? 'right' : 'left';
    action = {
      label: 'Guide Around',
      icon: side === 'right' ? 'turn_slight_right' : 'turn_slight_left',
      primary: true,
      a11y: `Guide around ${d.name} obstacle`,
      onPress: () => {
        haptic(side === 'right' ? 'navigate-right' : 'navigate-left');
        tts.speak(`${cap(d.name)} ahead. Take two steps to the ${side}, then continue forward.`, { priority: 'high', bearing: side, earcon: 'navigate' });
      },
    };
  } else if (isPerson) {
    action = { label: 'Audio Ping', icon: 'spatial_audio_off', primary: false, a11y: 'Play a sound from the person’s direction', onPress: speakWhere };
  } else {
    action = { label: 'Track', icon: 'navigation', primary: false, a11y: `Guide me to the ${d.name}`, onPress: () => void assistant.run({ type: 'find', target: d.name }) };
  }

  return (
    <Card className="p-space-md gap-space-xs">
      <View className="flex-row items-center gap-space-xs">
        <View className={`w-10 h-10 rounded-lg items-center justify-center ${isPerson ? 'bg-secondary-container' : 'bg-surface-container-high'}`}>
          <Icon name={isPerson ? 'person' : d.icon} className={isPerson ? 'text-on-secondary-container' : inPath ? 'text-primary' : 'text-tertiary'} />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="font-headline-sm text-headline-sm text-on-surface">{isPerson ? 'Person' : cap(d.name)}</Text>
            <Badge className={badge.cls}>{badge.text}</Badge>
          </View>
          <Text className="font-body-md text-body-md text-on-surface-variant">{where}</Text>
        </View>
      </View>
      <View className="mt-2 flex-row items-center justify-between pt-2 gap-2">
        <Text className="font-body-sm text-body-sm text-on-surface-variant flex-1">
          {d.approachRate > 0.25 ? 'Getting closer' : inPath ? 'In your walking path' : isPerson ? 'Ask “who is here?” for more' : 'Tap to be guided to it'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.a11y}
          onPress={action.onPress}
          className={`min-h-[48px] px-space-md rounded-lg flex-row items-center gap-1.5 active:opacity-90 ${action.primary ? 'bg-primary shadow-sm' : 'bg-surface-container'}`}
        >
          <Icon name={action.icon} size={18} className={action.primary ? 'text-on-primary' : 'text-on-surface'} />
          <Text className={`font-label-md text-label-md ${action.primary ? 'text-on-primary' : 'text-on-surface'}`}>{action.label}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

/** "Voice Interaction Mini Chat" - the real last question and answer. */
function VoiceClarifications() {
  const conversation = useAssistant((s) => s.conversation);
  const voiceEnabled = useSettings((s) => s.voiceEnabled);
  const update = useSettings((s) => s.update);
  const lastUser = [...conversation].reverse().find((t) => t.role === 'user');
  const lastAi = [...conversation].reverse().find((t) => t.role === 'assistant');

  return (
    <Card className="p-space-md gap-space-sm" label="Sensory Voice Assistant Mini Chat">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon name="smart_toy" size={22} className="text-primary" />
          <Text accessibilityRole="header" className="font-headline-sm text-headline-sm text-on-surface">
            Voice Clarifications
          </Text>
        </View>
        <Text className="font-label-sm text-label-sm text-on-surface-variant">Live transcript</Text>
      </View>
      <View className="gap-space-xs bg-surface-container-low rounded-xl p-space-sm">
        {lastUser ? (
          <View className="flex-row items-start justify-end gap-2">
            <View className="bg-surface-container-high rounded-xl rounded-tr-none px-3.5 py-2 max-w-[85%]">
              <Text className="font-label-sm text-label-sm text-on-surface-variant font-semibold">You asked</Text>
              <Text className="font-body-md text-body-md text-on-surface">“{lastUser.text}”</Text>
            </View>
            <View className="w-7 h-7 rounded-full bg-surface-container items-center justify-center">
              <Icon name="person" size={16} className="text-on-surface" />
            </View>
          </View>
        ) : (
          <Text className="font-body-md text-body-md text-on-surface-variant">Hold the orb on Home, or tap Ask AI, and ask a question like “Is there an empty seat?”</Text>
        )}
        {lastAi ? (
          <View className="flex-row items-start gap-2 mt-1">
            <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
              <Icon name="grain" size={16} className="text-on-primary" />
            </View>
            <View className="bg-surface-container-lowest rounded-xl rounded-tl-none p-3 shadow-sm max-w-[88%]">
              <View className="flex-row items-center gap-1.5 mb-0.5">
                <Text className="font-label-sm text-label-sm font-bold text-primary">6th Sense Iris</Text>
                <View className={`w-1.5 h-1.5 rounded-full ${lastAi.source === 'cloud' ? 'bg-secondary' : 'bg-tertiary'}`} />
                <Text className="font-label-sm text-label-sm text-on-surface-variant">{lastAi.source === 'cloud' ? 'Cloud AI' : lastAi.source === 'local-llm' ? 'Local AI' : 'On-device'}</Text>
              </View>
              <Text className="font-body-md text-body-md text-on-surface">“{lastAi.text}”</Text>
            </View>
          </View>
        ) : null}
      </View>
      <View className="gap-2 pt-1">
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Repeat last voice response"
            onPress={() => {
              haptic('tap');
              if (!tts.replayLast()) tts.speak('Nothing to repeat yet.', { priority: 'high', log: false });
            }}
            className="flex-1 min-h-[52px] px-3 bg-surface-container rounded-lg flex-row items-center justify-center gap-2 active:bg-surface-container-high"
          >
            <Icon name="replay" size={20} className="text-primary" />
            <Text className="font-label-md text-label-md text-on-surface">Repeat Voice</Text>
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: !voiceEnabled }}
            accessibilityLabel="Mute Audio Guidance"
            onPress={() => {
              haptic('tap');
              if (voiceEnabled) tts.stop();
              update({ voiceEnabled: !voiceEnabled });
            }}
            className="flex-1 min-h-[52px] px-3 bg-surface-container rounded-lg flex-row items-center justify-center gap-2 active:bg-surface-container-high"
          >
            <Icon name={voiceEnabled ? 'volume_off' : 'volume_up'} size={20} className="text-tertiary" />
            <Text className="font-label-md text-label-md text-on-surface">{voiceEnabled ? 'Mute Audio' : 'Unmute Audio'}</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch to outdoor GPS mode: announce where I am and which way I am facing"
          onPress={() => {
            haptic('tap');
            void navigation.announceOutdoor();
          }}
          className="w-full min-h-[52px] px-4 bg-surface-container rounded-lg flex-row items-center justify-center gap-2 active:bg-surface-container-high"
        >
          <Icon name="explore" size={20} className="text-secondary" />
          <Text className="font-label-md text-label-md text-on-surface">Switch to Outdoor GPS</Text>
        </Pressable>
      </View>
    </Card>
  );
}
