# Remote state — created by terraform/bootstrap. Replace the bucket / kms_key_id
# placeholders with the bootstrap outputs for this AWS account, or pass them via
# `terraform init -backend-config=...`.
terraform {
  backend "s3" {
    bucket         = "health-watchers-tfstate-REPLACE_WITH_ACCOUNT_ID"
    key            = "env/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "health-watchers-tflock"
    encrypt        = true
    kms_key_id     = "alias/health-watchers-tfstate"
  }
}
