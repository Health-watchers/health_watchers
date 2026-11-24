variable "project" {
  description = "Project slug, used to name the state bucket and lock table"
  type        = string
  default     = "health-watchers"
}

variable "region" {
  description = "AWS region that will host the state backend"
  type        = string
  default     = "us-east-1"
}
