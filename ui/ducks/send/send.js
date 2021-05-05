import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import abi from 'human-standard-token-abi';
import log from 'loglevel';
import { addHexPrefix } from 'ethereumjs-util';
import { debounce } from 'lodash';
import {
  conversionGreaterThan,
  multiplyCurrencies,
  subtractCurrencies,
} from '../../helpers/utils/conversion-util';
import { GAS_LIMITS } from '../../../shared/constants/gas';
import {
  INSUFFICIENT_FUNDS_ERROR,
  INSUFFICIENT_TOKENS_ERROR,
  MIN_GAS_LIMIT_HEX,
  NEGATIVE_ETH_ERROR,
} from '../../pages/send/send.constants';

import {
  addGasBuffer,
  calcGasTotal,
  calcTokenBalance,
  generateTokenTransferData,
  isBalanceSufficient,
  isTokenBalanceSufficient,
} from '../../pages/send/send.utils';
import {
  getAveragePriceEstimateInHexWEI,
  getGasPriceInHexWei,
  getSelectedAccount,
  getTargetAccount,
} from '../../selectors';
import { estimateGas } from '../../store/actions';
import {
  fetchBasicGasEstimates,
  setCustomGasLimit,
  SET_BASIC_GAS_ESTIMATE_DATA,
} from '../gas/gas.duck';
import { SELECTED_ACCOUNT_CHANGED } from '../../store/actionConstants';
import { getConversionRate } from '../metamask/metamask';

const name = 'send';

function computeGasFeeError({
  gasTotal,
  conversionRate,
  primaryCurrency,
  etherBalance,
}) {
  if (gasTotal && conversionRate) {
    const insufficientFunds = !isBalanceSufficient({
      amount: '0x0',
      balance: etherBalance,
      conversionRate,
      gasTotal,
      primaryCurrency,
    });

    if (insufficientFunds) {
      return INSUFFICIENT_FUNDS_ERROR;
    }
  }
  return null;
}

function computeSendError({
  gasTotal,
  sendToken,
  conversionRate,
  primaryCurrency,
  etherBalance,
  tokenBalance,
  amount,
}) {
  if (gasTotal && conversionRate && !sendToken) {
    if (
      isBalanceSufficient({
        amount,
        balance: etherBalance,
        conversionRate,
        gasTotal,
        primaryCurrency,
      }) === false
    ) {
      return INSUFFICIENT_FUNDS_ERROR;
    }
  }

  if (sendToken && tokenBalance !== null) {
    const { decimals } = sendToken;
    if (
      isTokenBalanceSufficient({
        tokenBalance,
        amount,
        decimals,
      }) === false
    ) {
      return INSUFFICIENT_TOKENS_ERROR;
    }
  }

  const amountLessThanZero = conversionGreaterThan(
    { value: 0, fromNumericBase: 'dec' },
    { value: amount, fromNumericBase: 'hex' },
  );
  if (amountLessThanZero) {
    return NEGATIVE_ETH_ERROR;
  }
  return null;
}

