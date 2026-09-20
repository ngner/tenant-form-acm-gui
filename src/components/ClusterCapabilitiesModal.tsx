import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
  Content,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@patternfly/react-core';
import { k8sList, k8sPatch } from '@openshift-console/dynamic-plugin-sdk';
import { ManagedClusterModel } from '../models';
import { TENANTS_HELP_PATH } from '../tenantRoutes';

export const CAPABILITY_VM = 'tenancy.acm.io/capability-vm';
export const CAPABILITY_CONTAINER = 'tenancy.acm.io/capability-container';

type ManagedClusterItem = {
  metadata?: {
    name?: string;
    labels?: Record<string, string>;
    resourceVersion?: string;
  };
  status?: { conditions?: Array<{ type?: string; status?: string }> };
};

type ClusterRow = {
  name: string;
  available: boolean;
  /** Labels as last loaded / saved from the API */
  savedVm: boolean;
  savedContainer: boolean;
  /** Draft checkbox state */
  vm: boolean;
  container: boolean;
  saving: boolean;
  error: string;
  savedOk: boolean;
};

const isAvailable = (mc: ManagedClusterItem): boolean =>
  Boolean(
    mc.status?.conditions?.some(
      (c) => c.type === 'ManagedClusterConditionAvailable' && c.status === 'True',
    ),
  );

const toRow = (mc: ManagedClusterItem): ClusterRow | null => {
  const name = mc.metadata?.name;
  if (!name) return null;
  const labels = mc.metadata?.labels ?? {};
  const vm = labels[CAPABILITY_VM] === 'true';
  const container = labels[CAPABILITY_CONTAINER] === 'true';
  return {
    name,
    available: isAvailable(mc),
    savedVm: vm,
    savedContainer: container,
    vm,
    container,
    saving: false,
    error: '',
    savedOk: false,
  };
};

const dirty = (row: ClusterRow): boolean =>
  row.vm !== row.savedVm || row.container !== row.savedContainer;

