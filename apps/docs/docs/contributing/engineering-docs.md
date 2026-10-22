---
title: Engineering Docs Index
description: Links to the canonical engineering, operations and compliance documents in the repository's docs/ directory.
---

# Engineering Docs Index

The repository's [`docs/`](https://github.com/Health-watchers/health_watchers/tree/main/docs) directory holds the long-form engineering documentation, with one canonical file per topic. This page mirrors [`docs/README.md`](https://github.com/Health-watchers/health_watchers/blob/main/docs/README.md).

## Architecture & Design

| Document | Topic |
|----------|-------|
| [ARCHITECTURE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/ARCHITECTURE.md) | System architecture, data flows, deployment topology |
| [DATABASE_SCHEMA.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DATABASE_SCHEMA.md) | Collections, relationships, indexes, core entities |
| [DATABASE_CONNECTION_POOLING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DATABASE_CONNECTION_POOLING.md) | MongoDB connection pool tuning |
| [DATABASE_SHARDING_STRATEGY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DATABASE_SHARDING_STRATEGY.md) | Sharding keys and balancing |
| [REPLICATION_OPTIMIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/REPLICATION_OPTIMIZATION.md) | Replica set and read-preference tuning |
| [DEPENDENCY_INJECTION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DEPENDENCY_INJECTION.md) | Service container and DI patterns |
| [SERVICE_DISCOVERY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/SERVICE_DISCOVERY.md) | Service registration and discovery |
| [COMPONENT_HIERARCHY_REFACTORING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/COMPONENT_HIERARCHY_REFACTORING.md) | Web component hierarchy and props |
| [RESPONSIVE_DESIGN_SYSTEM.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/RESPONSIVE_DESIGN_SYSTEM.md) | Breakpoints and responsive UI rules |
| [adr/](https://github.com/Health-watchers/health_watchers/blob/main/docs/adr/README.md) | Architecture Decision Records |
| [design/](https://github.com/Health-watchers/health_watchers/tree/main/docs/design) | Product/UX design specifications |
| [diagrams/](https://github.com/Health-watchers/health_watchers/blob/main/docs/diagrams/README.md) | Mermaid diagram sources |

## API

| Document | Topic |
|----------|-------|
| [API_DOCUMENTATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/API_DOCUMENTATION.md) | API overview and conventions |
| [API_MIGRATION_GUIDE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/API_MIGRATION_GUIDE.md) | Migrating between API versions |
| [API_RATE_LIMITING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/API_RATE_LIMITING.md) | Global and per-resource rate limits |
| [API_CONTRACT_TESTING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/API_CONTRACT_TESTING.md) | Pact consumer/provider contract testing |
| [ERROR_HANDLING_STANDARDIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/ERROR_HANDLING_STANDARDIZATION.md) | Error envelope and codes |
| [VALIDATION_STANDARDIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/VALIDATION_STANDARDIZATION.md) | Zod validation conventions |
| [ROLE-BASED-FILTERING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/ROLE-BASED-FILTERING.md) | Role-based response field filtering |
| [SDK_GUIDE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/SDK_GUIDE.md) | Client SDKs |
| [postman/](https://github.com/Health-watchers/health_watchers/tree/main/docs/postman) | Postman collection and environment |

## Development & Testing

| Document | Topic |
|----------|-------|
| [IDE_SETUP.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/IDE_SETUP.md) | Editor extensions, formatting, debugging |
| [TESTING_GUIDE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/TESTING_GUIDE.md) | Test stack, running tests, required test layers |
| [LOAD_TESTING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/LOAD_TESTING.md) | k6 load testing |
| [turborepo-remote-cache.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/turborepo-remote-cache.md) | Turborepo remote caching |
| [TROUBLESHOOTING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/TROUBLESHOOTING.md) | Common development problems |

## Performance

| Document | Topic |
|----------|-------|
| [PERFORMANCE_OPTIMIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/PERFORMANCE_OPTIMIZATION.md) | Backend performance and profiling suite |
| [FRONTEND_PERFORMANCE_OPTIMIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/FRONTEND_PERFORMANCE_OPTIMIZATION.md) | Web bundle and rendering performance |
| [QUERY_OPTIMIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/QUERY_OPTIMIZATION.md) | MongoDB query tuning |
| [CDN_CACHING_STRATEGY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/CDN_CACHING_STRATEGY.md) | CDN, browser, and Redis caching |

## Deployment & Operations

| Document | Topic |
|----------|-------|
| [DEPLOYMENT_GUIDE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DEPLOYMENT_GUIDE.md) | Docker, Kubernetes, and cloud deployment, deployment checklist |
| [KUBERNETES_DEPLOYMENT.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/KUBERNETES_DEPLOYMENT.md) | Raw Kubernetes manifests (`k8s/`) |
| [HELM_DEPLOYMENT.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/HELM_DEPLOYMENT.md) | Helm chart (`helm/`) |
| [BLUE_GREEN_DEPLOYMENT.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/BLUE_GREEN_DEPLOYMENT.md) | Blue-green releases and traffic shifting |
| [AUTO_SCALING_GUIDE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/AUTO_SCALING_GUIDE.md) | HPA policies and targets |
| [DOCKER_OPTIMIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DOCKER_OPTIMIZATION.md) | Production image builds |
| [CI_CD_PIPELINE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/CI_CD_PIPELINE.md) | GitHub Actions pipeline |
| [RELEASE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/RELEASE.md) | Release process |
| [RELEASE_NOTES_TEMPLATE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/RELEASE_NOTES_TEMPLATE.md) | Release notes template |
| [OBSERVABILITY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/OBSERVABILITY.md) | Logging, tracing, metrics, and best practices |
| [COST_OPTIMIZATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/COST_OPTIMIZATION.md) | Infrastructure cost controls |
| [DISASTER_RECOVERY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DISASTER_RECOVERY.md) | DR plan, drills, and backup operations |
| [BACKUP_VERIFICATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/BACKUP_VERIFICATION.md) | Automated backup verification |
| [runbooks/](https://github.com/Health-watchers/health_watchers/blob/main/docs/runbooks/README.md) | Step-by-step operational runbooks |
| [templates/INCIDENT_COMMUNICATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/templates/INCIDENT_COMMUNICATION.md) | Incident communication templates |

## Security & Compliance

| Document | Topic |
|----------|-------|
| [SECURITY_POLICY.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/SECURITY_POLICY.md) | Threat model, security guidelines, incident response |
| [SECRETS_MANAGEMENT.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/SECRETS_MANAGEMENT.md) | Secret storage and rotation |
| [SECURITY_SCANNING.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/SECURITY_SCANNING.md) | Dependency and CI security scanning |
| [SECURITY_REMEDIATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/SECURITY_REMEDIATION.md) | Remediation playbook, remediation log, secrets-leak response |
| [DEPENDENCY_AUDIT_REPORT.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DEPENDENCY_AUDIT_REPORT.md) | Latest weekly dependency audit |
| [DATA_ENCRYPTION_AT_REST.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/DATA_ENCRYPTION_AT_REST.md) | Field- and storage-level encryption |
| [INTRUSION_DETECTION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/INTRUSION_DETECTION.md) | Intrusion detection and alerting |
| [PENTEST_PLAN.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/PENTEST_PLAN.md) | Penetration test plan |
| [PENTEST_FINDINGS.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/PENTEST_FINDINGS.md) | Penetration test findings |
| [PENTEST_REMEDIATION.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/PENTEST_REMEDIATION.md) | Penetration test remediation plan |
| [HEALTHCARE_COMPLIANCE_GUIDE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/HEALTHCARE_COMPLIANCE_GUIDE.md) | HIPAA/GDPR/NDPR compliance |
| [PHI_HANDLING_GUIDE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/PHI_HANDLING_GUIDE.md) | Handling PHI in code |
| [BAA_TEMPLATE.md](https://github.com/Health-watchers/health_watchers/blob/main/docs/BAA_TEMPLATE.md) | Business Associate Agreement template |
