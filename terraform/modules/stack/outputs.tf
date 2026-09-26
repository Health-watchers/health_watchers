output "vpc_id" {
  value = module.networking.vpc_id
}

output "alb_dns_name" {
  value = module.load_balancer.alb_dns_name
}

output "alb_zone_id" {
  value = module.load_balancer.alb_zone_id
}

output "target_group_arn" {
  value = module.load_balancer.target_group_arn
}

output "app_security_group_id" {
  value = module.networking.app_security_group_id
}

output "private_subnet_ids" {
  value = module.networking.private_subnet_ids
}

output "docdb_endpoint" {
  value = module.database.cluster_endpoint
}

output "docdb_reader_endpoint" {
  value = module.database.reader_endpoint
}

output "certificate_arn" {
  value = module.tls.certificate_arn
}

output "secret_arns" {
  value = module.secrets.secret_arns
}

output "kms_key_arn" {
  value = module.secrets.kms_key_arn
}

output "backup_vault_arn" {
  value = module.backup_dr.vault_arn
}

output "alerts_topic_arn" {
  value = module.monitoring.sns_topic_arn
}

output "log_group_names" {
  value = module.logging.service_log_group_names
}
