#!/usr/bin/env bash
# Build the plugin image locally and deploy using the cluster integrated registry
# (no external Quay.io account required).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v podman &>/dev/null; then
  echo "ERROR: podman is not installed."
  exit 1
fi

if ! oc whoami &>/dev/null; then
  echo "ERROR: Not logged in. Set KUBECONFIG and run oc login first."
  exit 1
fi

NS=tenant-form-acm-gui
REGISTRY_HOST="$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}' 2>/dev/null || true)"
if [ -z "${REGISTRY_HOST}" ]; then
  echo "ERROR: openshift-image-registry route not found. Ensure the registry is exposed."
  exit 1
fi

IMAGE="${REGISTRY_HOST}/${NS}/tenant-form-acm-gui:latest"

echo "==> Local build + deploy (cluster registry)"
echo "    Cluster:  $(oc whoami --show-server)"
echo "    User:     $(oc whoami)"
echo "    Registry: ${REGISTRY_HOST}"
echo "    Image:    ${IMAGE}"
echo ""

echo "==> [1/4] Ensuring namespace and image stream..."
oc apply -f "${SCRIPT_DIR}/00-namespace.yaml"
oc create imagestream tenant-form-acm-gui -n "${NS}" --dry-run=client -o yaml | oc apply -f -

echo "==> [2/4] Building container image..."
podman build -t "${IMAGE}" "${REPO_ROOT}"

echo "==> [3/4] Pushing to integrated registry..."
oc registry login
podman push --tls-verify=false "${IMAGE}"

echo "==> [4/4] Deploying plugin..."
IMAGE="${IMAGE}" "${SCRIPT_DIR}/deploy.sh"
