const bwmClient = require('../src/services/bwm/bwm.client');
const {
  BadRequestError,
  InsufficientBalanceError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  UncertainOperationError,
} = require('../src/utils/errors');

describe('BWM Centralized API Client', () => {
  afterEach(() => {
    bwmClient.resetBwmHttpClient();
    jest.restoreAllMocks();
  });

  it('sends requests and returns response data on success', async () => {
    const mockHttp = {
      request: jest.fn().mockResolvedValue({ data: { xd_balance: 150.5 } }),
    };
    bwmClient.setBwmHttpClient(mockHttp);

    const data = await bwmClient.request({ method: 'GET', url: '/account/balance' });
    expect(data).toEqual({ xd_balance: 150.5 });
    expect(mockHttp.request).toHaveBeenCalledTimes(1);
    expect(mockHttp.request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/account/balance',
    });
  });

  it('preserves HTTP 400 Bad Request', async () => {
    const mockHttp = {
      request: jest.fn().mockRejectedValue({
        response: { status: 400, data: { message: 'Invalid app_name' } },
      }),
    };
    bwmClient.setBwmHttpClient(mockHttp);

    await expect(
      bwmClient.request({ method: 'POST', url: '/bots/deploy', isPaid: true })
    ).rejects.toThrow(BadRequestError);
  });

  it('preserves HTTP 401 Invalid API credentials', async () => {
    const mockHttp = {
      request: jest.fn().mockRejectedValue({
        response: { status: 401, data: { message: 'Invalid API key' } },
      }),
    };
    bwmClient.setBwmHttpClient(mockHttp);

    await expect(bwmClient.request({ method: 'GET', url: '/account/balance' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'BWM_INVALID_CREDENTIALS',
    });
  });

  it('preserves HTTP 402 Insufficient XD balance', async () => {
    const mockHttp = {
      request: jest.fn().mockRejectedValue({
        response: { status: 402, data: { message: 'Insufficient XD balance' } },
      }),
    };
    bwmClient.setBwmHttpClient(mockHttp);

    await expect(
      bwmClient.request({ method: 'POST', url: '/bots/deploy', isPaid: true })
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it('preserves HTTP 403 Forbidden and HTTP 404 Not Found', async () => {
    const mockHttp = {
      request: jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 403, data: { message: 'Forbidden' } } })
        .mockRejectedValueOnce({ response: { status: 404, data: { message: 'Not found' } } }),
    };
    bwmClient.setBwmHttpClient(mockHttp);

    await expect(bwmClient.request({ method: 'GET', url: '/bots/123' })).rejects.toThrow(ForbiddenError);
    await expect(bwmClient.request({ method: 'GET', url: '/bots/123' })).rejects.toThrow(NotFoundError);
  });

  it('maps network timeout on read-only call to UpstreamError (502) without retrying', async () => {
    const timeoutErr = new Error('timeout of 15000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    const mockHttp = {
      request: jest.fn().mockRejectedValue(timeoutErr),
    };
    bwmClient.setBwmHttpClient(mockHttp);

    await expect(bwmClient.request({ method: 'GET', url: '/bots', isPaid: false })).rejects.toThrow(
      UpstreamError
    );
    expect(mockHttp.request).toHaveBeenCalledTimes(1);
  });

  it('maps network timeout on paid call to UncertainOperationError without retrying', async () => {
    const timeoutErr = new Error('timeout of 15000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    const mockHttp = {
      request: jest.fn().mockRejectedValue(timeoutErr),
    };
    bwmClient.setBwmHttpClient(mockHttp);

    await expect(
      bwmClient.request({ method: 'POST', url: '/bots/deploy', isPaid: true })
    ).rejects.toThrow(UncertainOperationError);
    expect(mockHttp.request).toHaveBeenCalledTimes(1);
  });
});

