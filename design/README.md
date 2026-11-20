# Design assets

Design references for Health Watchers. The source of truth is Figma; this folder
holds links to the Figma files and any exported assets.

## Layout

| Path | Figma source |
|------|--------------|
| `screens/design-system/` | [Health Watchers – Design System – Screens](https://www.figma.com/design/i33wHJO8H3Kv4wNa9CdpiA/Health-Watchers-%E2%80%93-Design-System---Screens) |
| `screens/settings-profile/` | [Health Watcher – Settings & Profile page](https://www.figma.com/design/lO0DatXQI7nkVAI3llbBvH/Health-Watcher) |

Each `figma-link.url` file contains the URL of the corresponding Figma file.

## Exports

Export frames from Figma as PNG (or SVG) into the matching `screens/<name>/`
folder (File → Export, or select the frame → Export panel). Path rules:

- kebab-case, ASCII only, no spaces or special characters;
- consider Git LFS for large binary exports.

Product/UX specifications live in [`docs/design/`](../docs/design/).
