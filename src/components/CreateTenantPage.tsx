import * as React from 'react';
import { useHistory } from 'react-router-dom';
import {
  PageSection,
  Title,
  Form,
  FormGroup,
  FormSection,
  FormGroupLabelHelp,
  TextInput,
  ExpandableSection,
  ActionGroup,
  Button,
  Alert,
  Popover,
  Grid,
  GridItem,
  InputGroup,
  InputGroupItem,
  Content,
} from '@patternfly/react-core';
import { PlusCircleIcon, MinusCircleIcon } from '@patternfly/react-icons';
import { k8sCreate, k8sGet, k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';

const DEFAULT_NAMESPACE = 'tenancies';
const DEFAULT_MY_ASN = '64500';
const DEMO_CLIENT_SECRET = 'VDRjA2vWjJwlSZQ9tickuGkBQpiiJHdN';

const SecretModel = {
  apiVersion: 'v1',
  kind: 'Secret',
  plural: 'secrets',
  namespaced: true,
  abbr: 'SEC',
  label: 'Secret',
  labelPlural: 'Secrets',
};

interface MetallbForm {
  myASN: string;
  peerASN: string;
  peerAddress: string;
  vrf: string;
  addresses: string[];
}

interface IdentityForm {
  enabled: boolean;
  provider: 'keycloak' | 'oidc';
  clientSecret: string;
  consoleLoginName: string;
  oidcIssuer: string;
  keycloakNamespace: string;
  keycloakInstance: string;
  manageRealm: boolean;
  seedUsers: boolean;
  seedPassword: string;
  requirePasswordChange: boolean;
}

interface TenantSpec {
  displayName: string;
  owner: string;
  workloadNamespace: string;
  adminGroup: string;
  userGroup: string;
  viewerGroup: string;
  resourceQuota: { cpu: string; memory: string; pods: string; storage: string };
  vmQuota: { cpu: string; memory: string };
  limitRange: { maxCpu: string; maxMemory: string; maxStorage: string };
  network: { udnSubnet: string; metallb: MetallbForm };
  identity: IdentityForm;
}

const defaults: TenantSpec = {
  displayName: '',
  owner: '',
  workloadNamespace: '',
  adminGroup: '',
  userGroup: '',
  viewerGroup: '',
  resourceQuota: { cpu: '86', memory: '332Gi', pods: '15', storage: '2000Gi' },
  vmQuota: { cpu: '80', memory: '320Gi' },
  limitRange: { maxCpu: '32', maxMemory: '128Gi', maxStorage: '1Ti' },
  network: {
    udnSubnet: '',
    metallb: { myASN: DEFAULT_MY_ASN, peerASN: '', peerAddress: '', vrf: '', addresses: [] },
  },
  identity: {
    enabled: false,
    provider: 'keycloak',
    clientSecret: '',
    consoleLoginName: '',
    oidcIssuer: '',
    keycloakNamespace: 'keycloak-system',
    keycloakInstance: 'main',
    manageRealm: false,
    seedUsers: false,
    seedPassword: 'password',
    requirePasswordChange: false,
  },
};

const helpPopover = (content: string, label: string): React.ReactElement => (
  <Popover bodyContent={content}>
    <FormGroupLabelHelp aria-label={`More info for ${label}`} />
  </Popover>
);

const fieldValid = (submitted: boolean, value: string) =>
  submitted && !value.trim() ? 'error' as const : 'default' as const;

const sectionDescription = (text: string): React.ReactElement => (
  <Content component="p" style={{ marginBottom: '0.5rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
    {text}
  </Content>
);

const CreateTenantPage: React.FC = () => {
  const history = useHistory();
  const [name, setName] = React.useState('');
  const [namespace, setNamespace] = React.useState(DEFAULT_NAMESPACE);
  const [spec, setSpec] = React.useState<TenantSpec>({ ...defaults });
  const [networkExpanded, setNetworkExpanded] = React.useState(false);
  const [identityExpanded, setIdentityExpanded] = React.useState(false);
  const [advancedExpanded, setAdvancedExpanded] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const derivedAdminGroup = name.trim() ? `${name.trim()}-tenant-admin` : '';
  const derivedUserGroup = name.trim() ? `${name.trim()}-tenant-user` : '';
  const derivedViewerGroup = name.trim() ? `${name.trim()}-tenant-viewer` : '';
  const derivedVrf = name.trim() ? `${name.trim()}-vrf` : '';

  const effectiveAdminGroup = spec.adminGroup.trim() || derivedAdminGroup;
  const effectiveUserGroup = spec.userGroup.trim() || derivedUserGroup;
  const effectiveViewerGroup = spec.viewerGroup.trim() || derivedViewerGroup;
  const effectiveVrf = spec.network.metallb.vrf.trim() || derivedVrf;
  const effectiveNamespace = namespace.trim() || DEFAULT_NAMESPACE;

  const effectiveWorkloadNamespace = spec.workloadNamespace.trim() || name.trim();

  const updateSpec = <K extends keyof TenantSpec>(key: K, val: TenantSpec[K]) =>
    setSpec((prev) => ({ ...prev, [key]: val }));

  const updateQuota = (key: string, val: string) =>
    setSpec((prev) => ({ ...prev, resourceQuota: { ...prev.resourceQuota, [key]: val } }));

  const updateVmQuota = (key: string, val: string) =>
    setSpec((prev) => ({ ...prev, vmQuota: { ...prev.vmQuota, [key]: val } }));

  const updateLimit = (key: string, val: string) =>
    setSpec((prev) => ({ ...prev, limitRange: { ...prev.limitRange, [key]: val } }));

  const updateNetwork = (key: string, val: string) =>
    setSpec((prev) => ({ ...prev, network: { ...prev.network, [key]: val } }));

  const updateMetallb = (key: string, val: string | string[]) =>
    setSpec((prev) => ({
      ...prev,
      network: { ...prev.network, metallb: { ...prev.network.metallb, [key]: val } },
    }));

  const addAddress = () =>
    updateMetallb('addresses', [...spec.network.metallb.addresses, '']);

  const removeAddress = (idx: number) =>
    updateMetallb(
      'addresses',
      spec.network.metallb.addresses.filter((_, i) => i !== idx),
    );

  const updateAddress = (idx: number, val: string) =>
    updateMetallb(
      'addresses',
      spec.network.metallb.addresses.map((a, i) => (i === idx ? val : a)),
    );

  const updateIdentity = (key: keyof IdentityForm, val: string | boolean) =>
    setSpec((prev) => ({ ...prev, identity: { ...prev.identity, [key]: val } }));

  const generateClientSecret = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    // 24 bytes → 32 base64 chars with no padding; URL-safe via substitution (not removal).
    const secret = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    updateIdentity('clientSecret', secret);
  };

  const enableIdentity = (enabled: boolean) => {
    updateIdentity('enabled', enabled);
    if (enabled && !spec.identity.clientSecret.trim()) {
      updateIdentity('clientSecret', DEMO_CLIENT_SECRET);
    }
    if (enabled) {
      setIdentityExpanded(true);
    }
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Tenant name is required.');
    if (!effectiveAdminGroup) errs.push('Admin Group is required.');
    if (!effectiveUserGroup) errs.push('User Group is required.');
    if (spec.identity.enabled) {
      if (!spec.identity.clientSecret.trim()) {
        errs.push('Client secret is required when console SSO is enabled.');
      }
      if (spec.identity.provider === 'oidc' && !spec.identity.oidcIssuer.trim()) {
        errs.push('Issuer URL is required for external OIDC.');
      }
    }
    return errs;
  };

  const buildResource = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant: any = {
      apiVersion: `${TenantModel.apiGroup}/${TenantModel.apiVersion}`,
      kind: TenantModel.kind,
      metadata: {
        name: name.trim(),
        namespace: effectiveNamespace,
        labels: { tenant: name.trim() },
      },
      spec: {
        adminGroup: effectiveAdminGroup,
        userGroup: effectiveUserGroup,
        viewerGroup: effectiveViewerGroup,
        resourceQuota: { ...spec.resourceQuota },
        vmQuota: { ...spec.vmQuota },
        limitRange: { ...spec.limitRange },
      },
    };
    if (spec.displayName.trim()) tenant.spec.displayName = spec.displayName.trim();
    if (spec.owner.trim()) tenant.spec.owner = spec.owner.trim();
    const tenantName = name.trim();
    if (spec.workloadNamespace.trim() && spec.workloadNamespace.trim() !== tenantName) {
      tenant.spec.workloadNamespace = spec.workloadNamespace.trim();
    }

    const network: Record<string, unknown> = {};
    if (spec.network.udnSubnet.trim()) {
      network.udnSubnet = spec.network.udnSubnet.trim();
    }
    const mb = spec.network.metallb;
    const hasMetallb = mb.peerASN || mb.peerAddress || effectiveVrf || mb.addresses.some((a) => a.trim());
    if (hasMetallb) {
      const metallb: Record<string, unknown> = {
        myASN: parseInt(mb.myASN, 10) || parseInt(DEFAULT_MY_ASN, 10),
      };
      if (mb.peerASN) metallb.peerASN = parseInt(mb.peerASN, 10);
      if (mb.peerAddress.trim()) metallb.peerAddress = mb.peerAddress.trim();
      metallb.vrf = effectiveVrf;
      const filteredAddrs = mb.addresses.map((a) => a.trim()).filter(Boolean);
      if (filteredAddrs.length) metallb.addresses = filteredAddrs;
      network.metallb = metallb;
    }
    if (Object.keys(network).length) tenant.spec.network = network;

    if (spec.identity.enabled) {
      const tenantName = name.trim();
      const idpName = spec.identity.consoleLoginName.trim() || `${tenantName}-idp`;
      tenant.spec.identity = {
        enabled: true,
        provider: spec.identity.provider,
        consoleLoginName: idpName,
        clientId: `openshift-${tenantName}`,
        clientSecretRef: {
          name: `${tenantName}-client-secret`,
          namespace: 'openshift-config',
        },
      };
      if (spec.identity.provider === 'keycloak') {
        tenant.spec.identity.keycloak = {
          namespace: spec.identity.keycloakNamespace.trim() || 'keycloak-system',
          instanceName: spec.identity.keycloakInstance.trim() || 'main',
          realm: tenantName,
          manageRealm: spec.identity.manageRealm,
        };
        if (spec.identity.manageRealm && spec.identity.seedUsers) {
          tenant.spec.identity.keycloak.seedUsers = true;
          tenant.spec.identity.keycloak.seedPassword =
            spec.identity.seedPassword.trim() || 'password';
          if (spec.identity.requirePasswordChange) {
            tenant.spec.identity.keycloak.requirePasswordChange = true;
          }
        }
      } else {
        tenant.spec.identity.oidc = {
          issuer: spec.identity.oidcIssuer.trim(),
        };
      }
    }
    return tenant;
  };

  const upsertClientSecret = async (tenantName: string, secret: string) => {
    const secretName = `${tenantName}-client-secret`;
    const secretNs = 'openshift-config';
    const payload = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: secretName, namespace: secretNs, labels: { tenant: tenantName } },
      type: 'Opaque',
      stringData: { clientSecret: secret },
    };
    try {
      await k8sCreate({ model: SecretModel, data: payload });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('AlreadyExists') && !msg.includes('409')) {
        if (msg.includes('Forbidden') || msg.includes('403')) {
          throw new Error(
            'Cannot create client secret in openshift-config — cluster-admin (or equivalent) is required for console SSO.',
          );
        }
        throw err;
      }
      const existing = await k8sGet({ model: SecretModel, name: secretName, ns: secretNs });
      await k8sUpdate({
        model: SecretModel,
        name: secretName,
        ns: secretNs,
        data: { ...existing, stringData: { clientSecret: secret } },
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError('');
    const errs = validate();
    if (errs.length) {
      setError(errs.join(' '));
      return;
    }
    setLoading(true);
    try {
      const tenantName = name.trim();
      if (spec.identity.enabled) {
        await upsertClientSecret(tenantName, spec.identity.clientSecret.trim());
      }
      await k8sCreate({ model: TenantModel, data: buildResource() });
      history.push(
        `/k8s/ns/${effectiveNamespace}/${TenantModel.apiGroup}~${TenantModel.apiVersion}~${TenantModel.kind}/${name.trim()}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1">Create Tenant</Title>
      </PageSection>
      <PageSection>
        {error && (
          <Alert variant="danger" title="Error" isInline style={{ marginBottom: '1rem' }}>
            {error}
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          {/* ── Tenant Details ── */}
          <FormSection title="Tenant Details">
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup label="Tenant Name" isRequired fieldId="tenant-name">
                  <TextInput
                    id="tenant-name"
                    value={name}
                    onChange={(_e, v) => setName(v)}
                    validated={fieldValid(submitted, name)}
                    isRequired
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Display Name"
                  fieldId="display-name"
                  labelHelp={helpPopover(
                    'A friendly name for this tenant shown in the console.',
                    'Display Name',
                  )}
                >
                  <TextInput
                    id="display-name"
                    value={spec.displayName}
                    onChange={(_e, v) => updateSpec('displayName', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Workload namespace"
                  fieldId="workload-namespace"
                  labelHelp={helpPopover(
                    'Namespace created on managed clusters for this tenant (quotas, UDN, VMs). Defaults to the tenant name when left blank (e.g. starwars). Use a suffix such as starwars-ns if you prefer.',
                    'Workload namespace',
                  )}
                >
                  <TextInput
                    id="workload-namespace"
                    placeholder={name.trim() || 'same as tenant name'}
                    value={spec.workloadNamespace}
                    onChange={(_e, v) => updateSpec('workloadNamespace', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12}>
                <Content component="p" style={{ fontSize: '0.875rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
                  Managed cluster namespace: <strong>{effectiveWorkloadNamespace || '—'}</strong>
                  {' '}(label <code>tenant={name.trim() || '…'}</code> on provisioned resources)
                </Content>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Owner"
                  fieldId="owner"
                  labelHelp={helpPopover(
                    'Contact email or team identifier for the tenant owner.',
                    'Owner',
                  )}
                >
                  <TextInput
                    id="owner"
                    value={spec.owner}
                    onChange={(_e, v) => updateSpec('owner', v)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          {/* ── Tenant Resource Quotas ── */}
          <FormSection title="Tenant Resource Quotas" titleElement="h2">
            {sectionDescription(
              'Set the total resource budget for this tenant. These limits cover everything in the tenant \u2014 VMs, services, migration pods, and all other workloads.',
            )}
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup
                  label="CPU"
                  fieldId="rq-cpu"
                  labelHelp={helpPopover(
                    'Total CPU cores available across all workloads in this tenant.',
                    'CPU',
                  )}
                >
                  <TextInput
                    id="rq-cpu"
                    value={spec.resourceQuota.cpu}
                    onChange={(_e, v) => updateQuota('cpu', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Memory"
                  fieldId="rq-memory"
                  labelHelp={helpPopover(
                    'Total memory available across all workloads in this tenant.',
                    'Memory',
                  )}
                >
                  <TextInput
                    id="rq-memory"
                    value={spec.resourceQuota.memory}
                    onChange={(_e, v) => updateQuota('memory', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Pods"
                  fieldId="rq-pods"
                  labelHelp={helpPopover(
                    'Maximum number of running workloads in this tenant.',
                    'Pods',
                  )}
                >
                  <TextInput
                    id="rq-pods"
                    value={spec.resourceQuota.pods}
                    onChange={(_e, v) => updateQuota('pods', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Storage"
                  fieldId="rq-storage"
                  labelHelp={helpPopover(
                    'Total persistent storage available in this tenant.',
                    'Storage',
                  )}
                >
                  <TextInput
                    id="rq-storage"
                    value={spec.resourceQuota.storage}
                    onChange={(_e, v) => updateQuota('storage', v)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          {/* ── Virtual Machine Quota ── */}
          <FormSection title="Virtual Machine Quota" titleElement="h2">
            {sectionDescription(
              'Set the combined resource budget for all virtual machines in this tenant. This is a subset of the tenant resource quota above \u2014 it limits how much of the total budget VMs can consume, reserving the remainder for services like migration pods and other workloads.',
            )}
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup
                  label="CPU"
                  fieldId="vm-cpu"
                  labelHelp={helpPopover(
                    'Total CPU cores that can be allocated across all virtual machines.',
                    'VM CPU',
                  )}
                >
                  <TextInput
                    id="vm-cpu"
                    value={spec.vmQuota.cpu}
                    onChange={(_e, v) => updateVmQuota('cpu', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Memory"
                  fieldId="vm-memory"
                  labelHelp={helpPopover(
                    'Total memory that can be allocated across all virtual machines.',
                    'VM Memory',
                  )}
                >
                  <TextInput
                    id="vm-memory"
                    value={spec.vmQuota.memory}
                    onChange={(_e, v) => updateVmQuota('memory', v)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          {/* ── Maximum Virtual Machine Size ── */}
          <FormSection title="Maximum Virtual Machine Size" titleElement="h2">
            {sectionDescription(
              'Set the largest virtual machine that can be created in this tenant. No single VM may exceed these limits.',
            )}
            <Grid hasGutter>
              <GridItem span={4}>
                <FormGroup
                  label="CPU Limit"
                  fieldId="lr-cpu"
                  labelHelp={helpPopover(
                    'Maximum CPU cores for any single virtual machine.',
                    'CPU Limit',
                  )}
                >
                  <TextInput
                    id="lr-cpu"
                    value={spec.limitRange.maxCpu}
                    onChange={(_e, v) => updateLimit('maxCpu', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup
                  label="Memory Limit"
                  fieldId="lr-memory"
                  labelHelp={helpPopover(
                    'Maximum memory for any single virtual machine.',
                    'Memory Limit',
                  )}
                >
                  <TextInput
                    id="lr-memory"
                    value={spec.limitRange.maxMemory}
                    onChange={(_e, v) => updateLimit('maxMemory', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup
                  label="Storage Limit"
                  fieldId="lr-storage"
                  labelHelp={helpPopover(
                    'Maximum disk size for any single virtual machine.',
                    'Storage Limit',
                  )}
                >
                  <TextInput
                    id="lr-storage"
                    value={spec.limitRange.maxStorage}
                    onChange={(_e, v) => updateLimit('maxStorage', v)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          {/* ── Networking ── */}
          <ExpandableSection
            toggleText="Networking"
            isExpanded={networkExpanded}
            onToggle={(_e, expanded) => setNetworkExpanded(expanded)}
          >
            <FormSection title="Isolated Private Network">
              {sectionDescription(
                'CIDR block for this tenant\u2019s isolated virtual network. Each tenant gets its own network \u2014 address ranges may overlap between tenants.',
              )}
              <FormGroup
                label="Network CIDR"
                fieldId="udn-subnet"
                labelHelp={helpPopover(
                  'The private IP address range for this tenant\u2019s virtual network, similar to an AWS VPC CIDR block.',
                  'Network CIDR',
                )}
              >
                <TextInput
                  id="udn-subnet"
                  placeholder="e.g. 10.128.0.0/16"
                  value={spec.network.udnSubnet}
                  onChange={(_e, v) => updateNetwork('udnSubnet', v)}
                />
              </FormGroup>
            </FormSection>

            <FormSection title="Service Provider BGP Peering">
              {sectionDescription(
                'Configure BGP peering with your upstream network provider for external connectivity. This enables public IP assignment for ingress and egress traffic.',
              )}
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup
                    label="Peer Address"
                    fieldId="peer-address"
                    labelHelp={helpPopover(
                      'IP address of the upstream BGP router provided by your network team.',
                      'Peer Address',
                    )}
                  >
                    <TextInput
                      id="peer-address"
                      placeholder="e.g. 192.168.1.1"
                      value={spec.network.metallb.peerAddress}
                      onChange={(_e, v) => updateMetallb('peerAddress', v)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>

              <FormGroup
                label="Public IP Ranges"
                fieldId="addresses"
                labelHelp={helpPopover(
                  'External IP ranges assigned to this tenant for load balancer and ingress services, similar to AWS Elastic IPs.',
                  'Public IP Ranges',
                )}
              >
                {spec.network.metallb.addresses.map((addr, idx) => (
                  <InputGroup key={idx} style={{ marginBottom: '0.5rem' }}>
                    <InputGroupItem isFill>
                      <TextInput
                        id={`address-${idx}`}
                        placeholder="e.g. 203.0.113.0/28"
                        value={addr}
                        onChange={(_e, v) => updateAddress(idx, v)}
                      />
                    </InputGroupItem>
                    <InputGroupItem>
                      <Button
                        variant="plain"
                        aria-label="Remove address"
                        onClick={() => removeAddress(idx)}
                      >
                        <MinusCircleIcon />
                      </Button>
                    </InputGroupItem>
                  </InputGroup>
                ))}
                <Button variant="link" icon={<PlusCircleIcon />} onClick={addAddress}>
                  Add IP range
                </Button>
              </FormGroup>
            </FormSection>
          </ExpandableSection>

          {/* ── Console login (optional) ── */}
          <ExpandableSection
            toggleText="Console login (optional)"
            isExpanded={identityExpanded}
            onToggle={(_e, expanded) => setIdentityExpanded(expanded)}
          >
            <FormSection title="OpenShift OAuth identity provider">
              {sectionDescription(
                'Register an OpenShift console login IdP for this tenant. Production deployments typically use an existing customer Keycloak realm or external OIDC — only opt into realm creation for greenfield workshops.',
              )}
              <FormGroup fieldId="identity-enabled">
                <input
                  id="identity-enabled"
                  type="checkbox"
                  checked={spec.identity.enabled}
                  onChange={(e) => enableIdentity(e.target.checked)}
                />
                {' '}
                <label htmlFor="identity-enabled">Enable console SSO for this tenant</label>
              </FormGroup>
              {spec.identity.enabled && (
                <>
                  <Alert
                    variant="info"
                    isInline
                    title="Console SSO"
                    style={{ marginBottom: '1rem' }}
                  >
                    Stores an OAuth client secret in <strong>openshift-config</strong> and registers
                    an OpenShift IdP via the identity reconciler. For Keycloak, the realm and OIDC
                    client must already exist unless you explicitly enable realm creation below.
                  </Alert>
                <Grid hasGutter>
                  <GridItem span={6}>
                    <FormGroup label="Provider" fieldId="identity-provider">
                      <select
                        id="identity-provider"
                        value={spec.identity.provider}
                        onChange={(e) =>
                          updateIdentity('provider', e.target.value as 'keycloak' | 'oidc')
                        }
                      >
                        <option value="keycloak">Keycloak (platform-managed realm)</option>
                        <option value="oidc">External OIDC (Azure, Okta, …)</option>
                      </select>
                    </FormGroup>
                  </GridItem>
                  <GridItem span={6}>
                    <FormGroup label="Client secret" fieldId="client-secret" isRequired>
                      <InputGroup>
                        <InputGroupItem isFill>
                          <TextInput
                            id="client-secret"
                            type="password"
                            placeholder="Demo default pre-filled when SSO is enabled"
                            value={spec.identity.clientSecret}
                            onChange={(_e, v) => updateIdentity('clientSecret', v)}
                            validated={fieldValid(submitted, spec.identity.clientSecret)}
                            isRequired
                          />
                        </InputGroupItem>
                        <InputGroupItem>
                          <Button variant="secondary" onClick={generateClientSecret}>
                            Generate
                          </Button>
                        </InputGroupItem>
                      </InputGroup>
                    </FormGroup>
                  </GridItem>
                  <GridItem span={6}>
                    <FormGroup
                      label="Console IdP name"
                      fieldId="console-idp-name"
                      labelHelp={helpPopover('OpenShift OAuth identity provider name.', 'Console IdP name')}
                    >
                      <TextInput
                        id="console-idp-name"
                        placeholder={name.trim() ? `${name.trim()}-idp` : 'tenant-idp'}
                        value={spec.identity.consoleLoginName}
                        onChange={(_e, v) => updateIdentity('consoleLoginName', v)}
                      />
                    </FormGroup>
                  </GridItem>
                  {spec.identity.provider === 'keycloak' && (
                    <>
                      <GridItem span={12}>
                        <Alert variant="warning" isInline title="Keycloak must already exist">
                          A running Keycloak instance (Keycloak CR + route) is required in the
                          namespace below before console SSO will work. Point <strong>Realm</strong>{' '}
                          at an existing realm name unless you are provisioning a brand-new tenant
                          with no users yet.
                        </Alert>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Keycloak namespace" fieldId="kc-ns">
                          <TextInput
                            id="kc-ns"
                            value={spec.identity.keycloakNamespace}
                            onChange={(_e, v) => updateIdentity('keycloakNamespace', v)}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={6}>
                        <FormGroup label="Keycloak instance" fieldId="kc-instance">
                          <TextInput
                            id="kc-instance"
                            value={spec.identity.keycloakInstance}
                            onChange={(_e, v) => updateIdentity('keycloakInstance', v)}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        <FormGroup fieldId="manage-realm">
                          <input
                            id="manage-realm"
                            type="checkbox"
                            checked={spec.identity.manageRealm}
                            onChange={(e) => {
                              updateIdentity('manageRealm', e.target.checked);
                              if (!e.target.checked) {
                                updateIdentity('seedUsers', false);
                              }
                            }}
                          />
                          {' '}
                          <label htmlFor="manage-realm">
                            Create realm in Keycloak (KeycloakRealmImport)
                          </label>
                        </FormGroup>
                        <Content component="p" style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>
                          Enable only for a <strong>new</strong> tenant with no existing realm, groups,
                          or users. Leave unchecked when the customer already operates their own Keycloak
                          or shares a platform instance — the reconciler will register OpenShift OAuth
                          against the existing realm name ({name.trim() || 'tenant'}).
                        </Content>
                      </GridItem>
                      {spec.identity.manageRealm && (
                        <GridItem span={12}>
                          <FormGroup fieldId="seed-users">
                            <input
                              id="seed-users"
                              type="checkbox"
                              checked={spec.identity.seedUsers}
                              onChange={(e) => updateIdentity('seedUsers', e.target.checked)}
                            />
                            {' '}
                            <label htmlFor="seed-users">
                              Create demo seed users (admin@, user@, viewer@)
                            </label>
                          </FormGroup>
                          {spec.identity.seedUsers && (
                            <>
                              <FormGroup
                                label="Seed user password"
                                fieldId="seed-password"
                                labelHelp={helpPopover(
                                  'Initial password for all bootstrap users. Stored in plain text on the Tenant CR — workshop use only.',
                                  'Seed user password',
                                )}
                              >
                                <TextInput
                                  id="seed-password"
                                  type="password"
                                  value={spec.identity.seedPassword}
                                  onChange={(_e, v) => updateIdentity('seedPassword', v)}
                                  autoComplete="new-password"
                                />
                              </FormGroup>
                              <FormGroup fieldId="require-password-change">
                                <input
                                  id="require-password-change"
                                  type="checkbox"
                                  checked={spec.identity.requirePasswordChange}
                                  onChange={(e) =>
                                    updateIdentity('requirePasswordChange', e.target.checked)
                                  }
                                />
                                {' '}
                                <label htmlFor="require-password-change">
                                  Require password change on first login
                                </label>
                              </FormGroup>
                            </>
                          )}
                          <Content component="p" style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>
                            Workshop use only. Production tenants should federate real identities
                            (LDAP, corporate IdP) instead of bootstrap accounts.
                          </Content>
                        </GridItem>
                      )}
                    </>
                  )}
                  {spec.identity.provider === 'oidc' && (
                    <GridItem span={12}>
                      <FormGroup label="Issuer URL" fieldId="oidc-issuer" isRequired>
                        <TextInput
                          id="oidc-issuer"
                          placeholder="https://login.microsoftonline.com/.../v2.0"
                          value={spec.identity.oidcIssuer}
                          onChange={(_e, v) => updateIdentity('oidcIssuer', v)}
                          validated={fieldValid(submitted, spec.identity.oidcIssuer)}
                          isRequired
                        />
                      </FormGroup>
                    </GridItem>
                  )}
                </Grid>
                </>
              )}
            </FormSection>
          </ExpandableSection>

          {/* ── Advanced Settings ── */}
          <ExpandableSection
            toggleText="Advanced Settings"
            isExpanded={advancedExpanded}
            onToggle={(_e, expanded) => setAdvancedExpanded(expanded)}
          >
            <FormSection title="Cluster Set Management">
              {sectionDescription(
                'The namespace and its ClusterSetBinding control which managed clusters are visible to this tenant.',
              )}
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup
                    label="Cluster Groups Namespace"
                    fieldId="tenant-namespace"
                    labelHelp={helpPopover(
                      'Namespace where tenant resources are created. The associated ManagedClusterSetBinding determines which clusters this tenant can access.',
                      'Cluster Groups Namespace',
                    )}
                  >
                    <TextInput
                      id="tenant-namespace"
                      value={namespace}
                      placeholder={DEFAULT_NAMESPACE}
                      onChange={(_e, v) => setNamespace(v)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
            </FormSection>

            <FormSection title="Access Groups">
              {sectionDescription(
                'Identity provider groups used for role-based access. By default these are derived from the tenant name.',
              )}
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup
                    label="Admin Group"
                    fieldId="admin-group"
                    labelHelp={helpPopover(
                      'IdP group granted full admin access to this tenant\u2019s resources, VMs, and console views.',
                      'Admin Group',
                    )}
                  >
                    <TextInput
                      id="admin-group"
                      value={spec.adminGroup}
                      placeholder={derivedAdminGroup || 'e.g. mytenant-tenant-admin'}
                      onChange={(_e, v) => updateSpec('adminGroup', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={6}>
                  <FormGroup
                    label="User Group"
                    fieldId="user-group"
                    labelHelp={helpPopover(
                      'IdP group granted day-to-day user access to this tenant\u2019s resources and VMs.',
                      'User Group',
                    )}
                  >
                    <TextInput
                      id="user-group"
                      value={spec.userGroup}
                      placeholder={derivedUserGroup || 'e.g. mytenant-tenant-user'}
                      onChange={(_e, v) => updateSpec('userGroup', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={6}>
                  <FormGroup
                    label="Viewer Group"
                    fieldId="viewer-group"
                    labelHelp={helpPopover(
                      'IdP group granted read-only view access to this tenant\u2019s resources and VMs.',
                      'Viewer Group',
                    )}
                  >
                    <TextInput
                      id="viewer-group"
                      value={spec.viewerGroup}
                      placeholder={derivedViewerGroup || 'e.g. mytenant-tenant-viewer'}
                      onChange={(_e, v) => updateSpec('viewerGroup', v)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
            </FormSection>

            <FormSection title="BGP Advanced">
              {sectionDescription(
                'Override BGP peering defaults. These values are shared across tenants and rarely need changing.',
              )}
              <Grid hasGutter>
                <GridItem span={4}>
                  <FormGroup
                    label="VRF"
                    fieldId="vrf"
                    labelHelp={helpPopover(
                      'Virtual routing and forwarding instance for network isolation. Defaults to {tenant-name}-vrf.',
                      'VRF',
                    )}
                  >
                    <TextInput
                      id="vrf"
                      value={spec.network.metallb.vrf}
                      placeholder={derivedVrf || 'e.g. mytenant-vrf'}
                      onChange={(_e, v) => updateMetallb('vrf', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={4}>
                  <FormGroup
                    label="Cluster ASN"
                    fieldId="my-asn"
                    labelHelp={helpPopover(
                      'Cluster-side BGP autonomous system number. Shared across all tenants by default.',
                      'Cluster ASN',
                    )}
                  >
                    <TextInput
                      id="my-asn"
                      type="number"
                      value={spec.network.metallb.myASN}
                      onChange={(_e, v) => updateMetallb('myASN', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={4}>
                  <FormGroup
                    label="Peer ASN"
                    fieldId="peer-asn"
                    labelHelp={helpPopover(
                      'BGP autonomous system number of the upstream network provider router.',
                      'Peer ASN',
                    )}
                  >
                    <TextInput
                      id="peer-asn"
                      type="number"
                      value={spec.network.metallb.peerASN}
                      onChange={(_e, v) => updateMetallb('peerASN', v)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
            </FormSection>
          </ExpandableSection>

          {/* ── Actions ── */}
          <ActionGroup>
            <Button
              type="submit"
              variant="primary"
              isLoading={loading}
              isDisabled={loading}
            >
              Create
            </Button>
            <Button variant="link" onClick={() => history.goBack()}>
              Cancel
            </Button>
          </ActionGroup>
        </Form>
      </PageSection>
    </>
  );
};

export default CreateTenantPage;
