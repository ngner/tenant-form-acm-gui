import * as React from 'react';
import { Link } from 'react-router-dom';
import { Content, ContentVariants, List, ListItem, Title } from '@patternfly/react-core';
import { TENANTS_CREATE_PATH } from '../tenantRoutes';

/** High-level tenant overview body — used by the Help page. */
const TenantsHelpContent: React.FC = () => (
  <div>
    <Content component={ContentVariants.p}>
      A tenant is an isolated customer or team boundary. You define it once as a Tenant resource
      on the Fleet Management console (aka Hub). Governance policies then create matching namespaces, access, quotas, and
      networking on the clusters that tenant is allowed to use. The tenant configuration is stored as a Custom Resource Definition or (CRD) on the hub.

    </Content>

    <Title headingLevel="h3" size="md" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
      What happens when you create one
    </Title>
    <List>
      <ListItem>
        You submit the Create tenant form (or apply a Tenant CRD manifest). The Tenant lives in the{' '}
        <strong>tenancies</strong> namespace on the hub.
      </ListItem>
      <ListItem>
        ACM policies watch Tenants created on the hub and provision the tenants on any applicable clusters:
        namespace, RBAC groups, resource limits, and network boundaries.
      </ListItem>
      <ListItem>
        Each tenant has a workload profile; this determines the type of workloads that can be
        deployed to the tenant. Each cluster has a tenant capability label that determines the
        type of tenants that can be deployed to the cluster.
      </ListItem>
      <ListItem>
        Optional console SSO registers a Keycloak realm and OpenShift login IdP when you enable
        identity on the form.
      </ListItem>
      <ListItem>
        For tenants with VM workload profiles, a starter virtual machine can be seeded automatically so the
        tenant has something to open on day one.
      </ListItem>
    </List>

    <Title headingLevel="h3" size="md" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
      Workload profiles
    </Title>
    <List>
      <ListItem>
        <strong>VMs</strong> — virtualization quotas and console access (default for most demos).
      </ListItem>
      <ListItem>
        <strong>Containers</strong> — container workloads only.
      </ListItem>
      <ListItem>
        <strong>Containers + VMs</strong> — both workloads are supported.
      </ListItem>
      <ListItem>
        <strong>Clusters (CaaS)</strong> — this tenant will host their own clusters of OpenShift. This may be used for full providing full OpenShift-as-a-Service, or AI-aaS platform services.
      </ListItem>
    </List>

    <Title headingLevel="h3" size="md" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
      Labeling clusters for workload profiles
    </Title>
    <Content component={ContentVariants.p}>
      A tenant&apos;s workload profile controls what policies create for that tenant. Managed
      clusters must carry capability labels so ACM knows which spokes can host which workload
      types. A spoke with neither label is excluded from tenant provisioning.
    </Content>
    <List style={{ marginTop: '0.5rem' }}>
      <ListItem>
        <code>tenancy.acm.io/capability-container=true</code> — container and application
        workloads (tenant namespace, ResourceQuota, RBAC).
      </ListItem>
      <ListItem>
        <code>tenancy.acm.io/capability-vm=true</code> — OpenShift Virtualization; VM quotas,
        KubeVirt console access, and optional starter VMs.
      </ListItem>
      <ListItem>
        Both labels on one cluster — supports the <strong>Containers + VMs</strong> profile on
        that spoke.
      </ListItem>
    </List>
    <Content component={ContentVariants.p} style={{ marginTop: '0.75rem' }}>
      Match labels on your fleet to the tenant profile you assign:
    </Content>
    <List>
      <ListItem>
        <strong>VMs</strong> — at least one spoke with <code>capability-vm</code>.
      </ListItem>
      <ListItem>
        <strong>Containers</strong> — at least one spoke with <code>capability-container</code>.
      </ListItem>
      <ListItem>
        <strong>Containers + VMs</strong> — VM policies land only on VM-capable spokes;
        container policies only on container-capable spokes (a spoke can have one or both
        labels).
      </ListItem>
      <ListItem>
        <strong>Clusters (CaaS)</strong> — hosted control planes on the hub; managed-cluster
        capability labels are not used for tenant compute placement.
      </ListItem>
    </List>
    <Content component={ContentVariants.p} style={{ marginTop: '0.75rem' }}>
      Optional: set <code>tenancy.acm.io/zone=&lt;name&gt;</code> on VM-capable spokes to
      target starter VMs at specific regions when you choose zone-based seeding on the create
      form.
    </Content>
    <Content component={ContentVariants.p} style={{ marginTop: '0.75rem' }}>
      Prefer <strong>Label clusters</strong> on the Tenants list for a quick checkbox UI. You can
      also label from Fleet Management (Clusters) or with <code>oc label managedcluster</code> on
      the hub:
    </Content>
    <pre
      style={{
        marginTop: '0.5rem',
        padding: '0.75rem',
        background: 'var(--pf-v6-global--BackgroundColor--100)',
        fontSize: '0.875rem',
        overflowX: 'auto',
      }}
    >
      {`# Container-only spoke
oc label managedcluster aws-us \\
  tenancy.acm.io/capability-container=true --overwrite

# Virtualization spoke (containers + VMs, with a zone for seed targeting)
oc label managedcluster virt-cluster-northshore-region \\
  tenancy.acm.io/capability-container=true \\
  tenancy.acm.io/capability-vm=true \\
  tenancy.acm.io/zone=northshore --overwrite`}
    </pre>

    <Title headingLevel="h3" size="md" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
      How isolation is enforced
    </Title>
    <List>
      <ListItem>
        <strong>Namespace</strong> — dedicated workload namespace on target clusters (defaults to
        the tenant name).
      </ListItem>
      <ListItem>
        <strong>Access</strong> — admin, user, and viewer groups map to fixed role tiers.
      </ListItem>
      <ListItem>
        <strong>Capacity</strong> — ResourceQuota, LimitRange, and VM-aware quotas cap usage.
      </ListItem>
      <ListItem>
        <strong>Network</strong> — a primary user-defined network separates tenant traffic;
        optional MetalLB covers external addressing.
      </ListItem>
    </List>

    <Title headingLevel="h3" size="md" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
      Who uses which console
    </Title>
    <Content component={ContentVariants.p}>
      Platform operators stay in Fleet Management (this Tenants view) to create and edit tenants.
      Tenant users typically land in a scoped perspective such as VMaaS or Developer, depending on
      workload profile — not the full fleet admin experience.
    </Content>
    <Content component={ContentVariants.p} style={{ marginTop: '0.75rem' }}>
      Ready to onboard? <Link to={TENANTS_CREATE_PATH}>Create a tenant</Link>.
    </Content>
  </div>
);

export default TenantsHelpContent;
