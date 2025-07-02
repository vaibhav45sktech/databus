const DatabusUtils = require("../utils/databus-utils");
const DatabusWebappUtils = require("../utils/databus-webapp-utils");
const DatabusAlert = require("../components/databus-alert/databus-alert");
const SearchAdapter = require("../search/search-adapter");
const DatabusMessages = require("../utils/databus-messages");
const DatabusConstants = require("../utils/databus-constants");
const AppJsonFormatter = require("../utils/app-json-formatter");

function ProfileController($scope, $http) {

  $scope.account = data.account;
  $scope.auth = data.auth;

  if(data.owner != null) {
    $scope.account.apiKeys = data.owner.apiKeys;
  }
  $scope.auth = data.auth;
  $scope.preferredDatabusUsername = "";
  $scope.createApiKeyName = ""
  $scope.createAccountError = "";
  $scope.createApiKeyError = "";
  $scope.addWebIdUri = "";
  $scope.grantAccessUri = "";
  $scope.adapters = SearchAdapter.list;
  $scope.utils = new DatabusWebappUtils($scope);

  $scope.accountName = $scope.utils.getAccountName();

  $scope.personUri = `${DATABUS_RESOURCE_BASE_URL}/${$scope.accountName}${DatabusConstants.WEBID_THIS}`;

  $scope.putProfile = function (accountName) {

    var accountUri = `${DATABUS_RESOURCE_BASE_URL}/${accountName}`;
    var accountJsonLd = AppJsonFormatter.createAccountData(
      accountUri,
      accountName, 
      null, 
      null);

    $http.post(`/api/register`, accountJsonLd).then(function (result) {
      window.location.reload(true);
    }, function (err) {
      console.log(err);
      $scope.createAccountError = err.data;
    });
  }


  if ($scope.account == undefined) {

    $scope.createProfile = function () {

      if ($scope.isSubmitting) 
      {
        return;
      } 

      $scope.isSubmitting = true;

      if (!$scope.auth.authenticated) {
        return;
      }

      var accountName = $scope.preferredDatabusUsername;

      if (accountName == undefined || !DatabusUtils.isValidAccountName(accountName)) {
        $scope.createAccountError = "Enter a valid account name."
        $scope.showAccountNameHints = true;
        return;
      }

      $scope.showAccountNameHints = false;
      $scope.putProfile(accountName);
    }

    return;
  }

   $scope.addApiKey = async function () {
    // Validate the name input only
    
    if (!$scope.createApiKeyName) {
      DatabusAlert.alert("API key name must be provided.");
      return;
    }

    let account = $scope.account;

    const postData = {
      accountName: account.accountName,
      name: $scope.createApiKeyName
    };

    try {
      // Send POST request to create the API key
      let response = await $http.post('/api/account/api-key/create', postData);
      
      if (response.data && response.data.apikey && response.data.keyname) {
        // Append new key to the list
        account.apiKeys.push({
          keyname: response.data.keyname,
          apikey: response.data.apikey
        });

        // Clear the name input field
        $scope.createApiKeyName = '';
        
        DatabusAlert.alert($scope, true, "API key created.");
      } else {
      DatabusAlert.alert($scope, false, "Failed to create API key.");
      }

    } catch(error) {
      console.error('Error creating API key:', error);
      const message = error.data || error.message || "Unknown error occurred.";
      DatabusAlert.alert($scope, false, message);
    }
  };
  
  
  $scope.deleteApiKey = async function (apiKey) {
     try {

      let account = $scope.account;
      // Find index of the account using accountName
      const index = account.apiKeys.findIndex(key => key.keyname === apiKey.keyname);

      if (index === -1) {
        throw new Error(`API key with name "${apiKey.keyname}" not found.`);
      }

      console.log("Deleting API key with keyname:", apiKey.keyname);

      // Send delete request to server
      await $http.post(`/api/account/api-key/delete`, { accountName: account.accountName, keyname: apiKey.keyname });
      account.apiKeys.splice(index, 1);

      // Show success alert
      DatabusAlert.alert($scope, true, "API key deleted.");

    } catch (err) {
      console.error(err);



      const message = err.data || err.message || "Unknown error occurred.";
      DatabusAlert.alert($scope, false, message);
    }
  };

  $scope.addSecretary = function(account) {
    if (!account.secretaries) {
      account.secretaries = [];
    }

    account.secretaries.push({
      accountName: '',
      hasWriteAccessTo: []
    });
  };

  $scope.removeSecretary = function(account, index) {
    account.secretaries.splice(index, 1);
  };

  $scope.addNamespace = function(account, secIndex) {
    account.secretaries[secIndex].hasWriteAccessTo.push('');
  };

  $scope.removeNamespace = function(account, secIndex, nsIndex) {
    account.secretaries[secIndex].hasWriteAccessTo.splice(nsIndex, 1);
  };

  
  $scope.onCreateApiKeyNameChanged = function () {
    var hasError = !DatabusUtils.isValidResourceLabel($scope.createApiKeyName, 3, 20);
    $scope.createApiKeyError = hasError ? " API key name must have between 3 and 20 characters and match [A-Za-z0-9\\s_()\\.\\,\\-]*" : "";
  }

 /*
  $scope.removeApiKey = function (key) {

    $http.post(`/api/account/api-key/delete?name=${key.keyname}`).then(function (result) {
      $scope.apiKeys = $scope.apiKeys.filter(function (k) {
        return k.keyname != key.keyname;
      });

    }, function (err) {
      console.log(err);
      $scope.createApiKeyError = err.data;
    });
  }


  $scope.addApiKey = function () {

    $http.post(`/api/account/api-key/create?name=${encodeURIComponent($scope.createApiKeyName)}`).then(function (result) {

      if (result.data != null) {
        $scope.apiKeys.push(result.data);
      }

      DatabusAlert.alert($scope, true, DatabusMessages.ACCOUNT_API_KEY_CREATED);

    }, function (err) {
      console.log(err);
      $scope.createApiKeyError = err.data;
    });

  }*/

  $scope.removeSearchExtension = function(uri) {
    $http.post(`/api/account/mods/search-extensions/remove?uri=${encodeURIComponent(uri)}`)
    .then(function (result) {
      console.log(result);
      DatabusAlert.alert($scope, true, result.data);

      $scope.account.searchExtensions =  $scope.account.searchExtensions.filter(function (e) {
        return e.endpointUri != uri;
      });

    }, function (err) {
      console.log(err);
      DatabusAlert.alert($scope, false, err.data);
    });
  }

  $scope.addSearchExtension = function () {
    var uri = $scope.modsSettings.searchExtensionURI;
    var adapter = $scope.modsSettings.searchExtensionAdapter.name;

    $http.post(`/api/account/mods/search-extensions/add?uri=${encodeURIComponent(uri)}&adapter=${adapter}`)
      .then(function (result) {
        console.log(result);
        DatabusAlert.alert($scope, true, result.data);
        $scope.account.searchExtensions.push({
          endpointUri: uri,
          adapter: adapter
        });
      }, function (err) {
        console.log(err);
        DatabusAlert.alert($scope, false, err.data);
      });
  }

  $scope.grantAccess = function () {
    $http.post(`/api/account/access/grant?uri=${encodeURIComponent($scope.grantAccessUri)}`).then(function (result) {
      $scope.account.authorizedAccounts.push($scope.grantAccessUri);
    }, function (err) {
      console.log(err);
      $scope.grantAccessError = err.data;
    });
  }

  $scope.revokeAccess = function (uri) {
    $http.post(`/api/account/access/revoke?uri=${encodeURIComponent(uri)}`).then(function (result) {
      $scope.account.authorizedAccounts = $scope.account.webIds.filter(function (value, index, arr) {
        return value != uri;
      });
    }, function (err) {
      console.log(err);
      $scope.grantAccessError = err.data;
    });
  }

  $scope.connectWebid = function () {

    $http.post(`/api/account/webid/add?uri=${encodeURIComponent($scope.addWebIdUri)}`).then(function (result) {
      $scope.account.webIds.push($scope.addWebIdUri);
      DatabusAlert.alert($scope, true, DatabusMessages.ACCOUNT_WEBID_LINKED);

    }, function (err) {
      console.log(err);
      $scope.addWebIdError = err.data;
    });
  }

  $scope.removeWebId = function (webIdToRemove) {

    $http.post(`/api/account/webid/remove?uri=${encodeURIComponent(webIdToRemove)}`).then(function (result) {

      $scope.account.webIds = $scope.account.webIds.filter(function (value, index, arr) {
        return value != webIdToRemove;
      });

    }, function (err) {
      console.log(err);
      $scope.addWebIdError = err.data;
    });
  }


  $scope.saveProfile = async function () {

    if (!$scope.auth.authenticated) {
      return;
    }

    var accountUri = `${DATABUS_RESOURCE_BASE_URL}/${$scope.auth.info.accountName}`;
    var accountJsonLd = AppJsonFormatter.createAccountData(
      accountUri,
      $scope.editData.label, 
      $scope.editData.about, 
      $scope.editData.imageUrl);

    $http.post(`/api/register`, accountJsonLd).then(function (result) {
      DatabusAlert.alert($scope, true, DatabusMessages.ACCOUT_PROFILE_SAVED);
    }, function (err) {
      console.log(err);
    });
  }

  // We have profile data in $scope.account!

  if (!$scope.account.isOwn) {
    return;
  }

  $scope.modsSettings = {}
  $scope.modsSettings.searchExtensionURI = "";
  $scope.modsSettings.searchExtensionAdapter = $scope.adapters[0];


  $scope.editData = DatabusUtils.createCleanCopy($scope.account);

  $scope.resetEdits = function () {
    $scope.editData = DatabusUtils.createCleanCopy($scope.account);
  }

}

module.exports = ProfileController;