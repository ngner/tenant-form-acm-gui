#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${IMAGE:-}" ]; then
  read -rp "Quay.io organisation (e.g. nday): " QUAY_ORG
  if [ -z "${QUAY_ORG}" ]; then
    echo "ERROR: Organisation cannot be empty."
    exit 1
  fi
  IMAGE="quay.io/${QUAY_ORG}/tenant-form-acm-gui:latest"
fi

echo "==> Deploying tenant-form-acm-gui plugin"
echo "    Image: ${IMAGE}"
echo ""

# Verify oc is available and logged in
if ! oc whoami &>/dev/null; then
  echo "ERROR: Not logged in to an OpenShift cluster. Run 'oc login' first."
  exit 1
fi

echo "    Cluster: $(oc whoami --show-server)"
echo "    User:    $(oc whoami)"
echo ""

# 1. Apply the Tenant CRD
echo "==> [1/5] Applying Tenant CRD..."
oc apply -f "${SCRIPT_DIR}/01-tenant-crd.yaml"

# 2. Create the namespace
echo "==> [2/5] Creating namespace..."
oc apply -f "${SCRIPT_DIR}/00-namespace.yaml"

# 3. Deploy the plugin server (patch image if overridden)
echo "==> [3/5] Deploying plugin server..."
sed "s|quay.io/nday/tenant-form-acm-gui:latest|${IMAGE}|g" \
  "${SCRIPT_DIR}/02-deployment.yaml" | oc apply -f -

# 4. Register the ConsolePlugin
echo "==> [4/5] Registering ConsolePlugin..."
oc apply -f "${SCRIPT_DIR}/03-consoleplugin.yaml"

# 5. Enable the plugin on the cluster console
echo "==> [5/5] Enabling plugin in the console..."
EXISTING=$(oc get console.operator cluster -o jsonpath='{.spec.plugins}' 2>/dev/null || echo "[]")
if echo "${EXISTING}" | grep -q "tenant-form-acm-gui"; then
  echo "    Plugin already enabled in console.operator/cluster"
else
  oc patch console.operator cluster --type merge \
    --patch '{"spec":{"plugins":["tenant-form-acm-gui"]}}'
fi

echo ""
echo "==> Waiting for rollout..."
oc rollout status deployment/tenant-form-acm-gui -n tenant-form-acm-gui --timeout=120s

echo ""
echo "==> Deployment complete!"
echo "    Plugin pod:"
oc get pods -n tenant-form-acm-gui -l app=tenant-form-acm-gui --no-headers
echo ""
echo "    ConsolePlugin:"
oc get consoleplugins tenant-form-acm-gui --no-headers
echo ""
echo "    The console will reload within ~60s. Access the form at:"
echo "    $(oc whoami --show-console)/tenant-create"
