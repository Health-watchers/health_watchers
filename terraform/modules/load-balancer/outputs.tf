output "alb_arn" {
  value = aws_lb.this.arn
}

output "alb_dns_name" {
  description = "Public DNS name of the load balancer"
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB (for Route53 alias records)"
  value       = aws_lb.this.zone_id
}

output "target_group_arn" {
  value = aws_lb_target_group.app.arn
}

output "alb_arn_suffix" {
  description = "ARN suffix for CloudWatch AWS/ApplicationELB metrics"
  value       = aws_lb.this.arn_suffix
}

output "target_group_arn_suffix" {
  description = "ARN suffix for CloudWatch TargetGroup dimension"
  value       = aws_lb_target_group.app.arn_suffix
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}
