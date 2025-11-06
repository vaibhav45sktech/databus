const EntityHandler = require('./entity-handler');
const DatabusUtils = require('../utils/databus-utils');
const DatabusUris = require('../utils/databus-uris');
const GroupData = require('./group-data');

class ArtifactData extends EntityHandler {
  constructor($http, accounts, apiKeys) {
    super('databus_registration_artifact_data', $http, null, accounts, apiKeys);
  }

  initialize(data) {
    const validAccount = data && this.accounts.some(acc => acc.accountName === data.accountName);

    if (validAccount) {
      Object.assign(this, data);
    } else {
      this.accountName = this.accounts[0]?.name;
    }

    if(this.apiKeyName == null && this.apiKeys != null && this.apiKeys.length > 0) {
      this.apiKeyName = this.apiKeys[0].keyname;
    }


    this.sendmode ??= 'register';
    this.onAccountNameChanged();
    this.onGroupNameChanged();
  }

   validate() {
    this.errors = [];
    this.warnings = [];

    if (!DatabusUtils.isValidArtifactName(this.name)) {
      this.errors.push('err_invalid_artifact_name');
    }

    if (!DatabusUtils.isValidGroupName(this.groupName)) {
      this.errors.push('err_no_group_selected');
    }

    const exists = this.artifactList?.some(a => a.name === this.name);
    if (exists) {
      this.warnings.push('warning_artifact_exists');
    }
  }
  
  getURI() {
    return `${DATABUS_RESOURCE_BASE_URL}/${this.accountName}/${this.groupName}/${this.name}`;
  }

  getSaveData() {
    return {
      accountName: this.accountName,
      groupName: this.groupName,
      name: this.name,
      title: this.title,
      abstract: this.abstract,
      description: this.description,
      sendmode: this.sendmode,
      apiKeyName: this.apiKeyName,
    };
  }


  async setGroupName(groupName) {
    if (this.groupName !== groupName) {
      this.groupName = groupName;
      await this.onGroupNameChanged();
    }
  }

  async onGroupNameChanged() {
    this.isLoadingArtifacts = true;
    this.artifactList = await this.sparqlClient.getArtifacts(this.accountName, this.groupName);
    this.isLoadingArtifacts = false;
    this.onChange();
  }

 

  updateOutputs() {
    const groupUri = `${DATABUS_RESOURCE_BASE_URL}/${GroupData.getStringOrMissing(this.accountName)}/${GroupData.getStringOrMissing(this.groupName)}`;

    this.postBody = {
      "@context": this.getContext(),
      "@graph": [
        {
          "@id": `${groupUri}/${GroupData.getStringOrMissing(this.name)}`,
          "@type": "Artifact",
          "title": this.getValidString(this.title),
          "abstract": this.getValidString(this.abstract),
          "description": this.getValidString(this.description),
        }
      ]
    };

    const payload = JSON.stringify(this.postBody, null, 2);
    const apiKey = this.apiKeys?.find(k => k.keyname === this.apiKeyName)?.apikey;

    this.curlCommand = [
      `curl -X POST ${DATABUS_RESOURCE_BASE_URL}/api/register \\`,
      `  -H "X-API-KEY: ${GroupData.getStringOrMissing(apiKey)}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${payload}'`
    ].join('\n');
  }
}

module.exports = ArtifactData;
