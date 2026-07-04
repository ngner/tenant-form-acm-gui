export const TENANTS_LIST_PATH = '/tenants';
export const TENANTS_CREATE_PATH = '/tenants/create';

export const tenantEditPath = (ns: string, name: string): string =>
  `/tenants/edit/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`;
