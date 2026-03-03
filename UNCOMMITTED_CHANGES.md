# Uncommitted changes review (feat/mcp/api-tokens)

## Scope (files changed)

- **Admin-token type segregation** *(added in type-segregation pass)*
  - `packages/core/admin/shared/contracts/admin-token.ts` (**new**)
  - `packages/core/admin/server/src/validation/admin-tokens.ts` (**new**)
  - `packages/core/admin/shared/contracts/api-token.ts` (stripped admin-specific types/namespaces)
  - `packages/core/admin/server/src/validation/api-tokens.ts` (content-api only)
  - `packages/core/admin/server/src/controllers/admin-token.ts` (imports from `admin-token` contracts/validation)
  - `packages/core/admin/server/src/controllers/api-token.ts` (content-api only, removed admin branching)
  - `packages/core/admin/admin/src/services/apiTokens.ts` (admin hooks typed with `AdminToken.*`)
  - `packages/core/admin/admin/src/pages/Settings/pages/AdminTokens/EditView/EditViewPage.tsx` (imports from `admin-token`)
- **Admin content-types**
  - `packages/core/admin/server/src/content-types/Permission.ts`
  - `packages/core/admin/server/src/content-types/User.ts`
  - `packages/core/admin/server/src/content-types/api-token.ts`
- **Admin API token HTTP layer**
  - `packages/core/admin/server/src/routes/api-tokens.ts`
  - `packages/core/admin/server/src/routes/admin-tokens.ts` (**new**)
  - `packages/core/admin/server/src/controllers/api-token.ts`
  - `packages/core/admin/server/src/controllers/admin-token.ts` (**new**)
  - `packages/core/admin/server/src/validation/api-tokens.ts`
  - `packages/core/admin/shared/contracts/api-token.ts`
  - `packages/core/admin/server/src/config/admin-actions.ts` (adds `admin-tokens.*` actions)
- **Admin permission domain/services**
  - `packages/core/admin/server/src/domain/permission/index.ts`
  - `packages/core/admin/server/src/services/permission/queries.ts`
  - `packages/core/admin/server/src/services/api-token.ts` (**main business logic** — owner-ceiling fix + role-sync)
  - `packages/core/admin/server/src/services/role.ts` (triggers token sync after permission assignment)
  - `packages/core/admin/server/src/bootstrap.ts` (lifecycle hooks for user-role and role-deletion sync)
