# ─────────────────────────────────────────────────────────────────────────────
# Database: Amazon DocumentDB (MongoDB-compatible) cluster living entirely in
# the isolated database subnets. Storage is KMS-encrypted, automated backups
# and point-in-time restore are on, and the master password is pulled from
# Secrets Manager rather than being written in plain text.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  tags = merge(var.tags, { Module = "database" })
}

resource "aws_docdb_subnet_group" "this" {
  name       = "${var.name_prefix}-docdb"
  subnet_ids = var.subnet_ids
  tags       = local.tags
}

resource "aws_docdb_cluster_parameter_group" "this" {
  family      = "docdb5.0"
  name        = "${var.name_prefix}-docdb-params"
  description = "Health Watchers DocumentDB parameters — TLS required, audit logging on"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  parameter {
    name  = "audit_logs"
    value = "enabled"
  }

  tags = local.tags
}

resource "aws_docdb_cluster" "this" {
  cluster_identifier              = "${var.name_prefix}-docdb"
  engine                          = "docdb"
  engine_version                  = var.engine_version
  master_username                 = var.master_username
  master_password                 = var.master_password
  db_subnet_group_name            = aws_docdb_subnet_group.this.name
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.this.name
  vpc_security_group_ids          = var.security_group_ids

  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  backup_retention_period      = var.backup_retention_days
  preferred_backup_window      = var.preferred_backup_window
  preferred_maintenance_window = "sun:06:00-sun:08:00"

  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-docdb-final"

  enabled_cloudwatch_logs_exports = ["audit", "profiler"]

  tags = local.tags
}

resource "aws_docdb_cluster_instance" "this" {
  count              = var.instance_count
  identifier         = "${var.name_prefix}-docdb-${count.index}"
  cluster_identifier = aws_docdb_cluster.this.id
  instance_class     = var.instance_class
  tags               = local.tags
}
