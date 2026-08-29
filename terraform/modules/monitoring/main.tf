# ─────────────────────────────────────────────────────────────────────────────
# Monitoring stack: an SNS alerting topic, CloudWatch alarms for the load
# balancer (5xx rate, p99 latency, unhealthy hosts) and DocumentDB (CPU, free
# memory), plus a CloudWatch dashboard. The in-cluster Prometheus/Grafana stack
# already lives in docker-compose.monitoring.yml / helm; this module wires the
# managed AWS side so alarms exist even before that stack is up.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  tags = merge(var.tags, { Module = "monitoring" })
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == null ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# ── ALB alarms ──────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  count               = var.alb_arn_suffix == null ? 0 : 1
  alarm_name          = "${var.name_prefix}-alb-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.error_rate_5xx_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_latency" {
  count               = var.target_group_arn_suffix == null || var.alb_arn_suffix == null ? 0 : 1
  alarm_name          = "${var.name_prefix}-alb-p99-latency"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p99"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.latency_p99_threshold_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  count               = var.target_group_arn_suffix == null || var.alb_arn_suffix == null ? 0 : 1
  alarm_name          = "${var.name_prefix}-alb-unhealthy-hosts"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }
  tags = local.tags
}

# ── DocumentDB alarms ───────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "docdb_cpu" {
  count               = var.docdb_cluster_identifier == null ? 0 : 1
  alarm_name          = "${var.name_prefix}-docdb-cpu"
  namespace           = "AWS/DocDB"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions          = { DBClusterIdentifier = var.docdb_cluster_identifier }
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "docdb_memory" {
  count               = var.docdb_cluster_identifier == null ? 0 : 1
  alarm_name          = "${var.name_prefix}-docdb-freeable-memory"
  namespace           = "AWS/DocDB"
  metric_name         = "FreeableMemory"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 536870912 # 512 MiB
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions          = { DBClusterIdentifier = var.docdb_cluster_identifier }
  tags                = local.tags
}

# ── Dashboard ───────────────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = "${var.name_prefix}-overview"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "ALB requests & 5xx"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", coalesce(var.alb_arn_suffix, "unset")],
            ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", coalesce(var.alb_arn_suffix, "unset")],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "DocumentDB CPU / memory"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/DocDB", "CPUUtilization", "DBClusterIdentifier", coalesce(var.docdb_cluster_identifier, "unset")],
            ["AWS/DocDB", "FreeableMemory", "DBClusterIdentifier", coalesce(var.docdb_cluster_identifier, "unset")],
          ]
        }
      },
    ]
  })
}
