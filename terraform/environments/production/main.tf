module "stack" {
  source = "../../modules/stack"

  project     = "health-watchers"
  environment = "production"
  aws_region  = var.aws_region

  azs                   = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  vpc_cidr              = "10.30.0.0/16"
  public_subnet_cidrs   = ["10.30.0.0/24", "10.30.1.0/24", "10.30.2.0/24"]
  private_subnet_cidrs  = ["10.30.10.0/24", "10.30.11.0/24", "10.30.12.0/24"]
  database_subnet_cidrs = ["10.30.20.0/24", "10.30.21.0/24", "10.30.22.0/24"]
  nat_gateway_count     = 3

  route53_zone_id = var.route53_zone_id
  domain_name     = var.domain_name

  docdb_instance_count       = 3
  docdb_instance_class       = "db.r6g.xlarge"
  docdb_backup_retention_days = 35
  deletion_protection        = true

  backup_daily_retention_days  = 35
  backup_weekly_retention_days = 90
  enable_vault_lock            = true
  enable_cross_region_dr       = true
  dr_region                    = "us-west-2"
  # dr_vault_arn must point at a backup vault provisioned in dr_region.
  dr_vault_arn = var.dr_vault_arn

  log_retention_days = 400
  alarm_email        = var.alarm_email
}
