import { connect } from 'react-redux';
import { getConversionRate } from '../../../../ducks/metamask/metamask';
import {
  updateSendAmount,
  getGasTotal,
  getPrimaryCurrency,
  getSendToken,
  getSendAmount,
  getSendFromBalance,
  getTokenBalance,
  getSendMaxModeState,
  sendAmountIsInError,
  toggleSendMaxMode,
} from '../../../../ducks/send';
import SendAmountRow from './send-amount-row.component';

export default connect(mapStateToProps, mapDispatchToProps)(SendAmountRow);

function mapStateToProps(state) {
  return {
    amount: getSendAmount(state),
    balance: getSendFromBalance(state),
    conversionRate: getConversionRate(state),
    gasTotal: getGasTotal(state),
    inError: sendAmountIsInError(state),
    primaryCurrency: getPrimaryCurrency(state),
    sendToken: getSendToken(state),
    tokenBalance: getTokenBalance(state),
    maxModeOn: getSendMaxModeState(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    toggleSendMaxMode: () => dispatch(toggleSendMaxMode()),
    updateSendAmount: (newAmount) => dispatch(updateSendAmount(newAmount)),
  };
}
