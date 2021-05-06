/* eslint-disable react/prop-types */

import React from 'react';
import { select, text } from '@storybook/addon-knobs';
import PermissionsConnectHeader from '.'
import { PermissionPageContainerComponent } from '../permission-page-container'

export default {
  title: 'Confirmations',
};

export const Header = ({
  icon = 'test',
  iconName = 'tester',
  siteOrigin = 'PancakeSwap',
  headerTitle = 'Title',
  headerText = 'Header Text'
}) => (
  <PermissionsConnectHeader
    icon={icon}
    iconName={iconName}
    siteOrigin={siteOrigin}
    headerTitle={headerTitle}
    headerText={headerText}
  />
);

export const Permission = ({

}) => (
  <PermissionPageContainerComponent
    targetDomainMetadata={{
      extensionId: '1',
      icon: 'icon',
      host: 'host',
      name: 'PancakeSwap',
      origin: 'origin',
    }}
    rejectPermissionsRequest={() => {}}
    approvePermissionsRequest={() => {}}
  />
)