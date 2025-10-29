var fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const ServerUtils = require('./app/common/utils/server-utils.js');
const Constants = require('./app/common/constants');
const { log } = require('console');

class DatabusUserDatabase {

  constructor(userAddedCallback) {
    this.userAddedCallback = userAddedCallback;
    this.addUserQuery = require('./app/common/queries/userdb/add-user.sql');
    this.addUserQueryPrefix = this.addUserQuery.substring(0, 10);
    this.addApiKeyQuery = require('./app/common/queries/userdb/add-api-key.sql');
    this.getAccountsByIdQuery = require('./app/common/queries/userdb/get-accounts-by-id.sql');
    this.addAccountQuery = require('./app/common/queries/userdb/add-account.sql');
    this.getAccountsQuery = require('./app/common/queries/userdb/get-accounts.sql');
    this.getUsersQuery = require('./app/common/queries/userdb/get-users.sql');
    this.getUserByAccountNameQuery = require('./app/common/queries/userdb/get-user-by-account-name.sql');
    this.getAccountQuery = require('./app/common/queries/userdb/get-account.sql');
    this.getApiKeyQuery = require('./app/common/queries/userdb/get-account-by-api-key.sql');
    this.deleteAccountQuery = require('./app/common/queries/userdb/delete-account.sql');
    this.getUserQuery = require('./app/common/queries/userdb/get-user.sql');
    this.deleteUserQuery = require('./app/common/queries/userdb/delete-user.sql');
    this.deleteApiKeyQuery = require('./app/common/queries/userdb/delete-api-key.sql');
    this.getApiKeysQuery = require('./app/common/queries/userdb/get-api-keys.sql');

    this.debug = false;
  }

  onTrace(query) {
    if (query.startsWith(this.addUserQueryPrefix)) {
      console.log(query);
    }
  }
  async migrateSubToId() {
    try {

      const columns = await this.db.all(`PRAGMA table_info(users)`);
      const usersHasSub = columns.some(col => col.name === 'sub');
      const usersHasId = columns.some(col => col.name === 'id');


      if (usersHasSub && !usersHasId) {
        await this.db.run(`ALTER TABLE users RENAME COLUMN sub TO id`);
        await this.db.run(`ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''`);
        console.log("Migrated 'users.sub' column to 'id' and added 'email' column.");
      }

      const accountColumns = await this.db.all(`PRAGMA table_info(accounts)`);
      const accountHasSub = accountColumns.some(col => col.name === 'sub');
      const accountHasId = accountColumns.some(col => col.name === 'id');

      if (accountHasSub && !accountHasId) {
        await this.db.run(`ALTER TABLE accounts RENAME COLUMN sub TO id`);
        console.log("Migrated 'account.sub' to 'id'.");
      }

    } catch (err) {
      console.log("Migration error:", err);
    }
  }


  async connect() {

    try {
      if (!fs.existsSync(__dirname + Constants.DATABUS_SQLITE_USER_DATABASE_DIR)) {
        fs.mkdirSync(__dirname + Constants.DATABUS_SQLITE_USER_DATABASE_DIR);
      }

      this.db = await open({
        filename: __dirname + Constants.DATABUS_SQLITE_USER_DATABASE_PATH,
        driver: sqlite3.Database
      });

      if (this.userAddedCallback != undefined) {
        this.db.on('trace', this.onTrace);
      }

      if (this.debug) {
        console.log("Creating tables");
      }

      await this.migrateSubToId();

      await this.db.get("PRAGMA foreign_keys = ON");
      await this.db.run(require('./app/common/queries/userdb/create-user-table.sql'));
      await this.db.run(require('./app/common/queries/userdb/create-api-key-table.sql'));
      await this.db.run(require('./app/common/queries/userdb/create-account-table.sql'));

      console.log(`Connected to user database at ${__dirname + Constants.DATABUS_SQLITE_USER_DATABASE_PATH}.`);
      return true;
    } catch (err) {
      if (this.debug) {
        console.log(err);
      }
      return false;
    }
  }

  /**
   * Retrieve a user
   * @param {*} id 
   * @returns 
   */
  async getAccountsById(id) {
    let result = await this.all(this.getAccountsByIdQuery, {
      ID: id,
    });

    if (result == undefined) {
      return [];
    }

    for (let account of result) {
      account.apiKeys = await this.getApiKeys(account.accountName);
    }

    return result;
  }

  /**
  * Retrieve all users
  * @param {*} id 
  * @returns 
  */
  async getAllUsers() {
    return await this.all(this.getUsersQuery, null);
  }

  async getAllAccounts() {
    return await this.all(this.getAccountsQuery, null);
  }
  /**
   * Retrieve a user ny account name
   * @param {*} id 
   * @returns 
   */
  async getUserByAccountName(accountName) {
    return await this.get(this.getUserByAccountNameQuery, {
      ACCOUNT_NAME: accountName,
    });
  }

