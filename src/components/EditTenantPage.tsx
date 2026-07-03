import * as React from 'react';
import { useParams } from 'react-router-dom';
import { Alert, PageSection, Spinner, Title } from '@patternfly/react-core';
import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import { TenantModel } from '../models';
import { TenantResource } from '../tenantFormTypes';
import { parseTenantResource } from '../tenantFormUtils';
import TenantFormPage from './TenantFormPage';

const EditTenantPage: React.FC = () => {
  const { ns, name } = useParams<{ ns: string; name: string }>();
  const [tenant, setTenant] = React.useState<TenantResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    k8sGet({ model: TenantModel, name, ns })
      .then((resource) => {
        if (!cancelled) setTenant(resource as TenantResource);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, ns]);

  if (loading) {
    return (
      <PageSection>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  if (error || !tenant) {
    return (
      <>
        <PageSection variant="default">
          <Title headingLevel="h1">Edit Tenant</Title>
        </PageSection>
        <PageSection>
          <Alert variant="danger" title="Could not load tenant" isInline>
            {error || `Tenant ${ns}/${name} not found.`}
          </Alert>
        </PageSection>
      </>
    );
  }

  return (
    <TenantFormPage
      key={`${tenant.metadata.namespace}/${tenant.metadata.name}`}
      mode="edit"
      existing={tenant}
      initial={parseTenantResource(tenant)}
    />
  );
};

export default EditTenantPage;
