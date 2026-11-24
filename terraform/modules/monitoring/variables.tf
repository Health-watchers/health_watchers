variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "alarm_email" {
  type        = string
  description = "Email subscribed to the alerting SNS topic"
  default     = null
}

variable "alb_arn_suffix" {
  type        = string
  description = "ARN suffix of the ALB (from the load-balancer module) for CloudWatch metrics"
  default     = null
}

variable "target_group_arn_suffix" {
  type    = string
  default = null
}

variable "docdb_cluster_identifier" {
  type    = string
  default = null
}

variable "latency_p99_threshold_seconds" {
  type    = number
  default = 1.5
}

variable "error_rate_5xx_threshold" {
  type        = number
  description = "Number of 5xx responses in a 5-minute window that triggers an alarm"
  default     = 25
}

variable "tags" {
  type    = map(string)
  default = {}
}
