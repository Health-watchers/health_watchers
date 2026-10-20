# Health Watchers Documentation Index

This directory holds the engineering, operations, and compliance documentation for Health Watchers. Each topic has a single canonical file. The published documentation site lives in [`apps/docs`](../apps/docs/README.md), and API-specific references live in [`apps/api/docs`](../apps/api/docs/README.md).

Repository-level documents:

- [README](../README.md): project overview and quick start
- [CONTRIBUTING](../CONTRIBUTING.md): development workflow, coding standards, commit conventions
- [SECURITY](../SECURITY.md): vulnerability reporting and disclosure policy
- [CHANGELOG](../CHANGELOG.md): API changes and implementation history

## Architecture & Design

| Document | Topic |
|----------|-------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, data flows, deployment topology |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Collections, relationships, indexes, core entities |
| [DATABASE_CONNECTION_POOLING.md](./DATABASE_CONNECTION_POOLING.md) | MongoDB connection pool tuning |
| [DATABASE_SHARDING_STRATEGY.md](./DATABASE_SHARDING_STRATEGY.md) | Sharding keys and balancing |
| [REPLICATION_OPTIMIZATION.md](./REPLICATION_OPTIMIZATION.md) | Replica set and read-preference tuning |
| [DEPENDENCY_INJECTION.md](./DEPENDENCY_INJECTION.md) | Service container and DI patterns |
| [SERVICE_DISCOVERY.md](./SERVICE_DISCOVERY.md) | Service registration and discovery |
| [COMPONENT_HIERARCHY_REFACTORING.md](./COMPONENT_HIERARCHY_REFACTORING.md) | Web component hierarchy and props |
| [RESPONSIVE_DESIGN_SYSTEM.md](./RESPONSIVE_DESIGN_SYSTEM.md) | Breakpoints and responsive UI rules |
| [adr/](./adr/README.md) | Architecture Decision Records |
| [design/](./design/) | Product/UX design specifications |
| [diagrams/](./diagrams/README.md) | Mermaid diagram sources |

## API

| Document | Topic |
|----------|-------|
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | API overview and conventions |
| [API_MIGRATION_GUIDE.md](./API_MIGRATION_GUIDE.md) | Migrating between API versions |
| [API_RATE_LIMITING.md](./API_RATE_LIMITING.md) | Global and per-resource rate limits |
| [API_CONTRACT_TESTING.md](./API_CONTRACT_TESTING.md) | Pact consumer/provider contract testing |
| [ERROR_HANDLING_STANDARDIZATION.md](./ERROR_HANDLING_STANDARDIZATION.md) | Error envelope and codes |
| [VALIDATION_STANDARDIZATION.md](./VALIDATION_STANDARDIZATION.md) | Zod validation conventions |
| [ROLE-BASED-FILTERING.md](./ROLE-BASED-FILTERING.md) | Role-based response field filtering |
| [SDK_GUIDE.md](./SDK_GUIDE.md) | Client SDKs |
| [postman/](./postman/) | Postman collection and environment |

## Development & Testing

| Document | Topic |
|----------|-------|
| [IDE_SETUP.md](./IDE_SETUP.md) | Editor extensions, formatting, debugging |
| [TESTING_GUIDE.md](./TESTING_GUIDE.md) | Test stack, running tests, required test layers |
| [LOAD_TESTING.md](./LOAD_TESTING.md) | k6 load testing |
| [turborepo-remote-cache.md](./turborepo-remote-cache.md) | Turborepo remote caching |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common development problems |

## Performance

| Document | Topic |
|----------|-------|
| [PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md) | Backend performance and profiling suite |
| [FRONTEND_PERFORMANCE_OPTIMIZATION.md](./FRONTEND_PERFORMANCE_OPTIMIZATION.md) | Web bundle and rendering performance |
| [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) | MongoDB query tuning |
| [CDN_CACHING_STRATEGY.md](./CDN_CACHING_STRATEGY.md) | CDN, browser, and Redis caching |

## Deployment & Operations

| Document | Topic |
|----------|-------|
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Docker, Kubernetes, and cloud deployment, deployment checklist |
| [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) | Raw Kubernetes manifests (`k8s/`) |
| [HELM_DEPLOYMENT.md](./HELM_DEPLOYMENT.md) | Helm chart (`helm/`) |
| [BLUE_GREEN_DEPLOYMENT.md](./BLUE_GREEN_DEPLOYMENT.md) | Blue-green releases and traffic shifting |
| [AUTO_SCALING_GUIDE.md](./AUTO_SCALING_GUIDE.md) | HPA policies and targets |
| [DOCKER_OPTIMIZATION.md](./DOCKER_OPTIMIZATION.md) | Production image builds |
| [CI_CD_PIPELINE.md](./CI_CD_PIPELINE.md) | GitHub Actions pipeline |
| [RELEASE.md](./RELEASE.md) | Release process |
| [RELEASE_NOTES_TEMPLATE.md](./RELEASE_NOTES_TEMPLATE.md) | Release notes template |
| [OBSERVABILITY.md](./OBSERVABILITY.md) | Logging, tracing, metrics, and best practices |
| [COST_OPTIMIZATION.md](./COST_OPTIMIZATION.md) | Infrastructure cost controls |
| [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) | DR plan, drills, and backup operations |
| [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) | Automated backup verification |
| [runbooks/](./runbooks/README.md) | Step-by-step operational runbooks |
| [templates/INCIDENT_COMMUNICATION.md](./templates/INCIDENT_COMMUNICATION.md) | Incident communication templates |

