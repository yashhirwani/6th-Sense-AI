import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/icons/Icon';
import { SubHeader } from '@/components/SubHeader';
import { Button, Card, SectionHeading, Toggle } from '@/components/ui';
import type { EmergencyContact } from '@/services/api/types';
import { tts } from '@/services/audio/tts';
import { emergency } from '@/services/emergency/emergency';
import { useAssistant } from '@/state/assistant';

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => emergency.contacts());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [primary, setPrimary] = useState(contacts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const sms = useAssistant((s) => s.capabilities.sms);

  const reload = () => setContacts(emergency.contacts());

  const add = () => {
    const digits = phone.replace(/[^\d+]/g, '');
    if (!name.trim() || digits.replace('+', '').length < 8) {
      setError('Enter a name and a full phone number, including the country code if abroad.');
      tts.speak('Enter a name and a full phone number.', { priority: 'high', log: false });
      return;
    }
    emergency.saveContact({ name, phone: digits, relation: relation.trim() || null, is_primary: primary });
    tts.speak(`${name} added as an emergency contact.`, { priority: 'high', log: false });
    setName('');
    setPhone('');
    setRelation('');
    setPrimary(false);
    setError(null);
    reload();
  };

  return (
    <View className="flex-1 bg-surface">
      <SubHeader title="Emergency Contacts" subtitle={`${contacts.length} saved`} />
      <ScrollView contentContainerClassName="px-margin py-space-md gap-space-lg" keyboardShouldPersistTaps="handled">
        <Card className="p-space-md gap-space-xs">
          <Text className="font-label-md text-label-md text-on-surface">How alerts are sent</Text>
          <Text className="font-body-sm text-body-sm text-on-surface-variant">
            {sms
              ? 'The server sends an SMS with your location automatically when the countdown ends.'
              : 'Your messaging app opens with the alert and your location filled in — press Send (the phone does not allow apps to send SMS silently). If no contact is saved, the dialler opens with 112.'}
          </Text>
        </Card>

        <View className="gap-space-xs">
          <SectionHeading title="Saved contacts" upper />
          {contacts.length === 0 ? (
            <Text className="font-body-md text-body-md text-on-surface-variant px-1">No contacts yet.</Text>
          ) : (
            contacts.map((c) => (
              <View key={c.id} className="flex-row items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-lowest shadow-sm">
                <View className="w-11 h-11 rounded-lg bg-primary-fixed items-center justify-center">
                  <Icon name="call" className="text-on-primary-fixed" />
                </View>
                <View className="flex-1 min-w-0" accessible accessibilityLabel={`${c.name}, ${c.relation ?? ''}, ${c.phone.split('').join(' ')}${c.is_primary ? ', primary' : ''}`}>
                  <Text className="font-label-md text-label-md text-on-surface">
                    {c.name}
                    {c.is_primary ? ' • Primary' : ''}
                  </Text>
                  <Text className="font-body-sm text-body-sm text-on-surface-variant">{[c.relation, c.phone].filter(Boolean).join(' • ')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${c.name}`}
                  onPress={() => {
                    emergency.deleteContact(c.id);
                    reload();
                  }}
                  className="w-11 h-11 items-center justify-center rounded-lg bg-surface-container"
                >
                  <Icon name="delete" className="text-error" />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View className="gap-space-sm">
          <SectionHeading title="Add a contact" upper />
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Phone number" value={phone} onChange={setPhone} keyboard="phone-pad" />
          <Field label="Relation (optional)" value={relation} onChange={setRelation} />
          <View className="flex-row items-center justify-between min-h-[48px]">
            <Text className="font-label-md text-label-md text-on-surface">Primary guardian</Text>
            <Toggle label="Primary guardian" value={primary} onChange={setPrimary} />
          </View>
          {error ? (
            <Text accessibilityRole="alert" className="font-body-sm text-body-sm text-error">
              {error}
            </Text>
          ) : null}
          <Button title="Save contact" icon="person_add" onPress={add} />
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChange, keyboard }: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'phone-pad' }) {
  return (
    <View className="gap-1">
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        className="min-h-[56px] px-space-sm rounded-lg border-2 border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:border-primary"
      />
    </View>
  );
}
