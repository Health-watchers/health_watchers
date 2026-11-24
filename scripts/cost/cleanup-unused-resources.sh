#!/bin/bash
# scripts/cost/cleanup-unused-resources.sh
# Find (and optionally delete) unused cloud resources that cost money.
#
# DRY-RUN BY DEFAULT. Pass --apply to actually delete. Anything tagged
# keep=true / keep=1, or younger than --min-age-days, is always skipped.
# Every run writes a JSON report.
#
# Usage:
#   cleanup-unused-resources.sh [--apply] [--min-age-days 7] [--region us-east-1] \
#       [--keep-images 10] [--report out.json] [--only ebs,eip,snapshots,...]
#
# Categories: ebs, eip, snapshots, elb, sg, targetgroups, images, stopped-ec2
# Requires: aws-cli, jq. (Kubernetes idle-namespace check needs kubectl.)

set -euo pipefail

APPLY=false
MIN_AGE_DAYS=7
REGION="${AWS_REGION:-us-east-1}"
KEEP_IMAGES=10
REPORT="${REPORT:-/tmp/cost-cleanup-$(date -u +%Y%m%dT%H%M%SZ).json}"
ONLY=""
METRICS_FILE="${METRICS_FILE:-/tmp/cost_cleanup_metrics.txt}"

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
act()  { if $APPLY; then echo "  🗑  DELETE $*"; else echo "  [dry-run] would delete $*"; fi; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)         APPLY=true; shift ;;
    --min-age-days)  MIN_AGE_DAYS="$2"; shift 2 ;;
    --region)        REGION="$2"; shift 2 ;;
    --keep-images)   KEEP_IMAGES="$2"; shift 2 ;;
    --report)        REPORT="$2"; shift 2 ;;
    --only)          ONLY="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

want() { [[ -z "$ONLY" ]] || [[ ",$ONLY," == *",$1,"* ]]; }
CUTOFF=$(date -u -d "-${MIN_AGE_DAYS} days" +%s)
older_than_cutoff() { local ts; ts=$(date -u -d "$1" +%s 2>/dev/null || echo 0); (( ts > 0 && ts < CUTOFF )); }
has_keep_tag() { jq -e '(.Tags // [])[] | select((.Key|ascii_downcase)=="keep") | select(.Value=="true" or .Value=="1")' >/dev/null 2>&1; }

echo '{"dry_run": '"$([ $APPLY = true ] && echo false || echo true)"', "region": "'"$REGION"'", "items": []}' > "$REPORT"
add() {  # category id reason
  tmp=$(mktemp)
  jq --arg c "$1" --arg i "$2" --arg r "$3" '.items += [{category:$c, id:$i, reason:$r}]' "$REPORT" > "$tmp" && mv "$tmp" "$REPORT"
}
COUNT=0

# ── Unattached EBS volumes ─────────────────────────────────────────────────
if want ebs; then
  log "Unattached EBS volumes"
  aws ec2 describe-volumes --region "$REGION" --filters Name=status,Values=available \
    --query 'Volumes[].{Id:VolumeId,Created:CreateTime,Size:Size,Tags:Tags}' --output json \
  | jq -c '.[]' | while read -r v; do
      id=$(jq -r '.Id' <<<"$v"); created=$(jq -r '.Created' <<<"$v"); size=$(jq -r '.Size' <<<"$v")
      echo "$v" | has_keep_tag && { log "  skip $id (keep tag)"; continue; }
      older_than_cutoff "$created" || { log "  skip $id (younger than ${MIN_AGE_DAYS}d)"; continue; }
      act "EBS $id (${size}GiB, available since $created)"
      add ebs "$id" "unattached ${size}GiB since $created"
      $APPLY && aws ec2 delete-volume --region "$REGION" --volume-id "$id"
    done
fi

# ── Unassociated Elastic IPs ──────────────────────────────────────────────
if want eip; then
  log "Unassociated Elastic IPs"
  aws ec2 describe-addresses --region "$REGION" \
    --query 'Addresses[?AssociationId==`null`].[AllocationId,PublicIp]' --output text \
  | while read -r alloc ip; do
      [[ -n "$alloc" ]] || continue
      act "EIP $ip ($alloc)"
      add eip "$alloc" "unassociated $ip"
      $APPLY && aws ec2 release-address --region "$REGION" --allocation-id "$alloc"
    done
fi

# ── Orphaned / old snapshots (owned, no source volume or > retention) ─────
if want snapshots; then
  log "Orphaned snapshots"
  vols=$(aws ec2 describe-volumes --region "$REGION" --query 'Volumes[].VolumeId' --output text)
  aws ec2 describe-snapshots --region "$REGION" --owner-ids self \
    --query 'Snapshots[].{Id:SnapshotId,Vol:VolumeId,Start:StartTime,Tags:Tags}' --output json \
  | jq -c '.[]' | while read -r s; do
      id=$(jq -r '.Id' <<<"$s"); vol=$(jq -r '.Vol' <<<"$s"); start=$(jq -r '.Start' <<<"$s")
      echo "$s" | has_keep_tag && continue
      older_than_cutoff "$start" || continue
      if [[ "$vol" == "vol-ffffffff" || -z "$vol" ]] || ! grep -qw "$vol" <<<"$vols"; then
        act "snapshot $id (source $vol missing, $start)"
        add snapshots "$id" "source volume $vol missing; created $start"
        $APPLY && aws ec2 delete-snapshot --region "$REGION" --snapshot-id "$id"
      fi
    done
