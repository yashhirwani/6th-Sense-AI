import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { PerceptionCamera } from '@/components/camera/PerceptionCamera';
import { Icon } from '@/components/icons/Icon';
import { Spin } from '@/components/motion';
import { SegmentedRadio, Toggle } from '@/components/ui';
import { tts } from '@/services/audio/tts';
import { haptic } from '@/services/haptics';
import { usePermissions, requestPermission, type PermKey } from '@/services/permissions';
import { usePerception } from '@/state/perception';
import { useSettings, type HapticStrength, type SpeechRate, type TextScale } from '@/state/settings';
import { useTheme } from '@/theme';

const INTRO =
  'Welcome to 6th Sense AI. See the world with confidence. 6th Sense AI uses the camera, microphone and on-device artificial intelligence to describe your surroundings, read text, and warn you about hazards. Below you can adjust speech speed, vibration strength, text size and contrast, then allow the permissions the app needs. When you are ready, activate Get Started at the bottom of the screen.';

const TOUR = [
  'Audio guided tour. Chapter 1: the Home screen. The large round button in the middle describes what is in front of you when you tap it. Hold it down to ask a question, like: is there an empty seat? Release when you finish speaking.',
  'Chapter 2: the bottom bar. From left to right: Home, Explore, the Ask AI microphone in the centre, Scan, and Safety. The microphone works from every screen.',
  'Chapter 3: Explore. It shows the objects around you with their direction and approximate distance, and guides you indoors when a building has 6th Sense location codes.',
  'Chapter 4: Scan. Read documents, product labels, medicine labels and bank notes. Hold the item about thirty centimetres from the camera.',
  'Chapter 5: Safety. The app watches for vehicles, bicycles and obstacles, and can detect a possible fall. If that happens, a countdown starts; say I am okay, or press cancel, or your emergency contacts are alerted with your location.',
  'Chapter 6: memory. Say: remember my keys are here. Later ask: where did I keep my keys? You can delete memories in settings at any time. End of tour.',
];

