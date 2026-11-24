output "sns_topic_arn" {
  description = "ARN of the alerting SNS topic — subscribe PagerDuty / Slack / email here"
  value       = aws_sns_topic.alerts.arn
}

output "dashboard_name" {
  value = aws_cloudwatch_dashboard.this.dashboard_name
}
