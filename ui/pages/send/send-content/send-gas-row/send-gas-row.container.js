import { connect } from 'react-redux';
import {
  getAdvancedInlineGasShown,
  getCurrentEthBalance,
  getBasicGasEstimateLoadingStatus,
  getRenderableEstimateDataForSmallButtonsFromGWEI,
  getDefaultActiveButtonIndex,
  getIsMainnet,
  getIsEthGasPriceFetched,
  getNoGasPriceFetched,
} from '../../../../selectors';
import { isBalanceSufficient } from '../../send.utils';
import { calcMaxAmount } from '../send-amount-row/amount-max-button/amount-max-button.utils';
import {
  showGasButtonGroup,
  updateSendErrors,
  updateSendAmount,
  getGasTotal,
  getGasPrice,
  getGasLimit,
  getSendAmount,
  getSendFromBalance,
  getTokenBalance,
  getSendMaxModeState,
  getGasLoadingError,
  gasFeeIsInError,
  getGasButtonGroupShown,
  getSendToken,
  updateGasPrice,
  updateGasLimit,
} from '../../../../ducks/send';
import { getConversionRate } from '../../../../ducks/metamask/metamask';
import {
  resetCustomData,
  setCustomGasPrice,
  setCustomGasLimit,
} from '../../../../ducks/gas/gas.duck';
import { showModal } from '../../../../store/actions';
import SendGasRow from './send-gas-row.component';

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
)(SendGasRow);

function mapStateToProps(state) {
  const gasButtonInfo = getRenderableEstimateDataForSmallButtonsFromGWEI(state);
  const gasPrice = getGasPrice(state);
  const gasLimit = getGasLimit(state);
  const activeButtonIndex = getDefaultActiveButtonIndex(
    gasButtonInfo,
    gasPrice,
  );

  const gasTotal = getGasTotal(state);
  const conversionRate = getConversionRate(state);
  const balance = getCurrentEthBalance(state);

  const insufficientBalance = !isBalanceSufficient({
    amount: getSendToken(state) ? '0x0' : getSendAmount(state),
    gasTotal,
    balance,
    conversionRate,
  });
  const isEthGasPrice = getIsEthGasPriceFetched(state);
  const noGasPrice = getNoGasPriceFetched(state);

  return {
    balance: getSendFromBalance(state),
    gasTotal,
    gasFeeError: gasFeeIsInError(state),
    gasLoadingError: getGasLoadingError(state),
    gasPriceButtonGroupProps: {
      buttonDataLoading: getBasicGasEstimateLoadingStatus(state),
      defaultActiveButtonIndex: 1,
      newActiveButtonIndex: activeButtonIndex > -1 ? activeButtonIndex : null,
      gasButtonInfo,
    },
    gasButtonGroupShown: getGasButtonGroupShown(state),
    advancedInlineGasShown: getAdvancedInlineGasShown(state),
    gasPrice,
    gasLimit,
    insufficientBalance,
    maxModeOn: getSendMaxModeState(state),
    sendToken: getSendToken(state),
    tokenBalance: getTokenBalance(state),
    isMainnet: getIsMainnet(state),
    isEthGasPrice,
    noGasPrice,
  };
}

function mapDispatchToProps(dispatch) {
  return {
    showCustomizeGasModal: () =>
      dispatch(showModal({ name: 'CUSTOMIZE_GAS', hideBasic: true })),
    updateGasPrice: (gasPrice) => {
      dispatch(updateGasPrice(gasPrice));
      dispatch(setCustomGasPrice(gasPrice));
    },
    updateGasLimit: (newLimit) => {
      dispatch(updateGasLimit(newLimit));
      dispatch(setCustomGasLimit(newLimit));
    },
    setAmountToMax: (maxAmountDataObject) => {
      dispatch(updateSendErrors({ amount: null }));
      dispatch(updateSendAmount(calcMaxAmount(maxAmountDataObject)));
    },
    showGasButtonGroup: () => dispatch(showGasButtonGroup()),
    resetCustomData: () => dispatch(resetCustomData()),
  };
}

function mergeProps(stateProps, dispatchProps, ownProps) {
  const { gasPriceButtonGroupProps } = stateProps;
  const { gasButtonInfo } = gasPriceButtonGroupProps;
  const {
    updateGasPrice: dispatchUpdateGasPrice,
    showGasButtonGroup: dispatchShowGasButtonGroup,
    resetCustomData: dispatchResetCustomData,
    ...otherDispatchProps
  } = dispatchProps;

  return {
    ...stateProps,
    ...otherDispatchProps,
    ...ownProps,
    gasPriceButtonGroupProps: {
      ...gasPriceButtonGroupProps,
      handleGasPriceSelection: dispatchUpdateGasPrice,
    },
    resetGasButtons: () => {
      dispatchResetCustomData();
      dispatchUpdateGasPrice(gasButtonInfo[1].priceInHexWei);
      dispatchShowGasButtonGroup();
    },
    updateGasPrice: dispatchUpdateGasPrice,
  };
}
