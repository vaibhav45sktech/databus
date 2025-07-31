const { suite } = require('uvu');
const assert = require('uvu/assert');
const rp = require('request-promise');

const ServerUtils = require('../common/utils/server-utils');
const UriUtils = require('../common/utils/uri-utils');
const DatabusUserDatabase = require('../../userdb');
const DatabusUserTestUtils = require('./utils/userdb-utils');

const test_account = require('./templates/test-account.json');
const master_account = require('./templates/master-account.json');

const test = suite('group-crud');

/** @type {DatabusUserDatabase} */
let db;

const getGroup = async (expectedCode) => {
  const options = {
    method: 'GET',
    uri: UriUtils.createResourceUri([
      test_account.ACCOUNT_NAME,
      test_account.GROUP_NAME,
    ]),
    headers: { Accept: 'application/ld+json' },
    resolveWithFullResponse: true,
  };

  try {
    const res = await rp(options);
    assert.is(res.statusCode, expectedCode);
  } catch (err) {
    assert.is(err.response.statusCode, expectedCode);
  }
};

test.before(async () => {
  ServerUtils.setupRequireExtensions();

  db = new DatabusUserDatabase();
  await db.connect();

  await DatabusUserTestUtils.insertAccount(db, master_account);

  const createOptions = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/create`,
    headers: { 'x-api-key': master_account.APIKEY },
    json: true,
    resolveWithFullResponse: true,
    body: {
      name: test_account.ACCOUNT_NAME,
      label: 'Test Label',
    },
  };

  await rp(createOptions);

  await DatabusUserTestUtils.insertApiKey(db, test_account);
});

test('READ: group should not exist initially', async () => {
  await getGroup(404);
});

test('CREATE: group can be created', async () => {
  const registerOptions = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/register`,
    headers: { 'x-api-key': test_account.APIKEY },
    json: true,
    resolveWithFullResponse: true,
    body: ServerUtils.formatJsonTemplate(require('./templates/group.json'), {
      DATABUS_RESOURCE_BASE_URL: process.env.DATABUS_RESOURCE_BASE_URL,
      ACCOUNT: test_account.ACCOUNT_NAME,
      GROUP: test_account.GROUP_NAME,
    }),
  };

  const res = await rp(registerOptions);
  assert.is(res.statusCode, 200);
});

test('READ: group exists after creation', async () => {
  await getGroup(200);
});

test('DELETE: group can be deleted', async () => {

  const deleteOptions = {
    method: 'DELETE',
    uri: UriUtils.createResourceUri([ test_account.ACCOUNT_NAME, test_account.GROUP_NAME ]),
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
  };

  const res = await rp(deleteOptions);
  assert.is(res.statusCode, 204);
});

test('READ: group is gone after deletion', async () => {
  await getGroup(404);
});


test.after(async () => {
  // Try deleting the group in case it still exists
  const cleanupGroup = {
    method: 'DELETE',
    uri: UriUtils.createResourceUri([ test_account.ACCOUNT_NAME, test_account.GROUP_NAME ]),
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
  };

  try {
    await rp(cleanupGroup);
  } catch (err) {
    if (err.response?.statusCode !== 404 && err.response?.statusCode !== 204) {
      throw err;
    }
  }

  const deleteAccountOptions = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/delete`,
    headers: { 'x-api-key': master_account.APIKEY },
    json: true,
    resolveWithFullResponse: true,
    body: { accountName: test_account.ACCOUNT_NAME },
  };

  try {
    await rp(deleteAccountOptions);
  } catch (err) {
    assert.is(err.response?.statusCode, 404);
  }

  await DatabusUserTestUtils.deleteUser(db, master_account);
});

test.run();