const HAPTIC_LABEL: Record<HapticStrength, string> = { gentle: 'Gentle Single', crisp: 'Crisp Double', strong: 'Strong Long' };
const SPEED_LABEL: Record<SpeechRate, string> = { 1: '1.0x (Relaxed)', 1.25: '1.25x (Brisk)', 1.5: '1.5x (Fast)' };
const SCALE_NEXT: Record<TextScale, TextScale> = { default: 'large', large: 'xl', xl: 'default' };
const SCALE_LABEL: Record<TextScale, string> = { default: 'Default', large: 'Large', xl: 'Extra Large' };

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { colors } = useTheme();
  const perms = usePermissions(['camera', 'microphone', 'location', 'motion']);
  const [touring, setTouring] = useState(false);
  const [started, setStarted] = useState(false);
  const lastTap = useRef(0);

  useEffect(() => {
    // Greet screen-reader and non-screen-reader users alike.
    const t = setTimeout(() => tts.speak('Welcome to 6th Sense AI. Tap "Read this screen aloud" for an introduction.', { priority: 'high', replayable: true }), 600);
    return () => clearTimeout(t);
  }, []);

  const finish = async () => {
    haptic('success');
    for (const k of ['camera', 'microphone', 'location'] as PermKey[]) {
      if (perms.state[k] !== 'granted') await requestPermission(k);
    }
    settings.update({ onboarded: true });
    setStarted(true);
    tts.speak('Sensors calibrated. Activating live spatial guidance now.', { priority: 'high' });
    router.replace('/');
  };

  const onGetStarted = async () => {
    // Screen readers already use double-tap to activate, so a single activation is enough there.
    const sr = await AccessibilityInfo.isScreenReaderEnabled();
    const now = Date.now();
    if (sr || (now - lastTap.current < 500 && now - lastTap.current > 0)) {
      lastTap.current = 0;
      void finish();
    } else {
      lastTap.current = now;
      haptic('tap');
      tts.speak('Double tap to launch live spatial co-pilot.', { priority: 'high', log: false, replayable: false });
    }
  };

  const toggleTour = () => {
    if (touring) {
      tts.stop();
      setTouring(false);
      return;
    }
    setTouring(true);
    tts.stop();
    TOUR.forEach((c) => tts.speak(c, { append: true, log: false, replayable: false, earcon: null }));
    void tts.whenIdle().then(() => setTouring(false));
  };

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView contentContainerClassName="px-margin pb-space-xl gap-space-lg" showsVerticalScrollIndicator={false}>
        {/* Top Acoustic Beacon / Sound Wave Logo Header */}
        <View className="items-center justify-center pt-space-md pb-space-xs">
          <View accessible accessibilityRole="image" accessibilityLabel="6th Sense Acoustic Spatial Radar emblem" className="items-center justify-center w-28 h-28 rounded-full bg-surface-container-high shadow-sm mb-space-sm">
            <View style={{ position: 'absolute', left: 8, right: 8, top: 8, bottom: 8 }}>
              <Spin duration={20000} style={{ position: 'absolute', width: '100%', height: '100%' }}>
                <Svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
                  <Circle cx={50} cy={50} r={42} stroke={colors.primary} strokeOpacity={0.4} strokeDasharray="8 8" strokeWidth={3} />
                </Svg>
              </Spin>
              <Svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
                <Circle cx={50} cy={50} r={30} stroke={colors.primary} strokeOpacity={0.75} strokeDasharray="6 6" strokeWidth={3.5} />
                <Circle cx={50} cy={50} r={18} fill={colors.primary} fillOpacity={0.9} />
                <Path d="M50 32C43 32 38 37 38 43C38 51 55 52 55 60C55 64 51 68 47 68C43 68 40 65 40 62" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={3.5} />
                <Circle cx={47} cy={55} r={2.5} fill="#FFFFFF" />
              </Svg>
            </View>
            <View className="absolute -bottom-1 bg-secondary-container px-space-xs py-0.5 rounded-full flex-row items-center gap-1 shadow-sm">
              <Icon name="graphic_eq" size={14} filled className="text-on-secondary-container" />
              <Text className="font-label-sm text-label-sm text-on-secondary-container">Audio Ready</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2 px-space-sm py-1 rounded-full bg-surface-container mb-space-xs">
            <View className="w-2.5 h-2.5 rounded-full bg-secondary" />
            <Text className="font-label-sm text-label-sm text-on-surface">Multimodal Sensory Co-Pilot</Text>
          </View>
          <Text accessibilityRole="header" className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface text-center mb-space-xs tracking-tight">
            See the world with confidence.
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant text-center max-w-sm">
            6th Sense AI uses multimodal artificial intelligence to understand your surroundings and provide intelligent guidance.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Listen to this screen's introduction"
            onPress={() => tts.speak(INTRO, { priority: 'high' })}
            className="mt-space-sm flex-row items-center gap-2 px-space-md py-space-xs bg-surface-container rounded-full active:bg-surface-container-high active:scale-95"
          >
            <Icon name="volume_up" filled className="text-primary" />
            <Text className="font-label-md text-label-md text-primary">Read this screen aloud</Text>
          </Pressable>
        </View>

        {/* Interactive 4-Stage Sensory Loop */}
        <View className="gap-space-sm">
          <View className="flex-row items-center justify-between">
            <Text accessibilityRole="header" className="font-headline-sm text-headline-sm text-on-surface">
              How 6th Sense Operates
            </Text>
            <Text className="font-label-sm text-label-sm text-on-surface-variant">Real-Time</Text>
          </View>
          <View className="flex-row gap-space-sm">
            <Step n="01" title="See" icon="photo_camera" color="text-primary" body="The camera scans the scene in front of you for objects, people, text and obstacles." />
            <Step n="02" title="Understand" icon="psychology" color="text-tertiary" body="On-device and cloud AI recognise people, vehicles, furniture, signs and hazards." />
          </View>
          <View className="flex-row gap-space-sm">
            <Step n="03" title="Speak" icon="record_voice_over" color="text-secondary" body="A natural voice tells you what is where, using left, right and ahead." />
            <Step n="04" title="Assist" icon="vibration" color="text-primary-container" numColor="text-primary" body="Directional haptic pulses warn of approaching vehicles and obstacles." />
          </View>
        </View>

        <LiveDemo cameraGranted={perms.state.camera === 'granted'} started={started} />

        {/* Accessibility Sensory Calibration */}
        <View className="p-space-md bg-surface-container rounded-xl gap-space-md shadow-sm">
          <View className="flex-row items-center gap-2">
            <Icon name="tune" size={24} filled className="text-primary" />
            <View className="flex-1">
              <Text accessibilityRole="header" className="font-headline-sm text-headline-sm text-on-surface">
                Sensory Calibration
              </Text>
              <Text className="font-body-sm text-body-sm text-on-surface-variant">Adjust your preferences now; you can fine-tune at any time.</Text>
            </View>
          </View>

          <View className="gap-1.5">
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-1.5">
                <Icon name="speed" size={18} className="text-on-surface" />
                <Text className="font-label-md text-label-md text-on-surface">Speech Narration Speed</Text>
              </View>
              <Text className="font-label-sm text-label-sm text-primary font-bold">{SPEED_LABEL[settings.speechRate]}</Text>
            </View>
            <SegmentedRadio<SpeechRate>
              label="Speech Speed"
              value={settings.speechRate}
              options={[
                { value: 1, label: '1.0x' },
                { value: 1.25, label: '1.25x' },
                { value: 1.5, label: '1.5x' },
              ]}
              onChange={(v) => {
                settings.update({ speechRate: v });
                setTimeout(() => tts.speak(`Speaking at ${v} times speed.`, { priority: 'high', log: false, replayable: false }), 50);
              }}
            />
          </View>

          <View className="gap-1.5">
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-1.5">
                <Icon name="touch_app" size={18} className="text-on-surface" />
                <Text className="font-label-md text-label-md text-on-surface">Haptic Pulse Feedback</Text>
              </View>
              <Text className="font-label-sm text-label-sm text-secondary font-bold">{HAPTIC_LABEL[settings.hapticStrength]}</Text>
            </View>
            <SegmentedRadio<HapticStrength>
              label="Haptic strength"
              value={settings.hapticStrength}
              activeClass="bg-secondary"
              activeText="text-on-secondary"
              options={[
                { value: 'gentle', label: 'Gentle' },
                { value: 'crisp', label: 'Crisp' },
                { value: 'strong', label: 'Strong' },
              ]}
              onChange={(v) => {
                settings.update({ hapticStrength: v });
                haptic('object', v);
              }}
            />
          </View>

          <View className="flex-row gap-space-sm pt-space-xs">
            <View className="flex-1 p-space-sm rounded-lg bg-surface-container-lowest">
              <Text className="font-label-sm text-label-sm text-on-surface-variant mb-1">Display Text Scale</Text>
              <View className="flex-row items-center justify-between">
                <Text className="font-headline-sm text-headline-sm text-on-surface">Aa+</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Text size ${SCALE_LABEL[settings.textScale]}. Tap to change.`}
                  onPress={() => {
                    haptic('tap');
                    settings.update({ textScale: SCALE_NEXT[settings.textScale] });
                  }}
                  className="px-space-sm py-1 min-h-[44px] justify-center bg-surface-container rounded-md"
                >
                  <Text className="font-label-md text-label-md text-primary">{SCALE_LABEL[settings.textScale]}</Text>
                </Pressable>
              </View>
            </View>
            <View className="flex-1 p-space-sm rounded-lg bg-surface-container-lowest">
              <Text className="font-label-sm text-label-sm text-on-surface-variant mb-1">High Contrast Shield</Text>
              <View className="flex-row items-center justify-between min-h-[44px]">
                <Icon name="contrast" className="text-primary" />
                <Toggle label="High Contrast Shield" value={settings.highContrast} onChange={(v) => settings.update({ highContrast: v })} />
              </View>
            </View>
          </View>
        </View>

        {/* Essential Plain-Language Permissions */}
        <View className="gap-space-sm">
          <View>
            <Text accessibilityRole="header" className="font-headline-sm text-headline-sm text-on-surface">
              Clear & Respectful Permissions
            </Text>
            <Text className="font-body-sm text-body-sm text-on-surface-variant">
              Detection runs on your device. A photo is sent to the cloud only when you ask a question that needs it — you can turn this off in Settings. Never sold.
            </Text>
          </View>
          <View className="gap-space-xs">
            <PermissionItem k="camera" state={perms.state.camera} onDone={perms.refresh} icon="visibility" title="Continuous Vision (Camera)" body="Spatial awareness, text and sign reading, and hazard detection." />
            <PermissionItem k="microphone" state={perms.state.microphone} onDone={perms.refresh} icon="mic" title="Voice Co-Pilot (Microphone)" body={'Natural two-way dialogue: ask "Is this bus the #14?", "Read this pill bottle", or "Describe this room".'} />
            <PermissionItem k="location" state={perms.state.location} onDone={perms.refresh} icon="near_me" iconClass="text-tertiary" title="Outdoor Navigation (Location)" body="Where you are, remembering where you left things, and sharing your location in an emergency." />
            <PermissionItem k="motion" state={perms.state.motion} onDone={perms.refresh} icon="notifications_active" iconClass="text-primary-container" title="Urgent Alert Beacon (Motion)" body="Step counting for indoor guidance, and possible-fall alerts with a countdown while the app is open." />
          </View>
        </View>

        <View className="flex-row items-center gap-space-sm p-space-md bg-surface-container-high rounded-xl">
          <View className="w-10 h-10 rounded-full bg-surface items-center justify-center">
            <Icon name="volunteer_activism" className="text-secondary" />
          </View>
          <View className="flex-1">
            <Text className="font-label-md text-label-md text-on-surface">Designed with low-vision communities</Text>
            <Text className="font-body-sm text-body-sm text-on-surface-variant">Built to give independence, peace of mind, and effortless exploration.</Text>
          </View>
        </View>

        <View accessibilityLabel="Complete Setup" className="gap-space-sm pt-space-xs">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get Started with 6th Sense AI. Double tap to begin sensor stream"
            onPress={() => void onGetStarted()}
            className={`w-full py-space-md px-space-lg rounded-lg flex-row items-center justify-center gap-3 shadow-md min-h-[64px] active:scale-[0.98] ${started ? 'bg-secondary' : 'bg-primary'}`}
          >
            <Icon name={started ? 'check' : 'power_settings_new'} size={30} filled className="text-on-primary" />
            <Text className="font-headline-sm text-headline-sm text-on-primary">{started ? 'Live Perception Active' : 'Get Started (Double-Tap)'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={touring ? 'Stop the audio guided tour' : 'Start Audio Guided Tour to hear full instructions'}
            onPress={toggleTour}
            className="w-full py-space-md px-space-lg bg-surface-container-lowest rounded-lg flex-row items-center justify-center gap-2.5 shadow-sm min-h-[56px] active:bg-surface-container"
          >
            <Icon name={touring ? 'stop_circle' : 'headphones'} className="text-primary" />
            <Text className="font-label-lg text-label-lg text-on-surface">{touring ? 'Stop Tour' : 'Audio Guided Tour (3 min)'}</Text>
          </Pressable>
        </View>

        <Text className="text-center font-label-sm text-label-sm text-on-surface-variant pb-space-sm">
          6th Sense AI v{Constants.expoConfig?.version ?? '0.1.0'} · Designed for WCAG 2.2 AAA · VoiceOver & TalkBack
        </Text>
      </ScrollView>
    </View>
  );
}

function Step({ n, title, icon, color, numColor, body }: { n: string; title: string; icon: string; color: string; numColor?: string; body: string }) {
  return (
    <View accessible className="flex-1 p-space-md bg-surface-container-lowest rounded-xl shadow-sm gap-space-xs">
      <View className="w-10 h-10 rounded-lg bg-surface-container items-center justify-center">
        <Icon name={icon} filled className={color} />
      </View>
      <View className="flex-row items-center gap-1.5 mt-1">
        <Text className={`font-label-sm text-label-sm ${numColor ?? color}`}>{n}</Text>
        <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
      </View>
      <Text className="font-body-sm text-body-sm text-on-surface-variant">{body}</Text>
    </View>
  );
}

function PermissionItem({ k, state, icon, iconClass = 'text-primary', title, body, onDone }: { k: PermKey; state?: string; icon: string; iconClass?: string; title: string; body: string; onDone: () => void }) {
  const granted = state === 'granted';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${granted ? 'Allowed' : 'Not allowed yet. Double tap to allow.'} ${body}`}
      disabled={granted}
      onPress={async () => {
        await requestPermission(k);
        onDone();
      }}
      className="flex-row items-start gap-space-sm p-space-md bg-surface-container-lowest rounded-xl shadow-sm"
    >
      <View className="w-11 h-11 rounded-lg bg-surface-container items-center justify-center">
        <Icon name={icon} className={iconClass} />
      </View>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="font-label-lg text-label-lg text-on-surface flex-shrink">{title}</Text>
          {granted ? (
            <Icon name="check_circle" filled className="text-secondary" />
          ) : (
            <View className="px-2 py-0.5 rounded-full bg-primary">
              <Text className="font-label-sm text-label-sm text-on-primary">Allow</Text>
            </View>
          )}
        </View>
        <Text className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{body}</Text>
      </View>
    </Pressable>
  );
}

