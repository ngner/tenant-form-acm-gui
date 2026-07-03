import { k8sCreate, k8sGet, k8sUpdate } from '@openshift-console/dynamic-plugin-sdk';
import {
  DEFAULT_MY_ASN,
  DEFAULT_NAMESPACE,
  DEMO_CLIENT_SECRET,
  IdentityForm,
  MetallbForm,
  TenantFormMode,
  TenantResource,
  TenantSpecForm,
  WorkloadProfile,
} from './tenantFormTypes';

export const SecretModel = {
  apiVersion: 'v1',
  kind: 'Secret',
  plural: 'secrets',
  namespaced: true,
  abbr: 'SEC',
  label: 'Secret',
  labelPlural: 'Secrets',
};

export const defaultTenantSpec = (): TenantSpecForm => ({
  displayName: '',
  owner: '',
  workloadNamespace: '',
  workloadProfile: 'vms',
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
});

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export const specField = str;

const parseMetallb = (raw: Record<string, unknown> | undefined): MetallbForm => {
  if (!raw) {
    return defaultTenantSpec().network.metallb;
  }
  const addresses = Array.isArray(raw.addresses)
    ? raw.addresses.map((a) => str(a)).filter(Boolean)
    : [];
  return {
    myASN: raw.myASN !== undefined ? str(raw.myASN) : DEFAULT_MY_ASN,
    peerASN: raw.peerASN !== undefined ? str(raw.peerASN) : '',
    peerAddress: str(raw.peerAddress),
    vrf: str(raw.vrf),
    addresses: addresses.length ? addresses : [''],
  };
};

const parseIdentity = (raw: Record<string, unknown> | undefined): IdentityForm => {
  const base = defaultTenantSpec().identity;
  if (!raw?.enabled) {
    return { ...base, enabled: false, clientSecret: '' };
  }
  const keycloak = (raw.keycloak ?? {}) as Record<string, unknown>;
  const oidc = (raw.oidc ?? {}) as Record<string, unknown>;
  return {
    enabled: true,
    provider: raw.provider === 'oidc' ? 'oidc' : 'keycloak',
    clientSecret: '',
    consoleLoginName: str(raw.consoleLoginName),
    oidcIssuer: str(oidc.issuer),
    keycloakNamespace: str(keycloak.namespace) || 'keycloak-system',
    keycloakInstance: str(keycloak.instanceName) || 'main',
    manageRealm: Boolean(keycloak.manageRealm),
    seedUsers: Boolean(keycloak.seedUsers),
    seedPassword: str(keycloak.seedPassword) || 'password',
    requirePasswordChange: Boolean(keycloak.requirePasswordChange),
  };
};

/** Map a Tenant CR from the API into form state. */
export function parseTenantResource(tenant: TenantResource): {
  name: string;
  namespace: string;
  spec: TenantSpecForm;
  originalWorkloadProfile: WorkloadProfile;
} {
  const name = tenant.metadata.name;
  const namespace = tenant.metadata.namespace || DEFAULT_NAMESPACE;
  const s = tenant.spec ?? {};
  const network = (s.network ?? {}) as Record<string, unknown>;
  const workloadProfile = (s.workloadProfile as WorkloadProfile) || 'vms';
  const workloadNs = str(s.workloadNamespace);
  const rq = (s.resourceQuota ?? {}) as Record<string, string>;
  const vmq = (s.vmQuota ?? {}) as Record<string, string>;
  const lr = (s.limitRange ?? {}) as Record<string, string>;

  const spec: TenantSpecForm = {
    displayName: str(s.displayName),
    owner: str(s.owner),
    workloadNamespace: workloadNs && workloadNs !== name ? workloadNs : '',
    workloadProfile,
    adminGroup: str(s.adminGroup),
    userGroup: str(s.userGroup),
    viewerGroup: str(s.viewerGroup),
    resourceQuota: {
      cpu: rq.cpu ?? '86',
      memory: rq.memory ?? '332Gi',
      pods: rq.pods ?? '15',
      storage: rq.storage ?? '2000Gi',
    },
    vmQuota: {
      cpu: vmq.cpu ?? '80',
      memory: vmq.memory ?? '320Gi',
    },
    limitRange: {
      maxCpu: lr.maxCpu ?? '32',
      maxMemory: lr.maxMemory ?? '128Gi',
      maxStorage: lr.maxStorage ?? '1Ti',
    },
    network: {
      udnSubnet: str(network.udnSubnet),
      metallb: parseMetallb(network.metallb as Record<string, unknown>),
    },
    identity: parseIdentity(s.identity as Record<string, unknown>),
  };

  return { name, namespace, spec, originalWorkloadProfile: workloadProfile };
}

export function derivedGroups(name: string) {
  const n = name.trim();
  return {
    admin: n ? `${n}-tenant-admin` : '',
    user: n ? `${n}-tenant-user` : '',
    viewer: n ? `${n}-tenant-viewer` : '',
    vrf: n ? `${n}-vrf` : '',
  };
}

