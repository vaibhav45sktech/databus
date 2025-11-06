const { suite } = require('uvu');
const assert = require('uvu/assert');
const rp = require('request-promise');
const jsonld = require('jsonld');

const DatabusUserTestUtils = require('./utils/userdb-utils');
const DatabusUserDatabase = require('../../userdb');
const ServerUtils = require('../common/utils/server-utils');
const suiteUtils = require('../api/lib/databus-tractate-suite');
const { autocomplete } = require('../api/lib/dataid-autocomplete');
const DatabusUris = require('../../../public/js/utils/databus-uris');

const test_account = require('./templates/test-account.json');
const master_account = require('./templates/master-account.json');

const test = suite('tractate-tests');

let testMetadata;

/** @type {DatabusUserDatabase} */
let db;


test.before(async () => {
  ServerUtils.setupRequireExtensions();

  testMetadata = ServerUtils.formatJsonTemplate(require('./templates/version.json'), {
    DATABUS_RESOURCE_BASE_URL: process.env.DATABUS_RESOURCE_BASE_URL,
    ACCOUNT: test_account.ACCOUNT_NAME,
    GROUP: test_account.GROUP_NAME,
    ARTIFACT: test_account.ARTIFACT_NAME,
    VERSION: test_account.VERSION_NAME,
  });

  db = new DatabusUserDatabase();
  await db.connect();

  await DatabusUserTestUtils.insertAccount(db, master_account);

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

  await rp(options);
});

test('generate Databus Tractate v1', async () => {
  const options = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/tractate/v1/canonicalize`,
    headers: { Accept: 'text/plain' },
    resolveWithFullResponse: true,
    json: true,
    body: testMetadata,
  };

  const response = await rp(options);
  assert.is(response.statusCode, 200);

  const lines = response.body.split('\n');
  assert.is(
    lines[1],
    `${process.env.DATABUS_RESOURCE_BASE_URL}/${test_account.ACCOUNT_NAME}/${test_account.GROUP_NAME}/${test_account.ARTIFACT_NAME}/${test_account.VERSION_NAME}`
  );
});

test('verify Databus Tractate v1', async () => {

  const expandedData = autocomplete(await jsonld.flatten(await jsonld.expand(testMetadata)));
  const proof = suiteUtils.createProof(expandedData);
  testMetadata[DatabusUris.JSONLD_GRAPH][DatabusUris.SEC_PROOF] = proof;

  const options = {
    method: 'POST',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/api/tractate/v1/verify`,
    headers: { Accept: 'application/json' },
    resolveWithFullResponse: true,
    json: true,
    body: testMetadata,
  };

  const response = await rp(options);
  assert.is(response.statusCode, 200);
  assert.ok(response.body.success, response.body.message);
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
  } catch(err) {
    assert.is(err.response?.statusCode, 404);
  }

  await DatabusUserTestUtils.deleteUser(db, master_account);
});


test.run();
