variable "name_prefix" {
  type = string
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key used to encrypt the backup vault"
}

variable "backup_resource_arns" {
  type        = list(string)
  description = "ARNs of resources to include in the backup selection (DocumentDB cluster, EFS, etc.)"
  default     = []
}

variable "selection_tag" {
  type        = map(string)
  description = "Also select any resource carrying this tag key/value"
  default     = { "Backup" = "true" }
}

variable "daily_retention_days" {
  type    = number
  default = 7
}

variable "weekly_retention_days" {
  type    = number
  default = 35
}

variable "daily_schedule" {
  type        = string
  description = "cron() expression for the daily backup rule"
  default     = "cron(0 5 * * ? *)"
}

variable "weekly_schedule" {
  type    = string
  default = "cron(0 6 ? * SUN *)"
}

variable "enable_vault_lock" {
  type        = bool
  description = "Apply Vault Lock (immutable retention). Leave off for non-prod."
  default     = false
}

variable "enable_cross_region_copy" {
  type    = bool
  default = false
}

variable "dr_region" {
  type        = string
  description = "Destination region for disaster-recovery copies"
  default     = "us-west-2"
}

variable "dr_vault_arn" {
  type        = string
  description = "ARN of the backup vault in the DR region (required when enable_cross_region_copy = true)"
  default     = null
}

variable "tags" {
  type    = map(string)
  default = {}
}
