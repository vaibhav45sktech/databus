const { suite } = require('uvu');
const assert = require('uvu/assert');
const rp = require('request-promise');
const fs = require('fs');

const test = suite('webDAV');

const DatabusUserTestUtils = require('./utils/userdb-utils');
const DatabusUserDatabase = require('../../userdb');
const DatabusWebDAV = require('../api/webdav');
const test_account = require('./templates/test-account.json');
const ServerUtils = require('../common/utils/server-utils');

/** @type {DatabusUserDatabase} */
let db;

/** @type {import('../api/webdav')} */
let dav;

/** @type {string} */
let userDavDirectory;

test.before(async () => {

  ServerUtils.setupRequireExtensions();

  db = new DatabusUserDatabase();
  await db.connect();

  await DatabusUserTestUtils.insertAccount(db, test_account);

  dav = new DatabusWebDAV();
  userDavDirectory = `${dav.directory}${test_account.ACCOUNT_NAME}`;

  if (fs.existsSync(userDavDirectory)) {
    fs.rmSync(userDavDirectory, { recursive: true, force: true });
  }
});

test('MKCOL creates directory', async () => {
  const options = {
    method: 'MKCOL',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/dav/${test_account.ACCOUNT_NAME}/test/`,
    headers: {
      'x-api-key': test_account.APIKEY,
    },
  };

  const response = await rp(options);
  assert.is(response, '');
  assert.ok(fs.existsSync(userDavDirectory));
});

test('PUT uploads a file', async () => {
  const payload = JSON.stringify({ success: true });

  const options = {
    method: 'PUT',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/dav/${test_account.ACCOUNT_NAME}/test/upload.json`,
    headers: {
      'x-api-key': test_account.APIKEY,
    },
    body: payload,
  };

  const response = await rp(options);
  assert.is(response, '');

  assert.ok(fs.existsSync(`${userDavDirectory}/test/upload.json`));
});

test('DELETE empties directory', async () => {
  const options = {
    method: 'DELETE',
    uri: `${process.env.DATABUS_RESOURCE_BASE_URL}/dav/${test_account.ACCOUNT_NAME}/test/`,
    headers: {
      'x-api-key': test_account.APIKEY,
    },
  };

  const response = await rp(options);
  assert.is(response, '');

  const files = fs.existsSync(userDavDirectory) ? fs.readdirSync(userDavDirectory) : [];
  assert.is(files.length, 0);
});

test.after(async () => {
  await DatabusUserTestUtils.deleteUser(db, test_account);
  if (fs.existsSync(userDavDirectory)) {
    fs.rmSync(userDavDirectory, { recursive: true, force: true });
  }
});

test.run();
