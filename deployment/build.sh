#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${IMAGE:-}" ]; then
  read -rp "Quay.io organisation (e.g. nday): " QUAY_ORG
  if [ -z "${QUAY_ORG}" ]; then
    echo "ERROR: Organisation cannot be empty."
    exit 1
  fi
  IMAGE="quay.io/${QUAY_ORG}/tenant-form-acm-gui:latest"
fi

echo "==> Building tenant-form-acm-gui"
echo "    Image: ${IMAGE}"
echo ""

if ! command -v podman &>/dev/null; then
  echo "ERROR: podman is not installed."
  exit 1
fi

echo "==> [1/2] Building container image..."
podman build -t "${IMAGE}" "${REPO_ROOT}"

echo ""
echo "==> [2/2] Pushing to registry..."
podman push "${IMAGE}"

echo ""
echo "==> Build complete!"
echo "    Image: ${IMAGE}"
echo ""
echo "    To deploy to a cluster, run:"
echo "    IMAGE=${IMAGE} ./deployment/deploy.sh"
