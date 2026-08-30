variable "domain_name" {
  type        = string
  description = "Primary fully-qualified domain name for the certificate"
}

variable "subject_alternative_names" {
  type        = list(string)
  description = "Additional SANs (e.g. api.example.com, *.example.com)"
  default     = []
}

variable "route53_zone_id" {
  type        = string
  description = "Route53 hosted zone ID used for DNS validation records"
}

variable "validation_record_ttl" {
  type    = number
  default = 60
}

variable "tags" {
  type    = map(string)
  default = {}
}
