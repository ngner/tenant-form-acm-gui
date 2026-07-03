# Edit Tenant feature (`feature/edit-tenant`)

Guided edit form for existing `Tenant` CRs — isolated on its own branch for easy rollback.

## Rollback

```bash
# Stop using edit — redeploy plugin from the previous branch
git checkout feature/tenant-identity-sso
./deployment/deploy-cluster-build.sh   # or deploy-git-build.sh

# Or delete the branch entirely
git branch -D feature/edit-tenant
git push mandibuswell --delete feature/edit-tenant
```

Create Tenant (`/tenant-create`) is unchanged on this branch; only additions are edit route and kebab action.

## Usage

1. Fleet Management → search **Tenant** → open a tenant CR
2. Actions (⋮) → **Edit tenant (form)**
3. Or navigate directly: `/tenant-edit/ns/tenancies/<name>`

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