- **Tests**
  - `packages/core/admin/server/src/controllers/__tests__/api-token.test.ts`
  - `packages/core/admin/server/src/controllers/__tests__/admin-token.test.ts` (**new**)
  - `packages/core/admin/server/src/services/__tests__/api-token.test.ts`
  - `packages/core/admin/server/src/strategies/__tests__/api-token.test.ts`
  - `packages/core/admin/admin/tests/server.ts`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/tests/EditViewPage.test.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/AdminTokens/EditView/tests/EditViewPage.test.tsx` (**new**)
- **Admin UI — permission matrix (ceiling-aware)**
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/utils/createPermissionChecker.ts` (**new**)
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/utils/updateValues.ts`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/hooks/usePermissionsDataManager.tsx` (replaced `.ts`; adds `checkUserHasPermission`)
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/Permissions.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/CollapsePropertyMatrix.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/ContentTypeCollapses.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/GlobalActions.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/ConditionsModal.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/Roles/components/PluginsAndSettings.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/components/AdminPermissions.tsx` (**new**; extended with owner-aware ceiling)
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/EditViewPage.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/components/FormApiTokenContainer.tsx`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/EditView/constants.ts`
  - `packages/core/admin/admin/src/pages/Settings/pages/ApiTokens/ListView.tsx`
  - `packages/core/admin/admin/src/pages/Settings/components/Tokens/Table.tsx`
  - `packages/core/admin/admin/src/services/apiTokens.ts` (adds `useGetAPITokenOwnerPermissionsQuery`)
- **Admin UI — kind-segregated settings pages**
  - `packages/core/admin/admin/src/types/permissions.ts` (adds `'admin-tokens'` to `SettingsPermissions`)
  - `packages/core/admin/admin/src/constants.ts` (adds `'admin-tokens'` permissions entry + sidebar link)
  - `packages/core/admin/admin/src/pages/Settings/constants.ts` (adds 3 `admin-tokens/*` routes)
  - `packages/core/admin/admin/src/pages/Settings/pages/AdminTokens/ListView.tsx` (**new**)
  - `packages/core/admin/admin/src/pages/Settings/pages/AdminTokens/EditView/EditViewPage.tsx` (**new**)
  - `packages/core/admin/admin/src/pages/Settings/pages/AdminTokens/CreateView.tsx` (**new**)

## High-level outcome

API Tokens are now split into two **kinds**:

- **`content-api`** tokens: original content-API tokens. Have a `type` (`read-only`, `full-access`, `custom`), carry content-API route permissions, have no owner, and have no admin permissions.
- **`admin`** tokens: new MCP-oriented tokens. Always have an owner (`adminUserOwner`), carry admin permissions (`adminPermissions`) scoped by the owner's permission ceiling, and have no content-API `type` or content-API `permissions`.

`kind` is a string enumeration persisted in the database and forms a **TypeScript discriminated union** at the contract level, so all call-sites can narrow to the precise shape at compile time.

Beyond the kind split, this work also introduces:

- **Admin permission ceiling**: a non-super-admin can only assign token admin permissions within their own permission scope; conditions are inherited (not chosen).
- **Owner-only key access**: only the token owner can read the plaintext `accessKey` for admin tokens. Content API tokens keep back-compat (any caller with route permission can read the key).
- **List ownership filter**: non-super-admins only receive content-api tokens and their own admin tokens from `GET /api-tokens`.

## Admin-token type segregation

Admin-token declarations are now fully separated from content-api-token ones.

### New files

**`shared/contracts/admin-token.ts`**
- Defines `AdminApiToken` (moved from `api-token.ts`) and `AdminTokenBody` (was private `AdminApiTokenBody`).
- Declares endpoint namespaces for `/admin-tokens` routes: `Create`, `List`, `Get`, `Update`, `Revoke`, `Regenerate`, `GetAdminPermissions`, `UpdateAdminPermissions`, `GetOwnerPermissions`.

**`server/src/validation/admin-tokens.ts`**
- Admin-only Yup schemas — no `type` or content-api `permissions` fields.
- Creation schema includes `kind: yup.string().oneOf(['admin']).optional()` (controller sets `kind: 'admin'` in attributes before calling validation).
- `adminUserOwner` is `yup.mixed().nullable()` — the controller passes the full `ctx.state.user` object (not just an ID) into attributes before validation.
- Exports `validateAdminTokenCreationInput`, `validateAdminTokenUpdateInput`.

### Modified files

**`shared/contracts/api-token.ts`**
- `AdminApiToken` re-exported from `./admin-token` (single definition, no duplication).
- `ApiTokenBody` is now `ContentApiApiTokenBody` only (`kind` optional `'content-api'`).
- `AdminApiTokenBody` removed (moved to `admin-token.ts`).
- `GetAdminPermissions`, `UpdateAdminPermissions`, `GetOwnerPermissions` namespaces removed (moved to `admin-token.ts`).
- `Create`/`List`/`Get`/`Update`/`Revoke` response types narrowed to `ContentApiApiToken`.

**`server/src/validation/api-tokens.ts`**
- `kind` is now optional `'content-api'` on create (no `'admin'` accepted).
- `adminPermissions` and `adminUserOwner` fields removed.
- `apiTokenUpdateSchema` no longer accepts `kind`, `adminPermissions`, or `adminUserOwner`.

**`server/src/controllers/admin-token.ts`**
- Imports `Create`, `List`, `Get`, `Update`, `Revoke`, `GetAdminPermissions`, `UpdateAdminPermissions`, `GetOwnerPermissions`, `AdminApiToken` from `shared/contracts/admin-token`.
- Uses `validateAdminTokenCreationInput` / `validateAdminTokenUpdateInput` from `validation/admin-tokens`.
- `create()` hardcodes `kind: 'admin'` — no `body.kind === 'admin'` guard needed.
- `update()` uses `AdminToken.Update.Request['body']` — no kind branching.

**`server/src/controllers/api-token.ts`**
- Removed `AdminApiToken` import and all admin-token branching.
- `create()` hardcodes `kind: 'content-api'`.
- `regenerate()` no longer guards on `token.kind === 'admin'`.
- `get()` always exposes decrypted key (content-api back-compat).
- `update()` no longer calls `canAccessAdminToken`.
- `list()` always filters `kind: 'content-api'`.

**`admin/src/services/apiTokens.ts`**
- Admin hooks (`getAdminTokens`, `getAdminToken`, `createAdminToken`, `deleteAdminToken`, `updateAdminToken`) typed with `AdminToken.*` contracts.
- `getAPITokenOwnerPermissions` typed with `AdminToken.GetOwnerPermissions.*`.

**`admin/src/pages/Settings/pages/AdminTokens/EditView/EditViewPage.tsx`**
- `AdminApiToken` and `Get` imported from `shared/contracts/admin-token` instead of `api-token`.

## Token kind discriminant

### `kind` field — DB schema (`content-types/api-token.ts`)

- New `kind` attribute: `enumeration(['content-api', 'admin'])`, `required: true`, `default: 'content-api'` (backward compat — existing rows without the field migrate to `'content-api'`).
- `type` attribute changed to `required: false` (admin tokens have no type).
- `'kind'` added to `SELECT_FIELDS` in the service so it is always returned.

### TypeScript discriminated union (`shared/contracts/api-token.ts`)

The flat `ApiToken` and `ApiTokenBody` types are replaced with discriminated unions:

```typescript
type ApiTokenBase = {
  id;
  name;
  description;
  accessKey?;
  encryptedKey?;
  createdAt;
  updatedAt;
  expiresAt;
  lastUsedAt;
  lifespan;
};

export type ContentApiApiToken = ApiTokenBase & {
  kind: 'content-api';
  type: 'custom' | 'full-access' | 'read-only';
  permissions: string[];
};

export type AdminApiToken = ApiTokenBase & {
  kind: 'admin';
  adminPermissions: Permission[];
  adminUserOwner: Data.ID | AdminUser;
};

export type ApiToken = ContentApiApiToken | AdminApiToken;

type ContentApiApiTokenBody = {
  kind: 'content-api';
  name;
  description;
  type;
  permissions?;
  lifespan?;
};
type AdminApiTokenBody = {
  kind: 'admin';
  name;
  description;
  adminPermissions?;
  adminUserOwner?;
  lifespan?;
};
export type ApiTokenBody = ContentApiApiTokenBody | AdminApiTokenBody;
```

`ContentApiApiToken` and `AdminApiToken` are both exported for use in service/controller helpers that need to operate on a specific kind.

### Service-layer enforcement (`services/api-token.ts`)

Two new guard helpers are called at the top of `create` and `update`:

- **`assertLegacyKindFields(attributes)`**: throws `ValidationError` if `adminPermissions` or `adminUserOwner` are present on a `kind: 'content-api'` body.
- **`assertAdminKindFields(attributes)`**: throws `ValidationError` if `type` or content-API `permissions` are present on a `kind: 'admin'` body.

**`create(attributes, callingUser?)`** branches on `attributes.kind`:

- `'content-api'`: calls `assertLegacyKindFields` → runs content-api path (content-API permissions, no owner — `adminUserOwner: null` written to DB).
- `'admin'`: calls `assertAdminKindFields` → runs admin path (owner defaulting to `callingUser.id`, admin permission ceiling enforcement, persists `adminPermissions`).

**`update(id, attributes)`**:

- Asserts `kind` immutability: if `attributes.kind` is present and differs from `originalToken.kind` → throws `ValidationError('kind is immutable after creation')`.
- Resolves `resolvedKind` from `originalToken.kind` (authoritative source), then branches:
  - `'content-api'`: `assertLegacyKindFields`, content-api permission diff logic.
  - `'admin'`: `assertAdminKindFields`, resolves the **token owner** via `getService('user').findOne(ownerId)`, enforces ceiling against the **owner** (not the caller), then calls `assignAdminPermissionsToToken`.
- `kind` is stripped from the DB write (immutable field, never updated).
- The initial DB fetch now includes `populate: ['adminUserOwner']` so the owner ID is always available.

### Validation (`validation/api-tokens.ts`)

- `apiTokenCreationSchema`: added `kind: yup.string().oneOf(['content-api', 'admin']).required()`. `type` changed to `.optional()` (cross-field consistency validated in service).
- `apiTokenUpdateSchema`: added `kind: yup.string().oneOf(['content-api', 'admin']).optional()`. `type` changed to `.optional()`.

### Controller restructure (`controllers/api-token.ts`)

The old flat guards (`canAccessToken`, `canReadAccessKey`, `canUpdateToken`) that checked `adminUserOwner` presence are replaced by three kind-aware helpers:

- `isTokenOwner(user, AdminApiToken)` — exact ownership check. Used for key access and regenerate (super-admin does NOT bypass).
- `canAccessAdminToken(user, AdminApiToken)` — owner OR super-admin. Used for metadata read and update of admin tokens.

Each handler now branches on `token.kind` at the top level:

| Handler                  | Content API path                                                               | Admin path                                                                             |
| ------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `create`                 | builds `ContentApiApiTokenBody` attributes (only content-api fields forwarded) | builds `AdminApiTokenBody` attributes (only admin fields forwarded)                    |
| `regenerate`             | no extra check — anyone with route permission                                  | `isTokenOwner` gate; super-admin forbidden                                             |
| `get`                    | always fetches with decrypted key                                              | key only for owner; metadata-only for everyone else                                    |
| `update`                 | no ownership check                                                             | `canAccessAdminToken` gate (fixes pre-existing missing check)                          |
| `getAdminPermissions`    | `ctx.badRequest` — not applicable to content-api                               | `canAccessAdminToken` gate                                                             |
| `updateAdminPermissions` | `ctx.badRequest` — not applicable to content-api                               | `canAccessAdminToken` gate; resolves owner user and passes as `ceilingUser` to service |

### Invariants enforced

| Rule                                                                          | Where                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| `kind` stored as string in DB                                                 | Content type schema                                      |
| TypeScript narrowing via discriminant                                         | Contracts union                                          |
| Content API: no `adminUserOwner`, no `adminPermissions`                       | `assertLegacyKindFields` in service                      |
| Admin: no `type`, no content-API `permissions`                                | `assertAdminKindFields` in service                       |
| `kind` immutable after creation                                               | `update()` in service                                    |
| Existing tokens default to `'content-api'`                                    | DB schema default                                        |
| Content API tokens always expose key; admin tokens owner-only                 | Controller `get` / `regenerate`                          |
| Admin token update requires owner or super-admin                              | Controller `update`                                      |
| Admin permission ceiling on update always uses token owner (not calling user) | Service `update()` + Controller `updateAdminPermissions` |
| `getAdminPermissions` / `updateAdminPermissions` reject content-api tokens    | Controller early `badRequest`                            |

## Data model changes (admin content-types)

- **`admin::permission`**
  - Added nullable relation **`apiToken`** (many permissions → one api-token).
  - `role` explicitly marked `required: false` (to allow "token permissions" that have no role).
- **`admin::api-token`**
  - Added **`kind`** enumeration (`'content-api' | 'admin'`), `required: true`, `default: 'content-api'`.
  - `type` changed to `required: false` (admin tokens have no type).
  - Added **`adminPermissions`** one-to-many relation to `admin::permission` mapped by `permission.apiToken`.
  - Added **`adminUserOwner`** many-to-one relation to `admin::user`.
- **`admin::user`**
  - Added **`apiTokens`** one-to-many relation mapped by `apiToken.adminUserOwner`.

## Admin UI — permission matrix (ceiling-aware)

### Overview

The API token edit view now exposes an **Admin** permissions tab backed by the same matrix component used in the Roles edit page, extended with ceiling enforcement so users can only grant permissions within their own admin permission scope.

### Tab visibility rules in the edit view

- **Creating a new token** → only the Admin permissions matrix is shown (no Legacy tab).
- **Editing an owned token** (`adminUserOwner` is set) → two tabs: **Legacy** (existing content-API permissions) and **Admin** (admin permissions matrix).
- **Editing an ownerless content-api token** → only the Legacy tab (unchanged behavior, full back-compat).

### `Roles/utils/createPermissionChecker.ts` (new)

Two exported helpers used during bulk checkbox operations:

- `createFieldPermissionChecker(actionId, subject, userPermissions)` — returns a path-based checker that gates field-level leaf updates to the user's allowed fields for that action/subject pair.
- `createDynamicActionPermissionChecker(subject, actionId, userPermissions)` — same but resolves the `actionId` from the path when toggling a whole content-type row.

Both return `undefined` when `userPermissions` is absent, which signals "Role editing mode — no restrictions".

### `Roles/utils/updateValues.ts`

Added `updateValuesWithPermissions(obj, valueToSet, permissionChecker?, currentPath?, isFieldUpdate?)`:

- When `permissionChecker` is `undefined`, delegates to the original `updateValues` (Role editing, no change in behavior).
- When `permissionChecker` is provided (App Token editing), only sets leaf booleans to `valueToSet` if the checker approves the path; otherwise preserves the existing value.

### `Roles/components/Permissions.tsx`

Added optional `userPermissions?: AuthPermission[]` prop (the calling admin's own permissions, used as the ceiling):

- All dispatch handlers forward `userPermissions` to the reducer.
- **`ON_CHANGE_COLLECTION_TYPE_GLOBAL_ACTION_CHECKBOX`**: uses `createFieldPermissionChecker` + `updateValuesWithPermissions`; calls `inheritConditionsAtPath` on enable.
- **`ON_CHANGE_COLLECTION_TYPE_ROW_LEFT_CHECKBOX`**: gates simple field booleans and nested field objects through the ceiling checker; calls `inheritConditionsAtPath` on enable.
- **`ON_CHANGE_CONDITIONS`**: becomes a no-op when `userPermissions` is present (conditions are inherited, not user-chosen).
- **`ON_CHANGE_SIMPLE_CHECKBOX`**: calls `inheritConditionsAtPath` on enable when in App Token context.
- **`ON_CHANGE_TOGGLE_PARENT_CHECKBOX`**: uses `createDynamicActionPermissionChecker` + `updateValuesWithPermissions`; inherits conditions for the toggled action or all actions in a group.

When `userPermissions` is `undefined` the component behaves exactly as before (Role editing mode).

### UI-level ceiling enforcement (disabled checkboxes + read-only conditions)

So that less-privileged users cannot even _select_ permissions outside their ceiling, the matrix **visually disables** checkboxes the user is not allowed to grant. This is implemented via a shared helper in context and updates to all child components that render checkboxes.

#### `Roles/hooks/usePermissionsDataManager.tsx` (replaced `.ts`)

- Context now exposes **`checkUserHasPermission(action, subject?, field?)`**: returns `true` when `userPermissions` is undefined (Role editing, no restrictions), else checks for a matching permission by action + subject and, when `field` is provided, validates the field against `properties.fields` (exact or parent-path match).
- Provider is implemented as a component so it can derive `checkUserHasPermission` from `userPermissions` and pass it through context.

#### Child components (all under `Roles/components/`)

- **`CollapsePropertyMatrix.tsx`**: Threads **`subject`** prop through the component tree. **ActionRow** and **SubActionRow** call `checkUserHasPermission(actionId, subject, fieldPath)` (with `fieldPath` only when `propertyName === 'fields'`) and set `disabled={isFormDisabled || !userHasPermission}` on every field-level and parent checkboxes.
- **`ContentTypeCollapses.tsx`**: Passes **`subject={uid}`** to `Collapse` and `CollapsePropertyMatrix`. **Collapse** uses `checkUserHasPermission(actionId, subject)` to disable action-level checkboxes; passes **`isReadOnly={userPermissions !== undefined}`** to `ConditionsModal`.
- **`GlobalActions.tsx`**: For each global action, checks `checkUserHasPermission(actionId, subject)` for **all** subjects of that action; disables the global checkbox when `!userHasPermissionForAll`.
- **`ConditionsModal.tsx`**: New prop **`isReadOnly?: boolean`**. When `true`: shows inherited-readonly message, syncs local state from `modifiedData` on change, blocks edits in `handleChange`/`handleSubmit`, renders conditions as read-only text instead of `MultiSelectNested`, and footer shows only "Close". **ActionRow** supports **`isReadOnly`** and renders a read-only summary when set.
- **`PluginsAndSettings.tsx`**: **SubCategory** uses `checkUserHasPermission(action, null)` to disable plugin/settings checkboxes; passes **`isReadOnly={userPermissions !== undefined}`** to `ConditionsModal`.

Result: when editing a token as a non-super-admin, only checkboxes for permissions (and fields) the user holds are enabled; condition modal is read-only and reflects inherited conditions.

### `ApiTokens/EditView/components/AdminPermissions.tsx` (new)

Thin wrapper component:

- Fetches the admin permissions layout via `useGetRolePermissionLayoutQuery({ role: '' })` (default layout, no role scoping).
- Reads the calling user's permissions from `useAuth()` to pass as the ceiling.
- Renders `<Permissions ref={...} layout={layout} permissions={initialAdminPermissions} userPermissions={userPermissions} isFormDisabled={disabled} />`.
- Forwards a `PermissionsAPI` ref so the parent can call `getPermissions()` / `setFormAfterSubmit()` on save.

#### Owner-aware ceiling (`tokenId` + `ownerUserId` props)

A super admin can edit any admin token regardless of owner. Without a fix the matrix ceiling would reflect the super admin's own (unrestricted) permissions instead of the owner's scope. Two new props address this:

- **`tokenId?: string`** — the token being edited (undefined in create mode).
- **`ownerUserId?: Data.ID | null`** — the recorded owner; undefined in create mode.

Logic inside the component:

- `isCurrentUserOwner = !ownerUserId || ownerUserId === currentUser?.id`
- When `isCurrentUserOwner === false`, calls `useGetAPITokenOwnerPermissionsQuery(tokenId)` (see frontend service below) to fetch the owner's effective permissions; the query is skipped otherwise (no extra request when editing your own token).
- `effectivePermissions = isCurrentUserOwner ? currentUserPermissions : (ownerPermissions ?? currentUserPermissions)` is passed to `<Permissions userPermissions={...} />`.

Result: a super admin editing another user's token sees and can only enable the checkboxes that correspond to the owner's permission scope, not their own.

### `ApiTokens/EditView/EditViewPage.tsx`

- Added `adminPermissionsRef = React.useRef<PermissionsAPI>(null)`.
- On **create and update**: collects `adminPermissionsRef.current?.getPermissions().permissionsToSend ?? []` and passes it as `adminPermissions` in the mutation body (both `createToken` and `updateToken` already accept `adminPermissions` via the contract).
- Calls `adminPermissionsRef.current?.setFormAfterSubmit()` after a successful save to sync the form's initial state.
- Contract fix: `ApiTokenBody.adminPermissions` now omits `actionParameters` (consistent with `PermissionsAPI.getPermissions()` return type and `UpdateAdminPermissions.Request`).
- **Regenerate button (owner-only)**: Uses `useAuth` to get the current user. Helpers `getOwnerId(apiToken.adminUserOwner)` and `isCurrentUserTokenOwner(apiToken, currentUser?.id)` determine if the current user may regenerate the token. `canRegenerateToken = canRegenerate && isCurrentUserTokenOwner(...)` is passed to `FormHead` as `canRegenerate`. The Regenerate button is therefore hidden when the token has an owner and the current user is not that owner (e.g. super admin viewing another user's token). Ownerless content-api tokens: regenerate remains available when RBAC allows it.
- **Owner-aware ceiling**: derives `ownerUserId` from `apiToken.adminUserOwner` (via the existing `getOwnerId` helper) and passes it together with `tokenId={!isCreating && id ? id : undefined}` to `<AdminPermissions>`.

## Contracts + validation + routes (public surface)

### Contract changes

In `packages/core/admin/shared/contracts/api-token.ts`:

- `ApiToken` is now a discriminated union `ContentApiApiToken | AdminApiToken` (see "Token kind discriminant" section above). Both variants are exported.
- `ApiTokenBody` is likewise a discriminated union `ContentApiApiTokenBody | AdminApiTokenBody`.
- New endpoints:
  - **`GetAdminPermissions`**: `GET /api-tokens/:id/admin-permissions`
  - **`UpdateAdminPermissions`**: `PUT /api-tokens/:id/admin-permissions`
  - **`GetOwnerPermissions`**: `GET /api-tokens/:id/owner-permissions` — returns the effective permissions of the token owner (used by the frontend to set the correct ceiling when a super admin edits another user's token)

### Input validation changes

In `packages/core/admin/server/src/validation/api-tokens.ts`:

- `kind` is now required on create (`oneOf(['content-api', 'admin']).required()`) and optional on update.
- `type` changed to optional on both create and update (cross-field checks live in service).
- `adminPermissions` validated as array of `permission` (from `common-validators`).
- `adminUserOwner` accepted as `mixed().nullable()`.

### Route changes

In `packages/core/admin/server/src/routes/api-tokens.ts`:

- Added `GET /api-tokens/:id/admin-permissions` (requires `admin::api-tokens.read`)
- Added `PUT /api-tokens/:id/admin-permissions` (requires `admin::api-tokens.update`)
- Added `GET /api-tokens/:id/owner-permissions` (requires `admin::api-tokens.read`) — returns the owner's effective permissions; only callable by the token owner or a super admin

### Controller changes

In `packages/core/admin/server/src/controllers/api-token.ts`:

The controller is restructured around `token.kind`. See "Token kind discriminant — Controller restructure" above for the per-handler breakdown. Key points:

- `create()` builds kind-specific attribute objects — only the fields belonging to the kind are forwarded to the service (no stray fields crossing the boundary).
- `list()` passes `ctx.state.user` to `apiTokenService.list(ctx.state.user)` so ownership filtering is applied.
- `get()` / `regenerate()` use `isTokenOwner` (not `isSuperAdmin`) for the key-access gate — super-admin does NOT bypass.
- `getAdminPermissions` / `updateAdminPermissions` return `400 Bad Request` for content-api tokens.
- `getOwnerPermissions` — new handler: 404 if token missing; 400 if `kind !== 'admin'`; 403 if caller is not the owner or super-admin; fetches the owner user via `getService('user').findOne(ownerId)` and returns their effective permissions via `getService('permission').findUserPermissions(ownerUser)` (sanitized). Used by the frontend ceiling switch in `AdminPermissions`.

## Business logic added/changed (services)

### `packages/core/admin/server/src/services/api-token.ts`

#### 1) Token now selects/populates kind, owner + admin permissions

- `SELECT_FIELDS` includes `'kind'`.
- `POPULATE_FIELDS` is `['permissions', 'adminPermissions', 'adminUserOwner']`.

#### 1b) List: ownership filtering

`list(callingUser: AdminUser)` (required, non-optional):

- Super-admins → no `where` filter; all tokens returned (but `accessKey` is never in `SELECT_FIELDS`, so it is never exposed).
- Regular admins → `where: { $or: [{ adminUserOwner: null }, { adminUserOwner: { id: callingUser.id } }] }` — only content-api tokens and tokens owned by the caller are returned.

#### 1c) Access key: opt-in decryption

- `getBy(whereParams, options?)` no longer selects `encryptedKey` or decrypts by default. Plaintext `accessKey` is **not** returned unless requested.
- Option `{ includeDecryptedKey: true }` selects `encryptedKey`, decrypts, and returns plaintext `accessKey`. Used only when the controller has confirmed the caller is the owner (or the token is content-api).
- `getById(id, options?)` and `getByName(name, options?)` accept and forward the options.
- Auth strategy `getBy({ accessKey: hash(token) })` is unchanged and never requests decryption.

#### 2) Token creation: kind-branched

On `create(attributes, callingUser?)`:

- **`kind: 'content-api'`**
  - Calls `assertLegacyKindFields` (no admin fields allowed).
  - Validates content-API permissions (`assertCustomTokenPermissionsValidity`).
  - Writes `adminUserOwner: null` to DB.
- **`kind: 'admin'`**
  - Calls `assertAdminKindFields` (no content-api fields allowed).
  - Validates admin-permission actions exist and `validatePermissionsExist`.
  - **Enforces ceiling + clamps** via `enforceAdminPermissionsCeiling`.
  - Owner defaults to `callingUser.id`; explicit `adminUserOwner` must match caller.
  - Persists admin permissions as `admin::permission` rows with `apiToken = tokenId`, `role = null`.

#### 3) Token update: kind-immutable, kind-branched

On `update(id, attributes, callingUser?)`:

- **Kind immutability**: if `attributes.kind` is provided and differs from `originalToken.kind` → throws `ValidationError`.
- `kind` is stripped from the DB write.
- Branches on `originalToken.kind`:
  - `'content-api'`: content-api permission diff logic.
  - `'admin'`: resolves token owner, enforces ceiling against **owner** (not caller), then calls `assignAdminPermissionsToToken`.
- **`adminUserOwner` immutable**: if provided, it must equal the existing value.

#### 4) Core rule: admin permission "ceiling" enforcement (+ condition inheritance)

`enforceAdminPermissionsCeiling(user, requestedPermissions?) -> PermissionInput[]`:

- **Bypasses**
  - If `requestedPermissions` empty → returns `[]`
  - If user has `SUPER_ADMIN_CODE` role → returns requested as-is
- **Strict**: If admin permissions are requested but `user` is missing → throws `ValidationError` (no ceiling bypass).
- **Matching rule**
  - For each requested permission, it must match at least one user permission by:
    - `action` equality AND
    - `subject` equality, treating "missing subject" as `null`.
- **Field-level ceiling**
  - If any matching user permission has `properties.fields` undefined/empty → treat as "all fields allowed".
  - Else compute effective allowed fields as **union** across matching permissions' `properties.fields`.
  - If requested permission specifies fields, they must be a subset of the effective allowed fields.
- **Condition-level enforcement**
  - The caller cannot choose conditions for token permissions.
  - If any matching user permission is unconditional (`conditions` missing/empty) → enforced conditions become `[]`.
  - Else enforced conditions become the **union** across matching permissions' `conditions`.
  - The returned permission is "clamped" to these enforced conditions.
- If any permission exceeds the ceiling, throws `ValidationError` with a human-readable list (action/subject + optionally field names).

#### 5) Assign admin permissions to token (diff-based)

`assignAdminPermissionsToToken(tokenId, permissions, ceilingUser)` (`ceilingUser` is the token owner):

- Validates permissions exist.
- Enforces ceiling against `ceilingUser` (always the token owner, resolved by the caller) and uses **clamped** permissions.
- Converts requested permissions into permission objects linked to token (`apiToken`, `role: null`).
- Diffs against existing DB permissions for that token using `arePermissionsEqual` comparing:
  - `conditions`, `properties`, `subject`, `action`, `actionParameters`
- Deletes removed permissions and creates new ones, then returns the full current set.

### `packages/core/admin/server/src/services/permission/queries.ts`

`cleanPermissionsInDatabase()` now:

- Fetches permissions with `populate: ['role', 'apiToken']`.
- Deletes:
  - invalid permissions (existing logic: invalid action/subject/properties), and
  - **orphaned permissions** where **both** `role` and `apiToken` are missing.

This is important because permissions can now be attached to either a role or an api-token; "no role" is no longer automatically invalid, but "no role and no apiToken" is.

### `packages/core/admin/server/src/domain/permission/index.ts`

- Added `apiToken` into `permissionFields` so permission-domain creation/picking preserves token linkage.

## Admin UI — owner display

### Edit view (`FormApiTokenContainer.tsx`)

A read-only **Owner** field is shown in the token details section when:

- `adminUserOwner` is populated as an `AdminUser` object (not just an ID), AND
- the owner's `id` differs from the currently logged-in user's `id`.

This makes the field visible only to super admins viewing another user's token; owners editing their own token see no extra field. Display name is resolved as `firstname + lastname` → `username` → `email`.

### Regenerate button (EditViewPage → FormHead)

The **Regenerate** button is hidden (not rendered) when the API token has an owner and the current user is not that owner. Logic lives in `EditViewPage.tsx`: `canRegenerateToken = canRegenerate && isCurrentUserTokenOwner(apiToken, currentUser?.id)`; when the token has no owner (content-api) or the current user is the owner, the button is shown if RBAC allows (`canRegenerate`). This aligns with the backend rule that only the owner may call `POST .../regenerate` and read the new key.

### List view (`ListView.tsx` + `Table.tsx`)

Added an **Owner** column to the API tokens list table:

- `TABLE_HEADERS` in `ListView.tsx` gains an `adminUserOwner` entry (label "Owner", non-sortable).
- `Table.tsx` renders the corresponding cell conditionally on `tokenType === 'api-token'`, with the same name-resolution logic. Transfer token rows are unaffected (they keep their 4-column layout; the owner cell is never rendered for them).
- Ownerless / content-api tokens show an empty cell.

## Admin UI — kind-based rendering (EditViewPage + FormApiTokenContainer)

### Overview

The edit/create view now branches strictly on `kind` — no tab switching, no mixed layout.

### `resolvedKind` derivation

In `EditViewPage.tsx`:

- **Create mode**: `resolvedKind` is derived from the `?kind=` query param; when not set, default is `'content-api'`. Explicit `?kind=admin` yields admin kind.
- **Edit mode**: `resolvedKind` is `apiToken.kind` (immutable, sourced from server response).

No kind selector is ever rendered; `kind` cannot be changed in the UI.

### Rendering rules

| `resolvedKind`  | Permissions section                     | Token type selector |
| --------------- | --------------------------------------- | ------------------- |
| `'admin'`       | `<AdminPermissions>` matrix only        | Hidden              |
| `'content-api'` | Legacy `<Permissions>` (content routes) | Shown               |

The previous tab layout (`Legacy` / `Admin`) that was conditioned on `adminUserOwner` presence is removed. Kind is now the sole discriminant.

### `FormApiTokenContainer.tsx`

- Accepts a new required `kind: 'admin' | 'content-api'` prop.
- Renders `<TokenTypeSelect>` only when `kind === 'content-api'`.
- Owner read-only field logic is unchanged.

### Formik schema (`constants.ts`)

- `type` field changed from `required` to `optional` — admin tokens have no type.

### Discriminated request payloads

`handleSubmit` in `EditViewPage.tsx` builds strictly kind-scoped bodies:

- **Create** (always admin): `{ kind: 'admin', name, description, lifespan, adminPermissions }`
- **Update admin**: `{ kind: 'admin', name, description, adminPermissions }`
- **Update content-api**: `{ kind: 'content-api', name, description, type, permissions }`

No cross-kind fields are ever sent.

### Legacy reducer effects guarded by kind

`ON_CHANGE_READ_ONLY`, `SELECT_ALL_ACTIONS`, and `UPDATE_PERMISSIONS` dispatches are only triggered when `kind === 'content-api'`, preventing content-permissions state from polluting admin-token save payloads.

### `isCurrentUserTokenOwner` helper

Updated to check `apiToken.kind === 'admin'` before accessing `adminUserOwner`, so content-api tokens always return `true` (no owner restriction).

## Admin UI — test fixtures and tests

### `admin/tests/server.ts`

- Added `kind: 'content-api'` to existing `/admin/api-tokens` list and `/admin/api-tokens/:id` (id `'1'`) fixtures.
- Added a new `/admin/api-tokens/2` fixture returning an admin token (`kind: 'admin'`, `adminPermissions: []`, `adminUserOwner` populated).
- Extended `/admin/permissions` handler to also serve the full layout (with `collectionTypes`, `singleTypes`, `plugins`, `settings` sections) when `role === ''` — required by `AdminPermissions` which calls the endpoint without a role parameter.
- Added `/admin/admin-tokens` (list) and `/admin/admin-tokens/:id` fixtures returning an admin token — required by `AdminTokens/EditView/tests/EditViewPage.test.tsx`.

### `ApiTokens/EditView/tests/EditViewPage.test.tsx`

Replaced the single snapshot test with five focused behavioural tests:

| Test                                                 | Asserts                                             |
| ---------------------------------------------------- | --------------------------------------------------- |
| Create mode — renders form, hides type selector      | Form fields present; `Token type` absent            |
| Edit content-api (id 1) — renders type + permissions | `Token type` label present; `Address` route visible |
| Edit content-api (id 1) — hides admin matrix         | Admin matrix section title absent                   |
| Edit admin (id 2) — hides type selector              | `Token type` absent                                 |
| Edit admin (id 2) — hides content-api permissions    | Route-bound section absent                          |

### `AdminTokens/EditView/tests/EditViewPage.test.tsx` (new — 6 tests)

Mirror of the ApiTokens EditView test for the admin token edit view:

| Test | Asserts |
| ---- | ------- |
| Create mode — renders name and description fields | `Name` and `Description` present |
| Create mode — no Token type selector | `Token type` absent |
| Create mode — admin permissions matrix present | `Plugins` tab visible |
| Edit mode (id 1) — renders token name and description | `My admin token` and description visible |
| Edit mode (id 1) — no Token type selector | `Token type` absent |
| Edit mode (id 1) — admin permissions matrix present | `Plugins` tab visible |

## Backend — controller test segregation

### `controllers/__tests__/api-token.test.ts` (content-api only — 20 tests)

All admin-kind blocks removed and migrated to `admin-token.test.ts`:

- Removed: `Create > Admin kind` (3 tests), `Regenerate` admin-ownership tests (3 tests), `Retrieve` admin-token key tests (2 tests), `Update > Admin kind` (6 tests), `Update admin permissions` (5 tests), `Get owner permissions` (6 tests).
- `legacyBody` in the Update section no longer includes `kind: 'content-api'` — `apiTokenUpdateSchema` rejects `kind` as an unknown key (`.noUnknown()`), so the field must be absent.
- Three rejection tests updated: now expect Yup `.noUnknown()` errors (`/this field has unspecified keys: .../`) instead of service-layer errors, and `update` service mock is asserted **not** called (validation fires before the service is reached).

### `controllers/__tests__/admin-token.test.ts` (new — 33 tests)

New file importing `adminTokenController` from `../admin-token`. Test groups:

| Group | Tests |
| ----- | ----- |
| Create | success (kind hardcoded to `'admin'`), name taken, valid lifespan, strips content-api fields |
| List | calls service with `{ filter: { kind: 'admin' } }` |
| Revoke | success, token not found (no error) |
| Regenerate | owner succeeds; non-owner forbidden; super-admin forbidden (does NOT bypass); token not found |
| Get | owner gets key (2 `getById` calls); super-admin gets no key (1 call); not found |
| Update | owner succeeds; super-admin succeeds; non-owner+non-super-admin forbidden; not found; name taken |
| getAdminPermissions | not found, not owner/super-admin (403), returns permissions for owner, returns permissions for super-admin |
| updateAdminPermissions | not found, not owner (403), owner user not found, super-admin uses owner as ceiling, owner uses owner as ceiling |
| getOwnerPermissions | not found, not owner/super-admin (403), owner user not found, returns permissions for owner, returns permissions for super-admin |

### `strategies/__tests__/api-token.test.ts`

Added `kind: 'content-api'` to the `apiToken` fixture used in authenticate tests — required because the auth strategy now explicitly rejects tokens whose `kind !== 'content-api'` with `ForbiddenError('NON CONTENT API TOKEN NOT SUPPORTED')`.

Added a new `describe('Admin token owner status checks')` block with four cases covering the owner deactivation edge case (see "Auth strategy — admin token owner deactivation" section below).

## Auth strategy — strict route-type separation

### `register.ts`

`apiTokenAuthStrategy` is now registered for **both** route types:

```ts
strapi.get('auth').register('admin', apiTokenAuthStrategy);
strapi.get('auth').register('content-api', apiTokenAuthStrategy);
```

### `strategies/api-token.ts`

`authenticate()` reads `routeType = ctx.state.route?.info?.type` immediately after expiry/lastUsedAt handling and enforces strict kind ↔ route-type matching:

- `kind: 'content-api'` + `routeType !== 'content-api'` → `{ authenticated: false }`.
- `kind: 'admin'` + `routeType !== 'admin'` → `{ authenticated: false }`.
- `kind: 'admin'` + `routeType === 'admin'`:
  - Owner-existence check: if `adminUserOwner` is missing or not a populated object → `UnauthorizedError('Token owner not found')`.
  - Owner-deactivation check: if `owner.isActive !== true` OR `owner.blocked === true` → `UnauthorizedError('Token owner is deactivated')`.
  - Builds CASL ability via `getService('permission').engine.generateTokenAbility(apiToken.adminPermissions ?? [], owner)`.
  - Sets `ctx.state.userAbility = ability` and `ctx.state.user = owner` so the `isAuthenticatedAdmin` and `hasPermissions` policies work transparently.
  - Returns `{ authenticated: true, credentials: apiToken, ability }`.

`verify()` adds an early return for admin tokens — authorization is delegated to the admin route policies:

```ts
if (apiToken.kind === 'admin') {
  return;
}
```

### `services/permission/engine.ts`

Added `generateTokenAbility(tokenPermissions, owner)` alongside `generateUserAbility`:

```ts
async generateTokenAbility(tokenPermissions: Permission[], owner: AdminUser): Promise<Ability> {
  return engine.generateAbility(tokenPermissions as any, owner);
}
```

Token permissions are already validated and ceiling-clamped at write time, so no additional filtering is needed here.

### Invariants added / changed

| Rule                                                                | Where                        |
| ------------------------------------------------------------------- | ---------------------------- |
| Admin token rejected on content-api routes                          | `authenticate()` in strategy |
| Content-api token rejected on admin routes                          | `authenticate()` in strategy |
| Admin token rejected when owner `isActive === false`                | `authenticate()` in strategy |
| Admin token rejected when owner `blocked === true`                  | `authenticate()` in strategy |
| Admin token rejected when owner relation is not populated as object | `authenticate()` in strategy |
| Admin token `verify()` defers to policies (no scope check)          | `verify()` in strategy       |

## Role → API Token Permission Sync

When role permissions change, a user's role bindings change, or a role is deleted, all admin API tokens owned by affected users are automatically re-synced to stay within the owner's new effective ceiling.

### Three trigger paths

| Trigger                   | Entry point                                                          | Mechanism                                                                               |
| ------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Role permissions updated  | `roleService.assignPermissions()`                                    | Called at end when `permissionsToDelete.length > 0`                                     |
| User-role binding changed | `strapi.db.lifecycles` `afterUpdate` on `admin::user`                | Fires when `event.params.data?.roles` is present                                        |
| Role deleted              | `strapi.db.lifecycles` `beforeDelete`+`afterDelete` on `admin::role` | `beforeDelete` captures affected user IDs in `event.state`; `afterDelete` re-syncs each |
| Owner user deleted        | `strapi.db.lifecycles` `beforeDelete` on `admin::user`               | Calls `deleteAdminTokensForUser(userId)` — removes all admin tokens + their permissions |

All three paths converge on `syncApiTokenPermissionsForUser(userId)`, which runs after the triggering change is committed so `findUserPermissions` always reflects the post-change effective set.

### `reconcileTokenPermissionsToUserCeiling(userPermissions, tokenPermissions)` — pure, sync

Returns `{ toDelete: Permission[], toUpdate: { id, conditions }[] }`.

For each token permission:

- **No matching user permission** (action + subject) → `toDelete`
- **Token fields exceed user's allowed fields** → `toDelete`
- **Match found, fields OK** → compute enforced conditions:
  - any matching user perm unconditional → `enforcedConditions = []`
  - else → `enforcedConditions = uniq(union of all matching perms' conditions)`
  - if conditions differ from token's current → `toUpdate` (conditions copied from role into token)
  - otherwise → no-op

### `syncApiTokenPermissionsForUser(userId)` — async, exported

1. Fetch user with `populate: ['roles']` — skip if super-admin or not found
2. `findUserPermissions(user)` — effective permissions across **all** roles (so a permission shared by another role is preserved)
3. Find all `kind: 'admin'` tokens owned by the user
4. For each token: apply `reconcileTokenPermissionsToUserCeiling` → `deleteByIds(toDelete)` + `db.update(conditions)` for each `toUpdate`

### `syncApiTokenPermissionsForRole(roleId)` — async, exported

Finds all non-super-admin users holding `roleId`, calls `syncApiTokenPermissionsForUser` for each.

### Invariants preserved

- A token permission is only removed if **no** role the user still holds grants it — multi-role users are safe.
- Conditions are always copied from the role permission union into the token; the token owner cannot hold different conditions than their role dictates.
- Super-admins are always skipped (no ceiling applies).

## Behavioral implications / notes

- **`kind` is the canonical discriminant**: all code should branch on `token.kind`, not on the presence of `adminUserOwner`.
- **Owner deactivation blocks auth**: an admin token whose owner has `isActive === false` or `blocked === true` is rejected at the `authenticate()` level with `UnauthorizedError`. This prevents deactivated users from retaining API access through tokens they previously created.
- **Security posture improvement**: non-super-admins can't mint API tokens that grant broader admin powers than they personally have.
- **Condition inheritance is a strong constraint**: token admin permissions cannot be "less restrictive" (or arbitrarily different) than the caller's; conditions are enforced from the caller's own role permissions.
- **Field ceiling is enforced only when the user's permission is field-scoped**: if user has "all fields" for a matching permission (no `properties.fields`) then token can request any fields.
- **Token list visibility**: non-super-admins only receive content-api tokens and tokens they own from `GET /api-tokens`. Super admins receive all tokens. Neither role ever receives `accessKey` in the list (it is not in `SELECT_FIELDS`).
- **Access key visibility**: only the token owner can read the plaintext `accessKey` (via `GET /api-tokens/:id` or `POST .../regenerate`). Super admins can list and manage tokens but never see others' keys. Content-api tokens keep back-compat: any caller with route permission can read the key. All new admin tokens created via the UI are owned by their creator.
- **Admin UI**: Edit view uses explicit checks for `accessKey` (`!== undefined` and `!== ''`) in all three places: initial `apiToken` state, initial `showToken` state, and the render-time `canShowToken` / token box guard. When the API omits the key, "View token" is **hidden** (not merely disabled). The **Regenerate** button is similarly hidden via an explicit ownership check. Kind-based rendering replaces the previous `adminUserOwner`-based tab visibility.
- **Admin UI — permission matrix**: Ceiling is enforced in two layers: (1) **reducer** blocks state updates for bulk operations and for conditions when `userPermissions` is set; (2) **UI** disables checkboxes the user is not allowed to grant (via `checkUserHasPermission` in context) and shows the conditions modal as read-only when editing a token.
- **Admin UI — owner-aware ceiling**: When a super admin edits an admin token owned by another user, the permission matrix ceiling is set to the **owner's** effective permissions (fetched via `GET /api-tokens/:id/owner-permissions`) rather than the super admin's own (unrestricted) permissions. No extra request is made when the owner is editing their own token.
- **Backend — owner-based ceiling on update (edge case)**: The ceiling enforcement on `PUT /api-tokens/:id` and `PUT /api-tokens/:id/admin-permissions` is applied against the **token owner's** current permissions, not the calling user's. This prevents a race condition where a super admin editing another user's token could overflow that user's permission scope if the owner's roles had just been downgraded. The owner is resolved fresh from the DB on every update request.
- **Role → token sync — trigger 1 uses a direct call, not a lifecycle hook**: `syncApiTokenPermissionsForRole(roleId)` is called directly at the end of `roleService.assignPermissions()` rather than via a DB lifecycle. Reason: `assignPermissions()` only writes to `admin::permission` rows — the `admin::role` row is never `UPDATE`d, so the `admin::role` `afterUpdate` lifecycle never fires for permission changes. Hooking into `admin::permission` `afterDelete` instead would fire once per deleted row, requiring deduplication of `roleId` lookups and making it impossible to run after all deletions have settled. The direct call has `roleId` already in scope, runs once after the full diff is applied, and mirrors the existing `metrics.sendDidUpdateRolePermissions()` call above it. Lifecycle hooks are used only for triggers 2 (user-role binding) and 3 (role deletion) where the mutation goes through raw `strapi.db.query` calls outside any owned service method.

## Admin UI — kind-segregated settings pages

### Overview

The single `/settings/api-tokens` surface that previously handled both kinds is split into two independent pages:

| Route | Kind served | Sidebar section |
| ----- | ----------- | --------------- |
| `/settings/api-tokens` | `content-api` only | Global Settings |
| `/settings/admin-tokens` | `admin` only | Administration Panel (below "Users", above "Audit Logs") |

### Server-side kind filtering (`List` endpoint)

`GET /admin/api-tokens` now accepts an optional `kind` query param (`'content-api' | 'admin'`).

- **Contract** (`shared/contracts/api-token.ts`): `List.Request.query` gains `kind?: 'content-api' | 'admin'`.
- **Controller** (`controllers/api-token.ts`): extracts `kind` from `ctx.query`, passes `{ filter: { kind } }` to the service.
- **Service** (`services/api-token.ts`): `list()` signature changed to `list(callingUser, { filter?: { kind? } } = {})`.
  - When `filter.kind === 'content-api'`: `where` clause uses `{ $or: [{ kind: 'content-api' }, { kind: null }] }` to include legacy tokens whose `kind` column was never set (pre-migration rows default to `null`).
  - When `filter.kind === 'admin'`: strict `{ kind: 'admin' }` equality match.
  - When `filter.kind` is absent: no kind filter (returns all tokens subject to ownership rules).

### Frontend query update (`services/apiTokens.ts`)

`useGetAPITokensQuery` now accepts `ApiToken.List.Request['query'] | void`. When a `kind` is provided it is serialized as a `?kind=` query param via `config.params`. The content-api list view passes `{ kind: 'content-api' }`; the hook remains callable with no argument for any future call-site that needs all tokens.

Five additional admin-scoped hooks call the dedicated `/admin/admin-tokens` endpoints:

- `useGetAdminTokensQuery` → `GET /admin/admin-tokens`
- `useGetAdminTokenQuery` → `GET /admin/admin-tokens/:id`
- `useCreateAdminTokenMutation` → `POST /admin/admin-tokens`
- `useDeleteAdminTokenMutation` → `DELETE /admin/admin-tokens/:id`
- `useUpdateAdminTokenMutation` → `PUT /admin/admin-tokens/:id`

`AdminTokens/ListView.tsx` and `AdminTokens/EditView/EditViewPage.tsx` use these admin-scoped hooks exclusively.

### `ApiTokens/ListView.tsx` (simplified)

- `TABLE_HEADERS` reduced to: name, description, createdAt, lastUsedAt (removed `kind` and `adminUserOwner`).
- Calls `useGetAPITokensQuery({ kind: 'content-api' })`.
- Single **"Add new API Token"** create button → `/settings/api-tokens/create`. No `?kind=` query param needed — the page is implicitly content-api.
- `showKind` / `showOwner` not passed to `<Table>` (both default to `false`).

### `ApiTokens/EditView/EditViewPage.tsx` (simplified)

- `resolvedKind` derivation removed — always `'content-api'`.
- `adminPermissionsRef`, `AdminPermissions` import and render block removed.
- `handleSubmit` reduced to the content-api create and update paths.
- `FormHead` title simplified: **"Create Content API Token"** (create) / **"Edit API Token"** (edit).
- `contentAPIPermissionsQuery` and `contentAPIRoutesQuery` retained — still needed for the content-api permissions panel.
- `useAuth` and owner-related helpers removed (not needed for content-api tokens).

### `components/Tokens/Table.tsx` (new props)

Two explicit boolean props replace the `tokenType === 'api-token'` guards on the kind and owner cells:

- `showKind?: boolean` (default `false`) — controls the kind cell.
- `showOwner?: boolean` (default `false`) — controls the owner cell.

Transfer tokens list is unaffected (never passes these props, still renders 4 columns). The content-api list passes neither. The admin tokens list passes `showOwner={true}`.

### `AdminTokens/ListView.tsx` (new)

- `TABLE_HEADERS`: name, description, createdAt, lastUsedAt, adminUserOwner.
- Calls `useGetAdminTokensQuery()` → `GET /admin/admin-tokens`.
- Single **"Add new Admin Token"** create button → `/settings/admin-tokens/create`.
- Uses `state.admin_app.permissions.settings?.['admin-tokens']` for RBAC gating.
- Passes `showOwner={true}` to `<Table>`.

### `AdminTokens/EditView/EditViewPage.tsx` (new)

Standalone edit view locked to `kind: 'admin'`:

- `useMatch('/settings/admin-tokens/:id')` — own match path.
- No `contentAPIPermissionsQuery` or `contentAPIRoutesQuery`.
- Renders only `<AdminPermissions>` (the ceiling-aware permission matrix) — no `<Permissions>` panel.
- `handleSubmit` builds `AdminApiTokenBody` for both create and update.
- Navigate after create: `../admin-tokens/${id}` (resolves to `/settings/admin-tokens/:id`).
- Retains `isCurrentUserTokenOwner` + `canRegenerateToken` logic (owner-only regenerate).
- Uses `admin-tokens` RBAC permissions (maps to `admin::admin-tokens.*` backend actions via the dedicated controller/router).

### `AdminTokens/CreateView.tsx` (new)

Thin RBAC wrapper, mirrors `ApiTokens/CreateView.tsx`. Protects with `admin-tokens.create` permission and renders `AdminTokens/EditView`.

### Permissions plumbing (`types/permissions.ts` + `constants.ts`)

- `'admin-tokens'` added to the `SettingsPermissions` union type so `PermissionMap['settings']` includes it and the `useSettingsMenu` `addPermissions` lookup resolves correctly.
- `ADMIN_PERMISSIONS_CE.settings` gains an `'admin-tokens'` entry that maps to the **new** `admin::admin-tokens.*` backend actions (distinct from `admin::api-tokens.*`). See "RBAC separation" section below.

### Routes (`pages/Settings/constants.ts`)

Three new entries added to `ROUTES_CE`:

```
admin-tokens          → AdminTokens/ListView  (ProtectedListView)
admin-tokens/create   → AdminTokens/CreateView (ProtectedCreateView)
admin-tokens/:id      → AdminTokens/EditView/EditViewPage (ProtectedEditView)
```

## RBAC separation — `admin-tokens.*` vs `api-tokens.*`

### Overview

The `admin-tokens` settings page previously mapped its RBAC checks to the same `admin::api-tokens.*` backend actions as the `api-tokens` page, making the two sections indistinguishable at the backend. This iteration introduces a fully independent RBAC surface for admin tokens.

### New backend actions (`config/admin-actions.ts`)

Six new entries under `category: 'admin tokens'`:

| uid | displayName |
| --- | ----------- |
| `admin-tokens.access` | Access the Admin tokens settings page |
| `admin-tokens.create` | Create (generate) |
| `admin-tokens.read` | Read |
| `admin-tokens.update` | Update |
| `admin-tokens.delete` | Delete (revoke) |
| `admin-tokens.regenerate` | Regenerate |

### Frontend action mapping (`admin/src/constants.ts`)

`ADMIN_PERMISSIONS_CE.settings['admin-tokens']` updated from `admin::api-tokens.*` to `admin::admin-tokens.*`:

```typescript
'admin-tokens': {
  main:       [{ action: 'admin::admin-tokens.access',     subject: null }],
  create:     [{ action: 'admin::admin-tokens.create',     subject: null }],
  delete:     [{ action: 'admin::admin-tokens.delete',     subject: null }],
  read:       [{ action: 'admin::admin-tokens.read',       subject: null }],
  update:     [{ action: 'admin::admin-tokens.update',     subject: null }],
  regenerate: [{ action: 'admin::admin-tokens.regenerate', subject: null }],
},
```

### Dedicated router (`routes/admin-tokens.ts`) — new file

9 routes under `/admin-tokens`, all using `admin-token.*` handlers and `admin::admin-tokens.*` permissions. Registered in `routes/index.ts` alongside `apiTokens`.

### Dedicated controller (`controllers/admin-token.ts`) — new file

Admin-only controller — all `content-api` branches and `kind` guards are removed because the route is structurally scoped to admin tokens. Key differences from `api-token.ts`:

| Handler | Behaviour |
| ------- | --------- |
| `create` | Hardcodes `kind: 'admin'`; no content-api branch |
| `list` | Hardcodes `filter: { kind: 'admin' }`; ignores query param |
| `get` | Key exposed only to token owner; no content-api bypass |
| `update` | `canAccessAdminToken` guard always applied; no content-api bypass |
| `regenerate` | Owner-only gate; super-admin does NOT bypass |
| `getAdminPermissions` / `updateAdminPermissions` / `getOwnerPermissions` | No `kind === 'content-api'` badRequest guard |

Access-control helpers (`isSuperAdmin`, `getOwnerId`, `isTokenOwner`, `canAccessAdminToken`) are duplicated from `api-token.ts` into this file (pure functions with no shared state). Registered in `controllers/index.ts` as `'admin-token'`.

### `api-token.ts` controller — unchanged

The existing `api-token` controller is not modified. It continues to serve `/api-tokens` routes with `admin::api-tokens.*` permissions.

## Quick manual test ideas (high signal)

- **Kind enforcement (create)**
  - `POST /api-tokens` with `kind: 'content-api'` + `adminPermissions` → expect `ValidationError`.
  - `POST /api-tokens` with `kind: 'admin'` + `type: 'read-only'` → expect `ValidationError`.
  - `POST /api-tokens` with `kind: 'admin'` and no `callingUser` → expect `ValidationError`.
- **Kind immutability (update)**
  - `PUT /api-tokens/:id` with `kind: 'admin'` on a content-api token → expect `ValidationError`.
- **Ceiling (action/subject)**
  - As a non-super-admin, try to assign an admin permission you don't have → expect `ValidationError`.
- **Ceiling (fields)**
  - If your role permission is field-scoped, request a field outside your scope → expect `ValidationError`.
- **Conditions inheritance**
  - If your role permission has conditions, set token permission with different/no conditions → stored permission conditions should match inherited union (or empty if any unconditional match exists).
- **Token list (ownership filter)**
  - As a non-super-admin, `GET /api-tokens` → only content-api tokens and your own admin tokens are returned.
  - As super admin, `GET /api-tokens` → all tokens are returned (no `accessKey` in any entry).
- **Ownership**
  - Create an admin token; confirm `adminUserOwner` defaults to caller.
  - As a different non-super-admin, call `GET /admin-tokens/:id/admin-permissions` → expect `403`.
  - `GET /api-tokens/:id/admin-permissions` on a content-api token → expect `400 Bad Request` (legacy route still guards by kind).
- **Access key (owner-only)**
  - As owner, `GET /api-tokens/:id` → response includes `accessKey`; "View token" works in UI.
  - As super admin, `GET /api-tokens/:id` for a token owned by another user → response has no `accessKey`.
  - As super admin, `POST /api-tokens/:id/regenerate` for another user's token → expect `403`.
  - Content-api token: any user with read permission can `GET` and see `accessKey`.
- **Admin UI — Regenerate button**
  - As owner of an admin token, edit page shows Regenerate (when RBAC allows).
  - As super admin editing another user's token, Regenerate button is hidden.
  - Content-api token: Regenerate shown when RBAC allows.
- **Admin UI — kind-based section visibility**
  - Create a new token → admin permissions matrix shown, no token type selector.
  - Open a content-api token → token type selector + content permissions shown, no admin matrix.
  - Open an admin token → admin permissions matrix shown, no token type selector.
- **Admin UI — ceiling enforcement in matrix**
  - As a non-super-admin, enable a permission you hold → checkbox becomes checked.
  - Try to enable a permission you do not hold → checkbox stays unchecked (silently blocked by ceiling).
  - If your role permission is field-scoped, only allowed fields are selectable; others remain unchecked.
  - Condition checkboxes in the modal are read-only (inherited from your role) when editing a token.
- **Admin UI — owner-aware ceiling (super admin)**
  - As super admin, open another user's token → permission matrix only enables checkboxes within the owner's permission scope.
  - As super admin, open your own token → permission matrix shows your full (unrestricted) scope.
  - `GET /admin-tokens/:id/owner-permissions` on a content-api token → expect `404` (no such token on the admin-tokens router).
  - `GET /admin-tokens/:id/owner-permissions` as a non-super-admin who is not the owner → expect `403`.
- **Admin UI — save round-trip**
  - Enable some admin permissions on create → save → reopen → same permissions are pre-checked.
  - Uncheck a permission → save → reopen → permission is no longer checked.
- **Owner-based ceiling on update (backend)**
  - As super admin, try to assign a permission to a non-super-admin's token that the owner does not hold → expect `ValidationError` (ceiling enforced against owner, not super admin).
  - As super admin, assign only permissions within the owner's scope → expect success.
  - Downgrade an admin user's role; then as super admin try to update their token with a newly-forbidden permission → expect `ValidationError`.
  - `PUT /admin-tokens/:id/admin-permissions` with a deleted owner → expect `404 owner.notFound`.
- **Role → token sync (trigger 1: role permissions updated)**
  - Remove a permission from a role → admin tokens owned by users of that role should have the corresponding token permission deleted automatically.
  - Change conditions on a role permission → token permissions for that action/subject should have their conditions updated to match the new role conditions.
  - Add a permission to a role → existing token permissions are unaffected (sync only trims/re-clamps, never expands).
  - User holds two roles both granting permission X; remove X from one role → token keeps permission X (still granted by the other role).
- **Role → token sync (trigger 2: user-role binding changed)**
  - Remove a role from a user via `PUT /users/:id` → token permissions that were solely sourced from that role are deleted.
  - Add a role to a user → existing token permissions unaffected.
  - User holds two roles both granting permission X; remove one role → token keeps permission X.
- **Role → token sync (trigger 3: role deleted)**
  - Delete a role → all users who held it have their token permissions re-synced; permissions no longer covered by remaining roles are deleted.
  - Super-admin user's tokens are never touched regardless of which role is deleted.
- **Owner user deleted**
  - Delete an admin user → all `kind: 'admin'` tokens owned by that user are deleted (along with their `adminPermissions` rows).
- **UI segregation — list views**
  - Navigate to `/settings/api-tokens` → only content-api tokens listed; no Kind or Owner column; single "Add new API Token" button.
  - Navigate to `/settings/admin-tokens` → only admin tokens listed; Owner column present; single "Add new Admin Token" button.
  - Legacy tokens whose DB `kind` column is `null` appear in the `/settings/api-tokens` list (not in admin tokens list).
  - "Admin Tokens" sidebar entry visible under "Administration Panel" (below "Users", above "Audit Logs") for users with `admin::admin-tokens.access` permission.
- **UI segregation — create flows**
  - From `/settings/api-tokens`: clicking "Add new API Token" opens a create form with token type selector and content-api permissions panel; no admin permissions matrix.
  - From `/settings/admin-tokens`: clicking "Add new Admin Token" opens a create form with admin permissions matrix; no token type selector.
- **UI segregation — edit views**
  - Opening a content-api token via `/settings/api-tokens/:id` → token type + content permissions shown, no admin matrix, Regenerate available per RBAC.
  - Opening an admin token via `/settings/admin-tokens/:id` → admin permissions matrix shown, no token type, owner-aware ceiling enforced, Regenerate only for owner.
  - Navigating directly to `/settings/api-tokens/:id` for an admin token (or vice versa) does not crash — the page loads but displays the token with its fixed kind.
