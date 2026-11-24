variable "name_prefix" {
  description = "Prefix applied to every resource name (e.g. health-watchers-dev)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones to spread subnets across"
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the public subnets (one per AZ)"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the private application subnets (one per AZ)"
  type        = list(string)
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for the isolated database subnets (one per AZ)"
  type        = list(string)
}

variable "nat_gateway_count" {
  description = "Number of NAT gateways. 1 = cost-optimised (single AZ egress), len(azs) = HA."
  type        = number
  default     = 1
}

variable "app_port" {
  description = "TCP port the API containers listen on"
  type        = number
  default     = 3001
}

variable "flow_log_destination_arn" {
  description = "CloudWatch Logs group ARN for VPC flow logs. Null disables flow logs."
  type        = string
  default     = null
}

variable "flow_log_role_arn" {
  description = "IAM role ARN that lets VPC Flow Logs write to CloudWatch"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags merged onto every resource"
  type        = map(string)
  default     = {}
}
