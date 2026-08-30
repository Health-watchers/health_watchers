output "state_bucket_name" {
  description = "Name of the S3 bucket holding Terraform state"
  value       = aws_s3_bucket.state.id
}

output "lock_table_name" {
  description = "Name of the DynamoDB table used for state locking"
  value       = aws_dynamodb_table.lock.name
}

output "kms_key_arn" {
  description = "ARN of the KMS key that encrypts the state bucket"
  value       = aws_kms_key.state.arn
}

output "backend_config_hint" {
  description = "Paste-ready backend block for an environment's backend.tf"
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.state.id}"
        key            = "env/<ENV>/terraform.tfstate"
        region         = "${var.region}"
        dynamodb_table = "${aws_dynamodb_table.lock.name}"
        encrypt        = true
        kms_key_id     = "${aws_kms_key.state.arn}"
      }
    }
  EOT
}