  async hasUser(accountName) {
    var user = await this.getUserByAccountName(accountName);
    return user != null;
  }

  async hasAccount(accountName) {
    var account = await this.getAccount(accountName);
    return account != null;
  }

  async getAccount(accountName) {
    return await this.get(this.getAccountQuery, {
      ACCOUNT_NAME: accountName
    });
  }

  async getApiKey(apikey) {
    return await this.get(this.getApiKeyQuery, {
      APIKEY: apikey
    });
  }


  async getUser(id) {
    return await this.get(this.getUserQuery, {
      ID: id
    });
  }

  /**
   * Adds an API key to a user 
   * @param {} id 
   * @param {*} apikey 
   * @param {*} debugLog 
   * @returns 
   */
  async addApiKey(accountName, name, apikey) {

    let account = await this.getAccount(accountName);
    if (account == undefined) {
      return false;
      //if(!await this.addUser(id)) {
      //  return false;
      //}
    }

    var result = await this.run(this.addApiKeyQuery, {
      ACCOUNTNAME: accountName,
      KEYNAME: name,
      APIKEY: apikey
    });

    return result != null && result.changes != 0;
  }

  async getApiKeys(accountName) {
    return await this.all(this.getApiKeysQuery, {
      ACCOUNTNAME: accountName,
    });
  }

  /**
   * Delete api key
   * @param {*} id 
   * @returns 
   */
  async deleteApiKey(accountName, name) {
    var result = await this.run(this.deleteApiKeyQuery, {
      ACCOUNTNAME: accountName,
      NAME: name,
    });

    return result != null && result.changes != 0;
  }

  /**
  * Adds a user 
  * @param {*} id 
  * @returns 
  */
  async addUser(id, email) {

    var result = await this.run(this.addUserQuery, {
      ID: id,
      EMAIL: email
    });

    return result != null && result.changes != 0;
  }

  /**
  * Adds an account 
  * @param {*} id 
  * @param {*} label 
  * @param {*} accountName 
  * @returns 
  */
  async addAccount(id, accountName) {

    if (this.debug) {
      console.log(`ADD USER id:${id}, accountName:${accountName}`);
    }

    let user = await this.getUser(id);

    if (user == undefined) {
      if (!await this.addUser(id)) {
        return false;
      }
    }

    var result = await this.run(this.addAccountQuery, {
      ID: id,
      ACCOUNT_NAME: accountName
    });

    return result != null && result.changes != 0;
  }

  async deleteAccount(accountName) {

    var result = await this.run(this.deleteAccountQuery, {
      ACCOUNT_NAME: accountName
    });


    return result != null && result.changes != 0;

  }

  /**
   * Delete user
   * @param {*} id 
   * @returns 
   */
  async deleteUser(id) {
    var result = await this.run(this.deleteUserQuery, {
      ID: id
    });

    return result != null && result.changes != 0;
  }


  isInputDangerous(params) {
    for (var key in params) {

      var value = params[key];

      if (value != null && (value.includes("\"") || value.includes(";"))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Run formatted SQL query
   * @param {*} query 
   * @param {*} params 
   * @returns 
   */
  async run(query, params) {
    try {

      if (this.debug) {
        console.log(JSON.stringify(params, null, 3));
      }

      if (this.isInputDangerous(params)) {

        if (this.debug) {
          console.log(`USERDB: Dangerous database input detected: ${JSON.stringify(params)}`);
        }

        return null;
      }

      var formattedQuery = ServerUtils.formatQuery(query, params);

      if (this.debug) {
        console.log(formattedQuery);
      }

      return await this.db.run(formattedQuery);
    } catch (err) {

      if (this.debug) {
        console.log(err);
      }

      return null;
    }
  }

  /**
   * Run formatted SQL GET query
   * @param {*} query 
   * @param {*} params 
   * @returns 
   */
  async get(query, params) {

    try {

      if (this.isInputDangerous(params)) {

        if (this.debug) {
          console.log(`USERDB: Dangerous database input detected: ${JSON.stringify(params)}`);
        }

        return null;
      }

      var formattedQuery = ServerUtils.formatQuery(query, params);

      if (this.debug) {
        console.log(formattedQuery);
      }

      return await this.db.get(formattedQuery);

    } catch (err) {

      if (this.debug) {
        console.log(err);
      }

      return null;
    }
  }

  /**
   * Run formatted SQL GET query
   * @param {*} query 
   * @param {*} params 
   * @returns 
   */
  async all(query, params) {
    try {

      if (this.isInputDangerous(params)) {

        if (this.debug) {
          console.log(`USERDB: Dangerous database input detected: ${JSON.stringify(params)}`);
        }

        return null;
      }

      var formattedQuery = ServerUtils.formatQuery(query, params);

      if (this.debug) {
        console.log(formattedQuery);
      }

      return await this.db.all(formattedQuery);
    } catch (err) {

      if (this.debug) {
        console.log(err);
      }

      return null;
    }
  }
}

module.exports = DatabusUserDatabase;