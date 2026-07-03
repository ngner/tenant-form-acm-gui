import { Action, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

const isTenantResource = (scope: K8sResourceCommon): boolean =>
  scope?.kind === 'Tenant' && String(scope?.apiVersion ?? '').startsWith('dusty-seahorse.io/');

/** Hide built-in YAML edit actions for Tenant CRs — replaced by our form action/tab. */
const filterTenantYamlEdit = (scope: K8sResourceCommon, action: Action): boolean => {
  if (!isTenantResource(scope)) {
    return true;
  }
  const id = String(action.id ?? '');
  if (id === 'edit-resource' || id === 'edit-Tenant-action' || id.startsWith('edit-Tenant')) {
    return false;
  }
  const cta = action.cta;
  if (typeof cta === 'object' && cta.href?.includes('/yaml')) {
    return false;
  }
  return true;
};

export default filterTenantYamlEdit;
