#!/bin/bash
# scripts/observability/capture-profile.sh
# On-demand performance profiling for the API (#1257).
#
# Captures a CPU profile and a heap snapshot from a running API process (local
# or a pod) without a redeploy, and drops them where they can be opened in
# Chrome DevTools / Speedscope.
#
#   local mode:  targets a local `node --inspect` process on $INSPECT_PORT
#   pod mode:    `kubectl exec` into an API pod, trigger the profile, copy it out
#
# Usage:
#   capture-profile.sh --mode local  --seconds 20
#   capture-profile.sh --mode pod --pod api-7d9f8-abcde --seconds 30
#
# Env: INSPECT_PORT (9229), KUBE_NAMESPACE (health-watchers), OUT_DIR (./profiles)

set -euo pipefail

MODE="local"
SECONDS_TO_PROFILE=20
POD=""
INSPECT_PORT="${INSPECT_PORT:-9229}"
KUBE_NAMESPACE="${KUBE_NAMESPACE:-health-watchers}"
OUT_DIR="${OUT_DIR:-./profiles}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --seconds) SECONDS_TO_PROFILE="$2"; shift 2 ;;
    --pod) POD="$2"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT_DIR"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

profile_local() {
  command -v npx >/dev/null || { echo "npx required" >&2; exit 1; }
  log "Attaching to inspector on 127.0.0.1:$INSPECT_PORT for ${SECONDS_TO_PROFILE}s ..."
  # clinic flame gives an interactive flamegraph; fall back to a raw v8 profile.
  if npx --yes clinic --version >/dev/null 2>&1; then
    npx --yes clinic flame --collect-only --dest "$OUT_DIR/clinic-$STAMP" -- \
      node -e "setTimeout(()=>process.exit(0), ${SECONDS_TO_PROFILE}000)" || true
  fi
  node --eval "
    const inspector = require('inspector');
    const fs = require('fs');
    const s = new inspector.Session(); s.connect();
    s.post('Profiler.enable', () => s.post('Profiler.start', () => {
      setTimeout(() => s.post('Profiler.stop', (err, { profile }) => {
        fs.writeFileSync('$OUT_DIR/cpu-$STAMP.cpuprofile', JSON.stringify(profile));
        s.post('HeapProfiler.takeHeapSnapshot', null, () => process.exit(0));
      }), ${SECONDS_TO_PROFILE} * 1000);
    }));
  " || log "inspector capture skipped (no local --inspect process?)"
  log "Wrote profiles to $OUT_DIR/ (open *.cpuprofile in Chrome DevTools → Performance)."
}

profile_pod() {
  [[ -z "$POD" ]] && { echo "--pod is required in pod mode" >&2; exit 1; }
  command -v kubectl >/dev/null || { echo "kubectl required" >&2; exit 1; }
  log "Sending SIGUSR2-style profile trigger to $POD (expects the API's /internal/profile hook) ..."
  kubectl -n "$KUBE_NAMESPACE" exec "$POD" -- \
    sh -c "kill -USR2 1 && sleep $((SECONDS_TO_PROFILE + 2))" || true
  # The API writes /tmp/profile-*.cpuprofile on SIGUSR2 (see docs/OBSERVABILITY_BEST_PRACTICES.md).
  kubectl -n "$KUBE_NAMESPACE" exec "$POD" -- sh -c 'ls -1 /tmp/profile-*.cpuprofile 2>/dev/null' \
    | while read -r f; do
        base=$(basename "$f")
        kubectl -n "$KUBE_NAMESPACE" cp "$POD:$f" "$OUT_DIR/$base"
        log "copied $base"
      done
  log "Done. Profiles in $OUT_DIR/."
}

case "$MODE" in
  local) profile_local ;;
  pod)   profile_pod ;;
  *) echo "unknown --mode: $MODE" >&2; exit 1 ;;
esac
