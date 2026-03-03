# Plan: `api-token` service factory

## Goal

Eliminate all `as AdminApiToken` / `as ContentApiApiToken` casts at callsites by turning the flat
`api-token.ts` service into a **factory function** that returns a narrowly-typed service object
keyed to a specific `kind`.

---

## Current problems

| Symptom | Root cause |
| ------- | ---------- |
| `apiTokenService.create(…) as AdminApiToken` (admin-token.ts controller, line 76) | `create` returns `AnyApiToken` |
| `apiTokenService.getById(id) as AdminApiToken` (admin-token.ts controller, line 129) | `getById` returns `AnyApiToken \| null` |
| `apiTokenService.revoke(id) as AdminApiToken` (admin-token.ts controller, line 117) | `revoke` returns `AnyApiToken` |
| `apiTokenService.update(id, body) as AdminApiToken` (admin-token.ts controller, line 178) | `update` returns `AnyApiToken` |
| Same pattern repeated in api-token.ts controller | Same cause |
| `list` receives a redundant `{ filter: { kind } }` param from every call-site | Call-site must remember which kind it serves |
| Admin-specific methods (`assignAdminPermissionsToToken`, sync helpers) are visible on any call that imports the service | No structural separation |

---

## Proposed API

### Factory signature

```ts
// api-token.ts  (factory exported from the service file)

function createTokenService(kind: 'content-api'): ContentApiTokenService;
function createTokenService(kind: 'admin'): AdminTokenService;
```

### Service registry (`services/index.ts`)

The factory is called **at registration time**, producing two typed singleton service objects:

```ts
import { createTokenService } from './api-token';

export default {
  // ...existing entries...
  'api-token-content-api': createTokenService('content-api'),
  'api-token-admin':        createTokenService('admin'),
  // 'api-token' entry removed — no longer needed
};
```

### `getService` type widening

`getService` must be updated to map the two new keys to their return types:

```ts
'api-token-content-api' → ContentApiTokenService
'api-token-admin'       → AdminTokenService
```

### `ContentApiTokenService`

```ts
interface ContentApiTokenService {
  // CRUD
  create(attributes: ContentApiApiTokenBody, callingUser?: AdminUser): Promise<ContentApiApiToken>;
  list(callingUser: AdminUser): Promise<ContentApiApiToken[]>;
  getById(id: string | number, options?: GetByOptions): Promise<ContentApiApiToken | null>;
  getByName(name: string, options?: GetByOptions): Promise<ContentApiApiToken | null>;
  update(id: string | number, attributes: ContentApiUpdateBody): Promise<ContentApiApiToken>;
  revoke(id: string | number): Promise<ContentApiApiToken>;
  regenerate(id: string | number): Promise<ContentApiApiToken>;
  exists(where: WhereParams): Promise<boolean>;
  count(where?: object): Promise<number>;
}
```

### `AdminTokenService`

```ts
interface AdminTokenService {
  // CRUD
  create(attributes: AdminTokenBody, callingUser: AdminUser): Promise<AdminApiToken>;
  list(callingUser: AdminUser): Promise<AdminApiToken[]>;
  getById(id: string | number, options?: GetByOptions): Promise<AdminApiToken | null>;
  getByName(name: string, options?: GetByOptions): Promise<AdminApiToken | null>;
  update(id: string | number, attributes: AdminUpdateBody): Promise<AdminApiToken>;
  revoke(id: string | number): Promise<AdminApiToken>;
  regenerate(id: string | number): Promise<AdminApiToken>;
  exists(where: WhereParams): Promise<boolean>;
  count(where?: object): Promise<number>;
  // Admin-only
  assignAdminPermissionsToToken(
    tokenId: Data.ID,
    permissions: PermissionInput[],
    ceilingUser: AdminUser
  ): Promise<Permission[]>;
  syncPermissionsForUser(userId: Data.ID): Promise<void>;
  syncPermissionsForRole(roleId: Data.ID): Promise<void>;
  deleteTokensForUser(userId: Data.ID): Promise<void>;
}
```