## Security & Compliance

| Document | Topic |
|----------|-------|
| [SECURITY_POLICY.md](./SECURITY_POLICY.md) | Threat model, security guidelines, incident response |
| [SECRETS_MANAGEMENT.md](./SECRETS_MANAGEMENT.md) | Secret storage and rotation |
| [SECURITY_SCANNING.md](./SECURITY_SCANNING.md) | Dependency and CI security scanning |
| [SECURITY_REMEDIATION.md](./SECURITY_REMEDIATION.md) | Remediation playbook, remediation log, secrets-leak response |
| [DEPENDENCY_AUDIT_REPORT.md](./DEPENDENCY_AUDIT_REPORT.md) | Latest weekly dependency audit |
| [DATA_ENCRYPTION_AT_REST.md](./DATA_ENCRYPTION_AT_REST.md) | Field- and storage-level encryption |
| [INTRUSION_DETECTION.md](./INTRUSION_DETECTION.md) | Intrusion detection and alerting |
| [PENTEST_PLAN.md](./PENTEST_PLAN.md) | Penetration test plan |
| [PENTEST_FINDINGS.md](./PENTEST_FINDINGS.md) | Penetration test findings |
| [PENTEST_REMEDIATION.md](./PENTEST_REMEDIATION.md) | Penetration test remediation plan |
| [HEALTHCARE_COMPLIANCE_GUIDE.md](./HEALTHCARE_COMPLIANCE_GUIDE.md) | HIPAA/GDPR/NDPR compliance |
| [PHI_HANDLING_GUIDE.md](./PHI_HANDLING_GUIDE.md) | Handling PHI in code |
| [BAA_TEMPLATE.md](./BAA_TEMPLATE.md) | Business Associate Agreement template |

## Moved and Merged Documents

| Former file | Now |
|-------------|-----|
| `DISASTER_RECOVERY_PLAN.md`, `DISASTER_RECOVERY_PLAYBOOK.md`, `DISASTER_RECOVERY_PROCEDURES.md`, `disaster-recovery.md` | [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) |
| `CONTRIBUTING_GUIDE.md` | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| `BLUE_GREEN_DEPLOYMENT_STRATEGY.md` | [BLUE_GREEN_DEPLOYMENT.md](./BLUE_GREEN_DEPLOYMENT.md#traffic-shifting-strategy) |
| `AUTO_SCALING_POLICIES.md` | [AUTO_SCALING_GUIDE.md](./AUTO_SCALING_GUIDE.md#policy-targets-summary) |
| `DEPLOYMENT_PROCEDURES.md` | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md#deployment-checklist) |
| `OBSERVABILITY_BEST_PRACTICES.md` | [OBSERVABILITY.md](./OBSERVABILITY.md#observability-best-practices) |
| `security-scanning.md` | [SECURITY_SCANNING.md](./SECURITY_SCANNING.md#ci-security-scan-workflow) |
| `contract-testing.md` | [API_CONTRACT_TESTING.md](./API_CONTRACT_TESTING.md) |
| `TESTING_GUIDE_ADDITIONS.md` | [TESTING_GUIDE.md](./TESTING_GUIDE.md#required-test-layers) |
| `DATA_MODEL.md` | [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md#core-entities-and-phi-requirements) |
| `SYSTEM_DESIGN_OVERVIEW.md` | [ARCHITECTURE.md](./ARCHITECTURE.md#overview) |
| `PER_RESOURCE_RATE_LIMITING.md` | [API_RATE_LIMITING.md](./API_RATE_LIMITING.md#per-resource-rate-limit-keys) |
| `CACHING_STRATEGY.md` | [CDN_CACHING_STRATEGY.md](./CDN_CACHING_STRATEGY.md#application-redis-caching) |
| `PERFORMANCE_PROFILING_SUITE.md` | [PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md#profiling-suite) |
| `VULNERABILITY_REMEDIATION_2026-08.md` | [SECURITY_REMEDIATION.md](./SECURITY_REMEDIATION.md#remediation-log-2026-08) |
| `runbooks/BACKUP_AND_DR_RUNBOOK.md` | [runbooks/05-backup.md](./runbooks/05-backup.md#backup--dr-automation) |
| Root `SECURITY_SECRETS_REMEDIATION.md` | [SECURITY_REMEDIATION.md](./SECURITY_REMEDIATION.md#secrets-leak-remediation) |
| Root `IMPLEMENTATION_SUMMARY.md`, `SECURITY_IMPLEMENTATION_SUMMARY.md`, `BATCH_*_IMPLEMENTATION.md` | [CHANGELOG.md — Implementation History](../CHANGELOG.md#implementation-history) |
