#!/usr/bin/env bash
# Build the plugin image on-cluster (no local podman/docker required).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! oc whoami &>/dev/null; then
  echo "ERROR: Not logged in. Set KUBECONFIG and run oc login first."
  exit 1
fi

NS=tenant-form-acm-gui
BC=tenant-form-acm-gui
IMAGE="image-registry.openshift-image-registry.svc:5000/${NS}/${BC}:latest"

echo "==> Cluster-side build + deploy"
echo "    Cluster: $(oc whoami --show-server)"
echo "    User:    $(oc whoami)"
echo ""

echo "==> [1/5] Namespace + image stream..."
oc apply -f "${SCRIPT_DIR}/00-namespace.yaml"
oc create imagestream "${BC}" -n "${NS}" --dry-run=client -o yaml | oc apply -f -

echo "==> [2/5] BuildConfig (docker strategy)..."
if ! oc get buildconfig "${BC}" -n "${NS}" &>/dev/null; then
  oc new-build --name="${BC}" \
    --binary \
    --strategy=docker \
    --to="${IMAGE}" \
    -n "${NS}"
else
  echo "    BuildConfig ${BC} already exists"
fi

echo "==> [3/5] Starting binary build from source..."
oc start-build "${BC}" --from-dir="${REPO_ROOT}" --follow -n "${NS}"

echo "==> [4/5] Resolving built image..."
BUILT_IMAGE="$(oc get istag "${BC}:latest" -n "${NS}" -o jsonpath='{.image.dockerImageReference}' 2>/dev/null || true)"
if [ -z "${BUILT_IMAGE}" ]; then
  BUILT_IMAGE="${IMAGE}"
fi
echo "    Image: ${BUILT_IMAGE}"

echo "==> [5/5] Deploying plugin..."
IMAGE="${BUILT_IMAGE}" "${SCRIPT_DIR}/deploy.sh"
