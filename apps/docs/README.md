# Health Watchers Documentation

Comprehensive documentation site built with Docusaurus.

## Getting Started

```bash
npm install
npm run dev
```

Documentation will be available at `http://localhost:3000`.

## Building

```bash
npm run build
```

## Deployment

### GitHub Pages

```bash
npm run deploy
```

### Vercel

Connect the repository to Vercel and set:
- Build command: `npm run build --workspace=docs`
- Output directory: `build`

## Documentation Structure

- **Getting Started**: Quick start, installation, configuration
- **Architecture**: System design, service communication, data flow
- **Features**: Patient management, encounters, payments, AI
- **Stellar Integration**: Payment flow, wallet setup, testnet guide
- **Security**: Authentication, RBAC, HIPAA compliance
- **Deployment**: Docker, Kubernetes, environment variables
- **Contributing**: Development setup, coding standards, PR process
- **API Reference**: Auto-generated from OpenAPI spec

## Adding Documentation

1. Create markdown file in appropriate directory
2. Add to `sidebars.ts`
3. Run `npm run dev` to preview
4. Commit and push

## Search

Documentation includes Algolia DocSearch for full-text search.

Configure in `docusaurus.config.ts`:
```typescript
algolia: {
  appId: process.env.ALGOLIA_APP_ID,
  apiKey: process.env.ALGOLIA_API_KEY,
  indexName: 'health-watchers',
}
```

## Versioning

To create a new documentation version:

```bash
npm run docusaurus docs:version 2.0.0
```

This creates a versioned copy of the documentation.

## See Also

- [Docusaurus Documentation](https://docusaurus.io/)
- [OpenAPI Plugin](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs)
