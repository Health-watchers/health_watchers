variable "project" {
  type    = string
  default = "health-watchers"
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "azs" {
  type = list(string)
}

# ── Networking ──────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
variable "public_subnet_cidrs" {
  type = list(string)
}
variable "private_subnet_cidrs" {
  type = list(string)
}
variable "database_subnet_cidrs" {
  type = list(string)
}
variable "nat_gateway_count" {
  type    = number
  default = 1
}
variable "app_port" {
  type    = number
  default = 3001
}

# ── DNS / TLS ───────────────────────────────────────────────────────────────
variable "route53_zone_id" {
  type = string
}
variable "domain_name" {
  type = string
}
variable "subject_alternative_names" {
  type    = list(string)
  default = []
}

# ── Database ────────────────────────────────────────────────────────────────
variable "docdb_instance_count" {
  type    = number
  default = 1
}
variable "docdb_instance_class" {
  type    = string
  default = "db.t3.medium"
}
variable "docdb_backup_retention_days" {
  type    = number
  default = 7
}
variable "deletion_protection" {
  type    = bool
  default = false
}

# ── Backup / DR ─────────────────────────────────────────────────────────────
variable "backup_daily_retention_days" {
  type    = number
  default = 7
}
variable "backup_weekly_retention_days" {
  type    = number
  default = 35
}
variable "enable_vault_lock" {
  type    = bool
  default = false
}
variable "enable_cross_region_dr" {
  type    = bool
  default = false
}
variable "dr_region" {
  type    = string
  default = "us-west-2"
}
variable "dr_vault_arn" {
  type    = string
  default = null
}

# ── Logging / Monitoring ────────────────────────────────────────────────────
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "alarm_email" {
  type    = string
  default = null
}
