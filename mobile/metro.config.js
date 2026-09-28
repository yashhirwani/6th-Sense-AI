const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// On-device ML models are bundled as assets; the web preview's SQLite (sql.js) is a .wasm file.
config.resolver.assetExts.push('tflite', 'wasm');

// rem is NOT inlined: Stitch tokens are authored in rem, and the root rem is set at runtime
// (16px by default, larger for the "Display Text Scale" setting) - see src/theme/textScale.ts.
module.exports = withNativeWind(config, { input: './global.css' });
