# Remote state — created by terraform/bootstrap.
terraform {
  backend "s3" {
    bucket         = "health-watchers-tfstate-REPLACE_WITH_ACCOUNT_ID"
    key            = "env/production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "health-watchers-tflock"
    encrypt        = true
    kms_key_id     = "alias/health-watchers-tfstate"
  }
}
