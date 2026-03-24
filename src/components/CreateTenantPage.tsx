import * as React from 'react';
import { useHistory } from 'react-router-dom';
import {
  Page,
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
} from '@patternfly/react-core';
import { PlusCircleIcon, MinusCircleIcon } from '@patternfly/react-icons';
import { k8sCreate } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';

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
    metallb: { myASN: '64500', peerASN: '', peerAddress: '', vrf: '', addresses: [] },
  },
};

const helpPopover = (content: string, label: string): React.ReactElement => (
  <Popover bodyContent={content}>
    <FormGroupLabelHelp aria-label={`More info for ${label}`} />
  </Popover>
);

const fieldValid = (submitted: boolean, value: string) =>
  submitted && !value.trim() ? 'error' as const : 'default' as const;

const CreateTenantPage: React.FC = () => {
  const history = useHistory();
  const [name, setName] = React.useState('');
  const [namespace, setNamespace] = React.useState('');
  const [spec, setSpec] = React.useState<TenantSpec>({ ...defaults });
  const [networkExpanded, setNetworkExpanded] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

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
    if (!name.trim()) errs.push('Resource name is required.');
    if (!namespace.trim()) errs.push('Namespace is required.');
    if (!spec.adminGroup.trim()) errs.push('Admin Group is required.');
    if (!spec.operatorGroup.trim()) errs.push('Operator Group is required.');
    return errs;
  };

  const buildResource = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenant: any = {
      apiVersion: `${TenantModel.apiGroup}/${TenantModel.apiVersion}`,
      kind: TenantModel.kind,
      metadata: { name: name.trim(), namespace: namespace.trim() },
      spec: {
        adminGroup: spec.adminGroup.trim(),
        operatorGroup: spec.operatorGroup.trim(),
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
    const hasMetallb = mb.peerASN || mb.peerAddress || mb.vrf || mb.addresses.some((a) => a.trim());
    if (hasMetallb) {
      const metallb: Record<string, unknown> = {
        myASN: parseInt(mb.myASN, 10) || 64500,
      };
      if (mb.peerASN) metallb.peerASN = parseInt(mb.peerASN, 10);
      if (mb.peerAddress.trim()) metallb.peerAddress = mb.peerAddress.trim();
      if (mb.vrf.trim()) metallb.vrf = mb.vrf.trim();
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
        `/k8s/ns/${namespace.trim()}/${TenantModel.apiGroup}~${TenantModel.apiVersion}~${TenantModel.kind}/${name.trim()}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
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
          {/* ── Metadata ── */}
          <FormSection title="Metadata">
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup label="Name" isRequired fieldId="tenant-name">
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
                <FormGroup label="Namespace" isRequired fieldId="tenant-namespace">
                  <TextInput
                    id="tenant-namespace"
                    value={namespace}
                    onChange={(_e, v) => setNamespace(v)}
                    validated={fieldValid(submitted, namespace)}
                    isRequired
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          {/* ── Identity & RBAC ── */}
          <FormSection title="Identity &amp; RBAC">
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup
                  label="Display Name"
                  fieldId="display-name"
                  labelHelp={helpPopover(
                    'Human-readable tenant name shown in the console.',
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
              <GridItem span={6}>
                <FormGroup
                  label="Admin Group"
                  isRequired
                  fieldId="admin-group"
                  labelHelp={helpPopover(
                    'IdP group granted admin in the tenant namespace, kubevirt.io:admin on VMs, and acm-vm-fleet:admin on the hub console.',
                    'Admin Group',
                  )}
                >
                  <TextInput
                    id="admin-group"
                    value={spec.adminGroup}
                    onChange={(_e, v) => updateSpec('adminGroup', v)}
                    validated={fieldValid(submitted, spec.adminGroup)}
                    isRequired
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Operator Group"
                  isRequired
                  fieldId="operator-group"
                  labelHelp={helpPopover(
                    'IdP group granted edit in the tenant namespace, kubevirt.io:edit on VMs, and acm-vm-fleet:view on the hub console.',
                    'Operator Group',
                  )}
                >
                  <TextInput
                    id="operator-group"
                    value={spec.operatorGroup}
                    onChange={(_e, v) => updateSpec('operatorGroup', v)}
                    validated={fieldValid(submitted, spec.operatorGroup)}
                    isRequired
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          {/* ── Resource Quota ── */}
          <FormSection
            title="Resource Quota"
            titleElement="h2"
          >
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup
                  label="CPU"
                  fieldId="rq-cpu"
                  labelHelp={helpPopover(
                    'Total CPU requests allowed for all pods.',
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
                    'Total memory requests allowed for all pods.',
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
                    'Maximum pod count in the namespace.',
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
                    'Total PVC storage requests allowed.',
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

          {/* ── VM Quota (AAQ) ── */}
          <FormSection
            title="VM Quota (AAQ)"
            titleElement="h2"
          >
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup
                  label="CPU"
                  fieldId="vm-cpu"
                  labelHelp={helpPopover(
                    'Aggregate vCPU across all VMIs.',
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
                    'Aggregate memory across all VMIs.',
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

          {/* ── Limit Range ── */}
          <FormSection
            title="Limit Range"
            titleElement="h2"
          >
            <Grid hasGutter>
              <GridItem span={4}>
                <FormGroup
                  label="Max CPU"
                  fieldId="lr-cpu"
                  labelHelp={helpPopover(
                    'Maximum CPU any single container may request.',
                    'Max CPU',
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
                  label="Max Memory"
                  fieldId="lr-memory"
                  labelHelp={helpPopover(
                    'Maximum memory any single container may request.',
                    'Max Memory',
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
                  label="Max Storage"
                  fieldId="lr-storage"
                  labelHelp={helpPopover(
                    'Maximum size of any single PVC.',
                    'Max Storage',
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

          {/* ── Advanced Networking ── */}
          <ExpandableSection
            toggleText={networkExpanded ? 'Advanced Networking' : 'Advanced Networking'}
            isExpanded={networkExpanded}
            onToggle={(_e, expanded) => setNetworkExpanded(expanded)}
          >
            <FormSection title="User Defined Network">
              <FormGroup
                label="UDN Subnet"
                fieldId="udn-subnet"
                labelHelp={helpPopover(
                  'CIDR for the tenant\'s primary UDN. May overlap other tenants — each UDN is a fully isolated logical network.',
                  'UDN Subnet',
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

            <FormSection title="MetalLB BGP">
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup
                    label="My ASN"
                    fieldId="my-asn"
                    labelHelp={helpPopover(
                      'Cluster-side ASN (shared across tenants by default).',
                      'My ASN',
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
                <GridItem span={6}>
                  <FormGroup
                    label="Peer ASN"
                    fieldId="peer-asn"
                    labelHelp={helpPopover(
                      'ASN of the upstream BGP router for this tenant.',
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
                <GridItem span={6}>
                  <FormGroup
                    label="Peer Address"
                    fieldId="peer-address"
                    labelHelp={helpPopover(
                      'IP address of the upstream BGP peer.',
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
                <GridItem span={6}>
                  <FormGroup
                    label="VRF"
                    fieldId="vrf"
                    labelHelp={helpPopover(
                      'Dedicated VRF name (e.g. starwars-vrf).',
                      'VRF',
                    )}
                  >
                    <TextInput
                      id="vrf"
                      value={spec.network.metallb.vrf}
                      onChange={(_e, v) => updateMetallb('vrf', v)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>

              <FormGroup
                label="Addresses"
                fieldId="addresses"
                labelHelp={helpPopover(
                  'External IP ranges assigned to this tenant\'s services.',
                  'Addresses',
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
                  Add address range
                </Button>
              </FormGroup>
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
    </Page>
  );
};

export default CreateTenantPage;
