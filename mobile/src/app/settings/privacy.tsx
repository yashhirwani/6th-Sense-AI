import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SubHeader } from '@/components/SubHeader';
import { Button, Card, SectionHeading } from '@/components/ui';
import { wipeLocalData } from '@/db/local';
import { api, clearAuth } from '@/services/api/client';
import { tts } from '@/services/audio/tts';
import { useAssistant } from '@/state/assistant';

const STORED = [
  ['On this phone', 'Settings, memories (object, time, place), scan history, hazard log, emergency contacts and alert history.'],
  ['On the server (only when cloud processing is on)', 'Copies of memories and emergency contacts, conversation text for follow-up questions (kept 24 hours), latency measurements, and face embeddings of people you enrolled (no photos).'],
  ['Camera frames', 'Analysed on the phone continuously. A single photo is sent only when you ask a question, read text or scan; it is processed and not stored.'],
  ['Voice', 'Speech is converted to text by your phone’s speech service. Audio recordings are not kept by 6th Sense AI.'],
];

export default function PrivacyScreen() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const clearConversation = useAssistant((s) => s.clearConversation);

  const wipe = async () => {
    wipeLocalData();
    clearConversation();
    let server = 'Server data could not be reached; it will be deleted when you next run this while online.';
    try {
      await api('/v1/me/data', { method: 'DELETE' });
      server = 'Server copy deleted.';
    } catch {
      /* offline */
    }
    await clearAuth();
    setStep('done');
    const msg = `All data on this phone deleted. ${server}`;
    setMessage(msg);
    tts.speak(msg, { priority: 'high', log: false });
  };

  return (
    <View className="flex-1 bg-surface">
      <SubHeader title="Privacy & Your Data" />
      <ScrollView contentContainerClassName="px-margin py-space-md gap-space-md">
        <SectionHeading title="What is stored" upper />
        {STORED.map(([title, body]) => (
          <Card key={title} className="p-space-md gap-1">
            <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
            <Text className="font-body-sm text-body-sm text-on-surface-variant">{body}</Text>
          </Card>
        ))}
        <SectionHeading title="Delete everything" upper />
        {step === 'confirm' ? (
          <View className="gap-2">
            <Text className="font-label-md text-label-md text-error">This permanently deletes memories, scans, contacts, history and enrolled faces. Continue?</Text>
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="danger" title="Delete" onPress={() => void wipe()} />
              <Button className="flex-1" variant="secondary" title="Cancel" onPress={() => setStep('idle')} />
            </View>
          </View>
        ) : step === 'done' ? (
          <Text accessibilityRole="alert" className="font-body-md text-body-md text-secondary">
            {message}
          </Text>
        ) : (
          <Button variant="danger" icon="delete_forever" title="Delete all my data" onPress={() => setStep('confirm')} />
        )}
      </ScrollView>
    </View>
  );
}
