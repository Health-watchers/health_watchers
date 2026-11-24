# Health Watchers Documentation

Documentation site built with [Docusaurus](https://docusaurus.io/).

## Getting Started

```bash
npm ci
npm start                 # http://localhost:3000
npm start -- --locale fr  # French preview
```

## Building

```bash
npm run build
```

The build fails on broken links, broken Markdown links, or broken anchors. The [Docs workflow](../../.github/workflows/docs.yml) runs it on every PR and deploys `main` to GitHub Pages.

## Documentation Structure

- **Getting Started** and **Architecture**: quick start, architecture overview, API reference
- **Clinical Modules**, **Payments**, **Platform**: one page per mounted API module (purpose, data model, key endpoints, roles)
- **Operations**: deployment, monitoring, disaster recovery, health checks, admin endpoints
- **Contributing**: workflow, writing docs, and an index of the engineering docs in [`docs/`](../../docs/README.md)
- **User Guide**: task-oriented guides for clinic administrators and front-desk staff (English, with French in progress)

## Search

Full-text search uses [`@easyops-cn/docusaurus-search-local`](https://github.com/easyops-cn/docusaurus-search-local). The index is generated at build time and needs no external service.

## Adding Documentation

See [`docs/contributing/writing-docs.md`](docs/contributing/writing-docs.md).
