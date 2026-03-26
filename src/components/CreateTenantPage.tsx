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
import { k8sCreate } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';

const DEFAULT_NAMESPACE = 'tenancies';
const DEFAULT_MY_ASN = '64500';

interface MetallbForm {
  myASN: string;
  peerASN: string;
  peerAddress: string;
  vrf: string;
  addresses: string[];
}

interface TenantSpec {
  displayName: string;
  owner: string;
  adminGroup: string;
  operatorGroup: string;
  resourceQuota: { cpu: string; memory: string; pods: string; storage: string };
  vmQuota: { cpu: string; memory: string };
  limitRange: { maxCpu: string; maxMemory: string; maxStorage: string };
  network: { udnSubnet: string; metallb: MetallbForm };
}

const defaults: TenantSpec = {
  displayName: '',
  owner: '',
  adminGroup: '',
  operatorGroup: '',
  resourceQuota: { cpu: '86', memory: '332Gi', pods: '15', storage: '2000Gi' },
  vmQuota: { cpu: '80', memory: '320Gi' },
  limitRange: { maxCpu: '32', maxMemory: '128Gi', maxStorage: '1Ti' },
  network: {
    udnSubnet: '',
    metallb: { myASN: DEFAULT_MY_ASN, peerASN: '', peerAddress: '', vrf: '', addresses: [] },
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
  const [advancedExpanded, setAdvancedExpanded] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const derivedAdminGroup = name.trim() ? `${name.trim()}-tenant-admin` : '';
  const derivedUserGroup = name.trim() ? `${name.trim()}-tenant-user` : '';
  const derivedVrf = name.trim() ? `${name.trim()}-vrf` : '';

  const effectiveAdminGroup = spec.adminGroup.trim() || derivedAdminGroup;
  const effectiveUserGroup = spec.operatorGroup.trim() || derivedUserGroup;
  const effectiveVrf = spec.network.metallb.vrf.trim() || derivedVrf;
  const effectiveNamespace = namespace.trim() || DEFAULT_NAMESPACE;

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

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Tenant name is required.');
    if (!effectiveAdminGroup) errs.push('Admin Group is required.');
    if (!effectiveUserGroup) errs.push('User Group is required.');
    return errs;
  };

  const buildResource = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant: any = {
      apiVersion: `${TenantModel.apiGroup}/${TenantModel.apiVersion}`,
      kind: TenantModel.kind,
      metadata: { name: name.trim(), namespace: effectiveNamespace },
      spec: {
        adminGroup: effectiveAdminGroup,
        operatorGroup: effectiveUserGroup,
        resourceQuota: { ...spec.resourceQuota },
        vmQuota: { ...spec.vmQuota },
        limitRange: { ...spec.limitRange },
      },
    };
    if (spec.displayName.trim()) tenant.spec.displayName = spec.displayName.trim();
    if (spec.owner.trim()) tenant.spec.owner = spec.owner.trim();

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
    return tenant;
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
                    fieldId="operator-group"
                    labelHelp={helpPopover(
                      'IdP group granted day-to-day user access to this tenant\u2019s resources and VMs.',
                      'User Group',
                    )}
                  >
                    <TextInput
                      id="operator-group"
                      value={spec.operatorGroup}
                      placeholder={derivedUserGroup || 'e.g. mytenant-tenant-user'}
                      onChange={(_e, v) => updateSpec('operatorGroup', v)}
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
