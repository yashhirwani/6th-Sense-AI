// Builds src/components/icons/glyphs.json (Material Symbols name -> codepoint) from the upstream .codepoints file.
// Usage: node scripts/gen-glyphs.js <path-to-MaterialSymbolsOutlined.codepoints>
const fs = require('fs');
const path = require('path');
const src = process.argv[2] || 'D:/6thSenseAI/downloads/fonts/MaterialSymbolsOutlined.codepoints';
const map = {};
for (const line of fs.readFileSync(src, 'utf8').trim().split(/\r?\n/)) {
  const [name, hex] = line.split(' ');
  map[name] = parseInt(hex, 16);
}
fs.writeFileSync(path.join(__dirname, '..', 'src/components/icons/glyphs.json'), JSON.stringify(map));
console.log(Object.keys(map).length, 'glyphs');
const used = ['chat_spark', 'pixel_4_4xl_4a_5_5a_5g', 'search_insights', 'graphic_eq', 'spatial_audio', 'spatial_audio_off', 'emergency_home', 'shield_with_heart', 'desk', 'waving_hand', 'compass_calibration', 'barcode_scanner', 'document_scanner', 'travel_explore', 'table_restaurant', 'door_front', 'motion_sensor_active', 'hail', 'front_hand', 'turn_slight_right', 'laptop_chromebook', 'volunteer_activism', 'power_settings_new', 'notifications_active', 'record_voice_over', 'verified_user', 'filter_center_focus', 'play_circle', 'wb_sunny', 'contrast', 'headphones', 'sos', 'campaign', 'share_location', 'screen_rotation', 'grain', 'smart_toy', 'meeting_room', 'radar', 'pin_drop', 'domain', 'near_me', 'menu_book', 'visibility', 'psychology', 'vibration', 'sensors', 'hearing', 'speed', 'touch_app', 'check_circle', 'mic', 'home', 'shield', 'call', 'arrow_forward', 'replay', 'volume_up', 'volume_off', 'explore', 'navigation', 'person', 'chair', 'verified', 'check', 'tune', 'photo_camera', 'camera'];
const missing = used.filter((n) => map[n] === undefined);
console.log(missing.length ? 'MISSING: ' + missing.join(', ') : 'all design icons present');
