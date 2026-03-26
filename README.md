# Tenant Management — OpenShift Console Plugin

An OpenShift Dynamic Console Plugin that adds a **Create Tenant** form to the
ACM Fleet Management console. The form is schema-driven from the
`tenants.dusty-seahorse.io` CRD and built entirely with PatternFly components —
no custom HTML or CSS.

The form is designed to be customer-friendly rather than infrastructure-focused.
Kubernetes concepts like namespaces, RBAC groups, and BGP ASNs are hidden behind
smart defaults and an Advanced Settings panel, so operators can provision a
tenant by simply entering a name and adjusting resource budgets.

## Prerequisites

| Requirement        | Version |
| ------------------ | ------- |
| OpenShift cluster  | 4.14+   |
| ACM hub            | 2.9+    |
| `oc` CLI           | 4.14+   |
| Node.js            | 22+     |
| Podman or Docker   | latest  |

The Tenant CRD must be installed on the cluster before the form can create
resources:

```bash
oc apply -f tenant-crd.yaml
```

## Form Overview

After deployment the **Create Tenant** link appears in the **Fleet Management
(All Clusters)** perspective sidebar in ACM. The form is accessible directly at
`https://<console-url>/tenant-create`.

### Smart Defaults

Several fields are auto-derived from the **Tenant Name** as the user types:

| Field | Default value | Where to override |
| ----- | ------------- | ----------------- |
| Namespace | `tenancies` | Advanced Settings → Cluster Set Management |
| Admin Group | `{name}-tenant-admin` | Advanced Settings → Access Groups |
| User Group | `{name}-tenant-user` | Advanced Settings → Access Groups |
| VRF | `{name}-vrf` | Advanced Settings → BGP Advanced |
| Cluster ASN | `64500` | Advanced Settings → BGP Advanced |

If left blank the derived values are used automatically at submission — the user
only needs to fill in a tenant name to get sensible defaults for the entire form.

### Form Sections

| Section | Description |
| ------- | ----------- |
| **Tenant Details** | Name, display name, and owner contact. |
| **Tenant Resource Quotas** | Total resource budget (CPU, memory, pods, storage) covering all workloads in the tenant. |
| **Virtual Machine Quota** | Subset of the tenant quota reserved for VMs — limits how much of the total budget VMs can consume, leaving headroom for migration pods and services. |
| **Maximum Virtual Machine Size** | Largest single VM that can be created (CPU, memory, storage per VM). |
| **Networking** *(collapsed)* | Isolated private network CIDR and Service Provider BGP peering for public IP / ingress / egress. |
| **Advanced Settings** *(collapsed)* | Cluster Groups namespace, RBAC group overrides, VRF, and ASN overrides. |

## Local Development

```bash
# Install dependencies
npm install

# Start the webpack dev server on port 9001
npm start
```

To connect the dev server to a running OpenShift console, use the
[bridge](https://github.com/openshift/console) with plugin proxy:

```bash
./bin/bridge \
  --plugins="tenant-form-acm-gui=http://localhost:9001"
```

Then open the console at `https://localhost:9000/tenant-create`.

## Build

```bash
# Production build (output in dist/)
npm run build

# Development build (unminified, with source maps)
npm run build-dev
```

## Container Image

Build and push the plugin image using the helper script:

```bash
./deployment/build.sh
```

The script prompts for your quay.io organisation, then builds and pushes the
image. To use a custom image tag, set `IMAGE` directly:

```bash
IMAGE=quay.io/myorg/tenant-form-acm-gui:v1.2.0 ./deployment/build.sh
```

The image uses a multi-stage build (UBI9 Node.js 22 → UBI9 nginx 1.20) and
includes a custom `nginx.conf` that serves the plugin bundle over HTTPS on port
9443 using the cluster's service-CA certificate, as required by the OpenShift
console plugin proxy.

## Cluster Deployment

All Kubernetes manifests and helper scripts live in the `deployment/` directory.
Clone the repo to your bastion host, log in with `oc`, and run the deploy
script:

```bash
git clone https://github.com/ngner/tenant-form-acm-gui.git
cd tenant-form-acm-gui

oc login https://<api-server>:6443 -u <user>

./deployment/deploy.sh
```

The script prompts for your quay.io organisation, then applies everything in
order — CRD, namespace, Deployment + Service, ConsolePlugin registration — and
enables the plugin on the cluster console.

To use a custom image, set the `IMAGE` environment variable:

```bash
IMAGE=quay.io/myorg/tenant-form-acm-gui:v1.2.0 ./deployment/deploy.sh
```

### What gets created

| File | Resources |
| ---- | --------- |
| `deployment/00-namespace.yaml` | Namespace `tenant-form-acm-gui` |
| `deployment/01-tenant-crd.yaml` | CRD `tenants.dusty-seahorse.io` |
| `deployment/02-deployment.yaml` | Deployment + Service (nginx serving the plugin bundle over TLS) |
| `deployment/03-consoleplugin.yaml` | ConsolePlugin CR that registers the plugin with the console |

The Service is annotated with `service.beta.openshift.io/serving-cert-secret-name`
so OpenShift's service-CA operator automatically generates a TLS certificate. The
Deployment mounts this certificate and nginx serves HTTPS on port 9443.

### Manual deployment

If you prefer to apply manifests individually:

```bash
oc apply -f deployment/01-tenant-crd.yaml
oc apply -f deployment/00-namespace.yaml
oc apply -f deployment/02-deployment.yaml
oc apply -f deployment/03-consoleplugin.yaml

oc patch console.operator cluster --type merge \
  --patch '{"spec":{"plugins":["tenant-form-acm-gui"]}}'
```

### Verify

```bash
oc get pods -n tenant-form-acm-gui
oc get consoleplugins
```

After the console pods restart (typically 30–60 seconds), a **Create Tenant**
link appears in the **Fleet Management (All Clusters)** perspective sidebar in
ACM. Navigate to `https://<console-url>/tenant-create` to access the form
directly.

## Uninstall

```bash
./deployment/undeploy.sh
```

The script removes the console plugin, deletes the namespace (which takes the
Deployment and Service with it), and optionally deletes the Tenant CRD.

## Project Layout

```
├── console-extensions.json   # Nav item + page route registration (ACM perspective)
├── Dockerfile                # Multi-stage UBI9 → nginx image
├── nginx.conf                # HTTPS on 9443 + HTTP on 8080 (health probes)
├── package.json              # Dependencies + consolePlugin metadata
├── tsconfig.json             # TypeScript configuration
├── webpack.config.ts         # Webpack with ConsoleRemotePlugin
├── tenant-crd.yaml           # Tenant CRD definition (source of truth)
├── deployment/
│   ├── 00-namespace.yaml     # Namespace
│   ├── 01-tenant-crd.yaml    # Tenant CRD
│   ├── 02-deployment.yaml    # Deployment + Service (TLS via service-CA)
│   ├── 03-consoleplugin.yaml # ConsolePlugin registration
│   ├── build.sh              # Build + push container image via podman
│   ├── deploy.sh             # One-command install (prompts for quay.io org)
│   └── undeploy.sh           # One-command teardown
└── src/
    ├── models.ts             # K8sModel for dusty-seahorse.io/v1alpha1 Tenant
    └── components/
        └── CreateTenantPage.tsx   # PatternFly form with smart defaults
```

## License

Apache-2.0
