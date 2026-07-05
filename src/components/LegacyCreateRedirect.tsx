import * as React from 'react';
import { Redirect } from 'react-router-dom';
import { TENANTS_CREATE_PATH } from '../tenantRoutes';

const LegacyCreateRedirect: React.FC = () => <Redirect to={TENANTS_CREATE_PATH} />;

export default LegacyCreateRedirect;
