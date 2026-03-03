import * as React from 'react';

import { Page } from '../../../../../../components/PageHelpers';
import { useAuth } from '../../../../../../features/Auth';
import { useGetAPITokenOwnerPermissionsQuery } from '../../../../../../services/apiTokens';
import { useGetRolePermissionLayoutQuery } from '../../../../../../services/users';
import { Permissions, PermissionsAPI } from '../../../Roles/components/Permissions';

import type { Permission } from '../../../../../../../../shared/contracts/shared';
import type { Data } from '@strapi/types';

interface AdminPermissionsProps {
  disabled?: boolean;
  initialAdminPermissions: Permission[];
  /** Undefined in create mode. */
  tokenId?: string;
  /** The owner's user id. Undefined in create mode, null when unset. */
  ownerUserId?: Data.ID | null;
}

const AdminPermissions = React.forwardRef<PermissionsAPI, AdminPermissionsProps>(
  ({ disabled, initialAdminPermissions, tokenId, ownerUserId }, ref) => {
    const { permissions: currentUserPermissions, user: currentUser } = useAuth(
      'AdminPermissions',
      (auth) => auth
    );

    const isCurrentUserOwner =
      ownerUserId === undefined || ownerUserId === null || ownerUserId === currentUser?.id;

    const { data: ownerPermissions } = useGetAPITokenOwnerPermissionsQuery(tokenId!, {
      skip: isCurrentUserOwner || tokenId === undefined,
    });

    const { data: layout, isLoading, error } = useGetRolePermissionLayoutQuery({ role: '' });

    if (isLoading) {
      return <Page.Loading />;
    }

    if (error !== undefined || layout === undefined) {
      return null;
    }

    const effectivePermissions = isCurrentUserOwner
      ? currentUserPermissions
      : (ownerPermissions ?? currentUserPermissions);

    return (
      <Permissions
        ref={ref}
        layout={layout}
        permissions={initialAdminPermissions}
        userPermissions={effectivePermissions}
        isFormDisabled={disabled}
      />
    );
  }
);

export { AdminPermissions };
export type { AdminPermissionsProps };
