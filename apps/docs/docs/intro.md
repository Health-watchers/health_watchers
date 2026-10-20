---
slug: /
title: Health Watchers Documentation
sidebar_label: Introduction
description: Documentation for the Health Watchers HIPAA-compliant healthcare management platform.
---

# Health Watchers Documentation

Health Watchers is a HIPAA-compliant healthcare management platform. It is built from a Next.js web app, an Express API, a React Native mobile app, and a Stellar service that handles blockchain payments.

## Who these docs are for

| You are… | Start here |
|----------|------------|
| A clinic administrator or front-desk staff member | [User Guide](/user-guide/overview) |
| A developer running the stack locally | [Quick Start](./getting-started/quick-start.md) |
| A developer working on a feature | [Clinical modules](./clinical/patients.md), [Payments](./payments/stellar-payments.md), [Platform](./platform/auth.md) |
| An operator deploying or running Health Watchers | [Operations](./operations/deployment.md) |
| A contributor | [Contributing](./contributing/overview.md) |

## How the docs are organised

- **Getting Started** and **Architecture** give the big picture.
- **Clinical modules**, **Payments** and **Platform** have one page per API module. Each page covers the module's purpose, data model, key endpoints, and the roles allowed to call them.
- **Operations** covers health checks, metrics, infrastructure endpoints, deployment, and disaster recovery.
- **Security & Compliance** describes the HIPAA controls.
- **Contributing** explains how to work on the codebase and on these docs.
- The **User Guide** contains task-oriented, non-technical guides for clinic staff.

Use the search box in the navigation bar to search every page.
