import * as React from 'react';
import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { TenantResource } from '../tenantFormTypes';
import { parseTenantResource } from '../tenantFormUtils';
import TenantFormPage from './TenantFormPage';

/** Tenant details horizontal tab — guided edit form (no separate route needed). */
const EditTenantTab: React.FC<{ obj?: K8sResourceCommon }> = ({ obj }) => {
  if (!obj?.metadata?.name || !obj?.metadata?.namespace) {
    return null;
  }
  const tenant = obj as TenantResource;
  const initial = parseTenantResource(tenant);
  return (
    <TenantFormPage
      key={`${tenant.metadata.namespace}/${tenant.metadata.name}`}
      mode="edit"
      existing={tenant}
      initial={initial}
      embedded
    />
  );
};

export default EditTenantTab;
