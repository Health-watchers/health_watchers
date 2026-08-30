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