async function estimateGasLimitForSend({
  selectedAddress,
  value,
  gasPrice,
  sendToken,
  to,
  data,
  blockGasLimit,
}) {
  // The parameters below will be sent to our background process to estimate
  // how much gas will be used for a transaction. That background process is
  // located in tx-gas-utils.js in the transaction controller folder.
  const paramsForGasEstimate = { from: selectedAddress, value, gasPrice };

  if (sendToken) {
    if (!to) {
      // if no to address is provided, we cannot generate the token transfer
      // hexData, which is the core component to our background process that
      // estimates gasLimit. We must use our best guess, which is represented
      // in the gas shared constants.
      return GAS_LIMITS.BASE_TOKEN_ESTIMATE;
    }
    paramsForGasEstimate.value = '0x0';
    // We have to generate the erc20 contract call to transfer tokens in
    // order to get a proper estimate for gasLimit.
    paramsForGasEstimate.data = generateTokenTransferData({
      toAddress: to,
      amount: value,
      sendToken,
    });
    paramsForGasEstimate.to = sendToken.address;
  } else {
    if (!data) {
      // eth.getCode will return the compiled smart contract code at the
      // address if this returns 0x, 0x0 or a nullish value then the address
      // is an externally owned account (NOT a contract account). For these
      // types of transactions the gasLimit will always be 21,000 or 0x5208
      const contractCode = Boolean(to) && (await global.eth.getCode(to));
      // Geth will return '0x', and ganache-core v2.2.1 will return '0x0'
      const contractCodeIsEmpty =
        !contractCode || contractCode === '0x' || contractCode === '0x0';
      if (contractCodeIsEmpty) {
        return GAS_LIMITS.SIMPLE;
      }
    }

    paramsForGasEstimate.data = data;

    if (to) {
      paramsForGasEstimate.to = to;
    }

    if (!value || value === '0') {
      // ??? Assuming that the value cannot be nullish or 0 to properly
      // estimate gasLimit?
      paramsForGasEstimate.value = '0xff';
    }
  }

  // If we do not yet have a gasLimit, we must call into our background
  // process to get an estimate for gasLimit based on known parameters.

  paramsForGasEstimate.gas = addHexPrefix(
    multiplyCurrencies(blockGasLimit ?? MIN_GAS_LIMIT_HEX, 0.95, {
      multiplicandBase: 16,
      multiplierBase: 10,
      roundDown: '0',
      toNumericBase: 'hex',
    }),
  );
  try {
    // call into the background process that will simulate transaction
    // execution on the node and return an estimate of gasLimit
    const estimatedGasLimit = await estimateGas(paramsForGasEstimate);
    const estimateWithBuffer = addGasBuffer(
      estimatedGasLimit.toString(16),
      blockGasLimit,
      1.5,
    );
    return addHexPrefix(estimateWithBuffer);
  } catch (error) {
    const simulationFailed =
      error.message.includes('Transaction execution error.') ||
      error.message.includes(
        'gas required exceeds allowance or always failing transaction',
      );
    if (simulationFailed) {
      const estimateWithBuffer = addGasBuffer(
        paramsForGasEstimate.gas,
        blockGasLimit,
        1.5,
      );
      return addHexPrefix(estimateWithBuffer);
    }
    log.error(error);
    throw error;
  }
}

const computeEstimatedGasLimitAsyncThunk = createAsyncThunk(
  'send/computeEstimatedGasLimit',
  async (payload, thunkApi) => {
    // Indicate to the user that the app has started estimating gasLimit. Note
    // that this gas loading variable is specific to just gasLimit, not gas
    // price.
    const currentState = thunkApi.getState();
    if (!currentState.send.editingTransactionId) {
      const gasLimit = await estimateGasLimitForSend({
        gasPrice: currentState.send.gasPrice,
        blockGasLimit: currentState.metamask.blockGasLimit,
        selectedAddress: currentState.metamask.selectedAddress,
        sendToken: currentState.send.sendToken,
        to: currentState.send.to.toLowerCase(),
        value: payload?.amount ?? currentState.send.draftTransaction.value,
        data: payload?.hexData ?? currentState.send.draftTransaction.data,
      });
      await thunkApi.dispatch(setCustomGasLimit(gasLimit));
      return {
        gasLimit,
      };
    }
    return null;
  },
);

const computeEstimatedGasLimitDebounced = debounce(
  (dispatch) => dispatch(computeEstimatedGasLimitAsyncThunk()),
  1000,
);

export const initializeSendState = createAsyncThunk(
  'send/initializeSendState',
  async (_, thunkApi) => {
    const state = thunkApi.getState();
    const selectedAccount = getSelectedAccount(state);
    await thunkApi.dispatch(fetchBasicGasEstimates());
    const result = await thunkApi.dispatch(
      computeEstimatedGasLimitAsyncThunk(),
    );
    const updatedState = thunkApi.getState();
    const gasPrice = getAveragePriceEstimateInHexWEI(updatedState);
    const gasLimit = result?.payload?.gasLimit ?? GAS_LIMITS.SIMPLE;
    return {
      address: selectedAccount.address,
      balance: selectedAccount.balance,
      gasPrice,
      gasLimit: updatedState.gasLimit,
      primaryCurrency: getPrimaryCurrency(updatedState),
      conversionRate: getConversionRate(updatedState),
      gasTotal: calcGasTotal(gasLimit, gasPrice),
    };
  },
);

