import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AppHeader } from '@/components/AppHeader';
import { PerceptionCamera } from '@/components/camera/PerceptionCamera';
import { CountdownRing } from '@/components/CountdownRing';
import { Icon } from '@/components/icons/Icon';
import { Pulse } from '@/components/motion';
import { ActionRow } from '@/components/ui';
import { tts } from '@/services/audio/tts';
import { emergency } from '@/services/emergency/emergency';
import { haptic } from '@/services/haptics';
import { lastFix, placeName } from '@/services/location';
import type { Hazard } from '@/services/perception/types';
import { useAssistant } from '@/state/assistant';
import { useEmergency } from '@/state/emergency';
import { usePerception } from '@/state/perception';
import { useSettings } from '@/state/settings';

export default function SafetyScreen() {
  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Safety Emergency" />
      {/* Hazard detection keeps running while this tab is open. */}
      <PerceptionCamera owner="safety" showPreview={false} />
      <ScrollView contentContainerClassName="px-margin pb-space-md gap-space-md" showsVerticalScrollIndicator={false}>
        <GuardianHeader />
        <EmergencyCard />
        <SafeguardActions />
        <HazardMatrix />
        <SpokenLog />
        <Telemetry />
      </ScrollView>
    </View>
  );
}

function GuardianHeader() {
  const voiceEnabled = useSettings((s) => s.voiceEnabled);
  const fall = useSettings((s) => s.fallDetection);
  const update = useSettings((s) => s.update);
  const detector = usePerception((s) => s.detectorState);
  const engaged = detector === 'ready' && fall;
  return (
    <View className="flex-row items-center justify-between bg-surface-container p-space-sm rounded-xl">
      <View className="flex-row items-center gap-space-xs flex-1">
        <Icon name="shield_with_heart" size={26} filled className="text-primary" />
        <View className="flex-1">
          <Text className="font-label-md text-label-md text-on-surface">Spatial Hazard Guardian</Text>
          <Text className={`font-label-sm text-label-sm font-bold ${engaged ? 'text-secondary' : 'text-tertiary'}`}>
            {engaged ? 'Multimodal Protection Engaged' : !fall ? 'Fall detection is off' : 'Hazard detection starting…'}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: voiceEnabled }}
        accessibilityLabel="Toggle loud voice announcements"
        onPress={() => {
          haptic('tap');
          if (voiceEnabled) tts.stop();
          update({ voiceEnabled: !voiceEnabled });
        }}
        className="min-w-[44px] min-h-[44px] px-space-xs flex-row items-center justify-center gap-1 rounded-lg bg-surface-container-high active:bg-surface-variant"
      >
        <Icon name={voiceEnabled ? 'volume_up' : 'volume_off'} size={20} className="text-on-surface" />
        <Text className="font-label-sm text-label-sm font-semibold text-on-surface">{voiceEnabled ? 'Voice On' : 'Muted'}</Text>
      </Pressable>
    </View>
  );
}

