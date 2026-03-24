import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

export const TenantModel: K8sModel = {
  apiGroup: 'dusty-seahorse.io',
  apiVersion: 'v1alpha1',
  kind: 'Tenant',
  plural: 'tenants',
  abbr: 'TN',
  namespaced: true,
  label: 'Tenant',
  labelPlural: 'Tenants',
};
