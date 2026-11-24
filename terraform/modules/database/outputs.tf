output "cluster_endpoint" {
  description = "Primary (writer) endpoint"
  value       = aws_docdb_cluster.this.endpoint
}

output "reader_endpoint" {
  description = "Load-balanced reader endpoint"
  value       = aws_docdb_cluster.this.reader_endpoint
}

output "port" {
  value = aws_docdb_cluster.this.port
}

output "cluster_identifier" {
  value = aws_docdb_cluster.this.cluster_identifier
}

output "cluster_arn" {
  value = aws_docdb_cluster.this.arn
}
