# Health Watchers — Infrastructure as Code (Terraform)

Reproducible, version-controlled infrastructure for the Health Watchers platform.
Every environment (dev / staging / production) is defined entirely in code and
provisioned from the same set of reusable modules, so an environment can be
rebuilt from scratch with `terraform apply`.

Closes #1256.

## Layout

```
terraform/
├── versions.tf                 Global Terraform + provider version pins
├── Makefile                    Thin wrapper around common workflows
├── bootstrap/                  One-time: creates the remote state backend
│   └── (S3 state bucket + DynamoDB lock table + KMS key)
├── modules/                    Reusable building blocks
│   ├── networking/             VPC, subnets, NAT, route tables, security groups
│   ├── database/               DocumentDB (MongoDB-compatible) cluster + backups
│   ├── load-balancer/          Application Load Balancer, target groups, listeners
│   ├── tls-certificate/        ACM certificate + Route53 DNS validation
│   ├── backup-dr/              AWS Backup vault + plan + cross-region copy
│   ├── monitoring/             CloudWatch dashboards, alarms, SNS, Prometheus stack
│   ├── logging/                Central log groups, log-archive bucket, Firehose
│   └── secrets/                Secrets Manager secrets + rotation + KMS
└── environments/               One directory per environment (the root modules)
    ├── dev/
    ├── staging/
    └── production/
```

## Prerequisites

- Terraform `>= 1.6.0`
- AWS credentials with permission to manage the resources above
- An AWS account per environment (or at minimum separate state keys)

## Bootstrapping remote state (run once per account)

The remote state backend has to exist before any environment can use it.
`bootstrap/` provisions it with a **local** state file that you then commit is
*not* required — keep it out of git (see `.gitignore`).

```bash
cd terraform/bootstrap
terraform init
terraform apply -var 'project=health-watchers' -var 'region=us-east-1'
```

Outputs: `state_bucket_name`, `lock_table_name`, `kms_key_arn`. Wire those into
each environment's `backend.tf`.

## Provisioning an environment

```bash
cd terraform/environments/dev
terraform init          # reads backend.tf -> S3 + DynamoDB lock
terraform plan  -out tfplan
terraform apply tfplan
```

Or via the Makefile from `terraform/`:

```bash
make plan  ENV=dev
make apply ENV=dev
```

## State security & locking

- **Remote state**: stored in a private, versioned S3 bucket with
  `aws:kms` encryption (SSE-KMS) and public access fully blocked.
- **Locking**: a DynamoDB table (`LockID` hash key) serialises concurrent runs.
- **Least privilege**: the state bucket policy denies any non-TLS request and any
  request that does not use the dedicated KMS key.
- **No secrets in state where avoidable**: application secrets live in AWS
  Secrets Manager (see `modules/secrets`), referenced by ARN, not value.
- **Change tracking**: all `.tf` and `.tfvars` files are committed to Git; the
  only thing not in Git is `*.tfstate`, `*.tfvars` containing real secrets, and
  `.terraform/`.

## Environment differences

Environment-specific sizing lives in each environment's `terraform.tfvars`
(instance classes, node counts, retention windows, NAT gateway count, deletion
protection, etc.). The module code is identical across environments.

| Setting                | dev     | staging | production |
|------------------------|---------|---------|------------|
| NAT gateways           | 1       | 1       | 3 (per-AZ) |
| DocumentDB instances   | 1       | 2       | 3          |
| Backup retention       | 7 days  | 14 days | 35 days    |
| Cross-region DR copy   | off     | off     | on         |
| Deletion protection    | off     | off     | on         |
| Log retention          | 14 days | 30 days | 400 days   |
