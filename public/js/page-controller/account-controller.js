const DatabusUtils = require("../utils/databus-utils");
const DatabusWebappUtils = require("../utils/databus-webapp-utils");
const TabNavigation = require("../utils/tab-navigation");

var DEFAULT_IMAGE = "https://picsum.photos/id/223/320/320";

// Controller for the header section
function AccountPageController($scope, $http, $location, collectionManager) {

  $scope.collectionManager = collectionManager;


  // Pick up the profile data
  $scope.auth = data.auth;
  $scope.location = $location;
  $scope.account = data.account;

  // Exit if there is no profile
  if ($scope.account == undefined) {
    return;
  }

 
  // Create a tab navigation object for the tab navigation with locato
  $scope.tabNavigation = new TabNavigation($scope, $location, [
    'data', 'collections', 'settings'
  ]);

  // Make some util functions available in the template
  $scope.utils = new DatabusWebappUtils($scope);
  $scope.accountName = $scope.utils.getAccountName();
  $scope.account.isOwn = $scope.accountName != null; //.auth.authenticated && $scope.auth.info.accountName == $scope.account.accountName;


  $scope.dataSearchInput = '';
  $scope.dataSearchSettings = {
    minRelevance: 0.01,
    maxResults: 10,
    placeholder: `Search ${$scope.account.accountName}'s data...`,
    resourceTypes: ['Group', 'Artifact'],
    filter: `&publisher=${$scope.account.accountName}&typeNameWeight=0`
  };

  $scope.collectionSearchInput = '';
  $scope.collectionSearchSettings = {
    minRelevance: 0.01,
    maxResults: 10,
    placeholder: `Search ${$scope.account.accountName}'s collections...`,
    resourceTypes: ['Collection'],
    filter: `&publisher=${$scope.account.accountName}&publisherWeight=0&typeNameWeight=0`
  };

  
  // Wait for additional artifact data to arrive
  $scope.publishedData = {};
  $scope.publishedData.isLoading = true;

  $http.get(`/app/account/content?account=${encodeURIComponent($scope.account.accountName)}`)
    .then(function (response) {

      $scope.publishedData.isLoading = false;
      $scope.publishedData.groups = response.data.groups;
      $scope.publishedData.artifacts = response.data.artifacts;

      for (var artifact of $scope.publishedData.artifacts) {
        artifact.group = DatabusUtils.navigateUp(artifact.uri, 1);
        artifact.title = DatabusUtils.stringOrFallback(artifact.title, artifact.latestVersionTitle);
        artifact.abstract = DatabusUtils.stringOrFallback(artifact.abstract, artifact.latestVersionAbstract);
        artifact.description = DatabusUtils.stringOrFallback(artifact.description, artifact.latestVersionDescription);
      }

      for (var group of $scope.publishedData.groups) {
        group.artifacts = $scope.publishedData.artifacts.filter(function (a) {
          return a.group == group.uri;
        });
      }

      // Order by latest version date
      $scope.recentUploads = $scope.publishedData.artifacts.filter(function (v) {
        return v.latestVersionDate != null;
      });
      $scope.recentUploads.sort(function (a, b) {
        return new Date(b.latestVersionDate) - new Date(a.latestVersionDate);
      });

      $scope.recentUploads = $scope.recentUploads.slice(0, 3);

      $scope.refreshFeaturedContent();
    }, function (err) {
      console.log(err);
    });


  // Wait for stats data to arrive
  $scope.statsData = {};
  $scope.statsData.isLoading = true;

  $http.get(`/app/account/stats?account=${encodeURIComponent($scope.account.accountName)}`).then(function (response) {
    $scope.statsData.stats = response.data;
    $scope.statsData.isLoading = false;
  }, function (err) {
    console.log(err);
  });

  // Wait for activity chart data to arrive
  $scope.activityData = {};
  $scope.activityData.isLoading = true;

  $http.get(`/app/account/activity?account=${encodeURIComponent($scope.account.accountName)}`).then(function (response) {
    $scope.activityData.entries = response.data;
    $scope.activityData.isLoading = false;
  }, function (err) {
    console.log(err);
  });

  $scope.collectionsData = {};
  $scope.collectionsData.isLoading = true;

  if (!$scope.account.isOwn) {
    $http.get(`/app/account/collections?account=${encodeURIComponent($scope.account.accountName)}`)
      .then(function (response) {

        $scope.collectionsData.collections = response.data;
        $scope.collectionsData.isLoading = false;
        $scope.refreshFeaturedContent();
      }, function (err) {
        console.log(err);
      });
  } else {
    $scope.collectionList = [];

    for(let guid in $scope.collectionManager.local) {
      let collection = $scope.collectionManager.local[guid];

      if(collection.accountName == $scope.accountName) {
        $scope.collectionList.push(collection);
      }

    }
  }

  $scope.getImageUrl = function () {
    if ($scope.account.imageUrl == undefined) {
      return DEFAULT_IMAGE;
    } else {
      return $scope.account.imageUrl;
    }
  }

  /**
   * COLLECTION FUNCTIONS 
   */

  // Collection List Search
  $scope.collectionSearch = {};
  $scope.collectionSearch.sortVisible = false;
  $scope.collectionSearch.sortProperty = 'title';
  $scope.collectionSearch.sortProperties =  [ 
    { key: 'title', label: 'Title' },
    { key: 'issued', label: 'Issued Date' },
  ];
  $scope.collectionSearch.sortReverse = false;
  $scope.collectionSearch.toggleSort = function(value) {
    if($scope.collectionSearch.sortProperty == value) {
      $scope.collectionSearch.sortReverse = !$scope.collectionSearch.sortReverse;
    } else {
      $scope.collectionSearch.sortProperty = value;
    }
  }

  /**
   * Pencil icon for edit pressed
   * @param {*} collection 
   */
  $scope.onEditCollectionClicked = function (collection) {
    $scope.collectionManager.setActive(collection.uuid);
    window.location.href = `/app/collection-editor?uuid=${collection.uuid}`;
  }

  /**
   * Create new collection
   */
  $scope.createNewCollection = function () {
    $scope.collectionManager.createNew($scope.accountName, 'New Collection', 'Replace this description with a description of your choice.',
      function (collection) {
        window.location.href = `/app/collection-editor?uuid=${collection.uuid}`;
      });
  }

  /**
   * Create a copy of the clicked collection
   */
  $scope.createCopy = function(collection) {
    let copy = $scope.collectionManager.createCopy(collection);
    window.location.href = `/app/collection-editor?uuid=${copy.uuid}`;
  }


  $scope.findFeaturedContent = function (uri) {

    for (var g in $scope.publishedData.groups) {
      var group = $scope.publishedData.groups[g];

      if (uri == group.uri) {
        return {
          type: 'Group',
          title: group.title,
          uri: uri,
          description: group.description
        }
      }

      for (var a in group.artifacts) {
        var artifact = group.artifacts[a];

        if (uri == artifact.artifactUri) {
          return {
            type: 'Artifact',
            title: artifact.title,
            uri: uri,
            description: artifact.description
          }
        }
      }
    }

    for (var c in $scope.collectionsData.collections) {
      var collection = $scope.collectionsData.collections[c];

      if (uri == collection.uri) {
        return {
          type: 'Collection',
          title: collection.title,
          uri: uri,
          description: collection.description
        }
      }
    }

  }

  $scope.refreshFeaturedContent = function () {
    if ($scope.account.featuredContent == undefined) {
      return;
    }

    var featuredContentUris = $scope.account.featuredContent.split('\n');
    $scope.featuredContent = [];

    for (var f in featuredContentUris) {
      var content = $scope.findFeaturedContent(featuredContentUris[f]);

      if (content != undefined) {
        $scope.featuredContent.push(content);
      }
    }
  }

  /** ACCOUNT MANAGEMENT FOR OWNER */

}

module.exports = AccountPageController;