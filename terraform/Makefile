# Convenience wrapper for the environment root modules.
#
#   make init   ENV=dev
#   make plan   ENV=staging
#   make apply  ENV=production
#   make fmt
#   make validate ENV=dev

ENV ?= dev
ENV_DIR := environments/$(ENV)
TF := terraform -chdir=$(ENV_DIR)

.PHONY: _check init plan apply destroy fmt validate output

_check:
	@test -d "$(ENV_DIR)" || { echo "Unknown ENV '$(ENV)' (expected environments/<env>)"; exit 1; }

init: _check
	$(TF) init

plan: _check
	$(TF) plan -out=tfplan

apply: _check
	$(TF) apply tfplan

destroy: _check
	$(TF) destroy

output: _check
	$(TF) output

validate: _check
	$(TF) validate

fmt:
	terraform fmt -recursive
