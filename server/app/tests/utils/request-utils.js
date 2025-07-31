const rp = require('request-promise');

class TestRequestUtils {

  static deleteOptions(uri, apikey) {
     return {
        method: 'DELETE',
        uri: uri,
        headers: { 'x-api-key': apikey },
        resolveWithFullResponse: true,
      };
  }

  static postOptions(uri, apikey) {
     return {
        method: 'DELETE',
        uri: uri,
        headers: { 'x-api-key': apikey },
        resolveWithFullResponse: true,
      };
  }

  static createOptions(
    uri,
    method = 'GET',
    apiKey = null,
    json = true,
    body = null,
    accept = 'application/json',
    extraHeaders = {}
  ) {
    const headers = {
      Accept: accept,
      ...extraHeaders,
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    return {
      "method": method,
      "uri": uri,
      "headers": headers,
      "json": true,
      "body": body,
      "resolveWithFullResponse": true,
    };
  }
}

module.exports = TestRequestUtils;
