# Tenants page (`feature/edit-tenant`)

Guided tenant management in the ACM console — list, create, and edit `Tenant` CRs without overriding the built-in CR YAML editor.

## Rollback

```bash
git checkout feature/tenant-identity-sso
./deployment/deploy-cluster-build.sh   # or deploy-git-build.sh

# Or delete the branch entirely
git branch -D feature/edit-tenant
git push mandibuswell --delete feature/edit-tenant
```

## Usage

1. Fleet Management → **Tenants** in the left nav
2. Search or pick a tenant from the list → **Edit**
3. **Create tenant** from the list page toolbar

Routes:

| Path | Purpose |
|------|---------|
| `/tenants` | List and search |
| `/tenants/create` | Create form |
| `/tenants/edit/:ns/:name` | Edit form |

Legacy redirects: `/tenant-create` and `/tenant-edit/ns/:ns/:name` still work.

The native Tenant CR details page and YAML editor are unchanged — use them for advanced debugging.

## Safe to edit

- Display name, owner, quotas, limit range, VM quota
- Network CIDR, MetalLB peering
- Access groups (admin / user / viewer)
- Console SSO settings (client secret optional — leave blank to keep existing)

## Locked or risky

| Field | Behaviour |
|-------|-----------|
| Tenant name | Locked after create |
| Workload namespace | Locked after create |
| CR namespace (`tenancies`) | Locked in edit mode |
| Workload profile | Editable with warning — does not remove old provisioned resources |

## Deploy this branch

```bash
git checkout feature/edit-tenant
./deployment/deploy-cluster-build.sh
```

Hard-refresh the console after rollout (~60s).
