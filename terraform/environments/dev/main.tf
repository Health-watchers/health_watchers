module "stack" {
  source = "../../modules/stack"

  project     = "health-watchers"
  environment = "dev"
  aws_region  = var.aws_region

  azs                   = ["${var.aws_region}a", "${var.aws_region}b"]
  vpc_cidr              = "10.10.0.0/16"
  public_subnet_cidrs   = ["10.10.0.0/24", "10.10.1.0/24"]
  private_subnet_cidrs  = ["10.10.10.0/24", "10.10.11.0/24"]
  database_subnet_cidrs = ["10.10.20.0/24", "10.10.21.0/24"]
  nat_gateway_count     = 1

  route53_zone_id = var.route53_zone_id
  domain_name     = var.domain_name

  docdb_instance_count       = 1
  docdb_instance_class       = "db.t3.medium"
  docdb_backup_retention_days = 7
  deletion_protection        = false

  backup_daily_retention_days  = 7
  backup_weekly_retention_days = 14
  enable_cross_region_dr       = false

  log_retention_days = 14
  alarm_email        = var.alarm_email
}
