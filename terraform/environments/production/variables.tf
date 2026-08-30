variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "route53_zone_id" {
  type        = string
  description = "Hosted zone ID for DNS validation and records"
}

variable "domain_name" {
  type        = string
  description = "FQDN served by this environment"
}

variable "alarm_email" {
  type    = string
  default = null
}

variable "dr_vault_arn" {
  type        = string
  description = "ARN of the AWS Backup vault in the DR region for cross-region copies"
  default     = null
}
