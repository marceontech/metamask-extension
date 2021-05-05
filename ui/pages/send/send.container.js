import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';
import { compose } from 'redux';

import {
  getAddressBook,
  isCustomPriceExcessive,
  getCurrentChainId,
} from '../../selectors';

import { showQrScanner, qrCodeDetected } from '../../store/actions';
import {
  resetSendState,
  updateSendTokenBalance,
  updateSendEnsResolution,
  updateSendEnsResolutionError,
  updateRecipient,
  getSendToken,
  getSendTo,
  getSendToNickname,
  getSendTokenAddress,
  initializeSendState,
  isSendStateInitialized,
} from '../../ducks/send';
import { getQrCodeData } from '../../ducks/app/app';
import {
  getTokens,
  getSendHexDataFeatureFlagState,
} from '../../ducks/metamask/metamask';
import { isValidDomainName } from '../../helpers/utils/util';
import SendEther from './send.component';

function mapStateToProps(state) {
  return {
    addressBook: getAddressBook(state),
    chainId: getCurrentChainId(state),
    qrCodeData: getQrCodeData(state),
    sendToken: getSendToken(state),
    showHexData: getSendHexDataFeatureFlagState(state),
    to: getSendTo(state),
    toNickname: getSendToNickname(state),
    tokens: getTokens(state),
    sendTokenAddress: getSendTokenAddress(state),
    gasIsExcessive: isCustomPriceExcessive(state, true),
    initialized: isSendStateInitialized(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    initializeSendState: () => dispatch(initializeSendState()),
    updateSendTokenBalance: () => {
      dispatch(updateSendTokenBalance());
    },
    updateRecipient: ({ address, nickname }) =>
      dispatch(updateRecipient({ address, nickname })),
    resetSendState: () => dispatch(resetSendState()),
    scanQrCode: () => dispatch(showQrScanner()),
    qrCodeDetected: (data) => dispatch(qrCodeDetected(data)),
    updateSendEnsResolution: (ensResolution) =>
      dispatch(updateSendEnsResolution(ensResolution)),
    updateSendEnsResolutionError: (message) =>
      dispatch(updateSendEnsResolutionError(message)),
    updateToNicknameIfNecessary: (to, toNickname, addressBook) => {
      if (isValidDomainName(toNickname)) {
        const addressBookEntry =
          addressBook.find(({ address }) => to === address) || {};
        if (!addressBookEntry.name !== toNickname) {
          dispatch(
            updateRecipient({
              address: to,
              nickname: addressBookEntry.name ?? '',
            }),
          );
        }
      }
    },
  };
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(SendEther);