/** Emergency state machine card (Stitch "CRITICAL EMERGENCY DETECTED" card and its dispatched/cancelled states). */
function EmergencyCard() {
  const e = useEmergency();
  const primary = emergency.primary();

  if (e.phase === 'countdown' || e.phase === 'dispatching') {
    const title = e.trigger === 'fall' ? 'Possible Fall Detected' : 'Emergency Help Requested';
    const body = e.trigger === 'fall' ? `A sudden drop and impact${e.impactG ? ` (${e.impactG} g)` : ''} were detected by the phone's motion sensor.` : 'You asked for help.';
    return (
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className="bg-error-container p-space-md rounded-xl gap-space-sm shadow-md">
        <View className="flex-row items-start justify-between gap-space-xs">
          <View className="flex-row items-center gap-space-xs flex-1">
            <Pulse>
              <Icon name="emergency_home" size={32} filled className="text-error" />
            </Pulse>
            <View className="flex-1">
              <View className="self-start flex-row items-center px-2 py-0.5 rounded-full bg-error">
                <Text className="font-label-sm text-label-sm font-bold tracking-wider uppercase text-on-error">Urgent Alert</Text>
              </View>
              <Text className="font-headline-sm text-headline-sm text-on-error-container mt-1">{title}</Text>
            </View>
          </View>
          {e.phase === 'countdown' ? <CountdownRing secondsLeft={e.secondsLeft} total={e.total} /> : null}
        </View>
        <Text className="font-body-md text-body-md text-on-error-container">
          {e.phase === 'dispatching' ? e.detail ?? 'Sending alert…' : `${body} Alert will be sent to ${primary ? `${primary.name}${emergency.contacts().length > 1 ? ' and others' : ''}` : 'emergency services (112)'} in `}
          {e.phase === 'countdown' ? <Text className="text-error font-bold">{e.secondsLeft} seconds</Text> : null}
          {e.phase === 'countdown' ? '.' : ''}
        </Text>
        {e.phase === 'countdown' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel emergency countdown, I am okay"
              onPress={() => emergency.cancel()}
              className="w-full min-h-[64px] bg-on-error-container rounded-xl flex-row items-center justify-center gap-space-xs shadow-md active:scale-[0.98]"
            >
              <Icon name="check_circle" size={28} filled className="text-surface-container-lowest" />
              <Text className="font-label-lg text-label-lg text-surface-container-lowest">I'M OKAY — CANCEL ALERT</Text>
            </Pressable>
            <Text className="text-center font-label-sm text-label-sm text-on-error-container/80">Tap cancel, or say “I'm okay”</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Send the alert now without waiting" onPress={() => void emergency.dispatchNow()} className="self-center min-h-[44px] px-4 justify-center">
              <Text className="font-label-md text-label-md text-error underline">Send now</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  if (e.phase === 'dispatched' || e.phase === 'failed') {
    const ok = e.phase === 'dispatched';
    return (
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className="bg-error p-space-md rounded-xl gap-space-sm shadow-xl">
        <View className="flex-row items-center gap-space-xs">
          <Icon name="sos" size={36} className="text-on-error" />
          <View className="flex-1">
            <Text className="font-headline-sm text-headline-sm text-on-error">{ok ? 'Emergency Dispatched' : 'Alert Not Delivered'}</Text>
            <Text className="font-body-sm text-body-sm text-on-error">{e.detail}</Text>
          </View>
        </View>
        <View className="flex-row gap-2 mt-2">
          <Pressable accessibilityRole="button" onPress={() => emergency.callPrimary()} className="flex-1 min-h-[56px] bg-on-error rounded-xl items-center justify-center">
            <Text className="font-label-md text-label-md font-bold text-error">Call {primary?.name ?? '112'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => emergency.reset()} className="flex-1 min-h-[56px] border-2 border-on-error rounded-xl items-center justify-center">
            <Text className="font-label-md text-label-md font-bold text-on-error">End Emergency</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (e.phase === 'cancelled') {
    return (
      <View className="bg-secondary-fixed p-space-md rounded-xl gap-2 shadow-sm">
        <View className="flex-row items-center gap-2">
          <Icon name="verified" size={32} filled className="text-secondary" />
          <View className="flex-1">
            <Text className="font-headline-sm text-headline-sm text-on-secondary-fixed-variant">Alert Cancelled — Status Safe</Text>
            <Text className="font-body-sm text-body-sm text-on-secondary-fixed-variant">{e.detail}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => emergency.reset()} className="min-h-[44px] self-start mt-1 px-4 rounded-lg bg-secondary justify-center">
          <Text className="font-label-sm text-label-sm font-semibold text-on-secondary">Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="bg-secondary-fixed p-space-md rounded-xl gap-space-sm shadow-sm">
      <View className="flex-row items-center gap-2">
        <Icon name="verified_user" size={32} filled className="text-secondary" />
        <View className="flex-1">
          <Text className="font-headline-sm text-headline-sm text-on-secondary-fixed-variant">Monitoring — Status Safe</Text>
          <Text className="font-body-sm text-body-sm text-on-secondary-fixed-variant">
            {emergency.isMonitoring() ? 'Possible-fall detection is on while the app is open.' : 'Fall detection is off (Settings).'} Say “help me” at any time.
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send SOS. Starts a short countdown before alerting your emergency contacts."
        onPress={() => emergency.trigger('manual')}
        className="w-full min-h-[64px] bg-error rounded-xl flex-row items-center justify-center gap-space-xs shadow-md active:scale-[0.98]"
      >
        <Icon name="sos" size={28} className="text-on-error" />
        <Text className="font-label-lg text-label-lg text-on-error">SEND SOS</Text>
      </Pressable>
    </View>
  );
}

function SafeguardActions() {
  const [strobe, setStrobe] = useState(false);
  const [place, setPlace] = useState<string | null>(null);
  const focused = useIsFocused();
  const primary = emergency.primary();

  useEffect(() => {
    const f = lastFix();
    if (focused && f) void placeName(f).then(setPlace);
  }, [focused]);

  return (
    <View className="gap-space-xs">
      <Text accessibilityRole="header" className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider px-1">
        Instant Safeguard Actions
      </Text>
      {primary ? (
        <ActionRow icon="call" tileClass="bg-primary-fixed" iconClass="text-on-primary-fixed" title={`Call ${primary.name}${primary.relation ? ` (${primary.relation})` : ''}`} subtitle="Primary Guardian • Opens the dialler" onPress={() => emergency.callPrimary()} />
      ) : (
        <ActionRow icon="person_add" tileClass="bg-primary-fixed" iconClass="text-on-primary-fixed" title="Add an emergency contact" subtitle="Needed for SOS alerts and fall alerts" onPress={() => router.push('/settings/contacts')} />
      )}
      <ActionRow icon="share_location" tileClass="bg-secondary-fixed" iconClass="text-on-secondary-fixed" title="Broadcast Location & Spatial Map" subtitle={place ?? 'Send a live map link to your contacts'} onPress={() => void emergency.shareLocation()} />
      <ActionRow
        icon="pixel_4_4xl_4a_5_5a_5g"
        tileClass={strobe ? 'bg-error-container' : 'bg-tertiary-fixed'}
        iconClass={strobe ? 'text-error' : 'text-on-tertiary-fixed'}
        title={strobe ? 'SIREN ACTIVE (Tap to Silence)' : 'Sound High-Decibel Siren & Strobe'}
        subtitle="Helps nearby responders pinpoint you"
        trailing="campaign"
        role="switch"
        className={strobe ? 'bg-error-container' : 'bg-surface-container-lowest'}
        onPress={() => setStrobe(emergency.toggleSiren())}
      />
      <Strobe visible={strobe} onStop={() => setStrobe(emergency.toggleSiren())} />
    </View>
  );
}

/** Full-screen flashing strobe (paired with the siren); tap anywhere to stop. */
function Strobe({ visible, onStop }: { visible: boolean; onStop: () => void }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!visible) return;
    o.value = reduced ? 1 : withRepeat(withTiming(0, { duration: 250 }), -1, true);
  }, [visible, reduced, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Modal visible={visible} animationType="none" transparent={false} onRequestClose={onStop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Siren and strobe active. Tap anywhere to stop." onPress={onStop} style={{ flex: 1, backgroundColor: '#ba1a1a' }}>
        <Animated.View style={[{ flex: 1, backgroundColor: '#ffffff' }, a]} />
      </Pressable>
    </Modal>
  );
}

const MATRIX_STYLE: Record<Hazard['severity'], { card: string; pill: string; pillText: string; title: string; dist: string; body: string; label: string }> = {
  critical: { card: 'bg-error-container', pill: 'bg-error', pillText: 'text-on-error', title: 'text-on-error-container', dist: 'text-error', body: 'text-on-error-container', label: 'Critical' },
  warning: { card: 'bg-tertiary-fixed', pill: 'bg-tertiary', pillText: 'text-on-tertiary', title: 'text-on-tertiary-fixed-variant', dist: 'text-tertiary', body: 'text-on-tertiary-fixed-variant', label: 'Warning' },
  caution: { card: 'bg-surface-container-high', pill: 'bg-surface-container-highest', pillText: 'text-on-surface', title: 'text-on-surface', dist: 'text-on-surface-variant', body: 'text-on-surface-variant', label: 'Caution' },
  safe: { card: 'bg-secondary-fixed', pill: 'bg-secondary', pillText: 'text-on-secondary', title: 'text-on-secondary-fixed-variant', dist: 'text-secondary', body: 'text-on-secondary-fixed-variant', label: 'Safe' },
};

function HazardMatrix() {
  const hazards = usePerception((s) => s.hazards);
  const tracked = usePerception((s) => s.detections.length);
  const detector = usePerception((s) => s.detectorState);
  return (
    <View className="gap-space-xs">
      <View className="flex-row items-center justify-between px-1">
        <Text accessibilityRole="header" className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
          Spatial Hazard Matrix
        </Text>
        <Text className="font-label-sm text-label-sm text-secondary font-bold">{tracked} Objects Tracked</Text>
      </View>
      {hazards.length === 0 ? (
        <HazardCard
          h={{ severity: 'safe', title: detector === 'ready' ? 'No Hazards Detected' : 'Detection Starting', message: detector === 'ready' ? 'No vehicles, bicycles, animals or obstacles detected in your path right now.' : 'Hazard detection starts when the camera is running.', distanceM: null, bearing: 'front', source: 'device' }}
        />
      ) : (
        hazards.slice(0, 5).map((h) => <HazardCard key={h.id} h={h} />)
      )}
    </View>
  );
}

function HazardCard({ h }: { h: Pick<Hazard, 'severity' | 'title' | 'message' | 'distanceM' | 'bearing' | 'source'> }) {
  const s = MATRIX_STYLE[h.severity];
  const where = h.distanceM != null ? `${h.distanceM.toFixed(1)}m ${h.bearing === 'front' ? 'Ahead' : h.bearing === 'left' ? 'Left' : 'Right'}` : h.severity === 'safe' ? '' : h.bearing === 'front' ? 'Ahead' : h.bearing === 'left' ? 'Left' : 'Right';
  return (
    <View accessible accessibilityLabel={`${s.label}. ${h.title}. ${h.message}`} className={`p-space-sm rounded-xl shadow-sm gap-2 ${s.card}`}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          <View className={`px-2 py-0.5 rounded-full ${s.pill}`}>
            <Text className={`font-label-sm text-label-sm font-bold uppercase tracking-wider ${s.pillText}`}>{s.label}</Text>
          </View>
          <Text numberOfLines={1} className={`font-label-md text-label-md font-bold flex-shrink ${s.title}`}>
            {h.title}
          </Text>
        </View>
        {where ? <Text className={`font-label-md text-label-md font-bold ${s.dist}`}>{where}</Text> : null}
      </View>
      <Text className={`font-body-sm text-body-sm ${s.body}`}>{h.message}</Text>
      {h.severity !== 'safe' ? (
        <View className="flex-row items-center gap-1">
          <Icon name={h.source === 'server' ? 'cloud' : 'motion_sensor_active'} size={18} className={s.body} />
          <Text className={`font-label-sm text-label-sm ${s.body}`}>{h.source === 'server' ? 'Cloud open-vocabulary detection' : 'On-device detection'}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SpokenLog() {
  const log = useAssistant((s) => s.spokenLog);
  const latest = log[0];
  const lastHazard = log.find((l) => l.kind !== 'info');
  const dirLabel = latest?.direction ? `Earcon • Stereo ${latest.direction === 'front' ? 'Centre' : latest.direction === 'left' ? 'Left' : 'Right'}` : 'Voice';
  return (
    <View className="bg-surface-container-lowest p-space-sm rounded-xl gap-2 shadow-sm">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon name="record_voice_over" size={20} className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">Spoken Audio Feed Log</Text>
        </View>
        <Text className="font-label-sm text-label-sm text-on-surface-variant">Realtime</Text>
      </View>
      <View className="bg-surface-container p-space-sm rounded-lg gap-1">
        {latest ? (
          <>
            <View className="flex-row items-center justify-between">
              <Text className="font-label-sm text-label-sm text-on-surface-variant">{dirLabel}</Text>
              <Text className="font-label-sm text-label-sm text-on-surface-variant">{new Date(latest.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            </View>
            <Text className="font-body-md text-body-md text-on-surface font-medium italic">“{latest.text}”</Text>
          </>
        ) : (
          <Text className="font-body-md text-body-md text-on-surface-variant">Nothing has been announced yet.</Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Replay the last voice notification"
        disabled={!lastHazard && !latest}
        onPress={() => {
          const e = lastHazard ?? latest;
          if (e) tts.speak(e.text, { priority: 'high', log: false, bearing: e.direction === 'back' ? undefined : e.direction, kind: e.kind });
        }}
        className="w-full min-h-[44px] flex-row items-center justify-center gap-1"
      >
        <Icon name="replay" size={18} className="text-primary" />
        <Text className="font-label-sm text-label-sm text-primary font-bold">Replay Last Spoken Hazard Directive</Text>
      </Pressable>
    </View>
  );
}

/** "Hardware Sensor Telemetry" - every tile reflects a real sensor/service state. */
function Telemetry() {
  const fps = usePerception((s) => s.fps);
  const detector = usePerception((s) => s.detectorState);
  const fall = useSettings((s) => s.fallDetection);
  const spatial = useSettings((s) => s.spatialAudio);
  const fix = lastFix();
  const [, tick] = useState(0);
  const t = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    t.current = setInterval(() => tick((x) => x + 1), 5000);
    return () => clearInterval(t.current);
  }, []);
  const tiles = [
    { icon: 'sensors', title: 'On-device Vision', value: detector === 'ready' ? `YOLO11n • ${fps.toFixed(0)} FPS` : detector === 'loading' || detector === 'idle' ? 'Starting' : 'Unavailable', ok: detector === 'ready' },
    { icon: 'screen_rotation', title: 'Fall Sensor', value: fall && emergency.isMonitoring() ? 'Monitoring 50 Hz' : 'Off', ok: fall && emergency.isMonitoring() },
    { icon: 'my_location', title: 'Location', value: fix ? `±${Math.round(fix.accuracy_m ?? 0)} m` : 'No fix yet', ok: !!fix },
    { icon: 'spatial_audio', title: 'Spatial Audio', value: spatial ? 'Stereo cues on' : 'Off', ok: spatial },
  ];
  return (
    <View className="bg-surface-container-low p-space-sm rounded-xl gap-space-xs">
      <Text accessibilityRole="header" className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider px-1">
        Hardware Sensor Telemetry
      </Text>
      <View className="flex-row flex-wrap gap-space-xs">
        {tiles.map((x) => (
          <View key={x.title} accessible accessibilityLabel={`${x.title}: ${x.value}`} className="p-space-xs bg-surface-container-lowest rounded-lg flex-row items-center gap-2 shadow-sm" style={{ width: '48.5%' }}>
            <Icon name={x.icon} size={22} filled className={x.ok ? 'text-secondary' : 'text-outline'} />
            <View className="flex-1 min-w-0">
              <Text numberOfLines={1} className="font-label-sm text-label-sm text-on-surface font-semibold">
                {x.title}
              </Text>
              <Text numberOfLines={1} className={`font-label-sm text-label-sm font-bold ${x.ok ? 'text-secondary' : 'text-on-surface-variant'}`}>
                {x.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
