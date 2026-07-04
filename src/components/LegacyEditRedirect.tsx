import * as React from 'react';
import { Redirect, useParams } from 'react-router-dom';
import { tenantEditPath } from '../tenantRoutes';

const LegacyEditRedirect: React.FC = () => {
  const { ns, name } = useParams<{ ns: string; name: string }>();
  return <Redirect to={tenantEditPath(ns, name)} />;
};

export default LegacyEditRedirect;
