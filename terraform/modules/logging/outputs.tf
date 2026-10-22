output "service_log_group_names" {
  value = { for k, g in aws_cloudwatch_log_group.service : k => g.name }
}

output "service_log_group_arns" {
  value = { for k, g in aws_cloudwatch_log_group.service : k => g.arn }
}

output "flow_log_group_arn" {
  value = aws_cloudwatch_log_group.flow_logs.arn
}

output "flow_log_role_arn" {
  value = aws_iam_role.flow_logs.arn
}

output "archive_bucket_name" {
  value = var.enable_archive_bucket ? aws_s3_bucket.archive[0].id : null
}

output "archive_firehose_arn" {
  value = var.enable_archive_bucket ? aws_kinesis_firehose_delivery_stream.archive[0].arn : null
}
