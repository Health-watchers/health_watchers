output "vault_arn" {
  value = aws_backup_vault.this.arn
}

output "vault_name" {
  value = aws_backup_vault.this.name
}

output "plan_id" {
  value = aws_backup_plan.this.id
}

output "backup_role_arn" {
  value = aws_iam_role.backup.arn
}