export const initialState = {
  sendStateStatus: 'UNINITIALIZED',
  gasButtonGroupShown: true,
  gasIsLoading: false,
  gasTotal: '0x0',
  tokenBalance: '0x0',
  etherBalance: '0x0',
  draftTransaction: {
    from: '',
    to: '',
    data: null,
    value: '0',
    gas: '0', // this is gasLimit
    gasPrice: '0x0',
  },
  recipient: {
    address: '',
    nickname: '',
  },
  memo: '',
  errors: {},
  warnings: {},
  maxModeOn: false,
  editingTransactionId: null,
  ensResolution: null,
  ensResolutionError: '',
};

function computeMaximumEtherToSend(balance, gasTotal) {
  return subtractCurrencies(addHexPrefix(balance), addHexPrefix(gasTotal), {
    toNumericBase: 'hex',
    aBase: 16,
    bBase: 16,
  });
}

function computeMaximumTokenToSend(balance, token) {
  const decimals = token?.decimals ?? 0;
  const multiplier = Math.pow(10, Number(decimals));

  return multiplyCurrencies(balance, multiplier, {
    toNumericBase: 'hex',
    multiplicandBase: 16,
    multiplierBase: 10,
  });
}

const slice = createSlice({
  name,
  initialState,
  reducers: {
    beginEditingTransaction: (state, action) => {
      state.editingTransactionId = action.payload.id;
      state.gasLimit = action.payload.gasLimit;
      state.gasPrice = action.payload.gasPrice;
      state.amount = action.payload.amount;
      state.errors.to = null;
      state.errors.amount = null;
      state.to = action.payload.to;
      state.toNickname = action.payload.toNickname;
      state.from = action.payload.from;
    },
    clearMaximumAmount: (state) => {
      state.maxModeOn = false;
      state.amount = '0x0';
    },
    updateSendErrors: (state, action) => {
      state.errors = { ...state.errors, ...action.payload };
    },
    showGasButtonGroup: (state) => {
      state.gasButtonGroupShown = true;
    },
    hideGasButtonGroup: (state) => {
      state.gasButtonGroupShown = false;
    },
    updateDraftTransaction: (state, action) => {
      state.draftTransaction.gas ??= action.payload.gasLimit;
      state.draftTransaction.gasPrice ??= action.payload.gasPrice;
      state.draftTransaction.data ??= action.payload.hexData;
      state.draftTransaction.from ??= action.payload.from;
      const newGasTotal = calcGasTotal(
        state.draftTransaction.gas,
        state.draftTransaction.gasPrice,
      );
      let newValue = null;
      if (newGasTotal !== state.gasTotal) {
        state.gasTotal = newGasTotal;
        // TODO: remove dependency on conversionRate/primaryCurrency
        state.errors.gasFee = computeGasFeeError({
          gasTotal: state.gasTotal,
          conversionRate: action.payload.conversionRate,
          etherBalance: state.etherBalance,
          primaryCurrency: action.payload.primaryCurrency,
        });
        if (state.maxModeOn && !action.payload.amount) {
          newValue = state.sendToken
            ? computeMaximumTokenToSend(state.tokenBalance, state.sendToken)
            : computeMaximumEtherToSend(state.etherBalance, state.gasTotal);
        }
      }
      if (action.payload.amount) {
        state.maxModeOn = false;
        newValue = action.payload.amount;
      }
      if (newValue) {
        state.draftTransaction.value = newValue;
        state.errors.amount = computeSendError({
          gasTotal: state.gasTotal,
          conversionRate: action.payload.conversionRate,
          etherBalance: state.etherBalance,
          primaryCurrency: action.payload.primaryCurrency,
          amount: state.draftTransaction.value,
          sendToken: state.sendToken,
          tokenBalance: state.tokenBalance,
        });
      }
      // must check if new send amount is in error, if the amount changes based on
      // either maxMode calculation or by being set by the user.
    },
    updateGasLimit: (state, action) => {
      state.gasLimit = action.payload.gasLimit;
      state.gasTotal = calcGasTotal(state.gasLimit, state.gasPrice);
      if (state.maxModeOn) {
        state.amount = state.sendToken
          ? computeMaximumTokenToSend(state.tokenBalance, state.sendToken)
          : computeMaximumEtherToSend(state.etherBalance, state.gasTotal);
      }
      state.errors.gasFee = computeGasFeeError({
        gasTotal: state.gasTotal,
        conversionRate: action.payload.conversionRate,
        etherBalance: state.etherBalance,
        primaryCurrency: action.payload.primaryCurrency,
      });
    },
    updateGasPrice: (state, action) => {
      state.gasPrice = action.payload;
      state.gasTotal = calcGasTotal(state.gasLimit, state.gasPrice);
      if (state.maxModeOn) {
        state.amount = state.sendToken
          ? computeMaximumTokenToSend(state.tokenBalance, state.sendToken)
          : computeMaximumEtherToSend(state.etherBalance, state.gasTotal);
      }
      state.errors.gasFee = computeGasFeeError({
        gasTotal: state.gasTotal,
        conversionRate: action.payload.conversionRate,
        etherBalance: state.etherBalance,
        primaryCurrency: action.payload.primaryCurrency,
      });
    },
    updateSendTokenBalance: (state, action) => {
      state.tokenBalance = action.payload;
      if (state.maxModeOn) {
        state.amount = computeMaximumTokenToSend(
          state.tokenBalance,
          state.sendToken,
        );
      }
    },
    updateSendHexData: (state, action) => {
      state.data = action.payload;
    },
    updateRecipient: (state, action) => {
      state.recipient.address = action.payload.address;
      state.recipient.nickname = action.payload.nickname;
      if (state.sendToken === null) {
        state.draftTransaction.to = action.payload.address;
      }
    },
    updateSendAmount: (state, action) => {
      if (state.maxModeOn) {
        state.maxModeOn = false;
      }
      state.amount = action.payload.amount;
      state.errors.amount = computeSendError({
        gasTotal: state.gasTotal,
        conversionRate: action.payload.conversionRate,
        etherBalance: state.etherBalance,
        primaryCurrency: action.payload.primaryCurrency,
        amount: state.amount,
        sendToken: state.sendToken,
        tokenBalance: state.tokenBalance,
      });
    },
    setEditingTransactionId: (state, action) => {
      state.editingTransactionId = action.payload;
    },
    updateSendFrom: (state, action) => {
      state.from = action.payload.from;
    },
    toggleSendMaxMode: (state) => {
      if (state.maxModeOn) {
        state.maxModeOn = false;
        state.amount = '0x0';
      } else {
        state.maxModeOn = true;
        state.amount = state.sendToken
          ? computeMaximumTokenToSend(state.tokenBalance, state.sendToken)
          : computeMaximumEtherToSend(state.etherBalance, state.gasTotal);
      }
    },
    updateSendToken: (state, action) => {
      state.token = action.payload;
      if (state.editingTransactionId && !state.token) {
        const unapprovedTx =
          state?.unapprovedTxs?.[state.editingTransactionId] || {};
        const txParams = unapprovedTx.txParams || {};
        state.tokenBalance = null;
        state.balance = '0';
        state.from = unapprovedTx.from ?? '';
        txParams.data = '';
      }
      if (state.maxModeOn) {
        state.amount = computeMaximumTokenToSend(
          state.tokenBalance,
          state.sendToken,
        );
      }
    },
    updateSendEnsResolution: (state, action) => {
      state.ensResolution = action.payload;
      state.ensResolutionError = '';
    },
    updateSendEnsResolutionError: (state, action) => {
      state.ensResolution = null;
      state.ensResolutionError = action.payload;
    },
    resetSendState: () => initialState,
  },
  extraReducers: {
    [SELECTED_ACCOUNT_CHANGED]: (state, action) => {
      if (state.maxModeOn) {
        state.etherBalance = action.payload.account.balance;
        state.amount = computeMaximumEtherToSend(
          state.etherBalance,
          state.gasTotal,
        );
      }
    },
    [SET_BASIC_GAS_ESTIMATE_DATA]: (state, action) => {
      state.gasPrice = getGasPriceInHexWei(action.value.average ?? '0x0');
      state.gasTotal = calcGasTotal(state.gasLimit, state.gasPrice);
      if (state.maxModeOn) {
        state.amount = state.sendToken
          ? computeMaximumTokenToSend(state.tokenBalance, state.sendToken)
          : computeMaximumEtherToSend(state.etherBalance, state.gasTotal);
      }
    },
    [computeEstimatedGasLimitAsyncThunk.pending]: (state) => {
      state.gasIsLoading = true;
    },
    [computeEstimatedGasLimitAsyncThunk.fulfilled]: (state, action) => {
      // state.errors.gasLoadingError = null;
      // state.gasIsLoading = false;
      // if (action.payload !== null) {
      //   state.gasLimit = action.payload.gasLimit;
      //   state.gasTotal = calcGasTotal(state.gasLimit, state.gasPrice);
      //   if (state.maxModeOn) {
      //     state.amount = state.sendToken
      //       ? computeMaximumTokenToSend(state.tokenBalance, state.sendToken)
      //       : computeMaximumEtherToSend(state.etherBalance, state.gasTotal);
      //   }
      //   state.errors.gasFee = computeGasFeeError({
      //     gasTotal: state.gasTotal,
      //     conversionRate: action.payload.conversionRate,
      //     etherBalance: state.etherBalance,
      //     primaryCurrency: action.payload.primaryCurrency,
      //   });
      // }
    },
    [computeEstimatedGasLimitAsyncThunk.rejected]: (state) => {
      state.gasIsLoading = false;
      state.errors.gasLoadingError = 'gasLoadingError';
    },
    [initializeSendState.fulfilled]: (state, action) => {
      state.sendStateStatus = 'INITIALIZED';
      state.from = action.payload.address;
      state.etherBalance = action.payload.balance;
      state.gasLimit = action.payload.gasLimit;
      state.gasPrice = action.payload.gasPrice;
      state.gasTotal = action.payload.gasTotal;
      if (state.maxModeOn) {
        state.amount = state.sendToken
          ? computeMaximumTokenToSend(state.tokenBalance, state.sendToken)
          : computeMaximumEtherToSend(state.etherBalance, state.gasTotal);
      }
      state.errors.amount = computeSendError({
        gasTotal: state.gasTotal,
        conversionRate: action.payload.conversionRate,
        etherBalance: state.etherBalance,
        primaryCurrency: action.payload.primaryCurrency,
        amount: state.amount,
        sendToken: state.sendToken,
        tokenBalance: state.tokenBalance,
      });
      state.errors.gasFee = computeGasFeeError({
        gasTotal: state.gasTotal,
        conversionRate: action.payload.conversionRate,
        etherBalance: state.etherBalance,
        primaryCurrency: action.payload.primaryCurrency,
      });
    },
  },
});

