# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-25

### Added

#### Web Application
- Patient management system with CRUD operations
  - Patient listing with search and pagination
  - Individual patient detail views
  - Patient creation and editing forms
- Encounter tracking functionality
  - Create and view patient encounters
  - Link encounters to specific patients
- Payment processing integration
  - Stellar blockchain payment intent creation
  - Payment tracking and management
- Authentication system
  - JWT-based authentication with refresh tokens
  - Login/logout functionality
  - Protected routes and API endpoints
  - Auth context for client-side state management
- Internationalization (i18n) support
  - English and French language support
  - Next.js middleware for locale handling
- UI Component library
  - Design system documentation
  - Reusable components: Button, Card, Input, Modal, Table, etc.
  - Form components with validation
  - Loading states (Spinner, Skeleton)
  - Toast notifications

#### API
- RESTful API endpoints for patient, encounter, and payment management
- Authentication controller with user model
- MongoDB integration for data persistence

#### Infrastructure
- Monorepo structure using npm workspaces and Turbo
- TypeScript configuration across all packages
- Database seeding scripts
- Environment configuration templates

### Security
- JWT token-based authentication
- Password hashing with bcryptjs
- Protected API routes
- Secure token refresh mechanism

[unreleased]: https://github.com/[username]/health-watchers/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/[username]/health-watchers/releases/tag/v0.1.0
