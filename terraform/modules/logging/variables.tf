variable "name_prefix" {
  type = string
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key used to encrypt log groups and the archive bucket"
}

variable "log_groups" {
  type        = list(string)
  description = "Application log group short names (e.g. api, web, stellar-service)"
  default     = ["api", "web", "stellar-service"]
}

variable "retention_in_days" {
  type    = number
  default = 30
}

variable "enable_archive_bucket" {
  type        = bool
  description = "Create an S3 bucket and Firehose stream that archives all logs"
  default     = true
}

variable "archive_transition_days" {
  type        = number
  description = "Days before archived logs move to GLACIER"
  default     = 30
}

variable "archive_expiration_days" {
  type    = number
  default = 400
}

variable "tags" {
  type    = map(string)
  default = {}
}