const { actions, reducer } = slice;

export default reducer;

const {
  beginEditingTransaction,
  updateSendErrors,
  showGasButtonGroup,
  hideGasButtonGroup,
  updateSendEnsResolution,
  updateSendEnsResolutionError,
  resetSendState,
  setEditingTransactionId,
  updateSendFrom,
  updateSendTo,
  updateDraftTransaction,
} = actions;

export {
  beginEditingTransaction,
  updateSendErrors,
  showGasButtonGroup,
  hideGasButtonGroup,
  updateSendEnsResolution,
  updateSendEnsResolutionError,
  updateSendFrom,
  setEditingTransactionId,
  resetSendState,
  updateSendTo,
};

// Helper methods

export function updateGasLimit(gasLimit) {
  return async (dispatch, getState) => {
    const state = getState();
    const conversionRate = getConversionRate(state);
    const primaryCurrency = getPrimaryCurrency(state);
    await dispatch(
      actions.updateGasLimit({ gasLimit, conversionRate, primaryCurrency }),
    );
  };
}

export function updateGasPrice(gasPrice) {
  return async (dispatch, getState) => {
    const state = getState();
    const conversionRate = getConversionRate(state);
    const primaryCurrency = getPrimaryCurrency(state);
    await dispatch(
      actions.updateGasPrice({ gasPrice, conversionRate, primaryCurrency }),
    );
  };
}

