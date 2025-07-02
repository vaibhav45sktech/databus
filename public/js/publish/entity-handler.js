const DatabusUris = require("../utils/databus-uris");
const DatabusUtils = require("../utils/databus-utils");
const DatabusSparqlClient = require("./databus-sparql-client");

class EntityHandler {
  constructor(storageKey, $http, $interval, accounts, apiKeys) {
    this.storageKey = storageKey;
    this.$http = $http;
    this.$interval = $interval;
    this.accounts = accounts;
    this.apiKeys = apiKeys;
    this.sparqlClient = new DatabusSparqlClient($http);

    const data = this._loadFromSession();
    this.initialize(data);
  }

  _loadFromSession() {
    try {
      const raw = window.sessionStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("Failed to load session data:", e);
      return null;
    }
  }

  save() {
    try {
      const data = this.getSaveData();
      const json = JSON.stringify(data);
      window.sessionStorage.setItem(this.storageKey, json);
    } catch (e) {
      console.error("Failed to save session data:", e);
    }
  }

  // Abstract methods
  initialize(data) {
    throw new Error("Method 'initialize(data)' must be implemented.");
  }

  getSaveData() {
    throw new Error("Method 'getSaveData()' must be implemented.");
  }

  validate() {
    throw new Error("Method 'validate()' must be implemented.");
  }

  updateOutputs() {
    throw new Error("Method 'updateOutputs()' must be implemented.");
  }

  getValidString(value) {
    return value?.length > 0 ? value : undefined;
  }

  static getStringOrMissing(value) {
    return value?.length > 0 ? value : '!!!missing!!!';
  }

  hasError(errorKey) {
    return this.errors?.includes(errorKey) ?? false;
  }

  setSendMode(sendmode) {
    this.sendmode = sendmode;
    this.onChange();
  }

  getContext() {
    if (DATABUS_CONTEXT_URL && DatabusUtils.isValidHttpUrl(DATABUS_CONTEXT_URL)) {
      return DATABUS_CONTEXT_URL;
    }
    return DATABUS_CONTEXT[DatabusUris.JSONLD_CONTEXT];
  }

  async setAccountName(accountName) {
    if (this.accountName !== accountName) {
      this.accountName = accountName;
      await this.onAccountNameChanged();
    }
  }

  async onAccountNameChanged() {
    this.isLoadingGroups = true;
    this.groupList = await this.sparqlClient.getGroups(this.accountName);
    this.isLoadingGroups = false;
    this.onChange();
  }

  async setAccountName(accountName) {
    if (this.accountName !== accountName) {
      this.accountName = accountName;
      
      this.activeAccount = this.accounts?.find(a => a.accountName === this.accountName);
      await this.onAccountNameChanged();
    }
  }

  getAccount() {
    return this.activeAccount;
    
  }

  onChange() {
    this.updateOutputs();
    this.validate();
    this.save();
  }

  getApiKey() {
    return this.getAccount()?.apiKeys?.find(k => k.keyname === this.apiKeyName)?.apikey;
  }

  setApiKeyName(keyname) {
    this.apiKeyName = keyname;
    this.onChange();
  }

  async register() {
    try {
      const response = await this.$http({
        method: 'POST',
        url: `/api/register`,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        data: this.postBody
      });

      return response;
    } catch (err) {
      console.error('Entity registration failed:', err);
      return null;
    }
  }
}

module.exports = EntityHandler;
