import * as React from 'react';
import { Link, useHistory } from 'react-router-dom';
import {
  PageSection,
  Title,
  Form,
  FormGroup,
  FormSection,
  FormGroupLabelHelp,
  TextInput,
  FormSelect,
  FormSelectOption,
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
  Spinner,
} from '@patternfly/react-core';
import { PlusCircleIcon, MinusCircleIcon } from '@patternfly/react-icons';
import { k8sCreate, k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';
import { TENANTS_ACM_SEARCH_PATH, TENANTS_LIST_PATH } from '../tenantRoutes';
import {
  DEFAULT_NAMESPACE,
  TenantFormMode,
  TenantResource,
  TenantSpecForm,
  WorkloadProfile,
} from '../tenantFormTypes';
import {
  buildTenantResource,
  defaultTenantSpec,
  derivedGroups,
  demoClientSecretForEnable,
  parseTenantResource,
  resolveTenantIdentity,
  specField,
  shouldExpandNetwork,
  upsertClientSecret,
  validateTenantForm,
} from '../tenantFormUtils';

const helpPopover = (content: string, label: string): React.ReactElement => (
  <Popover bodyContent={content}>
    <FormGroupLabelHelp aria-label={`More info for ${label}`} />
  </Popover>
);

const fieldValid = (submitted: boolean, value: string) =>
  submitted && !value.trim() ? ('error' as const) : ('default' as const);

const sectionDescription = (text: string): React.ReactElement => (
  <Content
    component="p"
    style={{ marginBottom: '0.5rem', color: 'var(--pf-t--global--text--color--subtle)' }}
  >
    {text}
  </Content>
);

export interface TenantFormInitialValues {
  name: string;
  namespace: string;
  spec: TenantSpecForm;
  originalWorkloadProfile: WorkloadProfile;
  originalIdentityEnabled: boolean;
}

export interface TenantFormPageProps {
  mode: TenantFormMode;
  existing?: TenantResource;
  /** Pre-parsed values for edit mode — ensures form state matches the loaded CR. */
  initial?: TenantFormInitialValues;
  /** When true, omit page title (e.g. embedded in a details tab). */
  embedded?: boolean;
}

const TenantFormPage: React.FC<TenantFormPageProps> = ({ mode, existing, initial, embedded }) => {
  const history = useHistory();
  const isEdit = mode === 'edit';

  const [name, setName] = React.useState('');
  const [namespace, setNamespace] = React.useState(DEFAULT_NAMESPACE);
  const [spec, setSpec] = React.useState<TenantSpecForm>(() => defaultTenantSpec());
  const [originalWorkloadProfile, setOriginalWorkloadProfile] = React.useState<WorkloadProfile | null>(
    null,
  );
  const [originalIdentityEnabled, setOriginalIdentityEnabled] = React.useState(false);
  const [networkExpanded, setNetworkExpanded] = React.useState(false);
  const [identityExpanded, setIdentityExpanded] = React.useState(false);
  const [advancedExpanded, setAdvancedExpanded] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [identitySecretUnchanged, setIdentitySecretUnchanged] = React.useState(isEdit);
  const [formReady, setFormReady] = React.useState(!isEdit);

  const hydrateKey = isEdit
    ? `${existing?.metadata?.uid ?? ''}:${existing?.metadata?.resourceVersion ?? ''}`
    : 'create';

  React.useLayoutEffect(() => {
    if (!isEdit) {
      setFormReady(true);
      return;
    }
    if (!existing?.metadata?.name || !existing?.spec) {
      setFormReady(false);
      return;
    }
    const parsed = parseTenantResource(existing);
    setName(parsed.name);
    setNamespace(parsed.namespace);
    setSpec(parsed.spec);
    setOriginalWorkloadProfile(parsed.originalWorkloadProfile);
    setOriginalIdentityEnabled(parsed.originalIdentityEnabled);
    setNetworkExpanded(shouldExpandNetwork(parsed.spec));
    setIdentityExpanded(parsed.spec.identity.enabled);
    setIdentitySecretUnchanged(true);
    setSubmitted(false);
    setError('');
    setFormReady(true);
  }, [isEdit, hydrateKey, existing]);

  const { tenantName, tenantNamespace, workloadNamespace } = resolveTenantIdentity({
    name,
    namespace,
    spec,
    existing,
    initial,
  });

  const derived = derivedGroups(tenantName);
  const effectiveAdminGroup = spec.adminGroup.trim() || derived.admin;
  const effectiveUserGroup = spec.userGroup.trim() || derived.user;
  const effectiveViewerGroup = spec.viewerGroup.trim() || derived.viewer;
  const effectiveVrf = spec.network.metallb.vrf.trim() || derived.vrf;
  const effectiveNamespace = tenantNamespace;
  const effectiveWorkloadNamespace = workloadNamespace;
  const profileChanged =
    isEdit && originalWorkloadProfile !== null && spec.workloadProfile !== originalWorkloadProfile;
  const hadContainers =
    originalWorkloadProfile === 'containers' || originalWorkloadProfile === 'both';
  const hadVms = originalWorkloadProfile === 'vms' || originalWorkloadProfile === 'both';
  const wantsContainers =
    spec.workloadProfile === 'containers' || spec.workloadProfile === 'both';
  const wantsVms = spec.workloadProfile === 'vms' || spec.workloadProfile === 'both';
  const profileRemovesResources =
    profileChanged && ((hadContainers && !wantsContainers) || (hadVms && !wantsVms));
  const profileAddsResources =
    profileChanged && ((!hadContainers && wantsContainers) || (!hadVms && wantsVms));
  const ssoDisabled =
    isEdit && originalIdentityEnabled && !spec.identity.enabled;

  const updateSpec = <K extends keyof TenantSpecForm>(key: K, val: TenantSpecForm[K]) =>
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

  const updateIdentity = (key: keyof TenantSpecForm['identity'], val: string | boolean) =>
    setSpec((prev) => ({ ...prev, identity: { ...prev.identity, [key]: val } }));

  const generateClientSecret = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    setIdentitySecretUnchanged(false);
    updateIdentity('clientSecret', secret);
  };

  const enableIdentity = (enabled: boolean) => {
    updateIdentity('enabled', enabled);
    if (enabled && !spec.identity.clientSecret.trim() && !isEdit) {
      updateIdentity('clientSecret', demoClientSecretForEnable());
    }
    if (enabled) {
      setIdentityExpanded(true);
    }
  };

  const handleClientSecretChange = (val: string) => {
    setIdentitySecretUnchanged(false);
    updateIdentity('clientSecret', val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError('');
    const errs = validateTenantForm({
      mode,
      name: tenantName,
      effectiveAdminGroup,
      effectiveUserGroup,
      spec,
      identitySecretUnchanged,
      existing,
    });
    if (errs.length) {
      setError(errs.join(' '));
      return;
    }
    setLoading(true);
    try {
      const adminGroup = effectiveAdminGroup.trim() || specField(existing?.spec?.adminGroup) || '';
      const userGroup = effectiveUserGroup.trim() || specField(existing?.spec?.userGroup) || '';
      const viewerGroup =
        effectiveViewerGroup.trim() || specField(existing?.spec?.viewerGroup) || '';
      const resource = buildTenantResource({
        name: tenantName,
        namespace: effectiveNamespace,
        spec,
        effectiveAdminGroup: adminGroup,
        effectiveUserGroup: userGroup,
        effectiveViewerGroup: viewerGroup,
        effectiveVrf,
        existing,
      });
      if (spec.identity.enabled) {
        const shouldUpdateSecret =
          !isEdit || (!identitySecretUnchanged && spec.identity.clientSecret.trim());
        if (shouldUpdateSecret) {
          await upsertClientSecret(tenantName, spec.identity.clientSecret.trim());
        }
      }
      if (isEdit) {
        await k8sUpdate({ model: TenantModel, data: resource });
      } else {
        await k8sCreate({ model: TenantModel, data: resource });
      }
      history.push(TENANTS_LIST_PATH);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!embedded && (
        <PageSection variant="default">
          <Button
            variant="link"
            component={(props) => <Link {...props} to={TENANTS_LIST_PATH} />}
            style={{ paddingLeft: 0, marginBottom: '0.5rem' }}
          >
            Back to Tenants
          </Button>
          <Title headingLevel="h1">
            {isEdit ? `Edit Tenant: ${tenantName || '…'}` : 'Create Tenant'}
          </Title>
        </PageSection>
      )}
      {isEdit && !formReady ? (
        <PageSection>
          <Spinner size="lg" />
        </PageSection>
      ) : (
      <PageSection>
        {!embedded && (
          <Alert variant="info" isInline title="Hub control configuration" style={{ marginBottom: '1rem' }}>
            This form creates or updates Tenant CRs on the hub ({DEFAULT_NAMESPACE} namespace) only.
            Tenants on managed clusters are provisioned by policy and cannot be edited here.{' '}
            <Button
              variant="link"
              isInline
              component={(props) => <Link {...props} to={TENANTS_ACM_SEARCH_PATH} />}
            >
              Search all Tenant resources (fleet-wide)
            </Button>
          </Alert>
        )}
        {isEdit && (
          <Alert variant="info" isInline title="Editing an existing tenant" style={{ marginBottom: '1rem' }}>
            Changes apply on the next policy cycle. Tenant name and workload namespace cannot be
            changed here — they are fixed after provisioning.
          </Alert>
        )}
        {profileChanged && (
          <Alert variant="warning" isInline title="Workload profile changed" style={{ marginBottom: '1rem' }}>
            {profileRemovesResources && (
              <>
                Policies do not remove resources already provisioned under the previous profile.
                After saving, open{' '}
                <Button
                  variant="link"
                  isInline
                  component={(props) => <Link {...props} to={TENANTS_ACM_SEARCH_PATH} />}
                >
                  Search all Tenant resources
                </Button>
                , find stale namespaces and related objects on affected clusters, and delete
                them manually.
              </>
            )}
            {profileRemovesResources && profileAddsResources && ' '}
            {profileAddsResources && (
              <>
                {profileRemovesResources
                  ? 'New resources for the expanded profile are provisioned automatically on the next policy cycle on clusters with matching capability labels (for example container resources on capability-container spokes). The Tenant CR and workload namespace name stay the same — this is not a new tenant.'
                  : 'New resources for this profile are provisioned automatically on the next policy cycle on clusters with matching capability labels. Existing resources from the previous profile are not removed — delete those manually via fleet search if needed.'}
              </>
            )}
            {!profileRemovesResources && !profileAddsResources && (
              <>Review spoke clusters after saving.</>
            )}
          </Alert>
        )}
        {ssoDisabled && (
          <Alert variant="warning" isInline title="Console SSO will be disabled" style={{ marginBottom: '1rem' }}>
            After saving, the identity reconciler removes the OpenShift OAuth IdP and client secret
            on the next cycle (and the platform-managed Keycloak realm when applicable). To turn SSO
            back on, supply a new client secret — a fresh IdP is registered without clashing with
            the old one.
          </Alert>
        )}
        {error && (
          <Alert variant="danger" title="Error" isInline style={{ marginBottom: '1rem' }}>
            {error}
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          <FormSection title="Tenant Details">
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup label="Tenant Name" isRequired fieldId="tenant-name">
                  {isEdit ? (
                    <TextInput
                      id="tenant-name"
                      value={tenantName}
                      readOnlyVariant="default"
                      readOnly
                      isRequired
                    />
                  ) : (
                    <TextInput
                      id="tenant-name"
                      value={name}
                      onChange={(_e, v) => setName(v)}
                      validated={fieldValid(submitted, name)}
                      isRequired
                    />
                  )}
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
                    'Namespace on managed clusters for this tenant. Fixed after the tenant is created.',
                    'Workload namespace',
                  )}
                >
                  <TextInput
                    id="workload-namespace"
                    placeholder={tenantName || 'same as tenant name'}
                    value={isEdit ? effectiveWorkloadNamespace : spec.workloadNamespace}
                    onChange={(_e, v) => updateSpec('workloadNamespace', v)}
                    readOnlyVariant={isEdit ? 'default' : undefined}
                    readOnly={isEdit}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12}>
                <Content
                  component="p"
                  style={{ fontSize: '0.875rem', color: 'var(--pf-t--global--text--color--subtle)' }}
                >
                  Managed cluster namespace: <strong>{effectiveWorkloadNamespace || '—'}</strong>
                  {' '}
                  (label <code>tenant={tenantName || '…'}</code> on provisioned resources)
                </Content>
              </GridItem>
              <GridItem span={6}>
                <FormGroup
                  label="Workload profile"
                  fieldId="workload-profile"
                  labelHelp={helpPopover(
                    'Controls which ACM policies provision resources on capable clusters. vms — VM placement (AAQ, KubeVirt RBAC). containers — managed placement (ResourceQuota, no AAQ). both — both policy sets. Narrowing the profile (for example both → vms) does not delete existing resources — remove them manually via fleet search. Widening the profile (for example vms → both) adds new resources on the next policy cycle where cluster capability labels match; the workload namespace name is unchanged.',
                    'Workload profile',
                  )}
                >
                  <FormSelect
                    id="workload-profile"
                    value={spec.workloadProfile}
                    onChange={(_e, v) => updateSpec('workloadProfile', v as WorkloadProfile)}
                  >
                    <FormSelectOption value="vms" label="VMs (Fleet Virtualization)" />
                    <FormSelectOption value="containers" label="Containers" />
                    <FormSelectOption value="both" label="Both" />
                  </FormSelect>
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

          <FormSection title="Tenant Resource Quotas" titleElement="h2">
            {sectionDescription(
              'Total resource budget for this tenant — VMs, services, migration pods, and all other workloads.',
            )}
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup label="CPU" fieldId="rq-cpu">
                  <TextInput
                    id="rq-cpu"
                    value={spec.resourceQuota.cpu}
                    onChange={(_e, v) => updateQuota('cpu', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label="Memory" fieldId="rq-memory">
                  <TextInput
                    id="rq-memory"
                    value={spec.resourceQuota.memory}
                    onChange={(_e, v) => updateQuota('memory', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label="Pods" fieldId="rq-pods">
                  <TextInput
                    id="rq-pods"
                    value={spec.resourceQuota.pods}
                    onChange={(_e, v) => updateQuota('pods', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label="Storage" fieldId="rq-storage">
                  <TextInput
                    id="rq-storage"
                    value={spec.resourceQuota.storage}
                    onChange={(_e, v) => updateQuota('storage', v)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          <FormSection title="Virtual Machine Quota" titleElement="h2">
            {sectionDescription(
              'Combined VM budget — a subset of the tenant quota above, reserving headroom for non-VM pods.',
            )}
            <Grid hasGutter>
              <GridItem span={6}>
                <FormGroup label="CPU" fieldId="vm-cpu">
                  <TextInput
                    id="vm-cpu"
                    value={spec.vmQuota.cpu}
                    onChange={(_e, v) => updateVmQuota('cpu', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={6}>
                <FormGroup label="Memory" fieldId="vm-memory">
                  <TextInput
                    id="vm-memory"
                    value={spec.vmQuota.memory}
                    onChange={(_e, v) => updateVmQuota('memory', v)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          <FormSection title="Maximum Virtual Machine Size" titleElement="h2">
            {sectionDescription('Largest single VM permitted in this tenant.')}
            <Grid hasGutter>
              <GridItem span={4}>
                <FormGroup label="CPU Limit" fieldId="lr-cpu">
                  <TextInput
                    id="lr-cpu"
                    value={spec.limitRange.maxCpu}
                    onChange={(_e, v) => updateLimit('maxCpu', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup label="Memory Limit" fieldId="lr-memory">
                  <TextInput
                    id="lr-memory"
                    value={spec.limitRange.maxMemory}
                    onChange={(_e, v) => updateLimit('maxMemory', v)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={4}>
                <FormGroup label="Storage Limit" fieldId="lr-storage">
                  <TextInput
                    id="lr-storage"
                    value={spec.limitRange.maxStorage}
                    onChange={(_e, v) => updateLimit('maxStorage', v)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>
          </FormSection>

          <ExpandableSection
            toggleText="Networking"
            isExpanded={networkExpanded}
            onToggle={(_e, expanded) => setNetworkExpanded(expanded)}
          >
            <FormSection title="Isolated Private Network">
              <FormGroup label="Network CIDR" fieldId="udn-subnet">
                <TextInput
                  id="udn-subnet"
                  placeholder="e.g. 10.128.0.0/16"
                  value={spec.network.udnSubnet}
                  onChange={(_e, v) => updateNetwork('udnSubnet', v)}
                />
              </FormGroup>
            </FormSection>
            <FormSection title="Service Provider BGP Peering">
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup label="Peer Address" fieldId="peer-address">
                    <TextInput
                      id="peer-address"
                      placeholder="e.g. 192.168.1.1"
                      value={spec.network.metallb.peerAddress}
                      onChange={(_e, v) => updateMetallb('peerAddress', v)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
              <FormGroup label="Public IP Ranges" fieldId="addresses">
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

          <ExpandableSection
            toggleText="Console login (optional)"
            isExpanded={identityExpanded}
            onToggle={(_e, expanded) => setIdentityExpanded(expanded)}
          >
            <FormSection title="OpenShift OAuth identity provider">
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
                    <FormGroup label="Client secret" fieldId="client-secret" isRequired={!isEdit}>
                      <InputGroup>
                        <InputGroupItem isFill>
                          <TextInput
                            id="client-secret"
                            type="password"
                            placeholder={
                              isEdit
                                ? 'Leave blank to keep existing secret'
                                : 'Demo default pre-filled when SSO is enabled'
                            }
                            value={spec.identity.clientSecret}
                            onChange={(_e, v) => handleClientSecretChange(v)}
                            validated={
                              !isEdit || !identitySecretUnchanged
                                ? fieldValid(submitted, spec.identity.clientSecret)
                                : 'default'
                            }
                            isRequired={!isEdit}
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
                    <FormGroup label="Console IdP name" fieldId="console-idp-name">
                      <TextInput
                        id="console-idp-name"
                        placeholder={tenantName ? `${tenantName}-idp` : 'tenant-idp'}
                        value={spec.identity.consoleLoginName}
                        onChange={(_e, v) => updateIdentity('consoleLoginName', v)}
                      />
                    </FormGroup>
                  </GridItem>
                  {spec.identity.provider === 'keycloak' && (
                    <>
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
                              if (!e.target.checked) updateIdentity('seedUsers', false);
                            }}
                          />
                          {' '}
                          <label htmlFor="manage-realm">
                            Create realm in Keycloak (KeycloakRealmImport)
                          </label>
                        </FormGroup>
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
                              <FormGroup label="Seed user password" fieldId="seed-password">
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
              )}
            </FormSection>
          </ExpandableSection>

          <ExpandableSection
            toggleText="Advanced Settings"
            isExpanded={advancedExpanded}
            onToggle={(_e, expanded) => setAdvancedExpanded(expanded)}
          >
            <FormSection title="Cluster Set Management">
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup label="Cluster Groups Namespace" fieldId="tenant-namespace">
                    <TextInput
                      id="tenant-namespace"
                      value={isEdit ? effectiveNamespace : namespace}
                      placeholder={DEFAULT_NAMESPACE}
                      onChange={(_e, v) => setNamespace(v)}
                      readOnlyVariant={isEdit ? 'default' : undefined}
                      readOnly={isEdit}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
            </FormSection>
            <FormSection title="Access Groups">
              <Grid hasGutter>
                <GridItem span={6}>
                  <FormGroup label="Admin Group" fieldId="admin-group">
                    <TextInput
                      id="admin-group"
                      value={spec.adminGroup}
                      placeholder={derived.admin || 'e.g. mytenant-tenant-admin'}
                      onChange={(_e, v) => updateSpec('adminGroup', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={6}>
                  <FormGroup label="User Group" fieldId="user-group">
                    <TextInput
                      id="user-group"
                      value={spec.userGroup}
                      placeholder={derived.user || 'e.g. mytenant-tenant-user'}
                      onChange={(_e, v) => updateSpec('userGroup', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={6}>
                  <FormGroup label="Viewer Group" fieldId="viewer-group">
                    <TextInput
                      id="viewer-group"
                      value={spec.viewerGroup}
                      placeholder={derived.viewer || 'e.g. mytenant-tenant-viewer'}
                      onChange={(_e, v) => updateSpec('viewerGroup', v)}
                    />
                  </FormGroup>
                </GridItem>
              </Grid>
            </FormSection>
            <FormSection title="BGP Advanced">
              <Grid hasGutter>
                <GridItem span={4}>
                  <FormGroup label="VRF" fieldId="vrf">
                    <TextInput
                      id="vrf"
                      value={spec.network.metallb.vrf}
                      placeholder={derived.vrf || 'e.g. mytenant-vrf'}
                      onChange={(_e, v) => updateMetallb('vrf', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={4}>
                  <FormGroup label="Cluster ASN" fieldId="my-asn">
                    <TextInput
                      id="my-asn"
                      type="number"
                      value={spec.network.metallb.myASN}
                      onChange={(_e, v) => updateMetallb('myASN', v)}
                    />
                  </FormGroup>
                </GridItem>
                <GridItem span={4}>
                  <FormGroup label="Peer ASN" fieldId="peer-asn">
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

          <ActionGroup>
            <Button type="submit" variant="primary" isLoading={loading} isDisabled={loading}>
              {isEdit ? 'Save changes' : 'Create'}
            </Button>
            <Button variant="link" onClick={() => history.push(TENANTS_LIST_PATH)}>
              Cancel
            </Button>
          </ActionGroup>
        </Form>
      </PageSection>
      )}
    </>
  );
};

export default TenantFormPage;
