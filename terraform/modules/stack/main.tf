# ─────────────────────────────────────────────────────────────────────────────
# Composition root for one Health Watchers environment. Every environment
# (dev / staging / production) instantiates this module with different sizing
# inputs, guaranteeing the environments are structurally identical and fully
# reproducible from code.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  name_prefix = "${var.project}-${var.environment}"
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# 1. Secrets & KMS — created first; the KMS key is reused for DB/backup/log encryption.
module "secrets" {
  source      = "../secrets"
  name_prefix = local.name_prefix
  tags        = local.common_tags

  secrets = {
    docdb_master_password = {
      description       = "DocumentDB master password"
      generate_password = true
    }
    jwt_access_token_secret  = { description = "JWT access token signing secret", generate_password = true }
    jwt_refresh_token_secret = { description = "JWT refresh token signing secret", generate_password = true }
    field_encryption_key     = { description = "PHI field-level encryption key", generate_password = true }
    document_encryption_key  = { description = "Document at-rest encryption master key", generate_password = true }
    stellar_secret_key       = { description = "Stellar platform account secret key" }
    smtp_password            = { description = "Outbound SMTP password" }
  }
}

# 2. Networking
module "networking" {
  source = "../networking"

  name_prefix           = local.name_prefix
  vpc_cidr              = var.vpc_cidr
  azs                  = var.azs
  public_subnet_cidrs   = var.public_subnet_cidrs
  private_subnet_cidrs  = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
  nat_gateway_count     = var.nat_gateway_count
  app_port             = var.app_port

  flow_log_destination_arn = module.logging.flow_log_group_arn
  flow_log_role_arn        = module.logging.flow_log_role_arn

  tags = local.common_tags
}

# 3. Logging
module "logging" {
  source            = "../logging"
  name_prefix       = local.name_prefix
  kms_key_arn       = module.secrets.kms_key_arn
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# 4. TLS certificate
module "tls" {
  source                    = "../tls-certificate"
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  route53_zone_id           = var.route53_zone_id
  tags                      = local.common_tags
}

# 5. Database
module "database" {
  source = "../database"

  name_prefix        = local.name_prefix
  subnet_ids         = module.networking.database_subnet_ids
  security_group_ids = [module.networking.database_security_group_id]
  instance_count     = var.docdb_instance_count
  instance_class     = var.docdb_instance_class
  master_password    = module.secrets.generated_password_values["docdb_master_password"]
  kms_key_arn        = module.secrets.kms_key_arn
  backup_retention_days      = var.docdb_backup_retention_days
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = !var.deletion_protection
  tags                       = local.common_tags
}

# 6. Load balancing
module "load_balancer" {
  source = "../load-balancer"

  name_prefix               = local.name_prefix
  vpc_id                    = module.networking.vpc_id
  public_subnet_ids         = module.networking.public_subnet_ids
  security_group_ids        = [module.networking.alb_security_group_id]
  certificate_arn           = module.tls.certificate_arn
  app_port                  = var.app_port
  enable_deletion_protection = var.deletion_protection
  # ALB access logs need a bucket with an ELB log-delivery policy; wire a
  # purpose-built bucket here when enabling. Off by default to keep apply clean.
  access_logs_bucket = null
  tags               = local.common_tags
}

# 7. Backup & disaster recovery
module "backup_dr" {
  source = "../backup-dr"

  name_prefix              = local.name_prefix
  kms_key_arn              = module.secrets.kms_key_arn
  backup_resource_arns     = [module.database.cluster_arn]
  daily_retention_days     = var.backup_daily_retention_days
  weekly_retention_days    = var.backup_weekly_retention_days
  enable_vault_lock        = var.enable_vault_lock
  enable_cross_region_copy = var.enable_cross_region_dr
  dr_region                = var.dr_region
  dr_vault_arn             = var.dr_vault_arn
  tags                     = local.common_tags
}

# 8. Monitoring
module "monitoring" {
  source = "../monitoring"

  name_prefix              = local.name_prefix
  aws_region               = var.aws_region
  alarm_email              = var.alarm_email
  alb_arn_suffix           = module.load_balancer.alb_arn_suffix
  target_group_arn_suffix  = module.load_balancer.target_group_arn_suffix
  docdb_cluster_identifier = module.database.cluster_identifier
  tags                     = local.common_tags
}
