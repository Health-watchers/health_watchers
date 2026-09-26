# ─────────────────────────────────────────────────────────────────────────────
# SSL/TLS certificate automation: requests an ACM certificate and completes
# DNS-01 validation automatically by writing the CNAME records into Route53.
# ACM renews the certificate automatically for as long as the records stay put.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  tags = merge(var.tags, { Module = "tls-certificate" })
}

resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_route53_record" "validation" {
  for_each = {
    for dvo in aws_acm_certificate.this.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = var.validation_record_ttl
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}
