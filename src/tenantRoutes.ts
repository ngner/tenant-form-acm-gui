import { DEFAULT_NAMESPACE } from './tenantFormTypes';

export const TENANTS_LIST_PATH = '/tenants';
export const TENANTS_CREATE_PATH = '/tenants/create';

/** Edit URL — namespace omitted when tenant CRs live in tenancies. */
export const tenantEditPath = (name: string, ns: string = DEFAULT_NAMESPACE): string =>
  ns === DEFAULT_NAMESPACE
    ? `/tenants/edit/${encodeURIComponent(name)}`
    : `/tenants/edit/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`;

export interface TenantEditRouteParams {
  ns: string;
  name: string;
}

/** Parse tenant name/namespace from console URL (useParams is unreliable in some ACM routes). */
export function parseTenantEditPath(pathname: string): TenantEditRouteParams | null {
  const legacy = pathname.match(/\/tenant-edit\/ns\/([^/?#]+)\/([^/?#]+)/);
  if (legacy) {
    return {
      ns: decodeURIComponent(legacy[1]),
      name: decodeURIComponent(legacy[2]),
    };
  }

  const edit = pathname.match(/\/tenants\/edit\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (!edit) {
    return null;
  }

  const first = decodeURIComponent(edit[1]);
  const second = edit[2] ? decodeURIComponent(edit[2]) : '';

  if (second) {
    return { ns: first, name: second };
  }

  return { ns: DEFAULT_NAMESPACE, name: first };
}
