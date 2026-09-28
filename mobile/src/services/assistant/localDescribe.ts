import { spokenBearing, spokenDistance } from '../perception/geometry';
import type { Detection } from '../perception/types';

const plural = (name: string, n: number) => {
  if (n === 1) return name;
  if (name === 'person') return 'people';
  if (/(s|sh|ch|x)$/.test(name)) return `${name}es`;
  return `${name}s`;
};

const countWord = (n: number) => (n <= 10 ? ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] : `about ${n}`);

/**
 * Deterministic description built ONLY from on-device detections (used offline / when cloud
 * processing is disabled). It never invents room types or details it cannot see.
 */
export function describeLocally(dets: Detection[], opts: { brief?: boolean } = {}): string {
  if (dets.length === 0) {
    return "I don't recognise any objects right now. Try pointing the camera slowly around you.";
  }
  const groups = new Map<string, Detection[]>();
  for (const d of dets) groups.set(d.name, [...(groups.get(d.name) ?? []), d]);

  const parts: string[] = [];
  const people = groups.get('person');
  if (people) {
    parts.push(`${countWord(people.length)} ${plural('person', people.length)}`);
    groups.delete('person');
  }
  for (const [name, list] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
    parts.push(`${countWord(list.length)} ${plural(name, list.length)}`);
  }
  const summary = `I can see ${joinList(parts)}.`;

  // Nearest thing straight ahead, then the closest object on each side.
  const withDist = dets.filter((d) => d.distanceM != null).sort((a, b) => (a.distanceM ?? 99) - (b.distanceM ?? 99));
  const ahead = withDist.find((d) => d.bearing === 'front');
  const details: string[] = [];
  if (ahead) details.push(`A ${ahead.name} is ${spokenDistance(ahead.distanceM)} ${spokenBearing('front')}.`);
  for (const side of ['left', 'right'] as const) {
    const s = withDist.find((d) => d.bearing === side && d !== ahead);
    if (s) details.push(`A ${s.name} ${spokenBearing(side)}, ${spokenDistance(s.distanceM)}.`);
  }
  if (opts.brief) return [summary, ...details.slice(0, 1)].join(' ');
  return [summary, ...details, '(On-device detection only.)'].join(' ');
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Guidance toward a target during "find" mode. */
export function findGuidance(d: Detection): string {
  const where = d.bearing === 'front' ? 'straight ahead' : d.bearing === 'left' ? 'to your left' : 'to your right';
  const dist = spokenDistance(d.distanceM);
  return `${d.name.charAt(0).toUpperCase() + d.name.slice(1)} ${where}${dist ? `, ${dist}` : ''}.`;
}