export type ClusterCapabilitiesModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const ClusterCapabilitiesModal: React.FC<ClusterCapabilitiesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [rows, setRows] = React.useState<ClusterRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');

  const loadClusters = React.useCallback(() => {
    setLoading(true);
    setLoadError('');
    k8sList({ model: ManagedClusterModel, queryParams: {} })
      .then((items) => {
        const next = ((items ?? []) as ManagedClusterItem[])
          .map(toRow)
          .filter((r): r is ClusterRow => Boolean(r))
          .sort((a, b) => a.name.localeCompare(b.name));
        setRows(next);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      loadClusters();
    }
  }, [isOpen, loadClusters]);

  const updateRow = (name: string, patch: Partial<ClusterRow>) => {
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row: ClusterRow) => {
    if (!dirty(row)) {
      updateRow(row.name, { savedOk: true, error: '' });
      return;
    }
    updateRow(row.name, { saving: true, error: '', savedOk: false });
    try {
      const items = (await k8sList({
        model: ManagedClusterModel,
        queryParams: {},
      })) as ManagedClusterItem[];
      const fresh = items.find((mc) => mc.metadata?.name === row.name);
      if (!fresh?.metadata?.name) {
        throw new Error(`ManagedCluster ${row.name} not found`);
      }
      const hadLabels = Boolean(fresh.metadata.labels);
      const nextLabels = { ...(fresh.metadata.labels ?? {}) };
      if (row.vm) {
        nextLabels[CAPABILITY_VM] = 'true';
      } else {
        delete nextLabels[CAPABILITY_VM];
      }
      if (row.container) {
        nextLabels[CAPABILITY_CONTAINER] = 'true';
      } else {
        delete nextLabels[CAPABILITY_CONTAINER];
      }

      await k8sPatch({
        model: ManagedClusterModel,
        resource: {
          metadata: {
            name: row.name,
            ...(fresh.metadata.resourceVersion
              ? { resourceVersion: fresh.metadata.resourceVersion }
              : {}),
          },
        },
        data: [
          hadLabels
            ? { op: 'replace', path: '/metadata/labels', value: nextLabels }
            : { op: 'add', path: '/metadata/labels', value: nextLabels },
        ],
      });

      updateRow(row.name, {
        saving: false,
        savedVm: row.vm,
        savedContainer: row.container,
        savedOk: true,
        error: '',
      });
    } catch (err) {
      updateRow(row.name, {
        saving: false,
        error: err instanceof Error ? err.message : String(err),
        savedOk: false,
      });
    }
  };

  const anySaving = rows.some((r) => r.saving);

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={() => {
        if (anySaving) return;
        onClose();
      }}
      aria-labelledby="label-clusters-title"
      aria-describedby="label-clusters-body"
    >
      <ModalHeader title="Label clusters" labelId="label-clusters-title" />
      <ModalBody id="label-clusters-body">
        <Content
          component="p"
          style={{ marginBottom: '1rem', color: 'var(--pf-t--global--text--color--subtle)' }}
        >
          Set capability labels so tenant policies know which ManagedClusters can host VMs or
          containers. Requires permission to patch ManagedClusters.{' '}
          <Link to={TENANTS_HELP_PATH} onClick={onClose}>
            How labels work
          </Link>
        </Content>

        {loadError && (
          <Alert
            variant="danger"
            isInline
            title="Could not load clusters"
            style={{ marginBottom: '1rem' }}
          >
            {loadError}{' '}
            <Button variant="link" isInline onClick={loadClusters}>
              Retry
            </Button>
          </Alert>
        )}

        {loading ? (
          <Bullseye style={{ minHeight: '8rem' }}>
            <Spinner size="lg" />
          </Bullseye>
        ) : rows.length === 0 && !loadError ? (
          <Content component="p">No ManagedClusters found.</Content>
        ) : (
          <table className="pf-v6-c-table pf-m-compact pf-m-grid-md" role="grid">
            <thead className="pf-v6-c-table__thead">
              <tr className="pf-v6-c-table__tr" role="row">
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  Cluster
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  Available
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  VMs
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  Containers
                </th>
                <th className="pf-v6-c-table__th" role="columnheader" scope="col">
                  <span className="pf-v6-u-screen-reader">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="pf-v6-c-table__tbody" role="rowgroup">
              {rows.map((row) => (
                <tr className="pf-v6-c-table__tr" role="row" key={row.name}>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Cluster">
                    {row.name}
                    {row.error && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--pf-t--global--text--color--status--danger)',
                          marginTop: '0.25rem',
                        }}
                      >
                        {row.error}
                      </div>
                    )}
                    {row.savedOk && !row.error && !dirty(row) && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--pf-t--global--text--color--status--success)',
                          marginTop: '0.25rem',
                        }}
                      >
                        Saved
                      </div>
                    )}
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Available">
                    {row.available ? (
                      <Label color="green">Ready</Label>
                    ) : (
                      <Label color="orange">Not ready</Label>
                    )}
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="VMs">
                    <Checkbox
                      id={`cap-vm-${row.name}`}
                      label="capability-vm"
                      isChecked={row.vm}
                      isDisabled={row.saving}
                      onChange={(_e, checked) =>
                        updateRow(row.name, { vm: checked, savedOk: false, error: '' })
                      }
                    />
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Containers">
                    <Checkbox
                      id={`cap-container-${row.name}`}
                      label="capability-container"
                      isChecked={row.container}
                      isDisabled={row.saving}
                      onChange={(_e, checked) =>
                        updateRow(row.name, { container: checked, savedOk: false, error: '' })
                      }
                    />
                  </td>
                  <td className="pf-v6-c-table__td" role="cell" data-label="Actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      isDisabled={!dirty(row) || row.saving}
                      isLoading={row.saving}
                      onClick={() => saveRow(row)}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ModalBody>
      <ModalFooter>
        <Button key="close" variant="primary" onClick={onClose} isDisabled={anySaving}>
          Close
        </Button>
        <Button
          key="refresh"
          variant="link"
          onClick={loadClusters}
          isDisabled={loading || anySaving}
        >
          Refresh
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ClusterCapabilitiesModal;
