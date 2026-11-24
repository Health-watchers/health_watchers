output "kms_key_arn" {
  description = "KMS key that encrypts the secrets (reused by DB storage encryption)"
  value       = aws_kms_key.this.arn
}

output "secret_arns" {
  description = "Map of logical name => Secrets Manager ARN"
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "secret_names" {
  value = { for k, s in aws_secretsmanager_secret.this : k => s.name }
}

output "generated_password_values" {
  description = "Plaintext of secrets created with generate_password = true (consumed by other modules; never printed)"
  value       = { for k, p in random_password.this : k => p.result }
  sensitive   = true
}
