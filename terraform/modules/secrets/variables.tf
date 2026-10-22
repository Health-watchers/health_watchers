variable "name_prefix" {
  type = string
}

variable "secrets" {
  description = <<-EOT
    Map of logical secret name => settings.
      description         : human description
      generate_password   : if true, seed the secret with a random 32-char value
      rotation_lambda_arn  : optional Lambda ARN to enable automatic rotation
      rotation_days        : rotation cadence when a lambda is set
  EOT
  type = map(object({
    description        = optional(string, "")
    generate_password  = optional(bool, false)
    rotation_lambda_arn = optional(string)
    rotation_days      = optional(number, 30)
  }))
  default = {}
}

variable "recovery_window_days" {
  type    = number
  default = 7
}

variable "tags" {
  type    = map(string)
  default = {}
}
