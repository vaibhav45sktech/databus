const { suite } = require('uvu');
const assert = require('uvu/assert');
const DatabusUtils = require('../../../public/js/utils/databus-utils');
const UriUtils = require('../common/utils/uri-utils');

const test = suite('util-functions');

test('objSize returns correct size', () => {
  assert.is(DatabusUtils.objSize({ one: 1, two: 2 }), 2);
  assert.is(DatabusUtils.objSize({}), 0);
  assert.is(DatabusUtils.objSize(null), 0);
});

test('uniqueList returns unique elements', () => {
  const list = [0, 1, 1, 2, 2];
  const uniqueList = DatabusUtils.uniqueList(list);
  assert.is(uniqueList.length, 3);
  assert.is(uniqueList[0], 0);
  assert.is(uniqueList[1], 1);
  assert.is(uniqueList[2], 2);
});

test('uriToName extracts correct name', () => {
  assert.is(UriUtils.uriToName('https://example.org/test/my-name'), 'my-name');
  assert.is(UriUtils.uriToName('https://example.org/test/my-name#tag'), 'tag');
});

test('createResourceUri creates correct URI', () => {
  const expected = `${process.env.DATABUS_RESOURCE_BASE_URL}/asdf/qwer`;
  assert.is(UriUtils.createResourceUri(['asdf', 'qwer']), expected);
});

test.run();
