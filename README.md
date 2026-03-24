# Tenant Management — OpenShift Console Plugin

An OpenShift Dynamic Console Plugin that adds a **Create Tenant** form to the
ACM / OpenShift console. The form is schema-driven from the
`tenants.dusty-seahorse.io` CRD and built entirely with PatternFly components —
no custom HTML or CSS.

## Prerequisites


| Requirement        | Version |
| ------------------ | ------- |
| OpenShift cluster  | 4.14+   |
| ACM hub (optional) | 2.9+    |
| `oc` CLI           | 4.14+   |
| Node.js            | 22+     |
| Podman or Docker   | latest  |


The Tenant CRD must be installed on the cluster before the form can create
resources:

```bash
oc apply -f tenant-crd.yaml
```

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

Build and push the plugin image:

```bash
podman build -t quay.io/nday/tenant-form-acm-gui:latest .
podman push quay.io/nday/tenant-form-acm-gui:latest
```

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

The script applies everything in order — CRD, namespace, Deployment + Service,
ConsolePlugin registration — and enables the plugin on the cluster console.

To use a custom image, set the `IMAGE` environment variable:

```bash
IMAGE=quay.io/myorg/tenant-form-acm-gui:v1.2.0 ./deployment/deploy.sh
```

### What gets created

| File | Resources |
| ---- | --------- |
| `deployment/00-namespace.yaml` | Namespace `tenant-form-acm-gui` |
| `deployment/01-tenant-crd.yaml` | CRD `tenants.dusty-seahorse.io` |
| `deployment/02-deployment.yaml` | Deployment + Service (nginx serving the plugin bundle) |
| `deployment/03-consoleplugin.yaml` | ConsolePlugin CR that registers the plugin with the console |

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
link appears under **Home** in the admin perspective sidebar. Navigate to
`https://<console-url>/tenant-create` to access the form directly.

## Uninstall

```bash
./deployment/undeploy.sh
```

The script removes the console plugin, deletes the namespace (which takes the
Deployment and Service with it), and optionally deletes the Tenant CRD.

## Project Layout

```
├── console-extensions.json   # Nav item + page route registration
├── Dockerfile                # Multi-stage UBI9 → nginx image
├── package.json              # Dependencies + consolePlugin metadata
├── tsconfig.json             # TypeScript configuration
├── webpack.config.ts         # Webpack with ConsoleRemotePlugin
├── tenant-crd.yaml           # Tenant CRD definition (source of truth)
├── deployment/
│   ├── 00-namespace.yaml     # Namespace
│   ├── 01-tenant-crd.yaml    # Tenant CRD
│   ├── 02-deployment.yaml    # Deployment + Service
│   ├── 03-consoleplugin.yaml # ConsolePlugin registration
│   ├── deploy.sh             # One-command install
│   └── undeploy.sh           # One-command teardown
└── src/
    ├── models.ts             # K8sModel for dusty-seahorse.io/v1alpha1 Tenant
    └── components/
        └── CreateTenantPage.tsx   # PatternFly form (sole UI component)
```

## License

Apache-2.0