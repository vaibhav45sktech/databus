const { suite } = require('uvu');
const assert = require('uvu/assert');
const rp = require('request-promise');

const ServerUtils = require('../common/utils/server-utils');
const UriUtils = require('../common/utils/uri-utils');
const DatabusUserDatabase = require('../../userdb');
const DatabusUserTestUtils = require('./utils/userdb-utils');

const test_account = require('./templates/test-account.json');
const master_account = require('./templates/master-account.json');

const test = suite('artifact-crud');

/** @type {DatabusUserDatabase} */
let db;

const getArtifact = async (expectedCode) => {
  const options = {
    method: 'GET',
    uri: UriUtils.createResourceUri([
      test_account.ACCOUNT_NAME,
      test_account.GROUP_NAME,
      test_account.ARTIFACT_NAME,
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

  const createAccountOptions = {
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

  await rp(createAccountOptions);

  await DatabusUserTestUtils.insertApiKey(db, test_account);
});

test('READ: artifact should not exist initially', async () => {
  await getArtifact(404);
});

test('CREATE: artifact can be created', async () => {
  const options = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/register`,
    headers: { 'x-api-key': test_account.APIKEY },
    json: true,
    resolveWithFullResponse: true,
    body: ServerUtils.formatJsonTemplate(require('./templates/artifact.json'), {
      DATABUS_RESOURCE_BASE_URL: process.env.DATABUS_RESOURCE_BASE_URL,
      ACCOUNT: test_account.ACCOUNT_NAME,
      GROUP: test_account.GROUP_NAME,
      ARTIFACT: test_account.ARTIFACT_NAME,
    }),
  };

  const res = await rp(options);
  assert.is(res.statusCode, 200);
});

test('READ: artifact exists after creation', async () => {
  await getArtifact(200);
});

test('DELETE: deleting non-empty group returns conflict', async () => {
  const options = {
    method: 'DELETE',
    uri: UriUtils.createResourceUri([
      test_account.ACCOUNT_NAME,
      test_account.GROUP_NAME,
    ]),
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
  };

  let statusCode = 0;
  try {
    await rp(options);
  } catch (err) {
    statusCode = err.statusCode || err.response?.statusCode;
  }
  assert.is(statusCode, 409);
});

test('DELETE: artifact can be deleted', async () => {
  const options = {
    method: 'DELETE',
    uri: UriUtils.createResourceUri([
      test_account.ACCOUNT_NAME,
      test_account.GROUP_NAME,
      test_account.ARTIFACT_NAME,
    ]),
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
  };

  const res = await rp(options);
  assert.is(res.statusCode, 204);
});

test('READ: artifact is gone after deletion', async () => {
  await getArtifact(404);
});

test.after(async () => {
  try {
    await rp({
      method: 'DELETE',
      uri: UriUtils.createResourceUri([
        test_account.ACCOUNT_NAME,
        test_account.GROUP_NAME,
        test_account.ARTIFACT_NAME,
      ]),
      headers: { 'x-api-key': test_account.APIKEY },
      resolveWithFullResponse: true,
    });
  } catch (err) {
    if (![204, 404].includes(err.response?.statusCode)) throw err;
  }

  try {
    await rp({
      method: 'DELETE',
      uri: UriUtils.createResourceUri([
        test_account.ACCOUNT_NAME,
        test_account.GROUP_NAME,
      ]),
      headers: { 'x-api-key': test_account.APIKEY },
      resolveWithFullResponse: true,
    });
  } catch (err) {
    if (![204, 404].includes(err.response?.statusCode)) throw err;
  }

  try {
    await rp({
      method: 'POST',
      uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/delete`,
      headers: { 'x-api-key': master_account.APIKEY },
      json: true,
      resolveWithFullResponse: true,
      body: { accountName: test_account.ACCOUNT_NAME },
    });
  } catch (err) {
    assert.is(err.response?.statusCode, 404);
  }

  await DatabusUserTestUtils.deleteUser(db, master_account);
});

test.run();
