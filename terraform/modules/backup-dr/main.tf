# ─────────────────────────────────────────────────────────────────────────────
# Backup & disaster recovery: an encrypted AWS Backup vault, a backup plan with
# a daily and a weekly rule, a resource selection (explicit ARNs + tag based),
# and an optional continuous copy of every recovery point into a second region.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  tags = merge(var.tags, { Module = "backup-dr" })
}

resource "aws_backup_vault" "this" {
  name        = "${var.name_prefix}-vault"
  kms_key_arn = var.kms_key_arn
  tags        = local.tags
}

resource "aws_backup_vault_lock_configuration" "this" {
  count               = var.enable_vault_lock ? 1 : 0
  backup_vault_name   = aws_backup_vault.this.name
  min_retention_days  = 1
  max_retention_days  = 365
  changeable_for_days = 3
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${var.name_prefix}-backup-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

resource "aws_backup_plan" "this" {
  name = "${var.name_prefix}-plan"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.this.name
    schedule          = var.daily_schedule
    start_window      = 60
    completion_window = 300

    lifecycle {
      delete_after = var.daily_retention_days
    }

    dynamic "copy_action" {
      for_each = var.enable_cross_region_copy ? [1] : []
      content {
        destination_vault_arn = var.dr_vault_arn
        lifecycle {
          delete_after = var.daily_retention_days
        }
      }
    }
  }

  rule {
    rule_name         = "weekly"
    target_vault_name = aws_backup_vault.this.name
    schedule          = var.weekly_schedule
    start_window      = 60
    completion_window = 360

    lifecycle {
      delete_after = var.weekly_retention_days
    }

    dynamic "copy_action" {
      for_each = var.enable_cross_region_copy ? [1] : []
      content {
        destination_vault_arn = var.dr_vault_arn
        lifecycle {
          delete_after = var.weekly_retention_days
        }
      }
    }
  }

  tags = local.tags
}

resource "aws_backup_selection" "this" {
  name         = "${var.name_prefix}-selection"
  plan_id      = aws_backup_plan.this.id
  iam_role_arn = aws_iam_role.backup.arn

  resources = var.backup_resource_arns

  dynamic "selection_tag" {
    for_each = var.selection_tag
    content {
      type  = "STRINGEQUALS"
      key   = selection_tag.key
      value = selection_tag.value
    }
  }
}
