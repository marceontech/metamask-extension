import React from 'react';
import { shallow } from 'enzyme';
import sinon from 'sinon';
import {
  RINKEBY_CHAIN_ID,
  ROPSTEN_CHAIN_ID,
} from '../../../shared/constants/network';
import SendTransactionScreen from './send.component';
import * as util from './send.utils';

import SendHeader from './send-header/send-header.container';
import SendContent from './send-content/send-content.container';
import SendFooter from './send-footer/send-footer.container';

import AddRecipient from './send-content/add-recipient/add-recipient.container';

jest.mock('./send.utils', () => ({
  getToAddressForGasUpdate: jest.fn().mockReturnValue('mockAddress'),
  getAmountErrorObject: jest.fn().mockReturnValue({
    amount: 'mockAmountError',
  }),
  getGasFeeErrorObject: jest.fn().mockReturnValue({
    gasFee: 'mockGasFeeError',
  }),
  doesAmountErrorRequireUpdate: jest.fn(
    (obj) => obj.balance !== obj.prevBalance,
  ),
}));

let initialized = false;

describe('Send Component', () => {
  let wrapper, didMountSpy, updateGasSpy;

  const mockBasicGasEstimates = {
    blockTime: 'mockBlockTime',
  };

  const propsMethodSpies = {
    initializeSendState: jest.fn(() => {
      initialized = true;
    }),
    updateAndSetGasLimit: jest.fn(),
    updateSendErrors: jest.fn(),
    updateSendTokenBalance: jest.fn(),
    resetSendState: jest.fn(),
    fetchBasicGasEstimates: jest.fn(() =>
      Promise.resolve(mockBasicGasEstimates),
    ),
    fetchGasEstimates: jest.fn(),
    updateToNicknameIfNecessary: jest.fn(),
  };

  beforeAll(() => {
    didMountSpy = sinon.spy(
      SendTransactionScreen.prototype,
      'componentDidMount',
    );
  });

  beforeEach(() => {
    initialized = false;
    wrapper = shallow(
      <SendTransactionScreen
        from={{ address: 'mockAddress', balance: 'mockBalance' }}
        gasTotal="mockGasTotal"
        history={{ mockProp: 'history-abc' }}
        chainId={ROPSTEN_CHAIN_ID}
        sendToken={{ address: 'mockTokenAddress', decimals: 18, symbol: 'TST' }}
        showHexData
        initialized={initialized}
        qrCodeDetected={() => undefined}
        scanQrCode={() => undefined}
        initializeSendState={propsMethodSpies.initializeSendState}
        updateSendEnsResolution={() => undefined}
        updateSendEnsResolutionError={() => undefined}
        updateRecipient={() => undefined}
        updateSendTokenBalance={propsMethodSpies.updateSendTokenBalance}
        resetSendState={propsMethodSpies.resetSendState}
        updateToNicknameIfNecessary={
          propsMethodSpies.updateToNicknameIfNecessary
        }
        gasIsExcessive={false}
      />,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    didMountSpy.resetHistory();
  });

  describe('componentDidMount', () => {
    it('should call componentDidMount', () => {
      expect(didMountSpy.callCount).toStrictEqual(1);
    });

    it('should call initializeSendState', () => {
      expect(propsMethodSpies.initializeSendState).toHaveBeenCalledTimes(1);
    });
  });

  describe('componentWillUnmount', () => {
    it('should call this.props.resetSendState', () => {
      propsMethodSpies.resetSendState.mockClear();
      expect(propsMethodSpies.resetSendState).not.toHaveBeenCalled();
      wrapper.instance().componentWillUnmount();
      expect(propsMethodSpies.resetSendState).toHaveBeenCalled();
    });
  });

  describe('componentDidUpdate', () => {
    it('should call doesAmountErrorRequireUpdate with the expected params', () => {
      wrapper.instance().componentDidUpdate({
        from: {
          balance: '',
        },
      });
      expect(util.doesAmountErrorRequireUpdate).toHaveBeenCalled();
      expect(util.doesAmountErrorRequireUpdate.mock.calls[0][0]).toMatchObject({
        balance: 'mockBalance',
        gasTotal: 'mockGasTotal',
        prevBalance: '',
        prevGasTotal: undefined,
        prevTokenBalance: undefined,
        sendToken: {
          address: 'mockTokenAddress',
          decimals: 18,
          symbol: 'TST',
        },
        tokenBalance: 'mockTokenBalance',
      });
    });

    it('should call updateSendErrors with the expected params if sendToken is falsy', () => {
      wrapper.setProps({ sendToken: null });
      wrapper.instance().componentDidUpdate({
        from: {
          balance: 'balanceChanged',
        },
      });
      expect(propsMethodSpies.updateSendErrors).toHaveBeenCalledTimes(1);
      expect(propsMethodSpies.updateSendErrors.mock.calls[0][0]).toMatchObject({
        amount: 'mockAmountError',
        gasFee: null,
      });
    });
    it('should not call updateSendTokenBalance or this.updateGas if network === prevNetwork', () => {
      propsMethodSpies.updateSendTokenBalance.mockClear();
      wrapper.instance().componentDidUpdate({
        from: {
          balance: 'balanceChanged',
        },
        chainId: ROPSTEN_CHAIN_ID,
        sendToken: { address: 'mockTokenAddress', decimals: 18, symbol: 'TST' }, // Make sure not to hit updateGas when changing asset
      });
      expect(propsMethodSpies.updateSendTokenBalance).not.toHaveBeenCalled();
      expect(updateGasSpy.callCount).toStrictEqual(0);
    });

    it('should not call updateSendTokenBalance or this.updateGas if network === loading', () => {
      propsMethodSpies.updateSendTokenBalance.mockClear();
      updateGasSpy.resetHistory();
      wrapper.setProps({ network: 'loading' });
      wrapper.instance().componentDidUpdate({
        from: {
          balance: 'balanceChanged',
        },
        chainId: ROPSTEN_CHAIN_ID,
        sendToken: { address: 'mockTokenAddress', decimals: 18, symbol: 'TST' }, // Make sure not to hit updateGas when changing asset
      });
      expect(propsMethodSpies.updateSendTokenBalance).not.toHaveBeenCalled();
      expect(updateGasSpy.callCount).toStrictEqual(0);
    });

    it('should call updateSendTokenBalance and this.updateGas with the correct params', () => {
      updateGasSpy.resetHistory();
      wrapper.instance().componentDidUpdate({
        from: {
          balance: 'balanceChanged',
        },
        chainId: RINKEBY_CHAIN_ID,
        sendToken: { address: 'mockTokenAddress', decimals: 18, symbol: 'TST' }, // Make sure not to hit updateGas when changing asset
      });
      expect(propsMethodSpies.updateSendTokenBalance).toHaveBeenCalled();
      expect(
        propsMethodSpies.updateSendTokenBalance.mock.calls[0][0],
      ).toMatchObject({
        sendToken: {
          address: 'mockTokenAddress',
          decimals: 18,
          symbol: 'TST',
        }, // Make sure not to hit updateGas when changing asset
        tokenContract: { method: 'mockTokenMethod' },
        address: 'mockAddress',
      });
      expect(updateGasSpy.callCount).toStrictEqual(1);
    });

    it('should call updateGas when sendToken.address is changed', () => {
      wrapper.instance().componentDidUpdate({
        from: {
          balance: 'balancedChanged',
        },
        chainId: ROPSTEN_CHAIN_ID, // Make sure not to hit updateGas when changing network
        sendToken: { address: 'newSelectedToken' },
      });
      expect(
        propsMethodSpies.updateToNicknameIfNecessary,
      ).not.toHaveBeenCalled(); // Network did not change
      expect(propsMethodSpies.updateAndSetGasLimit).toHaveBeenCalled();
    });
  });

  describe('updateGas', () => {
    it('should call updateAndSetGasLimit with the correct params if no to prop is passed', () => {
      propsMethodSpies.updateAndSetGasLimit.mockClear();
      wrapper.instance().updateGas();
      expect(propsMethodSpies.updateAndSetGasLimit).toHaveBeenCalled();
      expect(
        propsMethodSpies.updateAndSetGasLimit.mock.calls[0][0],
      ).toMatchObject({
        blockGasLimit: 'mockBlockGasLimit',
        editingTransactionId: 'mockEditingTransactionId',
        gasLimit: 'mockGasLimit',
        gasPrice: 'mockGasPrice',
        selectedAddress: 'mockSelectedAddress',
        sendToken: {
          address: 'mockTokenAddress',
          decimals: 18,
          symbol: 'TST',
        },
        to: 'mockAddress',
        value: 'mockAmount',
        data: undefined,
      });
    });
  });

  describe('render', () => {
    it('should render a page-container class', () => {
      expect(wrapper.find('.page-container')).toHaveLength(1);
    });

    it('should render SendHeader and AddRecipient', () => {
      expect(wrapper.find(SendHeader)).toHaveLength(1);
      expect(wrapper.find(AddRecipient)).toHaveLength(1);
    });

    it('should pass the history prop to SendHeader and SendFooter', () => {
      wrapper.setProps({
        to: '0x80F061544cC398520615B5d3e7A3BedD70cd4510',
      });
      expect(wrapper.find(SendHeader)).toHaveLength(1);
      expect(wrapper.find(SendContent)).toHaveLength(1);
      expect(wrapper.find(SendFooter)).toHaveLength(1);
      expect(wrapper.find(SendFooter).props()).toStrictEqual({
        history: { mockProp: 'history-abc' },
      });
    });

    it('should pass showHexData to SendContent', () => {
      wrapper.setProps({
        to: '0x80F061544cC398520615B5d3e7A3BedD70cd4510',
      });
      expect(wrapper.find(SendContent).props().showHexData).toStrictEqual(true);
    });
  });

  describe('validate when input change', () => {
    let clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('should validate when input changes', () => {
      const instance = wrapper.instance();
      instance.onRecipientInputChange(
        '0x80F061544cC398520615B5d3e7A3BedD70cd4510',
      );

      expect(instance.state).toStrictEqual({
        internalSearch: false,
        query: '0x80F061544cC398520615B5d3e7A3BedD70cd4510',
        toError: null,
        toWarning: null,
      });
    });

    it('should validate when input changes and has error', () => {
      const instance = wrapper.instance();
      instance.onRecipientInputChange(
        '0x80F061544cC398520615B5d3e7a3BedD70cd4510',
      );

      clock.tick(1001);
      expect(instance.state).toStrictEqual({
        internalSearch: false,
        query: '0x80F061544cC398520615B5d3e7a3BedD70cd4510',
        toError: 'invalidAddressRecipient',
        toWarning: null,
      });
    });

    it('should validate when input changes and has error on a bad network', () => {
      wrapper.setProps({ network: 'bad' });
      const instance = wrapper.instance();
      instance.onRecipientInputChange(
        '0x80F061544cC398520615B5d3e7a3BedD70cd4510',
      );

      clock.tick(1001);
      expect(instance.state).toStrictEqual({
        internalSearch: false,
        query: '0x80F061544cC398520615B5d3e7a3BedD70cd4510',
        toError: 'invalidAddressRecipient',
        toWarning: null,
      });
    });

    it('should synchronously validate when input changes to ""', () => {
      wrapper.setProps({ network: 'bad' });
      const instance = wrapper.instance();
      instance.onRecipientInputChange(
        '0x80F061544cC398520615B5d3e7a3BedD70cd4510',
      );

      clock.tick(1001);
      expect(instance.state).toStrictEqual({
        internalSearch: false,
        query: '0x80F061544cC398520615B5d3e7a3BedD70cd4510',
        toError: 'invalidAddressRecipient',
        toWarning: null,
      });

      instance.onRecipientInputChange('');
      expect(instance.state).toStrictEqual({
        internalSearch: false,
        query: '',
        toError: '',
        toWarning: '',
      });
    });

    it('should warn when send to a known token contract address', () => {
      wrapper.setProps({ address: '0x888', decimals: 18, symbol: '888' });
      const instance = wrapper.instance();
      instance.onRecipientInputChange(
        '0x13cb85823f78Cff38f0B0E90D3e975b8CB3AAd64',
      );

      clock.tick(1001);
      expect(instance.state).toStrictEqual({
        internalSearch: false,
        query: '0x13cb85823f78Cff38f0B0E90D3e975b8CB3AAd64',
        toError: null,
        toWarning: 'knownAddressRecipient',
      });
    });
  });
});
