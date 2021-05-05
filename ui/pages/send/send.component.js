import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { isValidAddress } from 'ethereumjs-util';
import { debounce } from 'lodash';
import {
  getToWarningObject,
  getToErrorObject,
} from './send-content/add-recipient/add-recipient';
import SendHeader from './send-header';
import AddRecipient from './send-content/add-recipient';
import SendContent from './send-content';
import SendFooter from './send-footer';
import EnsInput from './send-content/add-recipient/ens-input';
import {
  INVALID_RECIPIENT_ADDRESS_ERROR,
  KNOWN_RECIPIENT_ADDRESS_ERROR,
  CONTRACT_ADDRESS_ERROR,
} from './send.constants';

export default class SendTransactionScreen extends Component {
  static propTypes = {
    addressBook: PropTypes.arrayOf(PropTypes.object),
    history: PropTypes.object,
    chainId: PropTypes.string,
    resetSendState: PropTypes.func.isRequired,
    sendToken: PropTypes.object,
    showHexData: PropTypes.bool,
    to: PropTypes.string,
    toNickname: PropTypes.string,
    tokens: PropTypes.array,
    updateSendEnsResolution: PropTypes.func.isRequired,
    updateSendEnsResolutionError: PropTypes.func.isRequired,
    updateRecipient: PropTypes.func.isRequired,
    updateSendTokenBalance: PropTypes.func.isRequired,
    updateToNicknameIfNecessary: PropTypes.func.isRequired,
    scanQrCode: PropTypes.func.isRequired,
    qrCodeDetected: PropTypes.func.isRequired,
    qrCodeData: PropTypes.object,
    sendTokenAddress: PropTypes.string,
    gasIsExcessive: PropTypes.bool.isRequired,
    initializeSendState: PropTypes.func.isRequired,
    initialized: PropTypes.bool.isRequired,
  };

  static contextTypes = {
    t: PropTypes.func,
    metricsEvent: PropTypes.func,
  };

  state = {
    query: '',
    toError: null,
    toWarning: null,
    internalSearch: false,
  };

  constructor(props) {
    super(props);
    this.dValidate = debounce(this.validate, 1000);
  }

  componentDidUpdate(prevProps) {
    const {
      chainId,
      sendToken,
      updateRecipient,
      updateSendTokenBalance,
      to,
      toNickname,
      addressBook,
      updateToNicknameIfNecessary,
      qrCodeData,
      qrCodeDetected,
    } = this.props;
    const { toError, toWarning } = this.state;

    const {
      chainId: prevChainId,
      sendToken: prevSendToken,
      to: prevTo,
    } = prevProps;

    if (this.props.initialized === true) {
      if (chainId !== prevChainId && chainId !== undefined) {
        updateSendTokenBalance();
        updateToNicknameIfNecessary(to, toNickname, addressBook);
        this.props.initializeSendState();
      }
    }

    const prevTokenAddress = prevSendToken && prevSendToken.address;
    const sendTokenAddress = sendToken && sendToken.address;

    if (sendTokenAddress && prevTokenAddress !== sendTokenAddress) {
      this.validate(this.state.query);
    }

    let scannedAddress;
    if (qrCodeData) {
      if (qrCodeData.type === 'address') {
        scannedAddress = qrCodeData.values.address.toLowerCase();
        if (isValidAddress(scannedAddress)) {
          const currentAddress = prevTo?.toLowerCase();
          if (currentAddress !== scannedAddress) {
            updateRecipient({ address: scannedAddress });
            // Clean up QR code data after handling
            qrCodeDetected(null);
          }
        } else {
          scannedAddress = null;
          qrCodeDetected(null);
          this.setState({ toError: INVALID_RECIPIENT_ADDRESS_ERROR });
        }
      }
    }

    // If selecting ETH after selecting a token, clear token related messages.
    if (prevSendToken && !sendToken) {
      let error = toError;
      let warning = toWarning;

      if (toError === CONTRACT_ADDRESS_ERROR) {
        error = null;
      }

      if (toWarning === KNOWN_RECIPIENT_ADDRESS_ERROR) {
        warning = null;
      }

      this.setState({
        toError: error,
        toWarning: warning,
      });
    }
  }

  componentDidMount() {
    this.props.initializeSendState();
  }

  UNSAFE_componentWillMount() {
    // Show QR Scanner modal  if ?scan=true
    if (window.location.search === '?scan=true') {
      this.props.scanQrCode();

      // Clear the queryString param after showing the modal
      const cleanUrl = window.location.href.split('?')[0];
      window.history.pushState({}, null, `${cleanUrl}`);
      window.location.hash = '#send';
    }
  }

  componentWillUnmount() {
    this.props.resetSendState();
  }

  onRecipientInputChange = (query) => {
    const { internalSearch } = this.state;

    if (!internalSearch) {
      if (query) {
        this.dValidate(query);
      } else {
        this.dValidate.cancel();
        this.validate(query);
      }
    }

    this.setState({ query });
  };

  setInternalSearch(internalSearch) {
    this.setState({ query: '', internalSearch });
  }

  validate(query) {
    const { tokens, sendToken, chainId, sendTokenAddress } = this.props;

    const { internalSearch } = this.state;

    if (!query || internalSearch) {
      this.setState({ toError: '', toWarning: '' });
      return;
    }

    const toErrorObject = getToErrorObject(query, sendTokenAddress, chainId);
    const toWarningObject = getToWarningObject(query, tokens, sendToken);

    this.setState({
      toError: toErrorObject.to,
      toWarning: toWarningObject.to,
    });
  }

  render() {
    const { history, to } = this.props;
    let content;

    if (to) {
      content = this.renderSendContent();
    } else {
      content = this.renderAddRecipient();
    }

    return (
      <div className="page-container">
        <SendHeader history={history} />
        {this.renderInput()}
        {content}
      </div>
    );
  }

  renderInput() {
    const { internalSearch } = this.state;
    return (
      <EnsInput
        className="send__to-row"
        scanQrCode={(_) => {
          this.context.metricsEvent({
            eventOpts: {
              category: 'Transactions',
              action: 'Edit Screen',
              name: 'Used QR scanner',
            },
          });
          this.props.scanQrCode();
        }}
        onChange={this.onRecipientInputChange}
        onValidAddressTyped={(address) =>
          this.props.updateRecipient({ address, nickname: '' })
        }
        onPaste={(text) => {
          this.props.updateRecipient({ address: text });
        }}
        onReset={() =>
          this.props.updateRecipient({ address: '', nickname: '' })
        }
        updateEnsResolution={this.props.updateSendEnsResolution}
        updateEnsResolutionError={this.props.updateSendEnsResolutionError}
        internalSearch={internalSearch}
      />
    );
  }

  renderAddRecipient() {
    const { toError, toWarning } = this.state;
    return (
      <AddRecipient
        query={this.state.query}
        toError={toError}
        toWarning={toWarning}
        setInternalSearch={(internalSearch) =>
          this.setInternalSearch(internalSearch)
        }
      />
    );
  }

  renderSendContent() {
    const { history, showHexData, gasIsExcessive } = this.props;
    const { toWarning, toError } = this.state;

    return [
      <SendContent
        key="send-content"
        showHexData={showHexData}
        warning={toWarning}
        error={toError}
        gasIsExcessive={gasIsExcessive}
      />,
      <SendFooter key="send-footer" history={history} />,
    ];
  }
}