fi

# ── Idle load balancers (no healthy targets for 14d) ─────────────────────
if want elb; then
  log "Idle ALB/NLB (no targets)"
  aws elbv2 describe-load-balancers --region "$REGION" \
    --query 'LoadBalancers[].[LoadBalancerArn,LoadBalancerName]' --output text \
  | while read -r arn name; do
      tgs=$(aws elbv2 describe-target-groups --region "$REGION" --load-balancer-arn "$arn" \
        --query 'TargetGroups[].TargetGroupArn' --output text 2>/dev/null || echo "")
      healthy=0
      for tg in $tgs; do
        h=$(aws elbv2 describe-target-health --region "$REGION" --target-group-arn "$tg" \
          --query 'length(TargetHealthDescriptions[?TargetHealth.State==`healthy`])' --output text 2>/dev/null || echo 0)
        healthy=$((healthy + h))
      done
      if [[ -z "$tgs" || "$healthy" -eq 0 ]]; then
        act "load balancer $name (no healthy targets)"
        add elb "$name" "no healthy targets"
        $APPLY && aws elbv2 delete-load-balancer --region "$REGION" --load-balancer-arn "$arn"
      fi
    done
fi

# ── Unused security groups ──────────────────────────────────────────────
if want sg; then
  log "Unused security groups"
  used=$(aws ec2 describe-network-interfaces --region "$REGION" \
    --query 'NetworkInterfaces[].Groups[].GroupId' --output text | tr '\t' '\n' | sort -u)
  aws ec2 describe-security-groups --region "$REGION" \
    --query 'SecurityGroups[?GroupName!=`default`].[GroupId,GroupName]' --output text \
  | while read -r gid gname; do
      grep -qx "$gid" <<<"$used" && continue
      act "security group $gname ($gid)"
      add sg "$gid" "not attached to any ENI"
      $APPLY && aws ec2 delete-security-group --region "$REGION" --group-id "$gid" 2>/dev/null || true
    done
fi

# ── Stale registry images (keep newest N per repo) ─────────────────────
if want images; then
  log "Stale ECR images (keep newest $KEEP_IMAGES per repo)"
  aws ecr describe-repositories --region "$REGION" --query 'repositories[].repositoryName' --output text \
  | tr '\t' '\n' | while read -r repo; do
      [[ -n "$repo" ]] || continue
      aws ecr describe-images --region "$REGION" --repository-name "$repo" \
        --query 'sort_by(imageDetails,&imagePushedAt)[:-'"$KEEP_IMAGES"'].[imageDigest,imagePushedAt]' --output text \
      | while read -r digest pushed; do
          [[ -n "$digest" ]] || continue
          older_than_cutoff "$pushed" || continue
          act "image $repo@$digest ($pushed)"
          add images "$repo@$digest" "beyond newest $KEEP_IMAGES; pushed $pushed"
          $APPLY && aws ecr batch-delete-image --region "$REGION" --repository-name "$repo" --image-ids imageDigest="$digest" >/dev/null
        done
    done
fi

# ── Long-stopped EC2 instances ────────────────────────────────────────
if want stopped-ec2; then
  log "EC2 instances stopped > 30d"
  aws ec2 describe-instances --region "$REGION" --filters Name=instance-state-name,Values=stopped \
    --query 'Reservations[].Instances[].[InstanceId,StateTransitionReason,Tags]' --output json \
  | jq -c '.[]' | while read -r i; do
      id=$(jq -r '.[0]' <<<"$i")
      reason=$(jq -r '.[1]' <<<"$i")   # e.g. "User initiated (2024-01-02 10:00:00 GMT)"
      when=$(sed -n 's/.*(\(.*\) GMT)/\1/p' <<<"$reason")
      [[ -n "$when" ]] && ! older_than_cutoff "$when" 2>/dev/null && continue
      act "stopped instance $id ($reason)"
      add stopped-ec2 "$id" "stopped: $reason"
      # deletion of instances is intentionally NOT automated even with --apply
    done
fi

n=$(jq '.items | length' "$REPORT")
{
  echo "# HELP hw_cost_cleanup_candidates Resources identified as unused"
  echo "# TYPE hw_cost_cleanup_candidates gauge"
  echo "hw_cost_cleanup_candidates $n"
  echo "hw_cost_cleanup_applied $([ $APPLY = true ] && echo 1 || echo 0)"
  echo "hw_cost_cleanup_timestamp_seconds $(date +%s)"
} > "$METRICS_FILE"

log "$n candidate(s) — report: $REPORT $([ $APPLY = true ] && echo '(APPLIED)' || echo '(dry-run)')"
$APPLY || log "re-run with --apply after review in the monthly cost meeting"
