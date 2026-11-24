variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets the ALB is attached to"
}

variable "security_group_ids" {
  type = list(string)
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the HTTPS listener"
}

variable "app_port" {
  type    = number
  default = 3001
}

variable "health_check_path" {
  type    = string
  default = "/api/v1/health"
}

variable "idle_timeout" {
  type    = number
  default = 60
}

variable "enable_deletion_protection" {
  type    = bool
  default = false
}

variable "access_logs_bucket" {
  type        = string
  description = "S3 bucket for ALB access logs. Null disables access logging."
  default     = null
}

variable "ssl_policy" {
  type        = string
  description = "ELB security policy for the HTTPS listener"
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "tags" {
  type    = map(string)
  default = {}
}
