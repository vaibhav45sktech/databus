const { suite } = require('uvu');
const assert = require('uvu/assert');
const rp = require('request-promise');

const Constants = require('../common/constants');

const test = suite('resource-tests');

test('GET default context returns 200', async () => {
  const options = {
    method: 'GET',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}${Constants.DATABUS_DEFAULT_CONTEXT_PATH}`,
    headers: {
      Accept: 'application/ld+json',
    },
    resolveWithFullResponse: true,
  };

  const response = await rp(options);
  assert.is(response.statusCode, 200);
});

test.run();
