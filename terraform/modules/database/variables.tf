variable "name_prefix" {
  type        = string
  description = "Prefix applied to every resource name"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Isolated database subnet IDs for the cluster subnet group"
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security groups attached to the cluster"
}

variable "instance_count" {
  type        = number
  description = "Number of DocumentDB instances (1 primary + N-1 replicas)"
  default     = 1
}

variable "instance_class" {
  type        = string
  description = "DocumentDB instance class"
  default     = "db.t3.medium"
}

variable "engine_version" {
  type        = string
  description = "DocumentDB engine version"
  default     = "5.0.0"
}

variable "master_username" {
  type        = string
  description = "Master username for the cluster"
  default     = "hwadmin"
}

variable "master_password" {
  type        = string
  description = "Master password for the cluster (source it from Secrets Manager, never a tfvars file)"
  sensitive   = true
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN used for storage encryption"
}

variable "backup_retention_days" {
  type        = number
  description = "Automated backup retention window"
  default     = 7
}

variable "preferred_backup_window" {
  type        = string
  default     = "03:00-05:00"
}

variable "deletion_protection" {
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  type        = bool
  default     = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
