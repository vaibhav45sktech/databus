const EntityHandler = require('./entity-handler');
const DatabusUtils = require('../utils/databus-utils');
const DatabusUris = require('../utils/databus-uris');
const DatabusSparqlClient = require('./databus-sparql-client');

class GroupData extends EntityHandler {
  constructor($http, accounts, apiKeys) {
    super('databus_registration_group_data', $http, accounts, apiKeys);
   
  }

  initialize(data) {
    const validAccount = data && this.accounts.some(acc => acc.name === data.accountName);
    
    if (validAccount) {
      Object.assign(this, data);
    } else {
      this.accountName = this.accounts[0]?.name;
      this.apiKeyName = this.apiKeys?.[0]?.keyname;
    }

    this.sendmode ??= 'register';
    this.onAccountNameChanged();
  }

  getSaveData() {
    return {
      accountName: this.accountName,
      name: this.name,
      title: this.title,
      abstract: this.abstract,
      description: this.description,
      sendmode: this.sendmode,
      apiKeyName: this.apiKeyName,
    };
  }

  validate() {
    this.errors = [];
    this.warnings = [];

    if (!DatabusUtils.isValidGroupName(this.name)) {
      this.errors.push('err_invalid_group_name');
    }

    const exists = this.groupList?.some(g => g.name === this.name);
    if (exists) {
      this.warnings.push('warning_group_exists');
    }
  }

  updateOutputs() {
    const accountUri = `${DATABUS_RESOURCE_BASE_URL}/${GroupData.getStringOrMissing(this.accountName)}`;

    this.postBody = {
      "@context": this.getContext(),
      "@graph": [
        {
          "@id": `${accountUri}/${GroupData.getStringOrMissing(this.name)}`,
          "@type": "Group",
          "title": this.getValidString(this.title),
          "abstract": this.getValidString(this.abstract),
          "description": this.getValidString(this.description),
        }
      ]
    };

    const payload = JSON.stringify(this.postBody, null, 2);
    const apiKey = this.getApiKey();

    this.curlCommand = [
      `curl -X POST ${DATABUS_RESOURCE_BASE_URL}/api/register \\`,
      `  -H "X-API-KEY: ${GroupData.getStringOrMissing(apiKey)}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${payload}'`
    ].join('\n');
  }
}

module.exports = GroupData;
