/**
 * COCO-80 class table used by the on-device YOLO11n model (class ids 0..79, Ultralytics order).
 * `height` = typical real-world height in metres, used for the approximate monocular distance estimate.
 * `icon` = Material Symbol shown on detection pins / object cards.
 * `kind` drives hazard rules.
 */
export type LabelKind = 'person' | 'vehicle' | 'cycle' | 'animal' | 'obstacle' | 'furniture' | 'object' | 'signal';

export type LabelInfo = { label: string; name: string; icon: string; height: number | null; kind: LabelKind };

const L = (label: string, icon: string, height: number | null, kind: LabelKind, name = label): LabelInfo => ({
  label,
  name,
  icon,
  height,
  kind,
});

export const COCO_LABELS: LabelInfo[] = [
  L('person', 'person', 1.7, 'person'),
  L('bicycle', 'pedal_bike', 1.0, 'cycle'),
  L('car', 'directions_car', 1.5, 'vehicle'),
  L('motorcycle', 'two_wheeler', 1.1, 'cycle'),
  L('airplane', 'flight', null, 'object'),
  L('bus', 'directions_bus', 3.0, 'vehicle'),
  L('train', 'train', 3.8, 'vehicle'),
  L('truck', 'local_shipping', 3.0, 'vehicle'),
  L('boat', 'directions_boat', null, 'object'),
  L('traffic light', 'traffic', 0.9, 'signal'),
  L('fire hydrant', 'fire_hydrant', 0.75, 'obstacle'),
  L('stop sign', 'report', 0.75, 'signal'),
  L('parking meter', 'local_parking', 1.3, 'obstacle'),
  L('bench', 'chair', 0.85, 'obstacle'),
  L('bird', 'raven', 0.2, 'animal'),
  L('cat', 'pets', 0.3, 'animal'),
  L('dog', 'pets', 0.55, 'animal'),
  L('horse', 'bedroom_baby', 1.6, 'animal'),
  L('sheep', 'pets', 0.8, 'animal'),
  L('cow', 'pets', 1.4, 'animal'),
  L('elephant', 'pets', 3.0, 'animal'),
  L('bear', 'pets', 1.2, 'animal'),
  L('zebra', 'pets', 1.4, 'animal'),
  L('giraffe', 'pets', 4.5, 'animal'),
  L('backpack', 'backpack', 0.45, 'object'),
  L('umbrella', 'beach_access', 0.9, 'object'),
  L('handbag', 'shopping_bag', 0.3, 'object'),
  L('tie', 'checkroom', null, 'object'),
  L('suitcase', 'luggage', 0.65, 'obstacle'),
  L('frisbee', 'sports', null, 'object'),
  L('skis', 'downhill_skiing', null, 'object'),
  L('snowboard', 'snowboarding', null, 'object'),
  L('sports ball', 'sports_soccer', 0.22, 'object'),
  L('kite', 'paragliding', null, 'object'),
  L('baseball bat', 'sports_baseball', null, 'object'),
  L('baseball glove', 'sports_baseball', null, 'object'),
  L('skateboard', 'skateboarding', 0.12, 'obstacle'),
  L('surfboard', 'surfing', null, 'object'),
  L('tennis racket', 'sports_tennis', null, 'object'),
  L('bottle', 'water_bottle', 0.25, 'object'),
  L('wine glass', 'wine_bar', 0.2, 'object'),
  L('cup', 'coffee', 0.1, 'object'),
  L('fork', 'restaurant', null, 'object'),
  L('knife', 'restaurant', null, 'object'),
  L('spoon', 'restaurant', null, 'object'),
  L('bowl', 'soup_kitchen', 0.08, 'object'),
  L('banana', 'nutrition', null, 'object'),
  L('apple', 'nutrition', 0.08, 'object'),
  L('sandwich', 'lunch_dining', null, 'object'),
  L('orange', 'nutrition', 0.08, 'object'),
  L('broccoli', 'nutrition', null, 'object'),
  L('carrot', 'nutrition', null, 'object'),
  L('hot dog', 'lunch_dining', null, 'object'),
  L('pizza', 'local_pizza', null, 'object'),
  L('donut', 'bakery_dining', null, 'object'),
  L('cake', 'cake', null, 'object'),
  L('chair', 'chair', 0.9, 'furniture'),
  L('couch', 'weekend', 0.85, 'furniture', 'sofa'),
  L('potted plant', 'potted_plant', 0.6, 'obstacle'),
  L('bed', 'bed', 0.6, 'furniture'),
  L('dining table', 'table_restaurant', 0.75, 'furniture', 'table'),
  L('toilet', 'wc', 0.75, 'furniture'),
  L('tv', 'tv', 0.6, 'object', 'television'),
  L('laptop', 'laptop_chromebook', 0.25, 'object'),
  L('mouse', 'mouse', null, 'object', 'computer mouse'),
  L('remote', 'settings_remote', null, 'object'),
  L('keyboard', 'keyboard', null, 'object'),
  L('cell phone', 'smartphone', 0.15, 'object', 'phone'),
  L('microwave', 'microwave', 0.3, 'object'),
  L('oven', 'oven', 0.6, 'object'),
  L('toaster', 'breakfast_dining', null, 'object'),
  L('sink', 'wash', null, 'object'),
  L('refrigerator', 'kitchen', 1.7, 'obstacle'),
  L('book', 'menu_book', 0.24, 'object'),
  L('clock', 'schedule', 0.3, 'object'),
  L('vase', 'local_florist', 0.3, 'object'),
  L('scissors', 'content_cut', null, 'object'),
  L('teddy bear', 'toys', 0.35, 'object'),
  L('hair drier', 'air', null, 'object', 'hair dryer'),
  L('toothbrush', 'dentistry', null, 'object'),
];

export function labelInfo(classId: number): LabelInfo {
  return COCO_LABELS[classId] ?? L(`object ${classId}`, 'category', null, 'object');
}

/** Lookup by name for voice "find" queries ("find my phone" -> cell phone). */
const ALIASES: Record<string, string> = {
  phone: 'cell phone',
  mobile: 'cell phone',
  table: 'dining table',
  desk: 'dining table',
  sofa: 'couch',
  tv: 'tv',
  television: 'tv',
  bag: 'handbag',
  plant: 'potted plant',
  bike: 'bicycle',
  motorbike: 'motorcycle',
  scooter: 'motorcycle',
  mug: 'cup',
  glass: 'wine glass',
  seat: 'chair',
  people: 'person',
  man: 'person',
  woman: 'person',
  someone: 'person',
};

export function classIdForName(name: string): number | null {
  const n = name.trim().toLowerCase().replace(/^(my|the|a|an)\s+/, '').replace(/s$/, '');
  const target = ALIASES[n] ?? n;
  const idx = COCO_LABELS.findIndex((l) => l.label === target || l.name === target);
  return idx >= 0 ? idx : null;
}
