output "vpc_id" {
  value = module.stack.vpc_id
}

output "alb_dns_name" {
  value = module.stack.alb_dns_name
}

output "docdb_endpoint" {
  value     = module.stack.docdb_endpoint
  sensitive = true
}

output "certificate_arn" {
  value = module.stack.certificate_arn
}

output "secret_arns" {
  value = module.stack.secret_arns
}

output "alerts_topic_arn" {
  value = module.stack.alerts_topic_arn
}
