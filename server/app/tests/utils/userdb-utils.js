const DatabusUserDatabase = require("../../../userdb");
const assert = require('assert');

/**
 * @class DatabusUserTestUtils
 */
class DatabusUserTestUtils {

  /**
   * @param {DatabusUserDatabase} db
   * @param {{ID: string, ACCOUNT_NAME: string, KEYNAME: string, APIKEY: string}} params
   * @returns {Promise<void>}
   */
  static async insertAccount(db, params) {
    await db.addUser(params.ID);
    await db.addAccount(params.ID, params.ACCOUNT_NAME);
    await db.addApiKey(params.ACCOUNT_NAME, params.KEYNAME, params.APIKEY);
  }

  /**
   * @param {DatabusUserDatabase} db
   * @param {{ID: string, ACCOUNT_NAME: string, KEYNAME: string, APIKEY: string}} params
   * @returns {Promise<void>}
   */
  static async insertApiKey(db, params) {
    await db.addApiKey(params.ACCOUNT_NAME, params.KEYNAME, params.APIKEY);
  }

  /**
  * @param {DatabusUserDatabase} db
  * @param {{ID: string, ACCOUNT_NAME: string, KEYNAME: string, APIKEY: string}} params
  * @returns {Promise<void>}
  */
  static async deleteUser(db, params) {
    await db.deleteUser(params.ID);
  }
}

module.exports = DatabusUserTestUtils;
