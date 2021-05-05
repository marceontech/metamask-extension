import React, { Component } from 'react';
import PropTypes from 'prop-types';
import SendRowWrapper from '../send-row-wrapper';
import UserPreferencedCurrencyInput from '../../../../components/app/user-preferenced-currency-input';
import UserPreferencedTokenInput from '../../../../components/app/user-preferenced-token-input';
import AmountMaxButton from './amount-max-button';

export default class SendAmountRow extends Component {
  static propTypes = {
    amount: PropTypes.string,
    balance: PropTypes.string,
    conversionRate: PropTypes.number,
    gasTotal: PropTypes.string,
    inError: PropTypes.bool,
    primaryCurrency: PropTypes.string,
    sendToken: PropTypes.object,
    tokenBalance: PropTypes.string,
    updateGasFeeError: PropTypes.func,
    updateSendAmount: PropTypes.func,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  componentDidUpdate(prevProps) {
    const { gasTotal: prevGasTotal } = prevProps;
    const { amount, gasTotal } = this.props;

    if (prevGasTotal !== gasTotal) {
      this.validateAmount(amount);
    }
  }

  validateAmount() {
    const {
      balance,
      conversionRate,
      gasTotal,
      primaryCurrency,
      sendToken,
      tokenBalance,
      updateGasFeeError,
    } = this.props;

    if (sendToken) {
      updateGasFeeError({
        balance,
        conversionRate,
        gasTotal,
        primaryCurrency,
        sendToken,
        tokenBalance,
      });
    }
  }

  handleChange = (newAmount) => {
    this.validateAmount(newAmount);
    this.props.updateSendAmount(newAmount);
  };

  renderInput() {
    const { amount, inError, sendToken } = this.props;

    return sendToken ? (
      <UserPreferencedTokenInput
        error={inError}
        onChange={this.handleChange}
        token={sendToken}
        value={amount}
      />
    ) : (
      <UserPreferencedCurrencyInput
        error={inError}
        onChange={this.handleChange}
        value={amount}
      />
    );
  }

  render() {
    const { gasTotal, inError } = this.props;

    return (
      <SendRowWrapper
        label={`${this.context.t('amount')}:`}
        showError={inError}
        errorType="amount"
      >
        {gasTotal && <AmountMaxButton inError={inError} />}
        {this.renderInput()}
      </SendRowWrapper>
    );
  }
}