/** "Live Perception Demonstration" - a genuinely live camera once permission is granted. */
function LiveDemo({ cameraGranted, started }: { cameraGranted: boolean; started: boolean }) {
  const detections = usePerception((s) => s.detections);
  const hazards = usePerception((s) => s.hazards);
  const nearest = [...detections].filter((d) => d.distanceM != null).sort((a, b) => (a.distanceM ?? 99) - (b.distanceM ?? 99))[0];
  const safe = hazards.length === 0;
  const caption = !cameraGranted
    ? 'Allow camera access below to see live perception here.'
    : nearest
      ? `${nearest.name.charAt(0).toUpperCase() + nearest.name.slice(1)} about ${nearest.distanceM?.toFixed(1)} m, ${nearest.bearing === 'front' ? 'ahead' : `on your ${nearest.bearing}`}.`
      : 'Point the camera around you.';

  return (
    <View accessibilityLabel="Visual scene simulator" className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm gap-space-sm">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon name="sensors" size={20} filled className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">Live Perception Demonstration</Text>
        </View>
        <View className={`px-space-xs py-0.5 rounded ${safe ? 'bg-secondary-fixed' : 'bg-tertiary-fixed'}`}>
          <Text className={`font-label-sm text-label-sm font-bold ${safe ? 'text-on-secondary-fixed-variant' : 'text-on-tertiary-fixed-variant'}`}>{safe ? 'Safe Corridor' : 'Caution'}</Text>
        </View>
      </View>
      <View className="w-full h-44 rounded-lg overflow-hidden bg-surface-container items-center justify-center">
        {cameraGranted && !started ? (
          <PerceptionCamera owner="onboarding" showPreview style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        ) : (
          <Icon name="photo_camera" size={40} className="text-outline" />
        )}
      </View>
      <View className="flex-row items-center justify-between px-space-sm py-2 rounded-lg bg-surface-container-low">
        <View className="flex-row items-center gap-2 flex-1">
          <Icon name="hearing" size={18} className="text-primary" />
          <Text accessibilityLiveRegion="polite" className="font-body-sm text-body-sm italic text-on-surface flex-1">
            {caption}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Replay audio cue" onPress={() => tts.speak(caption, { priority: 'high', log: false })} className="p-2 active:scale-90">
          <Icon name="play_circle" size={20} className="text-primary" />
        </Pressable>
      </View>
    </View>
  );
}
