---
title: Writing Documentation
description: How to add or update pages on the Health Watchers documentation site.
---

# Writing Documentation

The site is built with [Docusaurus](https://docusaurus.io/) from `apps/docs`.

```bash
cd apps/docs
npm ci
npm start        # live preview at http://localhost:3000
npm run build    # production build; fails on broken links or anchors
```

## Where to put a page

| Content | Folder |
|---------|--------|
| API module (purpose, data model, endpoints, roles) | `docs/clinical`, `docs/payments`, `docs/platform` or `docs/operations` |
| Task guide for clinic staff | `docs/user-guide` |
| Contributor workflow | `docs/contributing` |

After adding a page, register it in `apps/docs/sidebars.ts`.

## Module pages

When you mount a new router in `apps/api/src/routes/v1/index.ts` or `apps/api/src/app.ts`, add a module page in the matching section. Each page uses the same layout:

1. A purpose paragraph and a table with the base path and source files
2. **Data model**: the Mongoose models and their key fields
3. **Key endpoints**: method, path, and required roles
4. **Roles**
5. **Related** links

## Engineering docs

Long-form engineering, operations and compliance documents live in the repository's `docs/` directory, which has one canonical file per topic. The [Engineering Docs Index](./engineering-docs.md) links to them. Update the existing file instead of adding a new file on the same topic, and keep [`docs/README.md`](https://github.com/Health-watchers/health_watchers/blob/main/docs/README.md) in sync.

## Search

Search is provided by `@easyops-cn/docusaurus-search-local`. The index is built at build time, so it needs no external service or API keys.

## Translations

Locales are configured in `docusaurus.config.ts` (`en`, `fr`). To translate:

```bash
npm run write-translations -- --locale fr
# copy pages to translate into i18n/fr/docusaurus-plugin-content-docs/current/
npm start -- --locale fr
```

Pages without a translation fall back to English. Translation priorities are listed in the [User Guide translation plan](../user-guide/translations.md).

## Screenshots

User guide pages are illustrated with annotated screen diagrams stored in `static/img/user-guide/`. Numbered callouts in each diagram match the numbered steps in the text. When you replace a diagram with a real screenshot, use the demo seed data (never real patient data) and keep the same callout numbers.
