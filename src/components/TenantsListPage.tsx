import * as React from 'react';
import { Link, useHistory } from 'react-router-dom';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  Label,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  SearchInput,
  Spinner,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { EllipsisVIcon, ExternalLinkAltIcon, PlusCircleIcon, SearchIcon, TagIcon } from '@patternfly/react-icons';
import { k8sDelete, k8sList } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';
import { DEFAULT_NAMESPACE, TenantResource, WorkloadProfile } from '../tenantFormTypes';
import {
  TENANTS_ACM_SEARCH_PATH,
  TENANTS_CREATE_PATH,
  TENANTS_HELP_PATH,
  tenantCaasClustersPath,
  tenantEditPath,
  tenantVmsSearchPath,
  tenantWorkloadsSearchPath,
} from '../tenantRoutes';
import { specField } from '../tenantFormUtils';
import ClusterCapabilitiesModal from './ClusterCapabilitiesModal';

interface TenantRow {
  name: string;
  namespace: string;
  displayName: string;
  owner: string;
  workloadNamespace: string;
  workloadProfile: WorkloadProfile;
  ssoEnabled: boolean;
  resource: TenantResource;
}

const toRow = (tenant: TenantResource): TenantRow => {
  const s = tenant.spec ?? {};
  const name = tenant.metadata.name;
  const workloadNamespace = specField(s.workloadNamespace) || name;
  return {
    name,
    namespace: tenant.metadata.namespace || DEFAULT_NAMESPACE,
    displayName: specField(s.displayName),
    owner: specField(s.owner),
    workloadNamespace,
    workloadProfile: (s.workloadProfile as WorkloadProfile) || 'vms',
    ssoEnabled: Boolean(s.identity?.enabled),
    resource: tenant,
  };
};

const profileLabel = (profile: WorkloadProfile): string => {
  switch (profile) {
    case 'containers':
      return 'Containers';
    case 'both':
      return 'Containers + VMs';
    case 'clusters':
      return 'Clusters (CaaS via Hosted Control Plane)';
    default:
      return 'VMs';
  }
};

const TenantActionsMenu: React.FC<{
  row: TenantRow;
  onDelete: (row: TenantRow) => void;
}> = ({ row, onDelete }) => {
  const history = useHistory();
  const [isOpen, setIsOpen] = React.useState(false);
  const isCaas = row.workloadProfile === 'clusters';
  const wantsVms = row.workloadProfile === 'vms' || row.workloadProfile === 'both';
  const wantsContainers =
    row.workloadProfile === 'containers' || row.workloadProfile === 'both';

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open) => setIsOpen(open)}
      onSelect={() => setIsOpen(false)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          aria-label={`Actions for ${row.name}`}
          variant="plain"
          onClick={() => setIsOpen((prev) => !prev)}
          isExpanded={isOpen}
          icon={<EllipsisVIcon />}
        />
      )}
      popperProps={{ position: 'right' }}
    >
      <DropdownList>
        <DropdownItem
          key="edit"
          onClick={() => history.push(tenantEditPath(row.name, row.namespace))}
        >
          Edit
        </DropdownItem>
        {wantsVms && (
          <DropdownItem
            key="list-vms"
            onClick={() => history.push(tenantVmsSearchPath(row.workloadNamespace))}
          >
            List VMs
          </DropdownItem>
        )}
        {isCaas && (
          <DropdownItem
            key="list-caas"
            onClick={() => history.push(tenantCaasClustersPath(row.name))}
          >
            List CaaS
          </DropdownItem>
        )}
        {(wantsContainers) && (
          <DropdownItem
            key="list-workloads"
            onClick={() => history.push(tenantWorkloadsSearchPath(row.workloadNamespace))}
          >
            List Workloads
          </DropdownItem>
        )}
        <Divider component="li" key="separator" />
        <DropdownItem key="delete" isDanger onClick={() => onDelete(row)}>
          Delete
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};

const TenantsListPage: React.FC = () => {
  const history = useHistory();
  const [tenants, setTenants] = React.useState<TenantResource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<TenantRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const [labelClustersOpen, setLabelClustersOpen] = React.useState(false);

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
        const haystack = [row.name, row.displayName, row.owner, row.workloadProfile]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .map(toRow);
  }, [tenants, filter]);

  const closeDeleteModal = () => {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await k8sDelete({
        model: TenantModel,
        resource: pendingDelete.resource,
      });
      setPendingDelete(null);
      loadTenants();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1">Tenants</Title>
        <Content
          component="p"
          style={{ marginTop: '0.5rem', color: 'var(--pf-t--global--text--color--subtle)' }}
        >
          Hub control configuration — Tenant CRs in the <strong>{DEFAULT_NAMESPACE}</strong> namespace.
          Create and edit here drives ACM policy from the hub.{' '}
          <Link to={TENANTS_HELP_PATH}>How tenants work</Link>
        </Content>
      </PageSection>
      <PageSection>
        <Alert
          variant="info"
          isInline
          title="View tenants across all clusters"
          style={{ marginBottom: '1rem' }}
        >
          Tenant resources on managed clusters are provisioned by policy and are not editable here.
          Use fleet search for a read-only view of every Tenant CR in the fleet.{' '}
          <Button
            variant="link"
            isInline
            icon={<ExternalLinkAltIcon />}
            iconPosition="right"
            component={(props) => <Link {...props} to={TENANTS_ACM_SEARCH_PATH} />}
          >
            Search all Tenant resources
          </Button>
        </Alert>

        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <SearchInput
                aria-label="Search hub tenants"
                placeholder="Search by name, display name, or owner"
                value={filter}
                onChange={(_e, value) => setFilter(value)}
                onClear={() => setFilter('')}
              />
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button
                  variant="secondary"
                  icon={<TagIcon />}
                  onClick={() => setLabelClustersOpen(true)}
                >
                  Label clusters
                </Button>
              </ToolbarItem>
              <ToolbarItem>
                <Button
                  variant="secondary"
                  icon={<SearchIcon />}
                  component={(props) => <Link {...props} to={TENANTS_ACM_SEARCH_PATH} />}
                >
                  Fleet-wide search
                </Button>
              </ToolbarItem>
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
                      onClick={() => history.push(tenantEditPath(row.name, row.namespace))}
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
                    <TenantActionsMenu row={row} onDelete={setPendingDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageSection>

      <ClusterCapabilitiesModal
        isOpen={labelClustersOpen}
        onClose={() => setLabelClustersOpen(false)}
      />

      <Modal
        variant="small"
        isOpen={Boolean(pendingDelete)}
        onClose={closeDeleteModal}
        aria-labelledby="delete-tenant-title"
        aria-describedby="delete-tenant-body"
      >
        <ModalHeader title="Delete tenant?" labelId="delete-tenant-title" titleIconVariant="warning" />
        <ModalBody id="delete-tenant-body">
          {pendingDelete && (
            <>
              Delete Tenant CR <strong>{pendingDelete.name}</strong> from{' '}
              <strong>{pendingDelete.namespace}</strong>? Policy cleanup runs on the next cycle;
              some hub RBAC and themes may need manual removal.
            </>
          )}
          {deleteError && (
            <Alert variant="danger" isInline title="Delete failed" style={{ marginTop: '1rem' }}>
              {deleteError}
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            key="confirm"
            variant="danger"
            onClick={confirmDelete}
            isLoading={deleting}
            isDisabled={deleting}
          >
            Delete
          </Button>
          <Button key="cancel" variant="link" onClick={closeDeleteModal} isDisabled={deleting}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default TenantsListPage;
