#!/usr/bin/env bash
#
# test-rotation-lambda.sh
#
# Local test harness for the secret rotation Lambda (k8s/secret-rotation-lambda.py).
#
# This script packages the Lambda source, creates (or reuses) a local Lambda
# function, and invokes it with sample events for each step of the rotation
# lifecycle: create / set / test / finish. It then asserts that the response
# indicates success.
#
# Two backends are supported:
#
#   1. LocalStack (default) - spins up / uses a LocalStack instance to emulate
#      AWS Lambda. Requires `localstack` (or Docker) and `aws` CLI available.
#
#   2. Real AWS - set BACKEND=aws to invoke against a real AWS account. This
#      requires valid AWS credentials and the IAM permissions to create/update
#      a Lambda function and invoke it. Use with caution.
#
# Usage:
#   scripts/secrets/test-rotation-lambda.sh [--backend localstack|aws] [--keep]
#
# Options:
#   --backend <name>   Backend to use: "localstack" (default) or "aws".
#   --keep             Do not delete the Lambda function after the test run.
#   -h, --help         Show this help message.
#
# Environment variables:
#   AWS_REGION         AWS region to use (default: us-east-1).
#   LAMBDA_NAME        Name of the Lambda function (default: secret-rotation-test).
#   LAMBDA_ROLE_ARN    IAM role ARN for the Lambda function. Required for the
#                      "aws" backend. For LocalStack a dummy ARN is used.
#   LOCALSTACK_URL     LocalStack endpoint URL (default: http://localhost:4566).
#   SECRET_ID          Secret id passed to the Lambda event (default: test/secret).
#
# Exit codes:
#   0  All rotation steps succeeded.
#   1  A step failed or a prerequisite was missing.
#
# Example:
#   scripts/secrets/test-rotation-lambda.sh
#   scripts/secrets/test-rotation-lambda.sh --backend aws --keep
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LAMBDA_SOURCE="${REPO_ROOT}/k8s/secret-rotation-lambda.py"

BACKEND="localstack"
KEEP="false"
AWS_REGION="${AWS_REGION:-us-east-1}"
LAMBDA_NAME="${LAMBDA_NAME:-secret-rotation-test}"
LAMBDA_ROLE_ARN="${LAMBDA_ROLE_ARN:-}"
LOCALSTACK_URL="${LOCALSTACK_URL:-http://localhost:4566}"
SECRET_ID="${SECRET_ID:-test/secret}"

BUILD_DIR="$(mktemp -d)"
ZIP_PATH="${BUILD_DIR}/secret-rotation-lambda.zip"

log()  { printf '[test-rotation-lambda] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

cleanup() {
  if [[ "${KEEP}" != "true" ]]; then
    log "Cleaning up Lambda function '${LAMBDA_NAME}'..."
    aws lambda delete-function \
      --function-name "${LAMBDA_NAME}" \
      ${AWS_ENDPOINT_ARGS:-} \
      --region "${AWS_REGION}" >/dev/null 2>&1 || true
  fi
  rm -rf "${BUILD_DIR}"
}
trap cleanup EXIT

usage() {
  sed -n '2,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend) BACKEND="${2:-}"; shift 2 ;;
    --keep)    KEEP="true"; shift ;;
    -h|--help) usage ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

case "${BACKEND}" in
  localstack)
    AWS_ENDPOINT_ARGS="--endpoint-url ${LOCALSTACK_URL}"
    LAMBDA_ROLE_ARN="${LAMBDA_ROLE_ARN:-arn:aws:iam::000000000000:role/lambda-role}"
    ;;
  aws)
    AWS_ENDPOINT_ARGS=""
    [[ -n "${LAMBDA_ROLE_ARN}" ]] || fail "LAMBDA_ROLE_ARN must be set for the 'aws' backend"
    ;;
  *)
    fail "Unknown backend '${BACKEND}'. Use 'localstack' or 'aws'."
    ;;
esac

command -v aws >/dev/null 2>&1 || fail "'aws' CLI is required but not installed"
command -v zip >/dev/null 2>&1 || fail "'zip' is required but not installed"
[[ -f "${LAMBDA_SOURCE}" ]] || fail "Lambda source not found: ${LAMBDA_SOURCE}"

# ---------------------------------------------------------------------------
# Package the Lambda source.
# ---------------------------------------------------------------------------
log "Packaging Lambda source from ${LAMBDA_SOURCE}..."
cp "${LAMBDA_SOURCE}" "${BUILD_DIR}/lambda_function.py"
( cd "${BUILD_DIR}" && zip -q secret-rotation-lambda.zip lambda_function.py )

# ---------------------------------------------------------------------------
# Create (or update) the Lambda function.
# ---------------------------------------------------------------------------
log "Creating Lambda function '${LAMBDA_NAME}' (backend: ${BACKEND})..."
if aws lambda get-function \
      --function-name "${LAMBDA_NAME}" \
      ${AWS_ENDPOINT_ARGS} \
      --region "${AWS_REGION}" >/dev/null 2>&1; then
  log "Function already exists, updating code..."
  aws lambda update-function-code \
    --function-name "${LAMBDA_NAME}" \
    --zip-file "fileb://${ZIP_PATH}" \
    ${AWS_ENDPOINT_ARGS} \
    --region "${AWS_REGION}" >/dev/null
else
  aws lambda create-function \
    --function-name "${LAMBDA_NAME}" \
    --runtime python3.11 \
    --handler lambda_function.lambda_handler \
    --role "${LAMBDA_ROLE_ARN}" \
    --zip-file "fileb://${ZIP_PATH}" \
    --timeout 30 \
    ${AWS_ENDPOINT_ARGS} \
    --region "${AWS_REGION}" >/dev/null
fi

# ---------------------------------------------------------------------------
# Invoke the Lambda for each rotation step and assert success.
# ---------------------------------------------------------------------------
invoke_step() {
  local step="$1"
  local payload
  payload=$(cat <<EOF
{
  "Step": "${step}",
  "SecretId": "${SECRET_ID}",
  "ClientRequestToken": "test-token-0001"
}
EOF
)
  local out_file="${BUILD_DIR}/response-${step}.json"
  log "Invoking step '${step}'..."

  aws lambda invoke \
    --function-name "${LAMBDA_NAME}" \
    --payload "${payload}" \
    --cli-binary-format raw-in-base64-out \
    ${AWS_ENDPOINT_ARGS} \
    --region "${AWS_REGION}" \
    "${out_file}" >/dev/null

  if ! grep -qi '"status"[[:space:]]*:[[:space:]]*"success"' "${out_file}"; then
    log "Response for step '${step}':"
    cat "${out_file}" >&2
    fail "Step '${step}' did not report success"
  fi
  log "Step '${step}' succeeded."
}

for step in create set test finish; do
  invoke_step "${step}"
done

log "All rotation steps passed."
exit 0