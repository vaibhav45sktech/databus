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

const getCollection = async (expectedCode) => {
  const options = {
    method: 'GET',
    uri: UriUtils.createResourceUri([
      test_account.ACCOUNT_NAME,
      "collections",
      test_account.COLLECTION_NAME,
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

test('READ: collection should not exist initially', async () => {
  await getCollection(404);
});

test('CREATE: collection can be created', async () => {
  const registerOptions = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/register`,
    headers: { 'x-api-key': test_account.APIKEY },
    json: true,
    resolveWithFullResponse: true,
    body: ServerUtils.formatJsonTemplate(require('./templates/collection.json'), {
      DATABUS_RESOURCE_BASE_URL: process.env.DATABUS_RESOURCE_BASE_URL,
      ACCOUNT: test_account.ACCOUNT_NAME,
      COLLECTION: test_account.COLLECTION_NAME,
    }),
  };

  const res = await rp(registerOptions);
  assert.is(res.statusCode, 200);
});

test('READ: collection exists after creation', async () => {
  await getCollection(200);
});

test('GET SPARQL: collection sparql can be read', async () => {
  
  const getCollectionSparqlRequest = {
    method: 'GET',
    uri: UriUtils.createResourceUri([
      test_account.ACCOUNT_NAME,
      "collections",
      test_account.COLLECTION_NAME,
    ]),
    headers: { Accept: 'text/sparql' },
    resolveWithFullResponse: true,
  };

  try {
    const res = await rp(getCollectionSparqlRequest);
    assert.is(res.statusCode, 200);
  } catch (err) {
    assert.is(err.response.statusCode, 200);
  }
});

// TODO: Test SPARQL query for correctness 

// TODO: Test MD5 hash retrieval

test('DELETE: collection can be deleted', async () => {

  var resourcerUri = UriUtils.createResourceUri([
    test_account.ACCOUNT_NAME,
    "collections",
    test_account.COLLECTION_NAME,
  ]);

  const deleteOptions = {
    method: 'DELETE',
    uri: resourcerUri,
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
  };

  const res = await rp(deleteOptions);
  assert.is(res.statusCode, 204);
});

test('READ: collection is gone after deletion', async () => {
  await getCollection(404);
});


test.after(async () => {
  // Try deleting the group in case it still exists
  var resourcerUri = UriUtils.createResourceUri([
    test_account.ACCOUNT_NAME,
    "collections",
    test_account.COLLECTION_NAME,
  ]);


  const cleanupCollectionRequest = {
    method: 'DELETE',
    uri: resourcerUri,
    headers: { 'x-api-key': test_account.APIKEY },
    resolveWithFullResponse: true,
  };

  try {
    await rp(cleanupCollectionRequest);
  } catch (err) {
    if (err.response?.statusCode !== 404 && err.response?.statusCode !== 204) {
      throw err;
    }
  }

  const deleteAccountRequest = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/account/delete`,
    headers: { 'x-api-key': master_account.APIKEY },
    json: true,
    resolveWithFullResponse: true,
    body: { accountName: test_account.ACCOUNT_NAME },
  };

  try {
    await rp(deleteAccountRequest);
  } catch (err) {
    assert.is(err.response?.statusCode, 404);
  }

  await DatabusUserTestUtils.deleteUser(db, master_account);
});

test.run();
