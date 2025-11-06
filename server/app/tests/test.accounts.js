const { suite } = require('uvu');
const assert = require('uvu/assert');
const rp = require('request-promise');

const ServerUtils = require('../common/utils/server-utils');
const DatabusUserTestUtils = require('./utils/userdb-utils');
const DatabusUserDatabase = require('../../userdb');

const test_account = require('./templates/test-account.json');
const master_account = require('./templates/master-account.json');

const test = suite('account-tests');

/** @type {DatabusUserDatabase} */
let db;

test.before(async () => {
  ServerUtils.setupRequireExtensions();

  db = new DatabusUserDatabase();
  await db.connect();

  await DatabusUserTestUtils.insertAccount(db, master_account);

  const options = {
    headers: { 'x-api-key': master_account.APIKEY },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/delete`,
    method: 'POST',
    json: true,
    body: { accountName: test_account.ACCOUNT_NAME },
  };

  try {
    await rp(options);
  } catch (err) {
    assert.is(err.response?.statusCode, 404);
  }

});

test('GET non-existing account returns 404', async () => {
  const options = {
    headers: {
      'x-api-key': master_account.APIKEY,
      Accept: 'application/ld+json'
    },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/${test_account.ACCOUNT_NAME}`,
    method: 'GET',
  };

  try {
    await rp(options);
    assert.unreachable('Expected 404 for non-existing account.');
  } catch (err) {
    assert.is(err.response?.statusCode, 404);
  }
});

test('CREATE account returns 200', async () => {
  const options = {
    headers: { 'x-api-key': master_account.APIKEY },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/create`,
    method: 'POST',
    json: true,
    body: {
      name: test_account.ACCOUNT_NAME,
      label: 'Test Label',
    },
  };

  try {
    const response = await rp(options);
    assert.is(response.statusCode, 200);
  } catch (err) {
    console.error('Request failed:', {
      statusCode: err.statusCode,
      message: err.message,
      body: err.error
    });
    throw err;
  }
});

test('SEARCH account by label returns 200', async () => {
  await new Promise(resolve => setTimeout(resolve, 2000));

  const options = {
    headers: { 'x-api-key': master_account.APIKEY },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/search?query=Test Label&typeName=Account`,
    method: 'GET',
    json: true,
  };

  const response = await rp(options);
  assert.is(response.statusCode, 200);

  const responseBody = response.body;

  const accountDoc = responseBody.docs.find(
    doc => doc.id[0] === `${process.env.DATABUS_RESOURCE_BASE_URL}/${test_account.ACCOUNT_NAME}`
  );

  assert.ok(accountDoc, 'Account not found in search results');
});

test('GET created account returns 200', async () => {
  const options = {
    headers: { 'x-api-key': master_account.APIKEY, Accept: 'application/ld+json' },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/${test_account.ACCOUNT_NAME}`,
    method: 'GET',
  };

  const response = await rp(options);
  assert.is(response.statusCode, 200);
});

test('UPDATE account returns 200', async () => {
  const options = {
    headers: { 'x-api-key': master_account.APIKEY },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/update`,
    method: 'POST',
    json: true,
    body: {
      accountName: test_account.ACCOUNT_NAME,
      label: 'Updated Label',
      status: 'active',
    },
  };

  const response = await rp(options);
  assert.is(response.statusCode, 200);
});


test('Cannot create API key for someone else', async () => {

  await DatabusUserTestUtils.insertApiKey(db, test_account);

  const options = {
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/api-key/create`,
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
    method: 'POST',
    json: true,
    body: {
      accountName: 'janfo',
      keyname: 'testkey'
    },
  };

  try {
    await rp(options);
  } catch (err) {
    assert.is(err.response?.statusCode, 403);
  }
});

test('API key create and delete tests', async () => {

  await DatabusUserTestUtils.insertApiKey(db, test_account);

  const options = {
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/api-key/create`,
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
    method: 'POST',
    json: true,
    body: {
      accountName: test_account.ACCOUNT_NAME,
      keyname: 'testkey2'
    },
  };

  let response = await rp(options,);
  assert.is(response.statusCode, 200);

  try {
    response = await rp(options);
    assert.unreachable('Creating already existing API key should fail');
  } catch (err) {
    assert.is(err.response?.statusCode, 400);
  }

  options.uri = `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/api-key/delete`;
  response = await rp(options);
  assert.is(response.statusCode, 200);

  response = await rp(options);
  assert.is(response.statusCode, 204);
});

test('DELETE account returns 200 and 404 when deleting again', async () => {
  const options = {
    headers: { 'x-api-key': master_account.APIKEY },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/delete`,
    method: 'POST',
    json: true,
    body: { accountName: test_account.ACCOUNT_NAME },
  };

  let response = await rp(options);
  assert.is(response.statusCode, 200);

  try {
    response = await rp(options);
    assert.unreachable('Expected 404 when deleting already deleted account.');
  } catch (err) {
    assert.is(err.response?.statusCode, 404);
  }
});



test.after(async () => {

  const options = {
    headers: { 'x-api-key': master_account.APIKEY },
    resolveWithFullResponse: true,
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/delete`,
    method: 'POST',
    json: true,
    body: { accountName: test_account.ACCOUNT_NAME },
  };

  try {
    await rp(options);
  } catch (err) {

  }

  await DatabusUserTestUtils.deleteUser(db, master_account);
});

test.run();
