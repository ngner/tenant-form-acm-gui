import * as React from 'react';
import { Alert, PageSection, Spinner, Title } from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';
import { TenantResource } from '../tenantFormTypes';
import { useTenantEditParams } from '../useTenantEditParams';
import TenantFormPage from './TenantFormPage';

const isTenantResource = (resource: unknown): resource is TenantResource =>
  Boolean(
    resource &&
      typeof resource === 'object' &&
      (resource as TenantResource).kind === 'Tenant' &&
      (resource as TenantResource).metadata?.name,
  );

const EditTenantPage: React.FC = () => {
  const { ns, name } = useTenantEditParams();

  const watchResource = React.useMemo(
    () =>
      name && ns
        ? {
            groupVersionKind: {
              group: TenantModel.apiGroup,
              version: TenantModel.apiVersion,
              kind: TenantModel.kind,
            },
            name,
            namespace: ns,
            isList: false,
          }
        : null,
    [name, ns],
  );

  const [resource, loaded, loadError] = useK8sWatchResource<TenantResource>(watchResource);
  const tenant = isTenantResource(resource) ? resource : null;

  if (!name || !ns) {
    return (
      <PageSection>
        <Alert variant="danger" title="Invalid tenant URL" isInline>
          Expected /tenants/edit/&lt;name&gt; or /tenants/edit/tenancies/&lt;name&gt;
        </Alert>
      </PageSection>
    );
  }

  if (!loaded) {
    return (
      <PageSection>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  if (loadError || !tenant) {
    const message =
      loadError instanceof Error
        ? loadError.message
        : loadError
          ? String(loadError)
          : `Tenant ${ns}/${name} not found.`;
    return (
      <>
        <PageSection variant="default">
          <Title headingLevel="h1">Edit Tenant</Title>
        </PageSection>
        <PageSection>
          <Alert variant="danger" title="Could not load tenant" isInline>
            {message}
          </Alert>
        </PageSection>
      </>
    );
  }

  const tenantKey = `${tenant.metadata.resourceVersion ?? ''}/${tenant.metadata.uid ?? tenant.metadata.name}`;

  return (
    <TenantFormPage
      key={tenantKey}
      mode="edit"
      existing={tenant}
    />
  );
};

export default EditTenantPage;
