import * as React from 'react';
import { Action, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

/** Kebab action: open the guided edit form for a Tenant CR. */
const useTenantEditAction = (resource: K8sResourceCommon): [Action[], boolean] => {
  const actions = React.useMemo(() => {
    if (!resource?.metadata?.name || !resource?.metadata?.namespace) {
      return [];
    }
    return [
      {
        id: 'edit-tenant-form',
        label: 'Edit tenant (form)',
        insertBefore: 'edit-resource',
        cta: {
          href: `/tenant-edit/ns/${resource.metadata.namespace}/${resource.metadata.name}`,
        },
      },
    ];
  }, [resource]);

  return [actions, true];
};

export default useTenantEditAction;
