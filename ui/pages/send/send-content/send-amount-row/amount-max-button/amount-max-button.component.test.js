import React from 'react';
import { shallow } from 'enzyme';
import sinon from 'sinon';
import AmountMaxButton from './amount-max-button.component';

describe('AmountMaxButton Component', () => {
  let wrapper;

  const propsMethodSpies = {
    toggleSendMaxMode: sinon.spy(),
  };

  const MOCK_EVENT = { preventDefault: () => undefined };

  beforeEach(() => {
    wrapper = shallow(
      <AmountMaxButton
        balance="mockBalance"
        gasTotal="mockGasTotal"
        maxModeOn={false}
        sendToken={{ address: 'mockTokenAddress' }}
        toggleSendMaxMode={propsMethodSpies.toggleSendMaxMode}
        tokenBalance="mockTokenBalance"
      />,
      {
        context: {
          t: (str) => `${str}_t`,
          metricsEvent: () => undefined,
        },
      },
    );
  });

  afterEach(() => {
    propsMethodSpies.toggleSendMaxMode.resetHistory();
  });

  afterAll(() => {
    sinon.restore();
  });

  describe('render', () => {
    it('should render an element with a send-v2__amount-max class', () => {
      expect(wrapper.find('.send-v2__amount-max')).toHaveLength(1);
    });

    it('should call toggleSendMaxMode when the checkbox is checked', () => {
      const { onClick } = wrapper.find('.send-v2__amount-max').props();

      expect(propsMethodSpies.toggleSendMaxMode.callCount).toStrictEqual(0);
      onClick(MOCK_EVENT);
      expect(propsMethodSpies.toggleSendMaxMode.callCount).toStrictEqual(1);
    });

    it('should render the expected text when maxModeOn is false', () => {
      wrapper.setProps({ maxModeOn: false });
      expect(wrapper.find('.send-v2__amount-max').text()).toStrictEqual(
        'max_t',
      );
    });
  });
});