export function validateTenantForm(params: {
  mode: TenantFormMode;
  name: string;
  effectiveAdminGroup: string;
  effectiveUserGroup: string;
  spec: TenantSpecForm;
  identitySecretUnchanged: boolean;
  existing?: TenantResource;
}): string[] {
  const {
    mode,
    name,
    effectiveAdminGroup,
    effectiveUserGroup,
    spec,
    identitySecretUnchanged,
    existing,
  } = params;
  const resolvedName = name.trim() || existing?.metadata?.name?.trim() || '';
  const resolvedAdmin =
    effectiveAdminGroup.trim() || str(existing?.spec?.adminGroup) || '';
  const resolvedUser = effectiveUserGroup.trim() || str(existing?.spec?.userGroup) || '';
  const errs: string[] = [];
  if (!resolvedName) errs.push('Tenant name is required.');
  if (!resolvedAdmin) errs.push('Admin Group is required.');
  if (!resolvedUser) errs.push('User Group is required.');
  if (spec.identity.enabled) {
    const secretRequired =
      mode === 'create' || (mode === 'edit' && !identitySecretUnchanged);
    if (secretRequired && !spec.identity.clientSecret.trim()) {
      errs.push('Client secret is required when console SSO is enabled.');
    }
    if (spec.identity.provider === 'oidc' && !spec.identity.oidcIssuer.trim()) {
      errs.push('Issuer URL is required for external OIDC.');
    }
  }
  return errs;
}

export function buildTenantResource(params: {
  name: string;
  namespace: string;
  spec: TenantSpecForm;
  effectiveAdminGroup: string;
  effectiveUserGroup: string;
  effectiveViewerGroup: string;
  effectiveVrf: string;
  existing?: TenantResource;
}): Record<string, unknown> {
  const {
    name,
    namespace,
    spec,
    effectiveAdminGroup,
    effectiveUserGroup,
    effectiveViewerGroup,
    effectiveVrf,
    existing,
  } = params;
  const tenantName = name.trim();

  const tenant: Record<string, unknown> = {
    apiVersion: 'dusty-seahorse.io/v1alpha1',
    kind: 'Tenant',
    metadata: {
      ...(existing?.metadata ?? {}),
      name: tenantName,
      namespace: namespace.trim() || DEFAULT_NAMESPACE,
      labels: { ...(existing?.metadata?.labels ?? {}), tenant: tenantName },
    },
    spec: {
      adminGroup: effectiveAdminGroup,
      userGroup: effectiveUserGroup,
      viewerGroup: effectiveViewerGroup,
      workloadProfile: spec.workloadProfile,
      resourceQuota: { ...spec.resourceQuota },
      vmQuota: { ...spec.vmQuota },
      limitRange: { ...spec.limitRange },
    },
  };

  if (spec.displayName.trim()) {
    (tenant.spec as Record<string, unknown>).displayName = spec.displayName.trim();
  }
  if (spec.owner.trim()) {
    (tenant.spec as Record<string, unknown>).owner = spec.owner.trim();
  }
  if (spec.workloadNamespace.trim() && spec.workloadNamespace.trim() !== tenantName) {
    (tenant.spec as Record<string, unknown>).workloadNamespace = spec.workloadNamespace.trim();
  }

  const network: Record<string, unknown> = {};
  if (spec.network.udnSubnet.trim()) {
    network.udnSubnet = spec.network.udnSubnet.trim();
  }
  const mb = spec.network.metallb;
  const hasMetallb =
    mb.peerASN || mb.peerAddress || effectiveVrf || mb.addresses.some((a) => a.trim());
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
  if (Object.keys(network).length) {
    (tenant.spec as Record<string, unknown>).network = network;
  }

  if (spec.identity.enabled) {
    const idpName = spec.identity.consoleLoginName.trim() || `${tenantName}-idp`;
    const identity: Record<string, unknown> = {
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
      identity.keycloak = {
        namespace: spec.identity.keycloakNamespace.trim() || 'keycloak-system',
        instanceName: spec.identity.keycloakInstance.trim() || 'main',
        realm: tenantName,
        manageRealm: spec.identity.manageRealm,
      };
      if (spec.identity.manageRealm && spec.identity.seedUsers) {
        (identity.keycloak as Record<string, unknown>).seedUsers = true;
        (identity.keycloak as Record<string, unknown>).seedPassword =
          spec.identity.seedPassword.trim() || 'password';
        if (spec.identity.requirePasswordChange) {
          (identity.keycloak as Record<string, unknown>).requirePasswordChange = true;
        }
      }
    } else {
      identity.oidc = { issuer: spec.identity.oidcIssuer.trim() };
    }
    (tenant.spec as Record<string, unknown>).identity = identity;
  } else if (existing?.spec?.identity) {
    (tenant.spec as Record<string, unknown>).identity = { enabled: false };
  }

  return tenant;
}

export async function upsertClientSecret(tenantName: string, secret: string): Promise<void> {
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
}

export function shouldExpandNetwork(spec: TenantSpecForm): boolean {
  const mb = spec.network.metallb;
  return Boolean(
    spec.network.udnSubnet.trim() ||
      mb.peerAddress.trim() ||
      mb.peerASN ||
      mb.vrf.trim() ||
      mb.addresses.some((a) => a.trim()),
  );
}

export const demoClientSecretForEnable = (): string => DEMO_CLIENT_SECRET;