export function updateSendAmount(amount) {
  return async (dispatch, getState) => {
    const state = getState();
    const conversionRate = getConversionRate(state);
    const primaryCurrency = getPrimaryCurrency(state);
    await dispatch(
      actions.updateSendAmount({ amount, conversionRate, primaryCurrency }),
    );
  };
}

export function computeEstimatedGasLimit() {
  return (dispatch) => {
    return computeEstimatedGasLimitDebounced(dispatch);
  };
}

export function updateSendHexData(hexData) {
  return async (dispatch) => {
    const { gasLimit } = await dispatch(computeEstimatedGasLimit({ hexData }));
    await dispatch(updateDraftTransaction({ hexData, gasLimit }));
  };
}

export function toggleSendMaxMode() {
  return async (dispatch, getState) => {
    const state = getState();
    await dispatch(actions.toggleSendMaxMode());
    if (state.sendToken && state.maxModeOn) {
      await dispatch(computeEstimatedGasLimit());
    }
  };
}

export function updateRecipient({ address, nickname }) {
  return async (dispatch, getState) => {
    const state = getState();
    if (state.send.sendToken !== null) {
      const hexData = '0x';
      const { gasLimit } = await dispatch(
        computeEstimatedGasLimit({ hexData, to: state.sendToken.address }),
      );
      await dispatch(
        updateDraftTransaction({
          to: state.sendToken.address,
          hexData, // compute hexData for erc20 transfer
          gasLimit,
        }),
      );
    }
    await dispatch(
      updateSendTo({
        to: address,
        nickname,
      }),
    );
    if (state.send.to !== address) {
      await dispatch(computeEstimatedGasLimit());
    }
  };
}

