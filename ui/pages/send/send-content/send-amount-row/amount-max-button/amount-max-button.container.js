import { connect } from 'react-redux';
import { getBasicGasEstimateLoadingStatus } from '../../../../../selectors';
import {
  getSendMaxModeState,
  toggleSendMaxMode,
} from '../../../../../ducks/send';
import AmountMaxButton from './amount-max-button.component';

export default connect(mapStateToProps, mapDispatchToProps)(AmountMaxButton);

function mapStateToProps(state) {
  return {
    buttonDataLoading: getBasicGasEstimateLoadingStatus(state),
    maxModeOn: getSendMaxModeState(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    toggleSendMaxMode: () => dispatch(toggleSendMaxMode()),
  };
}
