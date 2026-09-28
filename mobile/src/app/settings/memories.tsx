import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '@/components/icons/Icon';
import { SubHeader } from '@/components/SubHeader';
import { Button, SectionHeading } from '@/components/ui';
import { tts } from '@/services/audio/tts';
import { deleteAllMemories, deleteMemory, describeMemory, listMemories, relativeTime, type LocalMemory } from '@/services/memory';

export default function MemoriesScreen() {
  const [items, setItems] = useState<LocalMemory[]>(() => listMemories());
  const [confirming, setConfirming] = useState(false);
  const reload = () => setItems(listMemories());

  return (
    <View className="flex-1 bg-surface">
      <SubHeader title="Memories" subtitle={`${items.length} stored on this phone`} />
      <ScrollView contentContainerClassName="px-margin py-space-md gap-space-sm">
        <Text className="font-body-md text-body-md text-on-surface-variant">
          Say “remember my keys are here”, then later ask “where did I keep my keys?”. Personal items the camera recognises (bags, phones, laptops, bottles…) are noted automatically when that setting is on.
        </Text>
        <SectionHeading title="Most recent" upper />
        {items.length === 0 ? <Text className="font-body-md text-body-md text-on-surface-variant px-1">Nothing remembered yet.</Text> : null}
        {items.map((m) => (
          <View key={m.id} className="flex-row items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-lowest shadow-sm">
            <Pressable accessibilityRole="button" accessibilityLabel={`${describeMemory(m)} Double tap to hear it.`} onPress={() => tts.speak(describeMemory(m), { priority: 'high' })} className="flex-1 flex-row items-center gap-space-sm min-w-0">
              <View className={`w-11 h-11 rounded-lg items-center justify-center ${m.source === 'user' ? 'bg-secondary-fixed' : 'bg-surface-container'}`}>
                <Icon name={m.source === 'user' ? 'bookmark' : 'visibility'} className={m.source === 'user' ? 'text-on-secondary-fixed' : 'text-primary'} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="font-label-md text-label-md text-on-surface">{m.object.charAt(0).toUpperCase() + m.object.slice(1)}</Text>
                <Text numberOfLines={2} className="font-body-sm text-body-sm text-on-surface-variant">
                  {[relativeTime(m.created_at), m.context, m.place].filter(Boolean).join(' • ')}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete memory of ${m.object}`}
              onPress={async () => {
                await deleteMemory(m.id);
                reload();
              }}
              className="w-11 h-11 items-center justify-center rounded-lg bg-surface-container"
            >
              <Icon name="delete" className="text-error" />
            </Pressable>
          </View>
        ))}
        {items.length > 0 ? (
          confirming ? (
            <View className="gap-2 mt-space-sm">
              <Text className="font-label-md text-label-md text-error">Delete all {items.length} memories from this phone and the server?</Text>
              <View className="flex-row gap-2">
                <Button className="flex-1" variant="danger" title="Delete all" onPress={async () => {
                  await deleteAllMemories();
                  setConfirming(false);
                  reload();
                  tts.speak('All memories deleted.', { priority: 'high', log: false });
                }} />
                <Button className="flex-1" variant="secondary" title="Keep" onPress={() => setConfirming(false)} />
              </View>
            </View>
          ) : (
            <Button className="mt-space-sm" variant="secondary" icon="delete_sweep" title="Delete all memories" onPress={() => setConfirming(true)} />
          )
        ) : null}
      </ScrollView>
    </View>
  );
}
