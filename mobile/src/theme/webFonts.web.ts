import { Asset } from 'expo-asset';

/**
 * Web preview: register Inter (4 weights under ONE family, so fontWeight selects the file, exactly like
 * the Android font family on the phone) and the two Material Symbols fonts via @font-face.
 */
const FACES: { family: string; weight: number; module: number }[] = [
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  { family: 'Inter', weight: 400, module: require('../../assets/fonts/Inter-Regular.ttf') },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  { family: 'Inter', weight: 500, module: require('../../assets/fonts/Inter-Medium.ttf') },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  { family: 'Inter', weight: 600, module: require('../../assets/fonts/Inter-SemiBold.ttf') },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  { family: 'Inter', weight: 700, module: require('../../assets/fonts/Inter-Bold.ttf') },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  { family: 'MaterialSymbolsOutlined', weight: 400, module: require('../../assets/fonts/MaterialSymbolsOutlined.ttf') },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  { family: 'MaterialSymbolsFilled', weight: 400, module: require('../../assets/fonts/MaterialSymbolsFilled.ttf') },
];

export async function loadWebFonts(): Promise<void> {
  const css = FACES.map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;font-display:block;src:url('${Asset.fromModule(f.module).uri}') format('truetype');}`).join('\n');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  await Promise.all(FACES.map((f) => document.fonts.load(`${f.weight} 16px '${f.family}'`).catch(() => undefined)));
}
