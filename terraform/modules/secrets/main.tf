# ─────────────────────────────────────────────────────────────────────────────
# Secrets management: a dedicated KMS key plus one AWS Secrets Manager secret
# per logical name. Secrets flagged `generate_password` are seeded with a random
# value so nothing sensitive is ever written to a .tf/.tfvars file; the rest are
# created empty for an operator (or CI) to populate out of band. Rotation is
# enabled per-secret when a rotation Lambda ARN is supplied.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  tags = merge(var.tags, { Module = "secrets" })
}

resource "aws_kms_key" "this" {
  description             = "Encrypts ${var.name_prefix} application secrets"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = local.tags
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name_prefix}-secrets"
  target_key_id = aws_kms_key.this.key_id
}

resource "aws_secretsmanager_secret" "this" {
  for_each                = var.secrets
  name                    = "${var.name_prefix}/${each.key}"
  description             = each.value.description
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = var.recovery_window_days
  tags                    = local.tags
}

resource "random_password" "this" {
  for_each = { for k, v in var.secrets : k => v if v.generate_password }
  length   = 32
  special  = false
}

resource "aws_secretsmanager_secret_version" "seed" {
  for_each      = { for k, v in var.secrets : k => v if v.generate_password }
  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = random_password.this[each.key].result
}

resource "aws_secretsmanager_secret_rotation" "this" {
  for_each            = { for k, v in var.secrets : k => v if v.rotation_lambda_arn != null }
  secret_id           = aws_secretsmanager_secret.this[each.key].id
  rotation_lambda_arn = each.value.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = each.value.rotation_days
  }
}
