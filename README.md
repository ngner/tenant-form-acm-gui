# Tenant Management — OpenShift Console Plugin

An OpenShift Dynamic Console Plugin that adds a **Create Tenant** form to the
ACM / OpenShift console. The form is schema-driven from the
`tenants.dusty-seahorse.io` CRD and built entirely with PatternFly components —
no custom HTML or CSS.

## Prerequisites

| Requirement | Version |
|---|---|
| OpenShift cluster | 4.14+ |
| ACM hub (optional) | 2.9+ |
| `oc` CLI | 4.14+ |
| Node.js | 22+ |
| Podman or Docker | latest |

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
podman build -t quay.io/<your-org>/tenant-form-acm-gui:latest .
podman push quay.io/<your-org>/tenant-form-acm-gui:latest
```

## Cluster Deployment

### 1. Create the namespace and deploy the plugin server

```bash
oc new-project tenant-form-acm-gui
```

Create the Deployment and Service. Replace the image reference with your
registry path:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tenant-form-acm-gui
  namespace: tenant-form-acm-gui
spec:
  replicas: 1
  selector:
    matchLabels:
      app: tenant-form-acm-gui
  template:
    metadata:
      labels:
        app: tenant-form-acm-gui
    spec:
      containers:
        - name: tenant-form-acm-gui
          image: quay.io/<your-org>/tenant-form-acm-gui:latest
          ports:
            - containerPort: 8080
              protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: tenant-form-acm-gui
  namespace: tenant-form-acm-gui
spec:
  selector:
    app: tenant-form-acm-gui
  ports:
    - port: 9443
      targetPort: 8080
      protocol: TCP
```

```bash
oc apply -f deployment.yaml
```

### 2. Register the ConsolePlugin

```bash
cat <<'EOF' | oc apply -f -
apiVersion: console.openshift.io/v1
kind: ConsolePlugin
metadata:
  name: tenant-form-acm-gui
spec:
  displayName: Tenant Management
  backend:
    type: Service
    service:
      name: tenant-form-acm-gui
      namespace: tenant-form-acm-gui
      port: 9443
EOF
```

### 3. Enable the plugin

```bash
oc patch console.operator cluster --type merge \
  --patch '{"spec":{"plugins":["tenant-form-acm-gui"]}}'
```

After the console pods restart (typically 30–60 seconds), a **Create Tenant**
link appears under **Home** in the admin perspective sidebar.

### Verify

```bash
# Check the plugin pod is running
oc get pods -n tenant-form-acm-gui

# Confirm the plugin is registered
oc get consoleplugins
```

Navigate to `https://<console-url>/tenant-create` to access the form directly.

## Uninstall

```bash
# Remove the plugin from the console
oc patch console.operator cluster --type json \
  --patch '[{"op":"remove","path":"/spec/plugins","value":"tenant-form-acm-gui"}]'

# Delete the ConsolePlugin CR
oc delete consoleplugin tenant-form-acm-gui

# Delete the namespace (removes Deployment + Service)
oc delete project tenant-form-acm-gui
```

## Project Layout

```
├── console-extensions.json   # Nav item + page route registration
├── Dockerfile                # Multi-stage UBI9 → nginx image
├── package.json              # Dependencies + consolePlugin metadata
├── tsconfig.json             # TypeScript configuration
├── webpack.config.ts         # Webpack with ConsoleRemotePlugin
├── tenant-crd.yaml           # Tenant CRD definition
└── src/
    ├── models.ts             # K8sModel for dusty-seahorse.io/v1alpha1 Tenant
    └── components/
        └── CreateTenantPage.tsx   # PatternFly form (sole UI component)
```

## License

Apache-2.0
