import { Action, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from './models';

/** Kebab action: open the guided edit form for a Tenant CR. */
const useTenantEditAction = (
  kind: { kind: string },
  obj: K8sResourceCommon,
): Action[] => {
  if (kind.kind !== TenantModel.kind || !obj?.metadata?.name || !obj?.metadata?.namespace) {
    return [];
  }
  return [
    {
      id: 'edit-tenant-form',
      label: 'Edit tenant (form)',
      insertBefore: 'edit-resource',
      cta: {
        href: `/tenant-edit/ns/${obj.metadata.namespace}/${obj.metadata.name}`,
      },
    },
  ];
};

export default useTenantEditAction;
