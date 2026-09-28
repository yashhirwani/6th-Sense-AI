import { Linking, Platform, Share } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as SMS from 'expo-sms';
import { router } from 'expo-router';
import { getDb, newId } from '@/db/local';
import { assistantStore } from '@/state/assistant';
import { emergencyStore, type EmergencyTrigger } from '@/state/emergency';
import { getSettings } from '@/state/settings';
import { api } from '../api/client';
import type { EmergencyContact } from '../api/types';
import { abortListening, listenOnce } from '../audio/stt';
import { tts } from '../audio/tts';
import { haptic, stopHaptics } from '../haptics';
import { getFix, mapsLink, type Fix } from '../location';
import { FallDetector } from './fallDetector';
import { siren } from './siren';

/** India's single emergency number; shown as a fallback when no personal contacts exist. */
export const PUBLIC_EMERGENCY_NUMBER = '112';

const OKAY_WORDS = /\b(okay|ok|fine|i'm fine|i am fine|cancel|stop|no|false alarm|i'm okay|i am okay)\b|ठीक|रुको/i;

class EmergencyService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private accelSub: { remove(): void } | null = null;
  private detector = new FallDetector();

  // ------------------------------------------------------------ contacts (local first, synced)

  contacts(): EmergencyContact[] {
    return getDb()
      .getAllSync<{ id: string; name: string; phone: string; relation: string | null; is_primary: number }>('SELECT * FROM emergency_contacts ORDER BY is_primary DESC, name')
      .map((r) => ({ ...r, is_primary: !!r.is_primary }));
  }

  primary(): EmergencyContact | null {
    return this.contacts()[0] ?? null;
  }

  saveContact(c: Omit<EmergencyContact, 'id'> & { id?: string }) {
    const id = c.id ?? newId();
    const db = getDb();
    if (c.is_primary) db.runSync('UPDATE emergency_contacts SET is_primary = 0');
    db.runSync(
      'INSERT OR REPLACE INTO emergency_contacts (id, name, phone, relation, is_primary) VALUES (?,?,?,?,?)',
      id, c.name.trim(), c.phone.replace(/[^\d+]/g, ''), c.relation, c.is_primary ? 1 : 0,
    );
    void this.syncContacts();
    return id;
  }

  deleteContact(id: string) {
    getDb().runSync('DELETE FROM emergency_contacts WHERE id = ?', id);
    void this.syncContacts();
  }

  private async syncContacts() {
    if (!getSettings().cloudProcessing) return;
    try {
      await api('/v1/emergency/contacts', { method: 'PUT', body: this.contacts() });
    } catch {
      /* offline - server copy only matters for server-side SMS dispatch */
    }
  }

  // ------------------------------------------------------------ fall monitoring

  startMonitoring() {
    // Fall detection needs the phone's accelerometer (not available in the web preview).
    if (Platform.OS === 'web' || this.accelSub || !getSettings().fallDetection) return;
    void Accelerometer.isAvailableAsync().then((ok) => {
      if (!ok || this.accelSub) return;
      Accelerometer.setUpdateInterval(20); // 50 Hz
      this.accelSub = Accelerometer.addListener(({ x, y, z }) => {
        const ev = this.detector.push(x, y, z, Date.now());
        if (ev) this.trigger('fall', ev.impactG);
      });
    });
  }

  stopMonitoring() {
    this.accelSub?.remove();
    this.accelSub = null;
    this.detector.reset();
  }

  isMonitoring() {
    return this.accelSub != null;
  }

  // ------------------------------------------------------------ alert flow

  trigger(trigger: EmergencyTrigger, impactG: number | null = null) {
    const s = emergencyStore.getState();
    if (s.phase === 'countdown' || s.phase === 'dispatching') return;
    const total = getSettings().emergencyCountdownSec;
    s.set({ phase: 'countdown', trigger, secondsLeft: total, total, detail: null, impactG });
    router.navigate('/safety');

    const what = trigger === 'fall' ? 'Possible fall detected.' : 'Emergency help requested.';
    tts.speak(`${what} Calling for help in ${total} seconds. Say "I'm okay" or press cancel.`, { priority: 'critical', kind: 'critical', replayable: false });

    this.timer = setInterval(() => {
      const left = emergencyStore.getState().secondsLeft - 1;
      emergencyStore.getState().set({ secondsLeft: left });
      haptic(left <= 3 ? 'critical' : 'warning');
      if (left <= 0) {
        this.clearTimer();
        void this.dispatch();
      }
    }, 1000);

    // Also accept a spoken "I'm okay" once the prompt has been read.
    void tts.whenIdle().then(async () => {
      if (emergencyStore.getState().phase !== 'countdown') return;
      const r = await listenOnce();
      if (r.ok && OKAY_WORDS.test(r.transcript) && emergencyStore.getState().phase === 'countdown') this.cancel();
    });
  }

  cancel() {
    if (emergencyStore.getState().phase !== 'countdown') return;
    this.clearTimer();
    abortListening();
    stopHaptics();
    const trig = emergencyStore.getState().trigger ?? 'manual';
    emergencyStore.getState().set({ phase: 'cancelled', secondsLeft: 0, detail: 'No emergency contacts contacted. Movement monitoring resumed.' });
    this.logEvent(trig, 'cancelled', null, null);
    haptic('success');
    tts.speak('Alert cancelled. Glad you are okay.', { priority: 'critical', kind: 'info', replayable: false });
  }

  reset() {
    this.clearTimer();
    emergencyStore.getState().set({ phase: 'idle', trigger: null, secondsLeft: 0, detail: null, impactG: null });
  }

  /** Skip the countdown ("Send now"). */
  async dispatchNow() {
    this.clearTimer();
    await this.dispatch();
  }

  private clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private buildMessage(trigger: EmergencyTrigger, fix: Fix | null) {
    const reason = trigger === 'fall' ? 'may have fallen and is not responding' : 'has requested emergency help';
    const where = fix ? `Location: ${mapsLink(fix)}${fix.accuracy_m ? ` (±${Math.round(fix.accuracy_m)} m)` : ''}` : 'Location unavailable.';
    return `6th Sense AI alert: the user ${reason}. ${where}. Time: ${new Date().toLocaleString()}.`;
  }

  private async dispatch() {
    const s = emergencyStore.getState();
    const trigger = s.trigger ?? 'manual';
    s.set({ phase: 'dispatching', detail: 'Getting your location…' });
    tts.speak('Sending emergency alert now.', { priority: 'critical', kind: 'critical', replayable: false });

    const fix = await getFix(5000);
    const contacts = this.contacts();
    const message = this.buildMessage(trigger, fix);

    if (contacts.length === 0) {
      const detail = `No emergency contacts are set up. Opening the dialler for ${PUBLIC_EMERGENCY_NUMBER}.`;
      emergencyStore.getState().set({ phase: 'failed', detail });
      this.logEvent(trigger, 'failed', detail, fix);
      tts.speak(`${detail} Press call to connect.`, { priority: 'critical', kind: 'critical' });
      void Linking.openURL(`tel:${PUBLIC_EMERGENCY_NUMBER}`).catch(() => undefined);
      return;
    }

    // 1) Server-side SMS (Twilio) - truly automatic, if the backend is configured for it.
    if (getSettings().cloudProcessing && assistantStore.getState().capabilities.sms) {
      try {
        const r = await api<{ sent: number; failed: number }>('/v1/emergency/dispatch', {
          method: 'POST',
          body: { trigger, message, lat: fix?.lat ?? null, lon: fix?.lon ?? null, contacts },
          timeoutMs: 15000,
        });
        if (r.sent > 0) {
          const detail = `Alert sent by SMS to ${r.sent} contact${r.sent === 1 ? '' : 's'}${fix ? ' with your location' : ''}.`;
          emergencyStore.getState().set({ phase: 'dispatched', detail });
          this.logEvent(trigger, 'dispatched', detail, fix);
          tts.speak(`${detail} Help has been notified.`, { priority: 'critical', kind: 'critical' });
          return;
        }
      } catch {
        // fall through to on-device SMS
      }
    }

    // 2) On-device SMS composer - the OS requires the user (or a bystander) to press Send.
    if (await SMS.isAvailableAsync()) {
      tts.speak('Your messaging app is open with the alert. Press send.', { priority: 'critical', kind: 'critical' });
      try {
        const { result } = await SMS.sendSMSAsync(contacts.map((c) => c.phone), message);
        const detail =
          result === 'sent'
            ? `Alert sent to ${contacts.length} contact${contacts.length === 1 ? '' : 's'}.`
            : result === 'cancelled'
              ? 'The alert message was not sent.'
              : `Alert message prepared for ${contacts.length} contact${contacts.length === 1 ? '' : 's'} - please confirm it was sent.`;
        const phase = result === 'cancelled' ? 'failed' : 'dispatched';
        emergencyStore.getState().set({ phase, detail });
        this.logEvent(trigger, phase, detail, fix);
        return;
      } catch (e) {
        const detail = `Could not open messaging: ${String(e)}`;
        emergencyStore.getState().set({ phase: 'failed', detail });
        this.logEvent(trigger, 'failed', detail, fix);
      }
    } else {
      const detail = 'This device cannot send SMS. Calling your primary contact instead.';
      emergencyStore.getState().set({ phase: 'failed', detail });
      this.logEvent(trigger, 'failed', detail, fix);
    }
    this.callPrimary();
  }

  /** Opens the dialler with the primary contact (the OS requires the user to press call). */
  callPrimary() {
    const p = this.primary();
    const number = p?.phone ?? PUBLIC_EMERGENCY_NUMBER;
    void Linking.openURL(`tel:${number}`).catch(() => tts.speak('Could not open the phone dialler.', { priority: 'high' }));
  }

  /** "Broadcast Location": share a live maps link via any app, or SMS to contacts. */
  async shareLocation() {
    const fix = await getFix(6000);
    if (!fix) {
      tts.speak('I could not get your location. Check that location is turned on.', { priority: 'high', kind: 'warning' });
      return;
    }
    const msg = `My current location (shared by 6th Sense AI): ${mapsLink(fix)}`;
    const contacts = this.contacts();
    if (contacts.length && (await SMS.isAvailableAsync())) {
      await SMS.sendSMSAsync(contacts.map((c) => c.phone), msg);
    } else {
      await Share.share({ message: msg });
    }
  }

  toggleSiren(): boolean {
    return siren.toggle();
  }

  sirenOn() {
    return siren.isOn();
  }

  history() {
    return getDb().getAllSync<{ id: string; trigger: string; status: string; detail: string | null; created_at: number }>(
      'SELECT id, trigger, status, detail, created_at FROM emergency_events ORDER BY created_at DESC LIMIT 20',
    );
  }

  private logEvent(trigger: EmergencyTrigger, status: string, detail: string | null, fix: Fix | null) {
    getDb().runSync(
      'INSERT INTO emergency_events (id, trigger, status, detail, lat, lon, created_at) VALUES (?,?,?,?,?,?,?)',
      newId(), trigger, status, detail, fix?.lat ?? null, fix?.lon ?? null, Date.now(),
    );
    if (getSettings().cloudProcessing) {
      void api('/v1/emergency/events', { method: 'POST', body: { trigger, status, detail, lat: fix?.lat ?? null, lon: fix?.lon ?? null } }).catch(() => undefined);
    }
  }
}

export const emergency = new EmergencyService();