### Shared methods (included in both services)

Operations that don't depend on `kind` are still exposed on every service instance so that
callsites only ever import `createTokenService` — no secondary imports needed.

```ts
interface SharedTokenMethods {
  // Utility — no DB access
  hash(accessKey: string): string;
  checkSaltIsDefined(): void;

  // Kind-agnostic DB lookups
  // `getByAccessKey` returns AnyApiToken because the auth strategy reads
  // token.kind *after* the lookup and must handle both shapes.
  getByAccessKey(accessKeyHash: string): Promise<AnyApiToken | null>;
  countAll(where?: object): Promise<number>;

  // Pure sync helper (no DB, no strapi reference)
  reconcileTokenPermissionsToUserCeiling(
    userPermissions: Permission[],
    tokenPermissions: Permission[]
  ): { toDelete: Permission[]; toUpdate: { id: Data.ID; conditions: string[] }[] };
}
```

`ContentApiTokenService` and `AdminTokenService` both extend `SharedTokenMethods`.

> **Why keep them on the instance rather than as separate named exports?**
> Every callsite already holds a service reference. Attaching shared helpers to it avoids a
> second import and keeps the public API surface of the module to a single entry point:
> `createTokenService(kind)`.

---

## Internal structure of the factory

The factory is **thin**: it does not contain duplicate logic. Internally it delegates to the
existing kind-branched helpers. The three layers are:

```
createTokenService(kind)
  └── returns object whose methods call existing helpers
        ├── create    → existing create(attrs, user) — already branches on kind
        ├── list      → existing list(user, { filter: { kind } }) — kind baked in
        ├── getById   → existing getBy({ id }) narrowed by cast + optional kind filter
        ├── update    → existing update(id, attrs) — already branches on kind
        ├── revoke    → existing revoke(id)  cast to K-token
        ├── regenerate→ existing regenerate(id) cast to K-token
        └── (admin only)
              ├── assignAdminPermissionsToToken → existing helper
              ├── syncPermissionsForUser        → syncApiTokenPermissionsForUser
              ├── syncPermissionsForRole        → syncApiTokenPermissionsForRole
              └── deleteTokensForUser           → deleteAdminTokensForUser
```

In the initial pass the internal casts are still present inside the factory, but they are now
**contained in one place** instead of leaking to every callsite. A follow-up can replace them with
runtime kind guards or DB-level kind filters.

### Optional: add implicit kind filter to `getById` / `getByName`

For defence-in-depth the factory's `getById(id)` can add `where: { id, kind }` to the DB query.
This means an admin-token controller cannot accidentally load a content-api token with the same id.
This is a **behaviour change** — mark as a separate step in the migration so it can be verified
independently.

---

## Callsite migration

All callsites keep using `getService(...)` — only the key changes.

### `controllers/api-token.ts`

```ts
// Before
const apiTokenService = getService('api-token');
const apiToken = await apiTokenService.create(attributes, ctx.state.user);  // AnyApiToken — needs cast

// After
const apiTokenService = getService('api-token-content-api');  // ContentApiTokenService
const apiToken = await apiTokenService.create(attributes, ctx.state.user);  // ContentApiApiToken — no cast
```

All 5 methods (`create`, `list`, `get`, `update`, `revoke`) drop their `as ContentApiApiToken` cast.
`list` no longer passes `{ filter: { kind: 'content-api' } }`.

### `controllers/admin-token.ts`

```ts
// Before
const apiTokenService = getService('api-token');
const apiToken = await apiTokenService.create(attributes, ctx.state.user) as AdminApiToken;

// After
const apiTokenService = getService('api-token-admin');  // AdminTokenService
const apiToken = await apiTokenService.create(attributes, ctx.state.user);  // AdminApiToken — no cast
```

