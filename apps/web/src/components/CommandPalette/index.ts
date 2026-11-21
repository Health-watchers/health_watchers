import dynamic from 'next/dynamic';

export const CommandPalette = dynamic(
  () => import('./CommandPalette').then((mod) => mod.CommandPalette),
  { ssr: false }
);

export { CommandPaletteProvider, useCommandPalette } from './CommandPaletteContext';