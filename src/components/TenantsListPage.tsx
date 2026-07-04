import * as React from 'react';
import { useHistory } from 'react-router-dom';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  PageSection,
  SearchInput,
  Spinner,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';
import { k8sList } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';
import { DEFAULT_NAMESPACE, TenantResource, WorkloadProfile } from '../tenantFormTypes';
import { TENANTS_CREATE_PATH, tenantEditPath } from '../tenantRoutes';
import { specField } from '../tenantFormUtils';

interface TenantRow {
  name: string;
  namespace: string;
  displayName: string;
  owner: string;
  workloadProfile: WorkloadProfile;
  ssoEnabled: boolean;
}

const toRow = (tenant: TenantResource): TenantRow => {
  const s = tenant.spec ?? {};
  return {
    name: tenant.metadata.name,
    namespace: tenant.metadata.namespace || DEFAULT_NAMESPACE,
    displayName: specField(s.displayName),
    owner: specField(s.owner),
    workloadProfile: (s.workloadProfile as WorkloadProfile) || 'vms',
    ssoEnabled: Boolean(s.identity?.enabled),
  };
};

const profileLabel = (profile: WorkloadProfile): string => {
  switch (profile) {
    case 'containers':
      return 'Containers';
    case 'both':
      return 'Containers + VMs';
    default:
      return 'VMs';
  }
};

const TenantsListPage: React.FC = () => {
  const history = useHistory();
  const [tenants, setTenants] = React.useState<TenantResource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState('');

  const loadTenants = React.useCallback(() => {
    setLoading(true);
    setError('');
    k8sList({ model: TenantModel, queryParams: { ns: DEFAULT_NAMESPACE } })
      .then((items) => setTenants((items ?? []) as TenantResource[]))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const rows = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...tenants].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    if (!q) {
      return sorted.map(toRow);
    }
    return sorted
      .filter((tenant) => {
        const row = toRow(tenant);
        const haystack = [row.name, row.displayName, row.owner, row.workloadProfile].join(' ').toLowerCase();
        return haystack.includes(q);
      })
      .map(toRow);
  }, [tenants, filter]);

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1">Tenants</Title>
      </PageSection>
      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <SearchInput
                aria-label="Search tenants"
                placeholder="Search by name, display name, or owner"
                value={filter}
                onChange={(_e, value) => setFilter(value)}
                onClear={() => setFilter('')}
              />
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button
                  variant="primary"
                  icon={<PlusCircleIcon />}
                  onClick={() => history.push(TENANTS_CREATE_PATH)}
                >
                  Create tenant
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>

        {error && (
          <Alert variant="danger" title="Could not load tenants" isInline style={{ marginBottom: '1rem' }}>
            {error}{' '}
            <Button variant="link" isInline onClick={loadTenants}>
              Retry
            </Button>
          </Alert>
        )}

        {loading ? (
          <Bullseye style={{ minHeight: '12rem' }}>
            <Spinner size="lg" />
          </Bullseye>
        ) : rows.length === 0 ? (
          <EmptyState>
            <EmptyStateBody>
              {filter.trim()
                ? 'No tenants match your search.'
                : `No tenants in the ${DEFAULT_NAMESPACE} namespace yet.`}
            </EmptyStateBody>
            {!filter.trim() && (
              <Button variant="primary" onClick={() => history.push(TENANTS_CREATE_PATH)}>
                Create tenant
              </Button>
            )}
          </EmptyState>
        ) : (
          <table className="pf-v6-c-table pf-m-compact pf-m-grid-md" role="grid">
            <thead className="pf-v6-c-table__thead">
              <tr className="pf-v6-c-table__tr" role="row">
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  Name
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  Display name
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  Owner
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  Workload profile
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  SSO
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  <span className="pf-v6-u-screen-reader">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="pf-v6-c-table__tbody" role="rowgroup">
              {rows.map((row) => (
                <tr className="pf-v6-c-table__tr" role="row" key={`${row.namespace}/${row.name}`}>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Name">
                    <Button
                      variant="link"
                      isInline
                      onClick={() => history.push(tenantEditPath(row.namespace, row.name))}
                    >
                      {row.name}
                    </Button>
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Display name">
                    {row.displayName || '—'}
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Owner">
                    {row.owner || '—'}
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Workload profile">
                    {profileLabel(row.workloadProfile)}
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="SSO">
                    {row.ssoEnabled ? <Label color="green">Enabled</Label> : <Label color="grey">Off</Label>}
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Actions">
                    <Button
                      variant="secondary"
                      onClick={() => history.push(tenantEditPath(row.namespace, row.name))}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageSection>
    </>
  );
};

export default TenantsListPage;