- All casts removed from `create`, `list`, `get`, `update`, `revoke`, `regenerate`.
- `assignAdminPermissionsToToken` accessed directly from the typed service.
- `isTokenOwner` / `canAccessAdminToken` helpers remain in the controller (view-layer concerns).

### `strategies/api-token.ts`

`getByAccessKey` is part of `SharedTokenMethods`, present on both services. The strategy can use
either — pick `'api-token-admin'` as convention (or `'api-token-content-api'`; the underlying
query is identical since `getByAccessKey` ignores kind):

```ts
// Before
const apiTokenService = getService('api-token');
const token = await apiTokenService.getBy({ accessKey: hash });

// After
const adminTokenService = getService('api-token-admin');
const token = await adminTokenService.getByAccessKey(hash);  // returns AnyApiToken | null
// strategy then branches on token.kind as before
```

### `services/role.ts`

```ts
// Before
await getService('api-token').syncApiTokenPermissionsForRole(roleId);

// After
await getService('api-token-admin').syncPermissionsForRole(roleId);
```

### `bootstrap.ts`

```ts
// Lifecycle hooks
await getService('api-token-admin').deleteTokensForUser(event.params.where.id);
await getService('api-token-admin').syncPermissionsForUser(event.result.id);

// createDefaultAPITokensIfNeeded — countAll is on SharedTokenMethods
const count = await getService('api-token-admin').countAll();
```

### `services/homepage.ts`

```ts
// Before
const countApiTokens = await getService('api-token').count();

// After
const countApiTokens = await getService('api-token-admin').countAll();
// countAll counts both kinds — getService choice is arbitrary here
```

---

## File structure after migration

```
services/
  api-token.ts           — existing file, kept for now (re-exports factory + standalones)
  createTokenService.ts  — new file with factory + interfaces
```

Or consolidate into `api-token.ts` directly if the file length is acceptable.

---

## Migration steps

1. **Define interfaces** (`SharedTokenMethods`, `ContentApiTokenService`, `AdminTokenService`) and
   the factory in `api-token.ts` — no runtime changes yet.
2. **Register in `services/index.ts`**: add `'api-token-content-api'` and `'api-token-admin'`
   entries; remove `'api-token'`.
3. **Widen `getService` types** to map the two new keys to their service interfaces.
4. **Migrate `controllers/api-token.ts`** → `getService('api-token-content-api')`, drop casts.
5. **Migrate `controllers/admin-token.ts`** → `getService('api-token-admin')`, drop casts.
6. **Migrate `strategies/api-token.ts`** → `getService('api-token-admin').getByAccessKey(hash)`.
7. **Migrate `services/role.ts`** and **`bootstrap.ts`** → `getService('api-token-admin')`.
8. **Migrate `services/homepage.ts`** → `getService('api-token-admin').countAll()`.
9. **Optional hardening**: add implicit `kind` filter inside factory's `getById` / `getByName`.
10. **Remove** internal kind-branching in `create` / `update` once the factory wrappers are the
    sole callers.

---

## Risks / open questions

| Item | Note |
| ---- | ---- |
| `update` for admin currently **requires** `adminPermissions` in the body, throwing `ValidationError('Invalid API Token kind')` when absent. The `AdminUpdateBody` type should reflect this. | Model the update body as `{ name?; description?; adminPermissions: PermissionInput[] }` — `adminPermissions` required on admin update. |
| `count` on the factory scopes to the kind via `where: { kind }`. `countAll` remains separate. | homepage.ts and bootstrap need `countAll`, not kind-scoped count. |
| `getByAccessKey` bypasses the factory completely — it must remain kind-agnostic for the auth strategy. | Fine: auth strategy is the only place that needs it. |
| Existing service tests mock `getService('api-token')` as a flat object. | Tests for controllers need updating to mock `'api-token-content-api'` / `'api-token-admin'` respectively. |
| `'api-token'` key removal is a breaking change for any plugin that calls `getService('api-token')` externally. | Document as a breaking change; provide a deprecation path if needed. |
