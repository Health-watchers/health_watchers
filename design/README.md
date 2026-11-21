# Design Assets

This directory holds the design assets for the project. It replaces the old `UI Designs/` folder, which used paths containing spaces and non-ASCII characters (an em dash) that broke shell scripts, CI globs, and tooling on Windows.

All paths under `design/` are lowercase, kebab-case, and ASCII-only, so they can be used unquoted in scripts and globs.

## Layout

```
design/
├── README.md
└── screens/
    └── settings-profile/   # Settings & Profile page (Figma screens)
```

- `design/screens/<screen-name>/` — exported screens, one directory per screen or flow.
- Subfolder names are kebab-case versions of the screen names (for example, the old `Design Figma screens — Settings & Profile page` folder is now `design/screens/settings-profile/`).

## Figma source

The Figma files are the source of truth for these assets. Links to the Figma files:

- **Settings & Profile page** — _add Figma file link here_
- **Other screens** — _add Figma file links here_

> Maintainers: replace the placeholders above with the actual Figma file URLs and keep this list in sync when new screens are added.

## How exports are produced

1. Open the relevant Figma file (see links above).
2. Select the frame(s) for the screen you are updating.
3. Export at the agreed settings (for example, PNG at 2x for raster screens, SVG for icons and vector assets).
4. Place the exported files in the matching `design/screens/<screen-name>/` directory, using lowercase kebab-case file names.
5. Commit the exports together with any related code changes.

Do not rename or restructure directories without updating this README and any references in `docs/`.

## Large binary exports (Git LFS)

Large binary exports (for example, high-resolution PNGs or PSDs) should be tracked with [Git LFS](https://git-lfs.com/) to keep the repository small.

Typical setup:

```sh
git lfs install
git lfs track "design/**/*.png"
git lfs track "design/**/*.psd"
git add .gitattributes
```

Commit the resulting `.gitattributes` so everyone uses the same LFS rules. If you clone the repository without Git LFS installed, large assets will be checked out as pointer files — install Git LFS and run `git lfs pull` to fetch them.

## Related documentation

- [Project documentation](../docs/README.md)