export function updateSendTokenBalance() {
  return (dispatch, getState) => {
    const state = getState();
    const tokenContract = getSendTokenContract(state);
    const address = getSendFrom(state);
    const sendToken = getSendTokenAddress(state);
    const tokenBalancePromise = tokenContract
      ? tokenContract.balanceOf(address)
      : Promise.resolve();

    return tokenBalancePromise
      .then((usersToken) => {
        if (usersToken) {
          const newTokenBalance = calcTokenBalance({ sendToken, usersToken });
          dispatch(actions.updateSendTokenBalance(newTokenBalance));
        }
      })
      .catch((err) => {
        log.error(err);
        updateSendErrors({ tokenBalance: 'tokenBalanceError' });
      });
  };
}

export function updateSendToken(token) {
  return async (dispatch) => {
    await dispatch(actions.updateSendToken(token));
    await dispatch(updateSendTokenBalance());
    await dispatch(computeEstimatedGasLimit());
  };
}

// Selectors
export function getGasLimit(state) {
  return state[name].gasLimit || '0';
}

export function getGasPrice(state) {
  return state[name].gasPrice || getAveragePriceEstimateInHexWEI(state);
}

export function getGasTotal(state) {
  return state[name].gasTotal;
}

export function getSendToken(state) {
  return state[name].token;
}

export function getSendTokenAddress(state) {
  return getSendToken(state)?.address;
}

export function getPrimaryCurrency(state) {
  const sendToken = getSendToken(state);
  return sendToken?.symbol;
}

export function getSendTokenContract(state) {
  const sendTokenAddress = getSendTokenAddress(state);
  return sendTokenAddress
    ? global.eth.contract(abi).at(sendTokenAddress)
    : null;
}

export function getSendAmount(state) {
  return state[name].amount;
}

export function getSendHexData(state) {
  return state[name].data;
}

export function getSendEditingTransactionId(state) {
  return state[name].editingTransactionId;
}

export function getSendFrom(state) {
  return state[name].from;
}

export function getSendFromBalance(state) {
  const fromAccount = getSendFromObject(state);
  return fromAccount.balance;
}

export function getSendFromObject(state) {
  const fromAddress = getSendFrom(state);
  return fromAddress
    ? getTargetAccount(state, fromAddress)
    : getSelectedAccount(state);
}

export function getSendMaxModeState(state) {
  return state[name].maxModeOn;
}

export function getSendTo(state) {
  return state[name].to;
}

export function getSendToNickname(state) {
  return state[name].toNickname;
}

export function getTokenBalance(state) {
  return state[name].tokenBalance;
}

export function getSendEnsResolution(state) {
  return state[name].ensResolution;
}

export function getSendEnsResolutionError(state) {
  return state[name].ensResolutionError;
}

export function getSendErrors(state) {
  return state[name].errors;
}

export function sendAmountIsInError(state) {
  return Boolean(state[name].errors.amount);
}

export function getGasLoadingError(state) {
  return state[name].errors.gasLoading;
}

export function gasFeeIsInError(state) {
  return Boolean(state[name].errors.gasFee);
}

export function getGasButtonGroupShown(state) {
  return state[name].gasButtonGroupShown;
}

export function isSendStateInitialized(state) {
  return state[name].sendStateStatus === 'INITIALIZED';
}

export function getTitleKey(state) {
  const isEditing = Boolean(getSendEditingTransactionId(state));
  const isToken = Boolean(getSendToken(state));

  if (!getSendTo(state)) {
    return 'addRecipient';
  }

  if (isEditing) {
    return 'edit';
  } else if (isToken) {
    return 'sendTokens';
  }
  return 'send';
}

export function isSendFormInError(state) {
  return Object.values(getSendErrors(state)).some((n) => n);
}
