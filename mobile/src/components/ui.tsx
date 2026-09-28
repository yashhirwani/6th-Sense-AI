import type { ReactNode } from 'react';
import { Pressable, Text, View, type AccessibilityRole } from 'react-native';
import { Icon } from './icons/Icon';
import { haptic } from '@/services/haptics';

/** Stitch card: bg-surface-container-lowest rounded-xl shadow-sm. */
export function Card({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <View accessibilityLabel={label} className={`bg-surface-container-lowest rounded-xl shadow-sm ${className}`}>
      {children}
    </View>
  );
}

/** Stitch icon tile: w-10 h-10 rounded-lg with a centred symbol. */
export function IconTile({ icon, className = 'bg-surface-container', iconClass = 'text-primary', size = 24, filled, box = 'w-10 h-10' }: { icon: string; className?: string; iconClass?: string; size?: number; filled?: boolean; box?: string }) {
  return (
    <View className={`${box} rounded-lg items-center justify-center ${className}`}>
      <Icon name={icon} size={size} filled={filled} className={iconClass} />
    </View>
  );
}

/** Quick Actions grid tile (Home). */
export function ActionTile({ icon, title, hint, a11y, onPress, tileClass = 'bg-surface-container', iconClass = 'text-primary' }: { icon: string; title: string; hint: string; a11y: string; onPress: () => void; tileClass?: string; iconClass?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      className="flex-1 flex-col p-space-md rounded-xl bg-surface-container-lowest active:bg-surface-container-low shadow-sm min-h-[104px] justify-between active:scale-[0.98]"
    >
      <IconTile icon={icon} className={tileClass} iconClass={iconClass} />
      <View className="flex-col mt-2">
        <Text className="font-label-lg text-label-lg text-on-surface font-bold">{title}</Text>
        <Text numberOfLines={1} className="font-body-sm text-body-sm text-on-surface-variant">
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

export type Tone = 'safe' | 'caution' | 'warning' | 'critical' | 'neutral';

const CHIP: Record<Tone, string> = {
  safe: 'bg-secondary text-on-secondary',
  warning: 'bg-tertiary text-on-tertiary',
  critical: 'bg-error text-on-error',
  caution: 'bg-surface-container-highest text-on-surface',
  neutral: 'bg-surface-container text-on-surface-variant',
};

/** Rounded status pill (Hazard matrix "Critical / Warning / Caution / Safe"). */
export function Pill({ tone, children }: { tone: Tone; children: string }) {
  const [bg, fg] = CHIP[tone].split(' ');
  return (
    <View className={`px-2 py-0.5 rounded-full ${bg}`}>
      <Text className={`font-label-sm text-label-sm font-bold uppercase tracking-wider ${fg}`}>{children}</Text>
    </View>
  );
}

/** Small soft badge (object cards: "Front Obstacle", "94% Confidence"...). */
export function Badge({ className, children }: { className: string; children: string }) {
  const parts = className.split(' ');
  const bg = parts.filter((p) => p.startsWith('bg-')).join(' ');
  const fg = parts.filter((p) => !p.startsWith('bg-')).join(' ');
  return (
    <View className={`px-2 py-0.5 rounded-full ${bg}`}>
      <Text className={`font-label-sm text-label-sm font-bold ${fg}`}>{children}</Text>
    </View>
  );
}

/** Onboarding radio group (speech speed, haptic strength). */
export function SegmentedRadio<T extends string | number>({
  label,
  options,
  value,
  onChange,
  activeClass = 'bg-primary',
  activeText = 'text-on-primary',
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  activeClass?: string;
  activeText?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${label}: ${o.label}`}
            onPress={() => {
              haptic('tap');
              onChange(o.value);
            }}
            className={`flex-1 py-2.5 rounded-lg items-center ${on ? `${activeClass} shadow-sm` : 'bg-surface-container-lowest'}`}
          >
            <Text className={`font-label-md text-label-md ${on ? activeText : 'text-on-surface'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Stitch switch: w-12 h-6 rounded-full track with a w-4 h-4 knob. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={12}
      onPress={() => {
        haptic('tap');
        onChange(!value);
      }}
      className={`w-12 h-6 rounded-full flex-row items-center px-1 ${value ? 'bg-primary justify-end' : 'bg-surface-container-highest justify-start'}`}
    >
      <View className="w-4 h-4 rounded-full bg-surface-container-lowest" />
    </Pressable>
  );
}

/** Full-width action row (Safety "Instant Safeguard Actions", Settings). */
export function ActionRow({
  icon,
  tileClass,
  iconClass,
  title,
  subtitle,
  trailing = 'arrow_forward',
  onPress,
  a11y,
  className = 'bg-surface-container-lowest',
  role = 'button',
}: {
  icon: string;
  tileClass: string;
  iconClass: string;
  title: string;
  subtitle?: string | null;
  trailing?: string | null;
  onPress?: () => void;
  a11y?: string;
  className?: string;
  role?: AccessibilityRole;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={a11y ?? [title, subtitle].filter(Boolean).join('. ')}
      onPress={onPress}
      disabled={!onPress}
      className={`w-full min-h-[56px] p-space-sm rounded-xl flex-row items-center justify-between shadow-sm active:bg-surface-container ${className}`}
    >
      <View className="flex-row items-center gap-space-sm flex-1 min-w-0">
        <IconTile icon={icon} className={tileClass} iconClass={iconClass} box="w-11 h-11" />
        <View className="flex-col min-w-0 flex-1">
          <Text numberOfLines={1} className="font-label-md text-label-md text-on-surface">
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={2} className="font-body-sm text-body-sm text-on-surface-variant">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {trailing ? <Icon name={trailing} size={22} className="text-outline" /> : null}
    </Pressable>
  );
}

export function SectionHeading({ title, right, upper = false }: { title: string; right?: string; upper?: boolean }) {
  return (
    <View className="flex-row items-center justify-between px-0.5">
      <Text accessibilityRole="header" className={upper ? 'font-label-md text-label-md text-on-surface-variant uppercase tracking-wider' : 'font-headline-sm text-headline-sm text-on-surface'}>
        {title}
      </Text>
      {right ? <Text className="font-label-sm text-label-sm text-on-surface-variant">{right}</Text> : null}
    </View>
  );
}

/** Primary / secondary buttons per DESIGN.md (min 56px, terracotta or outlined). */
export function Button({ title, icon, onPress, variant = 'primary', a11y, className = '' }: { title: string; icon?: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'safe'; a11y?: string; className?: string }) {
  const styles = {
    primary: ['bg-primary', 'text-on-primary'],
    secondary: ['bg-surface-container-lowest border-2 border-outline-variant', 'text-on-surface'],
    danger: ['bg-error', 'text-on-error'],
    safe: ['bg-secondary', 'text-on-secondary'],
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? title}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      className={`min-h-[56px] px-space-md rounded-lg flex-row items-center justify-center gap-2 active:opacity-90 ${styles[0]} ${className}`}
    >
      {icon ? <Icon name={icon} size={22} className={styles[1]} /> : null}
      <Text className={`font-label-lg text-label-lg ${styles[1]}`}>{title}</Text>
    </Pressable>
  );
}
