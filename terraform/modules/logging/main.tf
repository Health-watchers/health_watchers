# ─────────────────────────────────────────────────────────────────────────────
# Logging infrastructure: one encrypted CloudWatch log group per service, a
# shared VPC flow-log group, an IAM role that lets VPC Flow Logs write to it,
# and (optionally) a long-term S3 archive fed by Kinesis Firehose with a
# lifecycle policy that ages logs into Glacier and finally expires them.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  tags = merge(var.tags, { Module = "logging" })
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = toset(var.log_groups)
  name              = "/${var.name_prefix}/${each.value}"
  retention_in_days = var.retention_in_days
  kms_key_id        = var.kms_key_arn
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/${var.name_prefix}/vpc-flow-logs"
  retention_in_days = var.retention_in_days
  kms_key_id        = var.kms_key_arn
  tags              = local.tags
}

data "aws_iam_policy_document" "flow_logs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "flow_logs" {
  name               = "${var.name_prefix}-flow-logs"
  assume_role_policy = data.aws_iam_policy_document.flow_logs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "flow_logs" {
  name = "write-flow-logs"
  role = aws_iam_role.flow_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
      ]
      Resource = "${aws_cloudwatch_log_group.flow_logs.arn}:*"
    }]
  })
}

# ── Long-term archive ───────────────────────────────────────────────────────

resource "aws_s3_bucket" "archive" {
  count  = var.enable_archive_bucket ? 1 : 0
  bucket = "${var.name_prefix}-log-archive"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "archive" {
  count                   = var.enable_archive_bucket ? 1 : 0
  bucket                  = aws_s3_bucket.archive[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archive" {
  count  = var.enable_archive_bucket ? 1 : 0
  bucket = aws_s3_bucket.archive[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "archive" {
  count  = var.enable_archive_bucket ? 1 : 0
  bucket = aws_s3_bucket.archive[0].id
  rule {
    id     = "age-out"
    status = "Enabled"
    transition {
      days          = var.archive_transition_days
      storage_class = "GLACIER"
    }
    expiration {
      days = var.archive_expiration_days
    }
  }
}

data "aws_iam_policy_document" "firehose_assume" {
  count = var.enable_archive_bucket ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "firehose" {
  count              = var.enable_archive_bucket ? 1 : 0
  name               = "${var.name_prefix}-log-firehose"
  assume_role_policy = data.aws_iam_policy_document.firehose_assume[0].json
  tags               = local.tags
}

resource "aws_iam_role_policy" "firehose" {
  count = var.enable_archive_bucket ? 1 : 0
  name  = "write-archive"
  role  = aws_iam_role.firehose[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:AbortMultipartUpload", "s3:GetBucketLocation", "s3:GetObject", "s3:ListBucket", "s3:ListBucketMultipartUploads", "s3:PutObject"]
        Resource = [aws_s3_bucket.archive[0].arn, "${aws_s3_bucket.archive[0].arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [var.kms_key_arn]
      },
    ]
  })
}

resource "aws_kinesis_firehose_delivery_stream" "archive" {
  count       = var.enable_archive_bucket ? 1 : 0
  name        = "${var.name_prefix}-log-archive"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn           = aws_iam_role.firehose[0].arn
    bucket_arn         = aws_s3_bucket.archive[0].arn
    prefix             = "logs/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/"
    error_output_prefix = "errors/"
    compression_format = "GZIP"
    buffering_size     = 5
    buffering_interval = 300
  }

  tags = local.tags
}
