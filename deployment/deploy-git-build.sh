#!/usr/bin/env bash
# Build the plugin image on-cluster from a Git branch (no local podman/docker required).
# Push your branch to GitHub first, then run this script from any machine with oc access.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GIT_REPO="${GIT_REPO:-https://github.com/mandibuswell/tenant-form-acm-gui.git}"
GIT_REF="${GIT_REF:-feature/tenant-identity-sso}"
NS="${NS:-tenant-form-acm-gui}"
BC="${BC:-tenant-form-acm-gui}"
IMAGE="image-registry.openshift-image-registry.svc:5000/${NS}/${BC}:latest"

if ! oc whoami &>/dev/null; then
  echo "ERROR: Not logged in. Set KUBECONFIG (and HTTPS_PROXY if using an RHDP bastion) then oc login."
  exit 1
fi

echo "==> OpenShift Git build + deploy"
echo "    Cluster: $(oc whoami --show-server)"
echo "    User:    $(oc whoami)"
echo "    Repo:    ${GIT_REPO}#${GIT_REF}"
echo ""

echo "==> [1/4] Namespace + image stream..."
oc apply -f "${SCRIPT_DIR}/00-namespace.yaml"
oc create imagestream "${BC}" -n "${NS}" --dry-run=client -o yaml | oc apply -f -

echo "==> [2/4] BuildConfig + build from Git..."
if ! oc get buildconfig "${BC}" -n "${NS}" &>/dev/null; then
  oc new-build "${GIT_REPO}#${GIT_REF}" \
    --name="${BC}" \
    --strategy=docker \
    --to="${IMAGE}" \
    -n "${NS}"
  BUILD="$(oc get builds -n "${NS}" -l "buildconfig=${BC}" --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}')"
  echo "    Waiting for initial build ${BUILD}..."
  oc wait --for=condition=Complete "build/${BUILD}" -n "${NS}" --timeout=20m
else
  oc start-build "${BC}" --commit="${GIT_REF}" --follow -n "${NS}"
fi

echo "==> [3/4] Resolving built image..."
BUILT_IMAGE="$(oc get istag "${BC}:latest" -n "${NS}" -o jsonpath='{.image.dockerImageReference}')"
echo "    Image: ${BUILT_IMAGE}"

echo "==> [4/4] Deploying plugin..."
IMAGE="${BUILT_IMAGE}" "${SCRIPT_DIR}/deploy.sh"

echo ""
echo "==> Done. Hard-refresh the ACM console (or use incognito) at:"
echo "    $(oc whoami --show-console)/tenant-create"
