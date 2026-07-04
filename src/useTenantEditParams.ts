import * as React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { parseTenantEditPath, TenantEditRouteParams } from './tenantRoutes';
import { DEFAULT_NAMESPACE } from './tenantFormTypes';

/** Resolve edit-route params from react-router and pathname fallback. */
export function useTenantEditParams(): TenantEditRouteParams {
  const params = useParams<{ ns?: string; name?: string }>();
  const location = useLocation();

  return React.useMemo(() => {
    if (params.ns && params.name) {
      return {
        ns: decodeURIComponent(params.ns),
        name: decodeURIComponent(params.name),
      };
    }
    if (params.name && !params.ns) {
      return {
        ns: DEFAULT_NAMESPACE,
        name: decodeURIComponent(params.name),
      };
    }
    return parseTenantEditPath(location.pathname) ?? { ns: '', name: '' };
  }, [params.ns, params.name, location.pathname]);
}
