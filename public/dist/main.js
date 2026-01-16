/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "../server/app/common/utils/api-error.js"
/*!***********************************************!*\
  !*** ../server/app/common/utils/api-error.js ***!
  \***********************************************/
(module) {

class ApiError extends Error {
    constructor(statusCode, resource, message, body) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.resource = resource;
        this.body = body;
    }
}

module.exports = ApiError;

/***/ },

/***/ "./js/collections/databus-collection-manager.js"
/*!******************************************************!*\
  !*** ./js/collections/databus-collection-manager.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const AppJsonFormatter = __webpack_require__(/*! ../utils/app-json-formatter */ "./js/utils/app-json-formatter.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusCollectionUtils = __webpack_require__(/*! ./databus-collection-utils */ "./js/collections/databus-collection-utils.js");
const DatabusCollectionWrapper = __webpack_require__(/*! ./databus-collection-wrapper */ "./js/collections/databus-collection-wrapper.js");

class DatabusCollectionManager {

  // Daten die wir haben:

  // Liste von Remote Collections (ungeladen) { uri: databus.org/asdf, label: asdffasd }
  // Liste von Working Copies in der Local Storage
  // Beispiel:
  // [0] : { uri: databus.org/asdf, label: asdffasd, content: { ... }, ... }
  // [1] : { uri: databus.org/asdsdff, label: asdasdfffasd }



  // On Initizialze:
  // Fuer alle remove collections -> finde lokale Kopie / erzeuge lokale Kopie

  // On Select / On Set Active
  // 1: Ist es ein Draft -> uri ist undefined
  // Ja? -> Collection direkt als Draft Anzeigen
  // Nein? -> Ist Collection schon geladen? content ist nicht undefined
  //          Ja? -> Lade async, uberschreibe remote entry
  //          Nein? -> Lade async, setze remote und local entry

  _isInitialized = false;
  _initSubscribers = [];

  constructor($http, $interval, storageKey) {

    try {
      this.storageKeyPrefix = `${encodeURI(DATABUS_RESOURCE_BASE_URL)}`;
      // window.sessionStorage.removeItem(`${this.storageKeyPrefix}_session`);

      this.sessionInfo = JSON.parse(window.sessionStorage.getItem(`${this.storageKeyPrefix}_session`));

      if (this.sessionInfo == undefined) {
        this.sessionInfo = {};
      }

      window.sessionStorage.setItem(`${this.storageKeyPrefix}_session`, JSON.stringify(this.sessionInfo));
      this.storageKey = `${this.storageKeyPrefix}__collections`;
      this.local = this.loadCollectionsFromStorage(true);
      this.remote = {};

    } catch (err) {
      this.sessionInfo = {};
    }


    this.http = $http;
    this.interval = $interval;
  }

  clearSession() {
    this.sessionInfo = {};
    window.sessionStorage.setItem(`${this.storageKeyPrefix}_session`, JSON.stringify(this.sessionInfo));
  }

  get accountName() {
    return this.sessionInfo != undefined ? this.sessionInfo.accountName : undefined;
  }

  getLocalCollectionByUri(uri) {
    for (let guid in this.local) {
      let localCollection = this.local[guid];

      if (localCollection.uri == uri) {
        return localCollection;
      }
    }

    return undefined;
  }

  /**
   * Set up the collection mananger for a specific account.
   * 1) Load ALL the collections of this account from the remote
   * 2) Save to remote map
   * 3) Create local working copies if local has no entry for remote collection
   * @param {*} accountName 
   * @returns 
   */
  async tryInitialize(accountName) {

    // Needs an account name to set up
    if (accountName == undefined) {
      return;
    }

    // this.remote = this.loadCollectionsFromStorage(false);
    this.sessionInfo.accountName = accountName;



    let collectionListResponse = await this.http.get(`/app/account/collections?account=${encodeURIComponent(accountName)}`);
    let remoteCollections = collectionListResponse.data;


    let wasLocalCollectionAdded = false;

    for (let collectionUri in remoteCollections) {
      let remoteCollection = remoteCollections[collectionUri];
      let localCollection = this.getLocalCollectionByUri(collectionUri);

      // Create local copy if not exist
      if (localCollection == undefined) {
        localCollection = JSON.parse(JSON.stringify(remoteCollection));
        localCollection.uuid = DatabusCollectionUtils.uuidv4();
        this.local[localCollection.uuid] = localCollection;
        wasLocalCollectionAdded = true;
      }

      this.remote[localCollection.uuid] = remoteCollection;
      this.remote[localCollection.uuid].isHidden = this.remote[localCollection.uuid].issued == undefined;

      if(this.local[localCollection.uuid].isHidden == undefined) {
        this.local[localCollection.uuid].isHidden = this.remote[localCollection.uuid].isHidden;
      }
    }

    if(wasLocalCollectionAdded) {
      this.saveLocally();
    }

    this.findActive();

    /*

    if (loadFromServer) {
      try {
        var res = await this.http.get(`/app/account/collections?account=${accountName}`);
        this.initialize(res.data);

      } catch (e) {
        console.log(`Failed to initialze collection manager.`);
        console.log(e);
      }
    }
    */

    var self = this;

    this.interval(function () {
      var storageHash = window.localStorage.getItem(`${self.storageKey}_hash`);

      if (storageHash != self.currentHash) {
        self.local = JSON.parse(window.localStorage.getItem(self.storageKey));
        self.currentHash = storageHash;

        for (let identifier in self.local) {
          if (identifier === undefined || identifier === "undefined") {
            delete (self.local[identifier]);
          } else {
            //enable Collection Utils for all collections in local storage
            self.local[identifier] = new DatabusCollectionWrapper(self.local[identifier]);
          }
        }

        if (self.onCollectionChangedInDifferentTab != null) {
          self.onCollectionChangedInDifferentTab();
        }
      }
    }, 300);


    this._isInitialized = true;
    this._notifyInitialized();
  }

  get isInitialized() {
    return this._isInitialized;
  }

  subscribeOnInitialized(callback) {
    if (this._isInitialized) {
      callback();
    } else {
      this._initSubscribers.push(callback);
    }
  }

  _notifyInitialized() {
    this._initSubscribers.forEach(cb => cb());
    this._initSubscribers = [];
  }

  get hasAccountName() {
    return this.accountName != null;
  }

  // Setze das remote array und update local array
  initialize(remoteCollections) {
    // We keep remote entries and local entries separately to detect diffs
    this.remote = {};

    // Load everyting from the local browser storage. All entries in the local browser
    // storage are indexed with a UUID identifier.
    // Remote collections that are pulled to the local browser storage will
    // also be given such an identifier
    // this.local = this.loadCollectionsFromLocalStorage();

    // This map will keep track of all local entries that already claim to have a remote counterpart
    let localPublished = {};

    for (let identifier in this.local) {
      if (!identifier.startsWith('___')) {
        delete this.local[identifier];
        continue;
      }

      if (identifier !== this.local[identifier].uuid) {
        delete this.local[identifier];
        continue;
      }

      let localCollection = this.local[identifier];

      if (localCollection.uri !== undefined && remoteCollections !== undefined) {
        let uri = localCollection.uri;
        // The local collection already has a URI
        if (remoteCollections[uri] === undefined) {
          // There is no remote collection with that URI - delete it! Keep the collection as a draft
          delete (this.local[identifier].uri);
          delete (this.local[identifier].issued);
          delete (this.local[identifier].created);
        } else {
          // Remember that the collection with uri already has a working copy
          localPublished[uri] = true;
          // Also remember the remote entry as an entry with a local working copy
          this.remote[identifier] = remoteCollections[uri];
          // Make sure the unchangeable values are set to the remote entry
          this.local[identifier].publisher = remoteCollections[uri].publisher;
          this.local[identifier].issued = remoteCollections[uri].issued;
          this.local[identifier].created = remoteCollections[uri].created;
          this.local[identifier].files = remoteCollections[uri].files;
        }
      }
    }

    for (let uri in remoteCollections) {
      if (localPublished[uri] === undefined) {
        // We don't have a working copy in our local storage yet, time to create an identifier!
        let identifier = DatabusCollectionUtils.uuidv4();
        remoteCollections[uri].uuid = identifier;
        remoteCollections[uri].isHidden = remoteCollections[uri].issued == undefined;
        // Create two entries, one in the local map, one in the remote map
        this.local[identifier] = DatabusCollectionUtils.createCleanCopy(remoteCollections[uri]);
        this.remote[identifier] = DatabusCollectionUtils.createCleanCopy(remoteCollections[uri]);
      }
    }

    for (let identifier in this.local) {
      // The local collection is now either a draft or a working copy of the remote - wrap it.
      this.local[identifier] = new DatabusCollectionWrapper(this.local[identifier]);
      // Sanitize content
      if (!(this.local[identifier].content instanceof Object)) {
        this.local[identifier].content = { groups: [], customQueries: [] };
      }
    }

    /*
    let activeIdentifier = this.activeCollectionIdentifier;
    // Set first collection as active

    if (this.local[activeIdentifier] !== undefined) {
      this.activeCollectionIdentifier = activeIdentifier;
    }
    */



    // QueryNode.assignParents(this.activeCollection.content.root);

    // Save locally in case we created any local working copies

    this.saveLocally();

    // Call this always in header-controller.js
    if (this.activeCollection == null) {
      // select first or create a new draft if we don't have any local drafts yet
      this.selectFirstOrCreate();
    }

  }



  findActive() {
    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized1.";
    if (this.activeCollection == undefined) {
      this.selectFirstOrCreate();
    }
  }


  loadCollectionsFromStorage(local = true) {
    let collections;

    if (local) {
      collections = JSON.parse(window.localStorage.getItem(this.storageKey));
    } else {
      collections = JSON.parse(window.sessionStorage.getItem(this.storageKey));
    }

    if (collections == null) {
      collections = {};
    }

    for (let identifier in collections) {
      if (identifier === undefined || identifier === "undefined") {
        delete (collections[identifier]);
      } else if (collections[identifier].accountName == null) {
        delete (collections[identifier]);
      } else {
        //enable Collection Utils for all collections in local storage
        collections[identifier] = new DatabusCollectionWrapper(collections[identifier]);
      }
    }

    return collections;
  }

  /**
   * Selects the first collection in the local list or creates a new draft
   */
  selectFirstOrCreate(accountName) {

    for (let identifier in this.local) {
      this.setActive(identifier);
      break;
    }

    // Create new collection if current is null
    if (this.activeCollection == null) {
      this.createNew(accountName, "Unnamed Collection", "", function (response) { });
    }
  }

  setActive(uuid) {
    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized1.";

    this.convertCollectionContentToTree(uuid);

    let collection = this.local[uuid];
    // QueryNode.assignParents(collection.content.root);

    this.sessionInfo.activeCollectionIdentifier = uuid;
    window.sessionStorage.setItem(`${this.storageKeyPrefix}_session`, JSON.stringify(this.sessionInfo));

  }

  get activeCollectionIdentifier() {
    return this.sessionInfo != null ? this.sessionInfo.activeCollectionIdentifier : null;
  }

  get activeCollection() {
    if (this.activeCollectionIdentifier == null) {
      return null;
    }

    if (this.local == null) {
      return null;
    }

    return this.local[this.activeCollectionIdentifier];
  }

  convertCollectionContentToTree(uuid) {
    let collection = this.local[uuid];

    if (collection.content.root !== undefined) {
      return;
    }

    collection.content.root = new QueryNode(null, null);

    for (var g in collection.content.groups) {
      var group = collection.content.groups[g];
      var groupNode = new QueryNode(group.uri, 'databus:group');

      // add group facets
      for (var s in group.settings) {
        var setting = group.settings[s];

        if (setting.value === 'SYSTEM_LATEST_ARTIFACT_VERSION' || setting.value === 'SYSTEM_LATEST_GROUP_VERSION') {
          setting.value = '$latest';
        }

        groupNode.setFacet(setting.facet, setting.value, setting.checked);
      }

      collection.content.root.addChild(groupNode);


      for (var a in group.artifacts) {
        var artifact = group.artifacts[a];

        var artifactNode = new QueryNode(artifact.uri, 'databus:artifact');

        // add artifact facets

        groupNode.addChild(artifactNode);
      }
    }

  }

  createSnapshot(source) { // convert each version="latest" to actual latest version
    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

    let collection = DatabusCollectionWrapper.createNew();
    collection.accountName = this.accountName;
    collection.content = DatabusCollectionUtils.createCleanCopy(source.content);

    let root = collection.content.root;
    for (var g in root.childNodes) {
      var graph = root.childNodes[g];

      for (var s in graph.facetSettings) {
        if (graph.facetSettings[s][0].value === '$latest') {
          this.http.get('/app/utils/facets', {
            params: { uri: artifact.uri, type: 'group' }
          }).then(function (result) {
            let versions = result.data["http://purl.org/dc/terms/hasVersion"].values;
            let latestVersion = versions.reduce(function (a, b) { return a > b ? a : b; });
            artifact.facetSettings[s][0].value = latestVersion;
          });
        }
      }

      for (var a in graph.childNodes) {
        var artifact = graph.childNodes[a];

        for (var s in artifact.facetSettings) {
          if (artifact.facetSettings[s][0].value === '$latest') {
            this.http.get('/app/utils/facets', {
              params: { uri: artifact.uri, type: 'artifact' }
            }).then(function (result) {
              let versions = result.data["http://purl.org/dc/terms/hasVersion"].values;
              let latestVersion = versions.reduce(function (a, b) { return a > b ? a : b; });
              artifact.facetSettings[s][0].value = latestVersion;
            });
          }
        }

      }

    }


    collection.title = `Snapshot of ${source.title}`;
    collection.description = source.description;

    this.local[collection.uuid] = new DatabusCollectionWrapper(collection);
    this.saveLocally();
    this.setActive(collection.uuid);

    return collection;
  }

  saveLocally() {
    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

    if (this.activeCollection != null) {
      this.activeCollection.hasLocalChanges = this.hasLocalChanges(this.activeCollection);
    }

    var hash = DatabusCollectionUtils.cyrb53Hash(DatabusCollectionUtils.serialize(this.local));
    this.currentHash = hash;

    window.localStorage.setItem(`${this.storageKey}_hash`, hash);

    for (let identifier in this.local) {
      if (this.local[identifier].accountName == null) {
        delete (this.local[identifier]);
      }
    }

    try {
      //write local collections to local storage
      window.localStorage.setItem(this.storageKey, DatabusCollectionUtils.serialize(this.local));
      //write remote collections to session storage
      window.sessionStorage.setItem(this.storageKey, DatabusCollectionUtils.serialize(this.remote));
    } catch (e) {
      console.log(e);
    }
  }

  hasLocalChanges(localCollection) {
    if (this.remote[localCollection.uuid] === undefined) {
      return true;
    }

    let remoteCollection = this.remote[localCollection.uuid];

    if (remoteCollection.isHidden != localCollection.isHidden) {
      return true;
    }

    if (localCollection.title !== remoteCollection.title) {
      return true;
    }

    if (localCollection.description !== remoteCollection.description) {
      return true;
    }

    let serializedRemoteContent = DatabusCollectionUtils.serialize(remoteCollection.content);
    let serializedLocalContent = DatabusCollectionUtils.serialize(localCollection.content);

    return serializedLocalContent !== serializedRemoteContent;
  }

  discardLocalChanges() {

    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

    let uuid = this.activeCollection.uuid;

    if (this.remote[uuid] === undefined) {
      return;
    }

    let uri = this.activeCollection.uri;

    if (uri == undefined) {
      return;
    }

    this.local[uuid].title = this.remote[uuid].title;
    this.local[uuid].abstract = this.remote[uuid].abstract;
    this.local[uuid].description = this.remote[uuid].description;
    this.local[uuid].content = DatabusCollectionUtils.createCleanCopy(this.remote[uuid].content);
    this.local[uuid].hasLocalChanges = this.hasLocalChanges(this.local[uuid]);

    this.saveLocally();
  }

  addElement(elementQuery) {
    this.current.addElement(elementQuery);
    this.saveLocally();

    if (this.onActiveCollectionChanged != null) {
      this.onActiveCollectionChanged(this.current);
    }
  }

  removeElement(elementGuid) {
    this.current.removeElement(elementGuid);
    this.saveLocally();

    if (this.onActiveCollectionChanged != null) {
      this.onActiveCollectionChanged(this.current);
    }
  }



  createNew(accountName, title, description, callback) {
    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

    let reg = /^\w+[\w\s]*$/;

    if (title === undefined || !reg.test(title)) {
      callback(false);
      return;
    }

    let collection = DatabusCollectionWrapper.createNew(title, description, DATABUS_RESOURCE_BASE_URL, accountName);

    this.local[collection.uuid] = new DatabusCollectionWrapper(collection);
    this.setActive(collection.uuid);
    this.saveLocally();

    callback(collection);
  }

  createDraft(callback) {
    if (!this.hasAccountName) {
      return;
    }

    let collection = DatabusCollectionWrapper.createNew('', '');
    this.local[collection.uuid] = new DatabusCollectionWrapper(collection);
    this.setActive(collection.uuid);
    this.saveLocally()

    callback(DatabusResponse.COLLECTION_DRAFT_CREATED);
  }

  createCopy(source) {
    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

    let collection = DatabusCollectionWrapper.createNew();
    collection.content = DatabusCollectionUtils.createCleanCopy(source.content);
    collection.title = `Copy of ${source.title}`;
    collection.abstract = source.abstract;
    collection.description = source.description;
    collection.accountName = this.accountName;

    this.local[collection.uuid] = new DatabusCollectionWrapper(collection);
    this.saveLocally();
    this.setActive(collection.uuid);

    return collection;
  }



  deleteLocally() {
    delete this.local[this.activeCollection.uuid];
    this.saveLocally();
  }

  /**
   * Returns the collection or null
   * @param  {[type]} uri [description]
   * @return {[type]}      [description]
   */
  getCollectionByUri(uri) {
    if (uri == null)
      return null;

    for (let identifier in this.local) {
      if (uri === this.local[identifier].uri) {
        return this.local[identifier];
      }
    }
    return null;
  }

  /**
   * Returns the first collection or null
   * @return {[type]} [description]
   */
  getFirstCollection() {
    if (this.local.length === 0) {
      return null;
    }
    return this.local[0];
  }


  async changeCollection(username, collectionUri) {
    try {
      if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

      this.saveLocally();

      // Keep the identifier of the collection we want to push
      var pushIdentifier = this.activeCollection.uuid;
      var publisherUri = `${DATABUS_RESOURCE_BASE_URL}/${username}#this`;

      var ignoreKeys = [
        'parent',
        '$$hashKey',
        'expanded',
        'files',
        'eventListeners',
        'hasLocalChanges',
        'published',
        'uuid',
      ];

      var contentString = encodeURIComponent(DatabusCollectionUtils.serialize(this.activeCollection.content, ignoreKeys));

      // Format collection as json-ld
      let collectionJsonLd = {
        "@context": DATABUS_CONTEXT[DatabusUris.JSONLD_CONTEXT],
        "@graph": [
          {
            "@id": collectionUri,
            "@type": "Collection",
            "publisher": publisherUri,
            "title": this.activeCollection.title,
            "abstract": this.activeCollection.abstract,
            "description": this.activeCollection.description,
            "databus:collectionContent": contentString,
          }
        ]
      };

      if (!this.activeCollection.isHidden) {
        collectionJsonLd["@graph"][0].issued = DatabusUtils.timeStringNow();
      }

      var response = null;

      try {

        // var relativeUri = new URL(collectionUri).pathname;
        // response = await this.http.put(relativeUri, collectionJsonLd);

        response = await this.http.post('/api/register', collectionJsonLd);

      } catch (errResponse) {
        console.log(errResponse);
        throw { code: errResponse.data.code };
      }

      try {
        var relativeUri = new URL(collectionUri).pathname;

        var response = await this.http({
          method: 'GET',
          url: relativeUri,
          headers: {
            'Accept': 'application/ld+json',
            'X-Jsonld-Formatting': 'compact'
          }
        });


      } catch (errResponse) {
        console.log(errResponse);
        throw { code: errResponse.data.code };
      }

      // Get the remotely saved collection from the payload
      var remoteGraph = response.data;

      // If the user changed the active collection in the meantime throw an error. This
      // should be prevented by a loading dialog
      if (this.activeCollection.uuid != pushIdentifier) {
        throw { code: DatabusResponse.COLLECTION_INVALID_ARGUMENT };
      }

      this.local[pushIdentifier].uri = remoteGraph['@id'];
      this.local[pushIdentifier].hasLocalChanges = false;
      this.local[pushIdentifier].modified = remoteGraph.modified;
      this.local[pushIdentifier].issued = remoteGraph.issued;
      this.local[pushIdentifier].isHidden = remoteGraph.issued == null;
      // this.local[pushIdentifier].created = remoteGraph.created;

      //Update remote data
      this.remote[pushIdentifier] = JSON.parse(DatabusCollectionUtils.serialize(this.activeCollection));

      // Update the local data
      // this.local[pushIdentifier].uri = remoteGraph['@id'];
      //this.local[pushIdentifier].hasLocalChanges = this.hasLocalChanges(this.local[pushIdentifier]);
      //this.local[pushIdentifier].modified = this.activeCollection.modified;
      //this.local[pushIdentifier].issued = this.activeCollection.issued;
      //this.local[pushIdentifier].created = this.activeCollection.created;

      this.saveLocally();

      return response.data;

    } catch (err) {

      console.log(err);
      throw {
        code: err.data !== undefined && err.data.code !== undefined ? err.data.code :
          DatabusResponse.COLLECTION_UPDATE_ERROR
      };
    }
  }

  async updateCollection(username, collectionTag) {

    if (this.activeCollection.uri != null) {
      return await this.changeCollection(username, this.activeCollection.uri);
    } else {
      var collectionUri = `${DATABUS_RESOURCE_BASE_URL}/${username}/collections/${collectionTag}`;

      for (var uuid in this.local) {
        if (this.local[uuid].uri == collectionUri) {
          throw "A collection with the specifed URI already exists.";
        }
      }

      return await this.changeCollection(username, collectionUri);
    }
  }


  /**
   * Fetches the remote data of the current collection and assigns the field values to the local copy
   */
  async fetchCollection(uri) {
    try {
      if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

      var req = {
        method: 'GET',
        url: uri,
        headers: { 'Accept': 'application/json' }
      };

      var getResponse = await this.http(req);
      var collection = getCollectionByUri(uri);

      this.local[collection.uuid].content = getResponse.data.content;
      this.local[collection.uuid].created = getResponse.data.created;
      this.local[collection.uuid].issued = getResponse.data.issued;
      this.local[collection.uuid].title = getResponse.data.title;
      this.local[collection.uuid].description = getResponse.data.description;
      this.local[collection.uuid].files = getResponse.data.files;
    } catch (errResponse) {
      console.log(errResponse);
      return errResponse.data;
    }
  }

  async deleteCollection(username, collectionTag) {
    try {
      if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";



      // Keep the identifier of the collection we want to push
      let deleteIdentifier = this.activeCollection.uuid;

      if (this.activeCollection.isDraft) {
        delete this.local[deleteIdentifier];
        this.saveLocally();
        return { code: DatabusResponse.COLLECTION_DELETED };
      }

      var targetUri = `/${username}/collections/${collectionTag}`;

      let deleteResponse = await this.http.delete(targetUri);

      delete this.remote[deleteIdentifier];
      delete this.local[deleteIdentifier];

      return deleteResponse.data;
    } catch (errResponse) {
      console.log(errResponse);
      return errResponse.data;
    }
  }

  /**
   * Deletes the active collection from the server but keeps the local storage entry
   */
  async unpublishActiveCollection() {

    if (!this.hasAccountName) throw "Databus-Collection-Manager is not initialized.";

    if (this.activeCollection.isDraft) {
      throw "Cannot unpublish an unpublished draft";
    }

    // Keep the identifier of the collection we want to push
    let uuid = this.activeCollection.uuid;
    let identifier = DatabusUtils.uriToName(this.activeCollection.uri);

    var targetUri = `/${this.accountName}/collections/${identifier}`;
    await this.http.delete(targetUri);

    delete this.remote[uuid];
    delete this.local[uuid].uri;
    delete this.local[uuid].issued;
    this.saveLocally();
  }
}


module.exports = DatabusCollectionManager;

/***/ },

/***/ "./js/collections/databus-collection-utils.js"
/*!****************************************************!*\
  !*** ./js/collections/databus-collection-utils.js ***!
  \****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const QueryBuilder = __webpack_require__(/*! ../query-builder/query-builder */ "./js/query-builder/query-builder.js");
const QueryTemplates = __webpack_require__(/*! ../query-builder/query-templates */ "./js/query-builder/query-templates.js");
const DatabusConstants = __webpack_require__(/*! ../utils/databus-constants */ "./js/utils/databus-constants.js");
const DatabusMessages = __webpack_require__(/*! ../utils/databus-messages */ "./js/utils/databus-messages.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");

class DatabusCollectionUtils {

  static CEDIT_IDENTIFIER_REGEX = /^[a-z0-9_-]{3,50}$/;
  static CEDIT_TITLE_REGEX = /^[A-Za-z0-9\s_()\.\,\-]{3,200}$/;
  static CEDIT_ABSTRACT_REGEX = /^[\x00-\xFF\n]{10,}$/;
  static CEDIT_DESCRIPTION_REGEX = /^[\x00-\xFF\n]{10,}$/;

  static formatMessageWithRegex(message, regex) {
    var regexString = regex.source;
    return message.replace("#REGEX#", regexString);
  }

  static checkCollectionForm(form, collection) {

    var hasError = false;

    form.identifier.error = null;
    form.title.error = null;
    form.abstract.error = null;
    form.description.error = null;

    if (collection.isDraft) {

      // Check the identifier
      if (!this.CEDIT_IDENTIFIER_REGEX.test(form.identifier.value)) {
        hasError = true;
        form.identifier.error = this.formatMessageWithRegex(
          DatabusMessages.CEDIT_INVALID_IDENTIFIER,
          this.CEDIT_IDENTIFIER_REGEX
        );
      }
    }

    // Check the title
    if (!this.CEDIT_TITLE_REGEX.test(collection.title)) {
      hasError = true;
      form.title.error = this.formatMessageWithRegex(
        DatabusMessages.CEDIT_INVALID_TITLE,
        this.CEDIT_TITLE_REGEX
      );
    }

    // Check the abstract
    if (!this.CEDIT_ABSTRACT_REGEX.test(collection.abstract)) {
      hasError = true;
      form.abstract.error = this.formatMessageWithRegex(
        DatabusMessages.CEDIT_INVALID_ABSTRACT,
        this.CEDIT_ABSTRACT_REGEX
      );
    }

    // Check the description
    if (!this.CEDIT_DESCRIPTION_REGEX.test(collection.description)) {
      hasError = true;
      form.description.error = this.formatMessageWithRegex(
        DatabusMessages.CEDIT_INVALID_DESCRIPTION,
        this.CEDIT_DESCRIPTION_REGEX
      );
    }

    return !hasError;
  }




  static checkIdentifier(identifier) {
    var identifierRegex = /^[a-z0-9_-]{3, 50}$/;
    return this.checkField(identifier, identifierRegex, 3, 50);
  }

  static checkText(value, min, max) {
    var textRegex = /^[\x00-\xFF\n]*$/;
    return this.checkField(value, textRegex, min, max);
  }

  static checkLabel(value, min, max) {
    var labelRegex = /^[A-Za-z0-9\s_()\.\,\-]*$/;
    return this.checkField(value, labelRegex, min, max);
  }

  static checkField(value, regex, min, max) {
    if (value == undefined) {
      return false;
    }

    if (max > 0 && value.length > max) {
      return false;
    }

    if (value.length < min) {
      return false;
    }

    return regex.test(value);
  }


  // Checks whether a collection can be saved
  static checkCollectionTexts(collection) {
    var labelReg = /^[\x00-\x7F]*$/;
    var textReg = /^[\x00-\x7F\n]*$/;

    if (collection.label == undefined || collection.label == "") {
      return DatabusResponse.COLLECTION_MISSING_LABEL;
    }

    if (!labelReg.test(collection.label) || collection.label.length > 200) {
      return DatabusResponse.COLLECTION_INVALID_LABEL;
    }

    if (collection.description == undefined || collection.description == "") {
      return DatabusResponse.COLLECTION_MISSING_DESCRIPTION;
    }

    if (!textReg.test(collection.description) || description.description.length < 50) {
      return DatabusResponse.COLLECTION_INVALID_DESCRIPTION;
    }

    return 0;
  }


  // Creates a v4 uuid
  static uuidv4() {
    return '___xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static createQueryString(collection) {
    var wrapper = new DatabusCollectionWrapper(collection);
    return wrapper.createQuery();
  }

  static reduceBinding(binding) {
    for (var key in binding) {
      binding[key] = binding[key].value;
    }

    return binding;
  }


  static formatQuery(query, placeholderMappings) {

    if (placeholderMappings == undefined) {
      return query;
    }

    for (var placeholder in placeholderMappings) {
      var re = new RegExp('%' + placeholder + '%', "g");
      query = query.replace(re, placeholderMappings[placeholder]);
    }

    return query;
  }

  static async getCollectionStatistics($http, collection) {

    var query = QueryBuilder.build({
      node: collection.content.root,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL,
      template: QueryTemplates.COLLECTION_STATISTICS_TEMPLATE
    });

    if (query == null) return null;

    var req = {
      method: 'POST',
      url: DatabusConstants.DATABUS_SPARQL_ENDPOINT_URL,
      data: "format=json&timeout=1000000&query=" + encodeURIComponent(query),
      headers: {
        "Content-type": "application/x-www-form-urlencoded"
      },
    }

    var response = await $http(req);
    var entries = response.data.results.bindings;

    entries = entries.filter(function (e) {
      return e.file != undefined;
    });

    if (entries.length === 0) {
      return null;
    }


    let result = {
      fileCount: entries.length,
      licenses: [],
      files: [],
      size: 0
    };

    for (let i in entries) {
      let element = DatabusCollectionUtils.reduceBinding(entries[i]);

      result.size += parseInt(element.size);
      result.licenses.push(element.license);
      result.files.push(element);
    }

    result.licenses = result.licenses.filter(function (item, pos, self) {
      return self.indexOf(item) === pos;
    });

    return result;
  }

  static async getCollectionFiles($http, collection) {

    if (!collection.hasContent) {
      return [];
    }

    let query = QueryBuilder.build({
      node: collection.content.root,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL,
      template: QueryTemplates.DISTRIBUTIONS_TEMPLATE
    });

    var req = {
      method: 'POST',
      url: DatabusConstants.DATABUS_SPARQL_ENDPOINT_URL,
      data: "format=json&query=" + encodeURIComponent(query),
      headers: {
        "Content-type": "application/x-www-form-urlencoded"
      },
    }

    var response = await $http(req);
    var entries = response.data.results.bindings;

    if (entries.length === 0) {
      return null;
    }

    var distributions = {};
    var bindings = [];

    for (var entry of entries) {
      var uri = entry.distribution.value;
      var databusUri = DatabusCollectionUtils.navigateUp(uri, 4);

      if (distributions[databusUri] == null) {
        distributions[databusUri] = [];
      }

      distributions[databusUri].push(`<${uri}>`);
    }

    for (var databusUri in distributions) {

      var distributionsString = distributions[databusUri].join('\n');

      var params = {};
      params.DISTRIBUTIONS = distributionsString;

      let fileQuery = DatabusCollectionUtils.formatQuery(QueryTemplates.COLLECTION_TABLE_QUERY, params);

      var req = {
        method: 'POST',
        url: `${databusUri}${DatabusConstants.DATABUS_SPARQL_ENDPOINT_URL}`,
        data: "format=json&query=" + encodeURIComponent(fileQuery),
        headers: {
          "Content-type": "application/x-www-form-urlencoded"
        },
      }

      response = await $http(req);

      for (var binding of response.data.results.bindings) {
        binding.databus = databusUri;
        bindings.push(binding);
      }
    }

    // Postproccess
    let result = [];

    for (var binding of bindings) {
      binding = DatabusCollectionUtils.reduceBinding(binding);

      var variant = binding.variant;

      if(variant != undefined) {
        var variants = variant.split(',');

        var cleanedVariants = [];

        for (var v of variants) {
          if (v != "" && v != " ") {
            cleanedVariants.push(v);
          }
        }

        binding.variant = cleanedVariants.join(",");
      }

      result.push(binding);
    }


    /*
    for (var entry of entries) {

      try {
        console.log(entry.distribution.value);

        var params = {};
        params.DISTRIBUTION = entry.distribution.value;

        let fileQuery = DatabusUtils.formatQuery(QueryTemplates.COLLECTION_TABLE_ROW_QUERY, params);

        var req = {
          method: 'POST',
          url: DatabusConstants.DATABUS_SPARQL_ENDPOINT_URL,
          data: "format=json&query=" + encodeURIComponent(fileQuery),
          headers: {
            "Content-type": "application/x-www-form-urlencoded"
          },
        }

        response = await $http(req);

        if (response.data.results.bindings.length === 0) {
          continue;
        }

        result.push(DatabusCollectionUtils.reduceBinding(response.data.results.bindings[0]));

      } catch(err) {
        console.log(err);
      }
    }

    // Postprocess:



    for (let i in entries) {
      let element = DatabusCollectionUtils.reduceBinding(entries[i]);
      result.push(element);
    }
    */

    return result;
  }



  static navigateUp(uri, steps) {

    if (steps == undefined) {
      steps = 1;
    }

    for (var i = 0; i < steps; i++) {
      uri = uri.substr(0, uri.lastIndexOf('/'));
    }

    if (uri.includes('#')) {
      uri = uri.substr(0, uri.lastIndexOf('#'));
    }

    return uri;
  }

  static async getCollectionFileURLs($http, collection) {

    let query = QueryBuilder.build({
      node: collection.content.root,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL,
      template: QueryTemplates.DEFAULT_FILE_TEMPLATE
    });

    var req = {
      method: 'POST',
      url: DatabusConstants.DATABUS_SPARQL_ENDPOINT_URL,
      data: "format=json&query=" + encodeURIComponent(query),
      headers: {
        "Content-type": "application/x-www-form-urlencoded"
      },
    }

    var response = await $http(req);
    var entries = response.data.results.bindings;

    if (entries.length === 0) {
      return null;
    }

    let result = "";

    for (let i in entries) {
      let element = DatabusCollectionUtils.reduceBinding(entries[i]);
      result += element.file + '\n';
    }

    return result;
  }

  /*
  static copyData(data) {
    return JSON.parse(JSON.stringify(data));
  }*/

  static serialize(collectionObject, ignoreKeys) {

    if (ignoreKeys == undefined) {
      ignoreKeys = [
        'parent',
        '$$hashKey',
        'expanded',
        'files',
        'eventListeners',
        'hasLocalChanges',
        'published'
      ];
    }

    return JSON.stringify(collectionObject, function (key, value) {
      if (ignoreKeys.includes(key)) {
        return undefined;
      }

      return value;
    });
  }

  static cyrb53Hash(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed,
      h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };

  static createCleanCopy(jsonData) {

    var data = JSON.parse(DatabusCollectionUtils.serialize(jsonData));
    return data;
  }

  static exportToJsonFile(jsonData) {

    var ignoreKeys = [
      'parent',
      '$$hashKey',
      'expanded',
      'files',
      'eventListeners',
      'hasLocalChanges',
      'published',
      'uuid'
    ];

    let dataStr = DatabusCollectionUtils.serialize(jsonData, ignoreKeys);
    let dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    let exportFileDefaultName = 'data.json';

    let linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

}

module.exports = DatabusCollectionUtils;


/***/ },

/***/ "./js/collections/databus-collection-wrapper.js"
/*!******************************************************!*\
  !*** ./js/collections/databus-collection-wrapper.js ***!
  \******************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const QueryBuilder = __webpack_require__(/*! ../query-builder/query-builder */ "./js/query-builder/query-builder.js");
const QueryNode = __webpack_require__(/*! ../query-builder/query-node */ "./js/query-builder/query-node.js");
const QueryTemplates = __webpack_require__(/*! ../query-builder/query-templates */ "./js/query-builder/query-templates.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");

class DatabusCollectionWrapper {

  /**
   * Creates a new DatabusCollection from an already existing
   * @param {[type]} data [description]
   */
  constructor(data) {
    Object.assign(this, data);
    this.eventListeners = {};
  }

  addEventListener(name, callback) {
    if(this.eventListeners[name] == undefined) {
      this.eventListeners[name] = [];
    }

    this.eventListeners[name].push(callback);
  }

  isPublisher(username) {
    return this.uri != undefined && this.uri.startsWith('https://databus.dbpedia.org/' + username);
  }

  get isPublished() {
    return this.issued != undefined;
  }

  get displayLabelHtml() {
    var l = '';
    if(this.isDraft) {
      l += '<span style="color: #8a8cb3; margin-right:4px">DRAFT:</span>';
    }
    l += (this.label != undefined && this.label.length > 0) ? this.label : 'Untitled Collection';
    return l;
  }

  get isDraft() {
    return this.uri === undefined;
  }

  get hasContent() {

    if(this.content.root.childNodes.length == 0) {
      return false;
    }

    for(var childNode of this.content.root.childNodes) {
      if(childNode.childNodes.length > 0) {
        return true;
      }
    }

    return false;
  }

  fireEvent(name) {
    if(this.eventListeners[name] == undefined) {
      return;
    }

    for(var c in this.eventListeners[name]) {
      var callback = this.eventListeners[name][c];
      callback();
    }
  }


  static createNew(title, description, source, accountName) {
    var data = {};
    data.uuid = DatabusUtils.uuidv4();
    data.title = title;
    data.description = description;
    data.accountName = accountName;
    data.abstract = description;
    data.content = {};
    data.content.root = new QueryNode(null, null);
    data.content.root.addChild(new QueryNode(source, null));

    return data;
  }

  /**
   * Builds a composed query from all elements
   * @return {[type]} [description]
   */
  createQuery() {

    if(this.content.root == undefined) {
      return null;
    }

    return QueryBuilder.build({
      template : QueryTemplates.DEFAULT_FILE_TEMPLATE,
      resourceBaseUrl : DATABUS_RESOURCE_BASE_URL,
      node: this.content.root
    });
  }

  /**
   * Downloads the entire collection object as json
   * @return {[type]} [description]
   */
  downloadAsJson(){
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(angular.toJson(this));
    var downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", this.title + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  removeCustomQueryNode(node) {
    this.content.customQueries = this.content.customQueries.filter(function(n){
      return node.guid != n.guid;
    });
  }

  removeNodeByUri(uri) {
    QueryNode.removeChildByUri(this.content.root, uri);
  }

  getParentNode(node) {
    return QueryNode.findParentNodeRecursive(this.content.root, node);
  }

  removeGroupNode(groupNode) {
    this.content.groups = this.content.groups.filter(function(a){
      return groupNode.uri != a.uri;
    });
  }

  addCustomQueryNode(label, query) {
    this.content.customQueries.push({
      guid : DatabusUtils.uuidv4(),
      label : label,
      query : query,
    });
  }

  hasGroup(groupUri) {
    var group = this.findGroup(groupUri);
    return group != undefined;
  }

  hasArtifact(artifactUri) {
    var groupUri = DatabusUtils.navigateUp(artifactUri);

    var group = this.findGroup(groupUri);

    if(group == undefined) {
      return false;
    }

    var artifact = this.findArtifact(group, artifactUri);
    return artifact != undefined;
  }

  /**
   * Adds a new group node with label, uri and settings
   * @param {[type]} groupUri   [description]
   * @param {[type]} groupLabel [description]
   * @param {[type]} settings   [description]
   */
  addGroupNode(groupUri, settings) {

    var group = this.findGroup(groupUri);

    if(group == undefined) {

      var publisherUri = DatabusUtils.navigateUp(groupUri);

      var groupLabel = DatabusUtils.uriToName(groupUri);
      var publisherLabel = DatabusUtils.uriToName(publisherUri);

      group = {};
      group.uri = groupUri;
      group.artifacts = [];
      group.label = publisherLabel + " » " + groupLabel;
      group.settings = settings;
      group.expanded = true;

      this.content.groups.push(group);

      this.fireEvent("onGroupAdded");
    }

    return group;
  }

  /**
   * Adds a new artifact node with label uri and settings
   * This will fail if the appropriate group node has not been
   * added previously
   * @param {[type]} artifactUri   [description]
   * @param {[type]} artifactLabel [description]
   * @param {[type]} settings      [description]
   */
  addArtifactNode(artifactUri, artifactLabel, settings) {

    var groupUri = DatabusUtils.navigateUp(artifactUri);
    var group = this.addGroupNode(groupUri, [ 
      {
        facet: "http://purl.org/dc/terms/hasVersion",
        value: "SYSTEM_LATEST_ARTIFACT_VERSION",
        checked: true
      }]);

    var artifact = this.findArtifact(group, artifactUri);

    if(artifact == undefined) {
      artifact = {};
      artifact.uri = artifactUri;
      artifact.label = artifactLabel;
      artifact.settings = settings;

      group.artifacts.push(artifact);
      
      // TODO: merge facets
    

      this.fireEvent("onArtifactAdded");
    }
  }

  findGroup(groupUri) {
    for(var g in this.content.groups) {
      var group = this.content.groups[g];

      if(group.uri == groupUri) {
        return group;
      }
    }

    return null;
  }

  findArtifact(group, artifactUri) {
    for(var a in group.artifacts) {
      var artifact = group.artifacts[a];

      if(artifact.uri == artifactUri) {
        return artifact;
      }
    }

    return null;
  }
}

module.exports = DatabusCollectionWrapper;

/***/ },

/***/ "./js/components/account-history/account-history.js"
/*!**********************************************************!*\
  !*** ./js/components/account-history/account-history.js ***!
  \**********************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusWebappUtils = __webpack_require__(/*! ../../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");

// hinzufügen eines Controllers zum Modul
function AccountHistoryController($http) {

  var ctrl = this;
  ctrl.utils = new DatabusWebappUtils(null, null);

  
  ctrl.$onInit = async function() {

    var result = await $http.get(`/app/account/history?accountName=${ctrl.accountName}`);

    ctrl.results = result.data;
  }
}


module.exports = AccountHistoryController;

/***/ },

/***/ "./js/components/autofill-dropdown/autofill-dropdown.js"
/*!**************************************************************!*\
  !*** ./js/components/autofill-dropdown/autofill-dropdown.js ***!
  \**************************************************************/
(module) {

// hinzufügen eines Controllers zum Modul
function AutofillDropdownController($timeout) {

  var ctrl = this;

  ctrl.$onInit = function () {
    ctrl.displayValues = [];
  }

  ctrl.showAll = function() {
    ctrl.showDrop = true;
    ctrl.displayValues = ctrl.values;
  }

  ctrl.handleKey = function (e) {

    if (e.which === 9 || e.which === 13) {

      ctrl.showDrop = false;

      if(ctrl.displayValues.length > 0 && ctrl.input != ctrl.displayValues[0]) {
        e.preventDefault();
        ctrl.input = ctrl.displayValues[0];
        ctrl.change();
      }
    }
  }

  ctrl.hideDropDelayed = function () {
    $timeout(function () {
      ctrl.showDrop = false;
    }, 120);
  }

  ctrl.autoComplete = function () {

    ctrl.showDrop = true;
    if (ctrl.input == "" || ctrl.input == undefined) {
      ctrl.displayValues = ctrl.values;
      return;
    }

    ctrl.displayValues = [];

    for (var value of ctrl.values) {
      if (value.includes(ctrl.input) && value != ctrl.input) {
        ctrl.displayValues.push(value);
      }
    }

    if(ctrl.displayValues.length == 0) {
      ctrl.showDrop = false;
    }
  }

  ctrl.change = function () {

    ctrl.autoComplete();

    $timeout(function () {
      ctrl.onChange();
    }, 50);;
  }
}

module.exports = AutofillDropdownController;



/***/ },

/***/ "./js/components/better-dropdown/better-dropdown.js"
/*!**********************************************************!*\
  !*** ./js/components/better-dropdown/better-dropdown.js ***!
  \**********************************************************/
(module) {


// hinzufügen eines Controllers zum Modul
function BetterDropdownController($scope, $timeout, $element) {


  const ctrl = this;
  ctrl.isActive = false;

  ctrl.closeAll = function() {
    ctrl.rootNode.isActive = false;
    ctrl.setChildrenActiveState(ctrl.rootNode, false);
  }

  ctrl.activateNode = function(parent, node) {
    for(var sibling of parent.children) {
      sibling.isActive = false;
      ctrl.setChildrenActiveState(sibling, false);
    }

    node.isActive = true;
  }

  ctrl.setChildrenActiveState = function(node, value) {
    if(node.children == null) {
      return;
    }

    for(var child of node.children) {
      child.isActive = value;
      ctrl.setChildrenActiveState(child, value);
    }
  }

  ctrl.toggleNode = function(node) {
    node.isActive = !node.isActive;

    if(!node.isActive) {
      ctrl.setChildrenActiveState(node, false);
    }
  }

  ctrl.toggleDropdown = function () {
    ctrl.isActive = !ctrl.isActive;
  };
  ctrl.showDropdown = function () {
    ctrl.isActive = true;
  };
  ctrl.hideDropdown = function () {
    ctrl.isActive = false;
  };

  ctrl.showNested = function (parent, node) {
    if (node.children) {
      ctrl.cancelShowNested();
      ctrl.currentTimeout = $timeout(function () {
        ctrl.activateNode(parent, node);
      }, 200);
    }
  };

  ctrl.cancelShowNested = function() {
    if(ctrl.currentTimeout != null) {
      $timeout.cancel(ctrl.currentTimeout);
      ctrl.currentTimeout = null;
    }
  }

  ctrl.toggleNestedDropdown = function (node) {
    node.showChildren = !node.showChildren;
  };
  ctrl.selectNode = function (node) {
    // Handle the selected node here
    ctrl.onNodeClicked({ node : node });
  };



}


module.exports = BetterDropdownController;


/***/ },

/***/ "./js/components/collection-data-table/collection-data-table.js"
/*!**********************************************************************!*\
  !*** ./js/components/collection-data-table/collection-data-table.js ***!
  \**********************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionUtils = __webpack_require__(/*! ../../collections/databus-collection-utils */ "./js/collections/databus-collection-utils.js");
const DatabusUtils = __webpack_require__(/*! ../../utils/databus-utils */ "./js/utils/databus-utils.js");


// hinzufügen eines Controllers zum Modul
function CollectionDataTableController($http, $scope, $location, $sce) {

  var ctrl = this;
  ctrl.$http = $http;


  ctrl.$onInit = function() {


    ctrl.isLoading = true;
    DatabusCollectionUtils.getCollectionFiles(ctrl.$http, ctrl.collection).then(function(result) {
      ctrl.files = result;
      ctrl.isLoading = false;
      $scope.$apply();
    }, function(err) {
      ctrl.statistics = null;
      ctrl.isLoading = false;
    });


    if(ctrl.files == null) {
      return;
    }

    ctrl.groupedFiles = ctrl.groupBy(ctrl.files, 'version');
  }

  ctrl.getRowspan = function(file) {

    return file.distributions.length * 2; 
    /*
    var span = file.distributions.length * 2;
    if(!file.distributions[file.distributions.length - 1].expanded) {
      span--;
    }

    return span;*/
  }

  ctrl.groupBy = function(list, key) {

    var result = {};

    for(var i in list) {
      var element = list[i];
      var keyVal = element[key];

      if(result[keyVal] == undefined) {
        result[keyVal] = {}
        result[keyVal].value = keyVal;
        result[keyVal].title = element.title;
        result[keyVal].uri = keyVal;
        result[keyVal].distributions = [];
        result[keyVal].license = element.license;
      }

      result[keyVal].distributions.push(element);
    }
    
    return result;
  }

  ctrl.calculateRowSpan = function(file) {
    var rowspan = 0;

    for(var d in file.distributions) {
      rowspan += 1; //(file.distributions[d].expanded ? 2 : 1);
    }

    return rowspan;
  }

  ctrl.createRelativeUri = function(url) {
    var u = new URL(url);
    return u.pathname;
  }

  ctrl.$doCheck = function() {

    if(ctrl.files == null) {
      return;
    }

    if(ctrl.previousFileCount != ctrl.files.length) {
      ctrl.previousFileCount = ctrl.files.length;
      ctrl.groupedFiles = ctrl.groupBy(ctrl.files, 'version');
    }  
  }

  ctrl.uriToName = function(uri) {
    return DatabusUtils.uriToName(uri);
  }

  ctrl.formatUploadSize = function(size) {
    if(size < 1024) return size + " B";
    else if (size < 1048576) return Math.round(size / 1024) + " KB";
    else if (size < 1073741824) return (Math.round(10 * size / 1048576) / 10) + " MB";
    else return (Math.round(100 * size / 1073741824) / 100) + " GB";
  }
}


module.exports = CollectionDataTableController;

/***/ },

/***/ "./js/components/collection-editor-widget/collection-editor-widget.js"
/*!****************************************************************************!*\
  !*** ./js/components/collection-editor-widget/collection-editor-widget.js ***!
  \****************************************************************************/
(module) {


// hinzufügen eines Controllers zum Modul
function CollectionEditorWidgetController(collectionManager, $scope) {

  var ctrl = this;
  ctrl.$scope = $scope;
  ctrl.collectionManager = collectionManager;

  ctrl.$onInit = function () {

    // TODO: Change this hacky BS!
    setTimeout(function () {
      $(".dropdown-item").click(function (e) {
        var dropdown = $(this).closest(".dropdown");
        $(dropdown).removeClass("is-active");
        e.stopPropagation();
      });


      $("body").click(function () {
        $(".dropdown").removeClass("is-active");
      });

      $(".dropdown").click(function (e) {
        $(".dropdown").removeClass("is-active");
        $(this).addClass("is-active");
        e.stopPropagation();
      });
    }, 500);

  }

  ctrl.goToEditor = function () {
    window.location.href = '/app/collection-editor';
  }

  ctrl.addSelectionToCollection = function (uuid) {
    var selection = ctrl.selection;

    ctrl.collectionManager.setActive(uuid);
    var collection = ctrl.collectionManager.activeCollection;

    // Get local bus node
    var databusNode = QueryNode.findChildByUri(collection.content.root, DATABUS_RESOURCE_BASE_URL);

    if (databusNode == undefined) {
      databusNode = new QueryNode(DATABUS_RESOURCE_BASE_URL, null);
      collection.content.root.childNodes.push(databusNode);
    }

    QueryNode.mergeAddChild(databusNode, selection);

    ctrl.collectionManager.activeCollection.hasLocalChanges
      = ctrl.collectionManager.hasLocalChanges(ctrl.collectionManager.activeCollection);
    ctrl.collectionManager.saveLocally();
  }

}


module.exports = CollectionEditorWidgetController;


/***/ },

/***/ "./js/components/collection-hierarchy-two/collection-hierarchy.js"
/*!************************************************************************!*\
  !*** ./js/components/collection-hierarchy-two/collection-hierarchy.js ***!
  \************************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionWrapper = __webpack_require__(/*! ../../collections/databus-collection-wrapper */ "./js/collections/databus-collection-wrapper.js");
const QueryBuilder = __webpack_require__(/*! ../../query-builder/query-builder */ "./js/query-builder/query-builder.js");
const QueryNode = __webpack_require__(/*! ../../query-builder/query-node */ "./js/query-builder/query-node.js");
const QueryTemplates = __webpack_require__(/*! ../../query-builder/query-templates */ "./js/query-builder/query-templates.js");
const DatabusConstants = __webpack_require__(/*! ../../utils/databus-constants */ "./js/utils/databus-constants.js");
const DatabusFacetsCache = __webpack_require__(/*! ../../utils/databus-facets-cache */ "./js/utils/databus-facets-cache.js");
const DatabusUris = __webpack_require__(/*! ../../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");

// hinzufügen eines Controllers zum Modul
function CollectionHierarchyControllerTwo($http, $location, $sce, $scope, collectionManager) {

  var ctrl = this;

  ctrl.viewMode = -1;
  ctrl.$http = $http;
  ctrl.$scope = $scope;
  ctrl.facets = new DatabusFacetsCache($http);
  ctrl.utils = new DatabusWebappUtils($scope, $sce);
  ctrl.$sce = $sce;

  collectionManager.onCollectionChangedInDifferentTab = function () {
    ctrl.previousCollectionId = null;
  }

  ctrl.defaultQuery = `PREFIX databus: <https://dataid.dbpedia.org/databus#>
PREFIX dcv:    <https://dataid.dbpedia.org/databus-cv#>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX dcat:   <http://www.w3.org/ns/dcat#>
PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?file WHERE {
  # Replace this with your custom query:
  ?file <matches> <condition> .
} LIMIT 0`;
  const DATAID_ARTIFACT_PROPERTY = 'databus:artifact';
  const DATAID_GROUP_PROPERTY = 'databus:group';
  const KEY_LATEST_VERSION = "$latest";


  ctrl.$onInit = function () {

    ctrl.viewMode = -1;

    if (ctrl.collection == null) {
      return;
    }
  }

  ctrl.onAddContentClicked = function (sourceNode) {
    ctrl.onAddContent({ source: sourceNode.uri });

    ctrl.onChange();
    ctrl.updateViewModel();
  }


  ctrl.onAddCustomQueryClicked = function (sourceNode) {
    var node = QueryNode.createFrom(sourceNode);
    node.addChild(new QueryNode(DatabusUtils.uuidv4(), null));
    ctrl.onChange();
  }

  ctrl.toggleCollapsed = function (node, view) {
    view.collapsed = !view.collapsed;

    if (!view.collapsed) {
      ctrl.query(node);
    }
  }

  ctrl.isDatabus = async function (uri) {
    var req = {
      method: 'GET',
      url: uri,
      headers: {
        'Accept': 'application/rdf+turtle'
      }
    }

    var res = await ctrl.$http(req);
    var manifest = await DatabusUtils.parseDatabusManifest(res.data);
    var expectedUri = new URL(uri);

    if (manifest == undefined || manifest.uri != expectedUri.origin) {
      return false;
    }

    return true;
  }

  ctrl.getDatabusUri = async function (uri) {

    var url = new URL(uri);
    var segments = url.pathname.split('/');
    var base = url.origin;
    var currentUrl = base;

    var isDatabus = await ctrl.isDatabus(currentUrl);

    if (isDatabus) {
      return currentUrl;
    }

    for (var i = 0; segments.length; i++) {

      currentUrl += `/${segments[i]}`;
      var isDatabus = await ctrl.isDatabus(currentUrl);

      if (isDatabus) {
        return currentUrl;
      }
    }

  }

  ctrl.onAddResource = async function (uri) {

    if (uri.endsWith('/')) {
      uri = uri.substr(0, uri.length - 1);
    }

    let node = QueryNode.findChildByUri(ctrl.root, uri);

    // Resource already in collection
    if (node != undefined) {
      return;
    }

    var databusUri = await ctrl.getDatabusUri(uri);


    var databusUriLength = DatabusUtils.getResourcePathLength(databusUri);
    var resourceUriLength = DatabusUtils.getResourcePathLength(uri);
    var diff = resourceUriLength - databusUriLength;

    if (diff < 0 && diff > 3 || diff == 1) {
      return;
    }

    if (diff == 0) {
      ctrl.addDatabus(uri);
    }

    if (diff == 2) {
      ctrl.addDatabus(databusUri);
      let databusNode = QueryNode.findChildByUri(ctrl.root, databusUri);
      ctrl.addGroup(databusNode, uri);
    }

    if (diff == 3) {
      ctrl.addDatabus(databusUri);
      let databusNode = QueryNode.findChildByUri(ctrl.root, databusUri);
      let groupUri = DatabusUtils.navigateUp(uri);
      ctrl.addGroup(databusNode, groupUri);
      let groupNode = QueryNode.findChildByUri(ctrl.root, groupUri);
      ctrl.addArtifact(groupNode, uri);
    }

    ctrl.onChange();
    ctrl.updateViewModel();
    ctrl.$scope.$apply();
  }

  ctrl.addDatabus = function (uri) {
    let node = QueryNode.findChildByUri(ctrl.root, uri);

    if (node == null) {
      ctrl.root.childNodes.push(new QueryNode(uri, null));
    }
  }

  ctrl.addGroup = function (databusNode, uri) {
    let node = QueryNode.findChildByUri(ctrl.root, uri);

    if (node == null) {
      databusNode.childNodes.push(new QueryNode(uri, DATAID_GROUP_PROPERTY));
    }
  }

  ctrl.addArtifact = function (groupNode, uri) {
    let node = QueryNode.findChildByUri(ctrl.root, uri);

    if (node == null) {
      groupNode.childNodes.push(new QueryNode(uri, DATAID_ARTIFACT_PROPERTY));
    }
  }

  ctrl.addToCollection = function (source, view, result) {

    if (ctrl.isInCollection(result)) {
      QueryNode.removeChildByUri(ctrl.root, result.id[0].value);
    }
    else {
      if (result.typeName[0].value == 'Group') {
        let node = new QueryNode(result.id[0].value, DATAID_GROUP_PROPERTY);

        source.childNodes.push(node);
      }

      if (result.typeName[0].value == 'Artifact') {

        var artifactUri = result.id[0].value;
        let groupUri = DatabusUtils.navigateUp(artifactUri);
        let groupNode = QueryNode.findChildByUri(ctrl.root, groupUri);

        if (groupNode == null) {
          groupNode = new QueryNode(groupUri, DATAID_GROUP_PROPERTY);
          source.childNodes.push(groupNode);
        }

        let node = new QueryNode(artifactUri, DATAID_ARTIFACT_PROPERTY);
        groupNode.addChild(node);
      }
    }

    for (var res of view.searchResults) {
      res.inCollection = ctrl.isInCollection(res);
    }

    ctrl.onChange();
    ctrl.updateViewModel();
  }

  ctrl.isLastChild = function (group, artifact) {

    if (group.childNodes == undefined || group.childNodes.length == 0) {
      return false;
    }

    return group.childNodes[group.childNodes.length - 1].uri == artifact.uri;
  }

  ctrl.toggleExpand = function (node) {
    node.expanded = !node.expanded;
    ctrl.onChange();
  }

  ctrl.mergeFacets = function (node, facets) {

    if (node.facets == undefined) {
      node.facets = JSON.parse(JSON.stringify(facets));
      return;
    }

    for (var f in facets) {

      if (node.facets[f] == undefined) {
        node.facets[f] = JSON.parse(JSON.stringify(facets[f]));
        continue;
      }

      for (var value of facets[f].values) {
        if (!node.facets[f].values.includes(value)) {
          node.facets[f].values.push(value);
        }
      }
    }

    node.facetLabels = null;
  }

  ctrl.getAllFilters = function (groupNode, artifactNode) {

    if (artifactNode == null) {
      var result = Object.keys(groupNode.facetSettings)
      return DatabusUtils.uniqueList(result);
    }

    var result = Object.keys(groupNode.facetSettings).concat(Object.keys(artifactNode.facetSettings));
    return DatabusUtils.uniqueList(result);
  }

  ctrl.$doCheck = function () {

    if (ctrl.collection == null) {
      ctrl.previousCollectionId = null;
      return;
    }

    if (ctrl.previousCollectionId != ctrl.collection.uuid) {
      ctrl.previousCollectionId = ctrl.collection.uuid;

      ctrl.activeNode = null;
      ctrl.viewMode = -1;
      ctrl.updateViewModel();
    }
  }

  ctrl.handleKey = function (e, nodeView) {
    if (e.which === 9) {
      nodeView.showSearchResults = false;
    }
  }

  ctrl.isInCollection = function (result) {
    let uri = result.id[0].value;
    let node = QueryNode.findChildByUri(ctrl.root, uri);
    return node != null;
  }

  ctrl.updateSearchResults = function (view) {

    if (view == null || view.searchResults == null) {
      return;
    }

    for (var res of view.searchResults) {
      res.inCollection = ctrl.isInCollection(res);
    }
  }

  ctrl.searchNode = function (node, nodeView) {

    var baseUrl = new URL(node.uri).origin;
    var typeFilters = `typeName=Artifact Group`;

    if (node.property == DATAID_GROUP_PROPERTY) {
      var groupName = DatabusUtils.uriToResourceName(node.uri);
      var accountName = DatabusUtils.uriToResourceName(DatabusUtils.navigateUp(node.uri));
      typeFilters = `typeName=Artifact&publisher=${accountName}&group=${groupName}`;
    }

    var url = `${baseUrl}/api/search?${typeFilters}&typeNameWeight=0&format=JSON_FULL&minRelevance=15&maxResults=10&query=${nodeView.search}`;

    try {
      $http({ method: 'GET', url: url }).then(function successCallback(response) {

        nodeView.searchResults = [];

        for (var doc of response.data.docs) {
          doc.inCollection = ctrl.isInCollection(doc);
          nodeView.searchResults.push(doc);
        }

      }, function errorCallback(response) {
        console.log(response);
      });
    } catch (err) {

    }

  };

  ctrl.toggleExpand = function (view) {
    view.expanded = !view.expanded;
  }


  ctrl.isValidHttpUrl = function (url) {
    return DatabusUtils.isValidHttpUrl(url);
  }


  ctrl.updateViewModel = function () {
    ctrl.collectionWrapper = new DatabusCollectionWrapper(ctrl.collection);
    ctrl.root = ctrl.collection.content.root;

    ctrl.view = {};
    ctrl.view.groups = {};
    ctrl.view.artifacts = {};
    ctrl.view.sources = {};

    for (var s in ctrl.root.childNodes) {

      var sourceNode = ctrl.root.childNodes[s];

      if (ctrl.view.sources[sourceNode.uri] == undefined) {
        ctrl.view.sources[sourceNode.uri] = {};
        ctrl.view.sources[sourceNode.uri].uri = sourceNode.uri;
        ctrl.view.sources[sourceNode.uri].expanded = true;
        ctrl.view.sources[sourceNode.uri].addMode = 'artifact';
        ctrl.view.sources[sourceNode.uri].customQueryLabel = `New Custom Query`;
        ctrl.view.sources[sourceNode.uri].customQueryInput = ctrl.defaultQuery;
      }

      for (var g in sourceNode.childNodes) {

        var groupNode = sourceNode.childNodes[g];
        groupNode.expanded = true;


        ctrl.view.groups[groupNode.uri] = {};

        if (DatabusUtils.isValidHttpUrl(groupNode.uri)) {

          ctrl.facets.get(groupNode.uri).then(function (res) {
            delete res.facets[DatabusUris.DATABUS_ARTIFACT_PROPERTY];
            ctrl.view.groups[res.uri].facets = res.facets;

            var hasVersionFacets = ctrl.view.groups[res.uri].facets[DatabusUris.DCT_HAS_VERSION];

            if (hasVersionFacets != null && !hasVersionFacets.values.includes(KEY_LATEST_VERSION)) {
              hasVersionFacets.values.unshift(KEY_LATEST_VERSION);
            }

            $scope.$apply();
          });

          ctrl.query(groupNode);

          for (var a in groupNode.childNodes) {

            var artifactNode = groupNode.childNodes[a];

            ctrl.view.artifacts[artifactNode.uri] = {};
            ctrl.view.artifacts[artifactNode.uri].expanded = false;
            ctrl.view.artifacts[artifactNode.uri].collapsed = true;

            ctrl.facets.get(artifactNode.uri).then(function (res) {
              ctrl.view.artifacts[res.uri].facets = res.facets;

              var hasVersionFacets = ctrl.view.artifacts[res.uri].facets[DatabusUris.DCT_HAS_VERSION];

              if (hasVersionFacets != null && !hasVersionFacets.values.includes(KEY_LATEST_VERSION)) {
                hasVersionFacets.values.unshift(KEY_LATEST_VERSION);
              }

              $scope.$apply();
              //var groupUri = DatabusUtils.navigateUp(artifactNode.uri);
              //ctrl.view.artifacts[artifactNode.uri].facets = result.data;
              //ctrl.mergeFacets(ctrl.view.groups[groupUri], result.data);
            });



            /*en(function(result) {

               = result['http://purl.org/dc/terms/hasVersion'].values.unshift("$latest");


              var groupUri = DatabusUtils.navigateUp(artifactNode.uri);
              ctrl.view.artifacts[artifactNode.uri].facets = result.data;
              ctrl.mergeFacets(ctrl.view.groups[groupUri], result.data);

            });


          
            */
          }
        }
      }
    }
  }



  ctrl.onArtifactDropdownChanged = function (groupNode) {
    ctrl.onChange();
    ctrl.query(groupNode);
  }

  ctrl.selectAddFilterValue = function (viewNode, value) {
    viewNode.addFilterValueInput = value;
    viewNode.showValueDrop = false;

    ctrl.onAddFilterValueInputChanged(viewNode);
  }

  ctrl.selectAddFilterFacet = function (viewNode, value) {
    viewNode.addFilterFacetInput = value;
    viewNode.showFacetDrop = false;

    ctrl.onAddFilterFacetInputChanged(viewNode);
  }

  ctrl.onAddFilterValueInputChanged = function (viewNode) {

    for (var value of viewNode.facets[viewNode.addFilterFacet].values) {

      if (viewNode.addFilterValueInput == value) {
        viewNode.addFilterValue = value;
        return;
      }
    }

    viewNode.addFilterValue = null;
  }

  ctrl.onAddFilterFacetInputChanged = function (viewNode) {

    for (var facet in viewNode.facets) {

      if (viewNode.addFilterFacetInput == viewNode.facets[facet].label) {

        if (viewNode.addFilterFacet != facet) {
          viewNode.addFilterFacet = facet;
          viewNode.addFilterValue = [];
        }

        return;
      }
    }

    viewNode.addFilterFacet = null;
    viewNode.addFilterValue = [];
  }

  ctrl.includesValue = function (objs, value) {
    if (objs == undefined) {
      return false;
    }

    for (var obj of objs) {
      if (obj.value == value) {
        return true;
      }
    }

    return false;
  }

  ctrl.isLocalDatabusNode = function (node) {
    return node.uri == DATABUS_RESOURCE_BASE_URL;
  }
  ctrl.addFilter = function (node, facet, values, checked) {

    if (values == null) {
      return;
    }

    if (node.facetSettings[facet] == undefined) {
      node.facetSettings[facet] = [];
    }

    for (var value of values) {

      if (!ctrl.includesValue(node.facetSettings[facet], value.value)) {
        node.facetSettings[facet].push(value);
      }
    }

    ctrl.onChange();
    ctrl.query(node);
  }

  ctrl.query = function (node) {

    if (node.childNodes != undefined && node.childNodes.length > 0) {

      node.files = null;
      for (var child of node.childNodes) {
        ctrl.query(child);
      }

      return;
    }

    var queryNode = QueryNode.createSubTree(node);

    var fullQuery = QueryBuilder.build({
      node: queryNode,
      template: QueryTemplates.NODE_FILE_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL,
      root: ctrl.root
    });

    this.querySparql(fullQuery).then(function (result) {
      node.files = result;
      ctrl.$scope.$apply();

    });
  }

  ctrl.removeFilter = function (node, facet) {

    if (node.facetSettings[facet] == undefined) {
      return;
    }

    delete node.facetSettings[facet];

    ctrl.onChange();

    ctrl.query(node);
  }

  ctrl.onActiveFilterChanged = function (node) {
    ctrl.onChange();
    ctrl.query(node);
  }

  ctrl.getFacetLabels = function (viewNode) {

    if (viewNode.facetLabels != undefined) {
      return viewNode.facetLabels;
    }
    var result = [];

    for (var f in viewNode.facets) {
      result.push(viewNode.facets[f].label);
    }

    viewNode.facetLabels = result;
    return result;
  }


  ctrl.sortBy = function (property) {

    if (ctrl.sortProperty == property) {
      ctrl.sortReverse = !ctrl.sortReverse;
    }
    ctrl.sortProperty = property;
  }

  ctrl.formatFileSize = function (size) {
    return DatabusUtils.formatFileSize(size);
  };

  ctrl.toHTML = function (html) {
    return $sce.trustAsHtml(html);
  };

  ctrl.onComponentAdded = function () {

  }

  ctrl.customExpanded = function () {
    return ctrl.customNode.expanded && ctrl.collection.content.customQueries.length > 0;
  }

  ctrl.generatedExpanded = function () {
    return ctrl.generatedNode.expanded && ctrl.collection.content.groups.length > 0;
  }

  ctrl.publishCollection = function () {
    ctrl.onPublish();
  }

  ctrl.delete = function () {
    ctrl.onDelete();
  }

  ctrl.goToResource = function (node) {
    window.location = node.uri;
  }

  ctrl.formatGroupPrefix = function (uri) {
    return DatabusUtils.uriToName(DatabusUtils.navigateUp(uri));
  }

  ctrl.formatArtifactPrefix = function (uri) {
    var nav = DatabusUtils.navigateUp(uri);
    var groupName = DatabusUtils.uriToName(nav);
    var userName = DatabusUtils.uriToName(DatabusUtils.navigateUp(nav));

    return userName + '/' + groupName;
  }

  ctrl.uriToName = function (uri) {
    return DatabusUtils.uriToName(uri);
  }

  ctrl.objSize = function (obj) {
    return DatabusUtils.objSize(obj);
  }

  ctrl.showCollectionSearch = function () {
    ctrl.open = false;
    ctrl.viewMode = 0;
    ctrl.activeNode = ctrl.rootNode;

    $location.hash('search');
  }

  // ctrl.printJSON = function() {
  //   console.log(JSON.stringify(ctrl.collection));
  // }

  // SHOW NODES
  ctrl.showGroupNode = function (groupNode) {
    ctrl.open = true;
    ctrl.viewMode = 3;
    ctrl.activeNode = QueryNode.createFrom(groupNode);

    this.updateQuery();
  }

  ctrl.showArtifactNode = function (artifactNode, groupNode) {

    ctrl.open = true;
    ctrl.viewMode = 1;
    ctrl.activeNode = QueryNode.createFrom(artifactNode);

    this.updateQuery();
  }

  ctrl.querySparql = async function (query) {


    try {

      var req = {
        method: 'POST',
        url: DatabusConstants.DATABUS_SPARQL_ENDPOINT_URL,
        data: "format=json&query=" + encodeURIComponent(query),
        headers: {
          "Content-type": "application/x-www-form-urlencoded"
        },
      }

      var updateResponse = await ctrl.$http(req);

      var data = updateResponse.data;
      var bindings = data.results.bindings;

      for (var b in bindings) {
        ctrl.reduceBinding(bindings[b]);
      }

      return bindings;


    } catch (e) {
      console.log(e);
    }
  }

  ctrl.reduceBinding = function (binding) {
    for (var key in binding) {
      binding[key] = binding[key].value;
    }

    return binding;
  }



  ctrl.updateQuery = function () {
    var queryNode = QueryNode.createSubTree(ctrl.activeNode);

    ctrl.activeFileQuery = QueryBuilder.build({
      node: queryNode,
      template: QueryTemplates.DEFAULT_FILE_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });

    ctrl.activeFullQuery = QueryBuilder.build({
      node: queryNode,
      template: QueryTemplates.NODE_FILE_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });
  }

  ctrl.onActiveNodeChanged = function () {
    this.updateQuery();

    ctrl.onChange();
  }

  ctrl.addCustomNode = function (sourceNode, label, desc, query) {

    var node = new QueryNode(label, query);
    sourceNode.childNodes.push(node);


    ctrl.updateViewModel();
    ctrl.onChange();
  }

  ctrl.removeNode = function (node) {

    var parent = ctrl.collectionWrapper.getParentNode(node);
    ctrl.collectionWrapper.removeNodeByUri(node.uri);

    if (parent != null) {
      ctrl.query(parent);
    }

    ctrl.onChange();
  }

  ctrl.showCustomQueryNode = function (customQueryNode) {
    ctrl.open = true;
    ctrl.viewMode = 2;
    ctrl.activeNode = customQueryNode;
  }

  ctrl.list = function (setting) {

    var allEntries = Object.keys(setting).map(function (key, index) {

      var label = undefined;
      var entry = setting[key];

      if (entry.value == '') {
        label = '<i style="color: #a3a3a3;">None</i>';
      } else if (entry.value == '$latest') {
        label = 'Latest Version';
      } else {
        label = entry.value;
      }

      if (entry.checked) {
        return label;
      } else {
        return `<s>${label}</s>`;
      }
    });


    var list = [];
    var maxLength = 50;
    var length = 0;
    var hasOverflow = false;

    for (var entry of allEntries) {
      if (entry.length + length > maxLength) {
        hasOverflow = true;
        break;
      }

      length += entry.length;
      list.push(entry);
    }

    if (hasOverflow) {
      list.push('...');
    }

    return ctrl.$sce.trustAsHtml(list.join(', '));
    // return setting.map(function (v) { return v.value }).join(', ');
  }
}


module.exports = CollectionHierarchyControllerTwo;

/***/ },

/***/ "./js/components/collection-node/collection-node.js"
/*!**********************************************************!*\
  !*** ./js/components/collection-node/collection-node.js ***!
  \**********************************************************/
(module) {

// TODO Fabian evtl bug

// hinzufügen eines Controllers zum Modul
function CollectionNodeController() {

  var ctrl = this;

  ctrl.$onInit = function() {

  }

  ctrl.removeNode = function() {
    ctrl.onRemoveNode();
  }

  ctrl.click = function() {
    ctrl.onClick();
  }
}

module.exports = CollectionNodeController;

/***/ },

/***/ "./js/components/collection-search/collection-search.js"
/*!**************************************************************!*\
  !*** ./js/components/collection-search/collection-search.js ***!
  \**************************************************************/
(module) {

// hinzufügen eines Controllers zum Modul
function CollectionSearchController(collectionManager, $http, $interval, $sce) {

  var ctrl = this;

  ctrl.results = [];
  ctrl.collectionManager = collectionManager;



  



  ctrl.formatResult = function (result) {
    return $sce.trustAsHtml(result);
  }

  ctrl.getDatabusUrls = function () {

    if (ctrl.databusUrls != undefined) {
      return ctrl.databusUrls;
    }

    ctrl.databusUrls = [];
    var root = ctrl.collection.content.root;

    for (var sourceNode of root.childNodes) {
      ctrl.databusUrls.push(sourceNode.uri);
    }

    return ctrl.databusUrls;
  }

  ctrl.$onInit = function () {

    ctrl.searchInput = '';
    ctrl.filters = {};
    ctrl.filters.filterArtifact = false;
    ctrl.filters.filterGroup = false;
    ctrl.searchCooldown = 1000;

    ctrl.root = QueryNode.createFrom(ctrl.collection.content.root);

    ctrl.collectionWrapper = new DatabusCollectionWrapper(ctrl.collection);
    ctrl.autoFocus = true;
  }

  // TODO Fabian
  ctrl.isInCollection = function (result) {
    let uri = result.id[0].value;
    let node = QueryNode.findChildByUri(ctrl.root, uri);

    return node != null;
  }


  ctrl.addToCollection = function (result) {

    var currentSource = ctrl.targetDatabusUrl;
    var sourceNode = QueryNode.findChildByUri(ctrl.root, currentSource);

    if (result.inCollection) {
      QueryNode.removeChildByUri(ctrl.root, result.id[0].value);
    }
    else {
      if (result.typeName[0].value == 'Group') {
        let node = new QueryNode(result.id[0].value, 'databus:group');

        sourceNode.addChild(node);
        ctrl.onComponentAdded();
      }

      if (result.typeName[0].value == 'Artifact') {

        var artifactUri = result.id[0].value;
        let groupUri = DatabusUtils.navigateUp(artifactUri);
        let groupNode = QueryNode.findChildByUri(ctrl.root, groupUri);

        if (groupNode == null) {
          groupNode = new QueryNode(groupUri, 'databus:group');
          sourceNode.addChild(groupNode);
        }

        let node = new QueryNode(artifactUri, 'databus:artifact');
        groupNode.addChild(node);

        ctrl.onComponentAdded();
      }
    }

    for (let r in ctrl.results) {
      ctrl.results[r].inCollection = ctrl.isInCollection(ctrl.results[r]);
    }

    ctrl.collectionManager.saveLocally();

    console.log(ctrl.root);
  }

  $interval(function () {

    if (ctrl.searchChanged) {

      if (!DatabusUtils.isValidHttpUrl(ctrl.targetDatabusUrl)) {
        return;
      }

      var typeFilters = '?typeName=Artifact Group';

      if (ctrl.filters.filterArtifact || ctrl.filters.filterGroup) {

        typeFilters = '?typeName='
        if (ctrl.filters.filterArtifact) {
          typeFilters += 'Artifact ';
        }
        if (ctrl.filters.filterGroup) {
          typeFilters += 'Group ';
        }
      }

      ctrl.lastQuery = ctrl.searchInput;

      try {

        $http({
          method: 'GET',
          url: ctrl.targetDatabusUrl + '/api/search' + typeFilters + '&format=JSON_FULL&minRelevance=10&maxResults=10&query='
            + ctrl.searchInput,
        }).then(function successCallback(response) {

          if (ctrl.lastQuery != response.data.query) {
            return;
          }

          ctrl.results = response.data.docs;

          for (var r in ctrl.results) {
            ctrl.results[r].inCollection = ctrl.isInCollection(ctrl.results[r]);
          }

        }, function errorCallback(response) {
        });
      } catch (err) {

      }

      ctrl.searchChanged = false;
    };
  }, ctrl.searchCooldown);

  ctrl.search = function () {
    ctrl.searchChanged = true;
  };
}


module.exports = CollectionSearchController;

/***/ },

/***/ "./js/components/collection-statistics/collection-statistics.js"
/*!**********************************************************************!*\
  !*** ./js/components/collection-statistics/collection-statistics.js ***!
  \**********************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionUtils = __webpack_require__(/*! ../../collections/databus-collection-utils */ "./js/collections/databus-collection-utils.js");
const DatabusUtils = __webpack_require__(/*! ../../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");

// hinzufügen eines Controllers zum Modul
function CollectionStatisticsController($http, $scope, $location, $sce) {

  var ctrl = this;
  ctrl.$http = $http;
  ctrl.utils = new DatabusWebappUtils($scope, $sce);


  ctrl.$onInit = function() {
    ctrl.isLoading = true;
    DatabusCollectionUtils.getCollectionStatistics(ctrl.$http, ctrl.collection).then(function(result) {
      ctrl.statistics = result;
      ctrl.isLoading = false;
      $scope.$apply();
    }, function(err) {
      ctrl.statistics = null;
      ctrl.isLoading = false;
    });
  }

  ctrl.markdownToHtml = function(markdown) {
    return ctrl.utils.markdownToHtml(markdown);
  };

  ctrl.formatUploadSize = function(size) {
    return DatabusUtils.formatFileSize(size);
  };
}

module.exports = CollectionStatisticsController;



/***/ },

/***/ "./js/components/collection-status/collection-status.js"
/*!**************************************************************!*\
  !*** ./js/components/collection-status/collection-status.js ***!
  \**************************************************************/
(module) {



// hinzufügen eines Controllers zum Modul
function CollectionStatusController($http, $location, $sce) {

  var ctrl = this;

  ctrl.$onInit = function() {

    ctrl.colors = [];
    ctrl.colors.push('#b54c4c');
    ctrl.colors.push('#aaa');
    ctrl.colors.push('#aaa');
    ctrl.colors.push('#e8ca5f');
    ctrl.colors.push('#3a3');

    ctrl.labels = [];
    ctrl.labels.push('Draft');
    ctrl.labels.push('Hidden, Uncommitted Changes');
    ctrl.labels.push('Hidden');
    ctrl.labels.push('Visible, Uncommitted Changes');
    ctrl.labels.push('Visible');
  }

  ctrl.$doCheck = function() {
    if(ctrl.isDraft) {
      ctrl.status = 0;
      return;
    }

    if(ctrl.isPublished) {
      ctrl.status = ctrl.hasLocalChanges ? 3 : 4;
    } else {
      ctrl.status = ctrl.hasLocalChanges ? 1 : 2;
    }
  }
}

module.exports = CollectionStatusController;


/***/ },

/***/ "./js/components/databus-alert/databus-alert-controller.js"
/*!*****************************************************************!*\
  !*** ./js/components/databus-alert/databus-alert-controller.js ***!
  \*****************************************************************/
(module) {


// hinzufügen eines Controllers zum Modul
function DatabusAlertController($scope, $timeout) {

  var ctrl = this;

  $scope.$on('onDatabusAlert', function(e, data) {
    ctrl.isSuccess = data.isSuccess;
    ctrl.message = data.message;
    ctrl.isVisible = false;

    if(ctrl.hidePromise != null) {
      $timeout.cancel(ctrl.hidePromise);
    }

    $timeout(function() {
      ctrl.isVisible = true;
    }, 0);

    ctrl.hidePromise = $timeout(function() {
      ctrl.isVisible = false;
    }, data.ms);
  });

  ctrl.$onInit = function() {

  }

  ctrl.isSuccess = function() {
    return ctrl.isSuccess;
  }

  ctrl.$doCheck = function() {
    
  }
}

module.exports = DatabusAlertController;


/***/ },

/***/ "./js/components/databus-alert/databus-alert.js"
/*!******************************************************!*\
  !*** ./js/components/databus-alert/databus-alert.js ***!
  \******************************************************/
(module) {


class DatabusAlert {
  static alert($scope, isSuccess, message, ms) {
    if(ms == undefined) {
      ms = 3000; 
    }
    $scope.$broadcast('onDatabusAlert', { isSuccess: isSuccess, message: message, ms: ms});
  }

  static alertCode($scope, code, ms) {
    if(ms == undefined) {
      ms = 3000; 
    }

    var isSuccess = code >= 200 && code < 400;
    $scope.$broadcast('onDatabusAlert', { isSuccess: isSuccess, message: message, ms: ms});
  }
}


module.exports = DatabusAlert;


/***/ },

/***/ "./js/components/databus-icon/databus-icon.js"
/*!****************************************************!*\
  !*** ./js/components/databus-icon/databus-icon.js ***!
  \****************************************************/
(module) {

// hinzufügen eines Controllers zum Modul
function DatabusIconController() {

  var ctrl = this;

  ctrl.iconMap = {};
  ctrl.iconMap['databus'] = "m 1.8847 0.3851 v 2.6248 l 14.6656 -0.0005 l 3.1363 4.4338 l -0.001 16.0412 l 2.3606 -0.001 V 0.3851 Z m 9.2176 4.1976 l -2.8418 0.003 l 3.5989 5.2742 l -0.002 13.6233 l 2.352 -0.001 l 0.0083 -14.3005 z m -4.7365 0.001 l -4.4826 0.001 l 0.002 18.898 l 8.3978 -0.002 l 0.0005 -13.1455 z m 6.6256 0 l 2.7991 4.1094 l -0.0198 14.7881 l 2.3515 -0.001 l 0.003 -15.5479 l -2.2793 -3.347 z";
  ctrl.iconMap['add'] = "M 11 11 M 2 12 L 11 12 L 11 21 L 12 21 L 12 12 L 21 12 L 21 11 L 12 11 L 12 2 L 11 2 L 11 11 L 2 11 L 2 12";
  ctrl.iconMap['remove'] = "M 11 11 M 2 12 L 21 12 L 21 11 L 2 11 L 2 12";
  ctrl.iconMap['add-thick'] = "m11 11h-7.25c-.414 0-.75.336-.75.75s.336.75.75.75h7.25v7.25c0 .414.336.75.75.75s.75-.336.75-.75v-7.25h7.25c.414 0 .75-.336.75-.75s-.336-.75-.75-.75h-7.25v-7.25c0-.414-.336-.75-.75-.75s-.75.336-.75.75z";
  ctrl.iconMap['close'] = "m12 10.93 5.719-5.72c.146-.146.339-.219.531-.219.404 0 .75.324.75.749 0 .193-.073.385-.219.532l-5.72 5.719 5.719 5.719c.147.147.22.339.22.531 0 .427-.349.75-.75.75-.192 0-.385-.073-.531-.219l-5.719-5.719-5.719 5.719c-.146.146-.339.219-.531.219-.401 0-.75-.323-.75-.75 0-.192.073-.384.22-.531l5.719-5.719-5.72-5.719c-.146-.147-.219-.339-.219-.532 0-.425.346-.749.75-.749.192 0 .385.073.531.219z";
  ctrl.iconMap['delete'] = "M9 3h6v-1.75c0-.066-.026-.13-.073-.177-.047-.047-.111-.073-.177-.073h-5.5c-.066 0-.13.026-.177.073-.047.047-.073.111-.073.177v1.75zm11 1h-16v18c0 .552.448 1 1 1h14c.552 0 1-.448 1-1v-18zm-10 3.5c0-.276-.224-.5-.5-.5s-.5.224-.5.5v12c0 .276.224.5.5.5s.5-.224.5-.5v-12zm5 0c0-.276-.224-.5-.5-.5s-.5.224-.5.5v12c0 .276.224.5.5.5s.5-.224.5-.5v-12zm8-4.5v1h-2v18c0 1.105-.895 2-2 2h-14c-1.105 0-2-.895-2-2v-18h-2v-1h7v-2c0-.552.448-1 1-1h6c.552 0 1 .448 1 1v2h7z";
  ctrl.iconMap['goto'] = "M21.883 12l-7.527 6.235.644.765 9-7.521-9-7.479-.645.764 7.529 6.236h-21.884v1h21.883z";
  ctrl.iconMap['edit'] = "M8.071 21.586l-7.071 1.414 1.414-7.071 14.929-14.929 5.657 5.657-14.929 14.929zm-.493-.921l-4.243-4.243-1.06 5.303 5.303-1.06zm9.765-18.251l-13.3 13.301 4.242 4.242 13.301-13.3-4.243-4.243z";
  ctrl.iconMap['edit-thick'] = "M7.127 22.564l-7.126 1.436 1.438-7.125 5.688 5.689zm-4.274-7.104l5.688 5.689 15.46-15.46-5.689-5.689-15.459 15.46z";
  ctrl.iconMap['goback'] = "M2.117 12l7.527 6.235-.644.765-9-7.521 9-7.479.645.764-7.529 6.236h21.884v1h-21.883z";
  ctrl.iconMap['right'] = "M4 .755l14.374 11.245-14.374 11.219.619.781 15.381-12-15.391-12-.609.755z";
  ctrl.iconMap['left'] = "M20 .755l-14.374 11.245 14.374 11.219-.619.781-15.381-12 15.391-12 .609.755z";
  ctrl.iconMap['down'] = "M23.245 4l-11.245 14.374-11.219-14.374-.781.619 12 15.381 12-15.391-.755-.609z";
  ctrl.iconMap['left-thick'] = "M16.67 0l2.83 2.829-9.339 9.175 9.339 9.167-2.83 2.829-12.17-11.996z";
  ctrl.iconMap['help'] = "M12 0c6.623 0 12 5.377 12 12s-5.377 12-12 12-12-5.377-12-12 5.377-12 12-12zm0 1c6.071 0 11 4.929 11 11s-4.929 11-11 11-11-4.929-11-11 4.929-11 11-11zm.053 17c.466 0 .844-.378.844-.845 0-.466-.378-.844-.844-.844-.466 0-.845.378-.845.844 0 .467.379.845.845.845zm.468-2.822h-.998c-.035-1.162.182-2.054.939-2.943.491-.57 1.607-1.479 1.945-2.058.722-1.229.077-3.177-2.271-3.177-1.439 0-2.615.877-2.928 2.507l-1.018-.102c.28-2.236 1.958-3.405 3.922-3.405 1.964 0 3.615 1.25 3.615 3.22 0 1.806-1.826 2.782-2.638 3.868-.422.563-.555 1.377-.568 2.09z";
  ctrl.iconMap['max'] = "M24 22h-24v-20h24v20zm-7-1v-15h-16v15h16zm1 0h5v-18h-22v2h17v16zm-6-6h-1v-3.241l-7.241 7.241-.759-.759 7.241-7.241h-3.241v-1h5v5z";
  ctrl.iconMap['min'] = "M24 22h-24v-20h24v20zm-23-9v8h10v-8h-10zm22 8v-18h-22v9h11v9h11zm-4-9h-5v-5h1v3.241l5.241-5.241.759.759-5.241 5.241h3.241v1z";
  ctrl.iconMap['error'] = "M24 23h-24l12-22 12 22zm-22.315-1h20.63l-10.315-18.912-10.315 18.912zm10.315-2c.466 0 .845-.378.845-.845 0-.466-.379-.844-.845-.844-.466 0-.845.378-.845.844 0 .467.379.845.845.845zm.5-11v8h-1v-8h1z";
  ctrl.iconMap['info'] = "M12 0c6.623 0 12 5.377 12 12s-5.377 12-12 12-12-5.377-12-12 5.377-12 12-12zm0 1c6.071 0 11 4.929 11 11s-4.929 11-11 11-11-4.929-11-11 4.929-11 11-11zm.5 17h-1v-9h1v9zm-.5-12c.466 0 .845.378.845.845 0 .466-.379.844-.845.844-.466 0-.845-.378-.845-.844 0-.467.379-.845.845-.845z";
  ctrl.iconMap['eye'] = "M12.01 20c-5.065 0-9.586-4.211-12.01-8.424 2.418-4.103 6.943-7.576 12.01-7.576 5.135 0 9.635 3.453 11.999 7.564-2.241 4.43-6.726 8.436-11.999 8.436zm-10.842-8.416c.843 1.331 5.018 7.416 10.842 7.416 6.305 0 10.112-6.103 10.851-7.405-.772-1.198-4.606-6.595-10.851-6.595-6.116 0-10.025 5.355-10.842 6.584zm10.832-4.584c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm0 1c2.208 0 4 1.792 4 4s-1.792 4-4 4-4-1.792-4-4 1.792-4 4-4z";
  ctrl.iconMap['add-artifact'] = "M 12 0 M 12.016 1.424 L 21.756 12.053 L 12.016 22.563 L 2.204 12.005 L 3.396 10.721 L 2.774 10.058 L 1 12 L 12 24 L 23 12 L 12 0 L 10.153 2.078 L 10.837 2.741 Z M 6 6 L 6 2 L 7 2 L 7 6 L 11 6 L 11 7 L 7 7 L 7 11 L 6 11 L 6 7 L 2 7 L 2 6 L 6 6";
  ctrl.iconMap['add-button'] = "M24 10h-10v-10h-4v10h-10v4h10v10h4v-10h10z";
  ctrl.iconMap['collections'] = "M11.499 12.03v11.971l-10.5-5.603v-11.835l10.5 5.467zm11.501 6.368l-10.501 5.602v-11.968l10.501-5.404v11.77zm-16.889-15.186l10.609 5.524-4.719 2.428-10.473-5.453 4.583-2.499zm16.362 2.563l-4.664 2.4-10.641-5.54 4.831-2.635 10.474 5.775z";
  ctrl.iconMap['collections-thin'] = "M23 6.066v12.065l-11.001 5.869-11-5.869v-12.131l11-6 11.001 6.066zm-21.001 11.465l9.5 5.069v-10.57l-9.5-4.946v10.447zm20.001-10.388l-9.501 4.889v10.568l9.501-5.069v-10.388zm-5.52 1.716l-9.534-4.964-4.349 2.373 9.404 4.896 4.479-2.305zm-8.476-5.541l9.565 4.98 3.832-1.972-9.405-5.185-3.992 2.177z";
  ctrl.iconMap['content'] = "M9.484 15.696l-.711-.696-2.552 2.607-1.539-1.452-.698.709 2.25 2.136 3.25-3.304zm0-5l-.711-.696-2.552 2.607-1.539-1.452-.698.709 2.25 2.136 3.25-3.304zm0-5l-.711-.696-2.552 2.607-1.539-1.452-.698.709 2.25 2.136 3.25-3.304zm10.516 11.304h-8v1h8v-1zm0-5h-8v1h8v-1zm0-5h-8v1h8v-1zm4-5h-24v20h24v-20zm-1 19h-22v-18h22v18z"
  ctrl.iconMap['menu'] = "M24 18v1h-24v-1h24zm0-6v1h-24v-1h24zm0-6v1h-24v-1h24z";
  ctrl.iconMap['copy'] = "M17 7h6v16h-16v-6h-6v-16h16v6zm5 1h-14v14h14v-14zm-6-1v-5h-14v14h5v-9h9z";
  ctrl.iconMap['upload'] = "M9 16h-8v6h22v-6h-8v-1h9v8h-24v-8h9v1zm11 2c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm-7.5 0h-1v-14.883l-4.735 5.732-.765-.644 6.021-7.205 5.979 7.195-.764.645-4.736-5.724v14.884z";
  ctrl.iconMap['hide'] = "M8.137 15.147c-.71-.857-1.146-1.947-1.146-3.147 0-2.76 2.241-5 5-5 1.201 0 2.291.435 3.148 1.145l1.897-1.897c-1.441-.738-3.122-1.248-5.035-1.248-6.115 0-10.025 5.355-10.842 6.584.529.834 2.379 3.527 5.113 5.428l1.865-1.865zm6.294-6.294c-.673-.53-1.515-.853-2.44-.853-2.207 0-4 1.792-4 4 0 .923.324 1.765.854 2.439l5.586-5.586zm7.56-6.146l-19.292 19.293-.708-.707 3.548-3.548c-2.298-1.612-4.234-3.885-5.548-6.169 2.418-4.103 6.943-7.576 12.01-7.576 2.065 0 4.021.566 5.782 1.501l3.501-3.501.707.707zm-2.465 3.879l-.734.734c2.236 1.619 3.628 3.604 4.061 4.274-.739 1.303-4.546 7.406-10.852 7.406-1.425 0-2.749-.368-3.951-.938l-.748.748c1.475.742 3.057 1.19 4.699 1.19 5.274 0 9.758-4.006 11.999-8.436-1.087-1.891-2.63-3.637-4.474-4.978zm-3.535 5.414c0-.554-.113-1.082-.317-1.562l.734-.734c.361.69.583 1.464.583 2.296 0 2.759-2.24 5-5 5-.832 0-1.604-.223-2.295-.583l.734-.735c.48.204 1.007.318 1.561.318 2.208 0 4-1.792 4-4z";
  ctrl.iconMap['download'] = "M6 16h-5v6h22v-6h-5v-1h6v8h-24v-8h6v1zm14 2c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm-7.5-17v14.884l4.736-5.724.764.645-5.979 7.195-6.021-7.205.765-.644 4.735 5.732v-14.883h1z";
  ctrl.iconMap['import'] = "M16.965 2.381c3.593 1.946 6.035 5.749 6.035 10.119 0 6.347-5.153 11.5-11.5 11.5s-11.5-5.153-11.5-11.5c0-4.37 2.442-8.173 6.035-10.119l.608.809c-3.353 1.755-5.643 5.267-5.643 9.31 0 5.795 4.705 10.5 10.5 10.5s10.5-4.705 10.5-10.5c0-4.043-2.29-7.555-5.643-9.31l.608-.809zm-4.965-2.381v14.826l3.747-4.604.753.666-5 6.112-5-6.101.737-.679 3.763 4.608v-14.828h1z";
  ctrl.iconMap['filter'] = "M23 0l-9 14.146v7.73l-3.996 2.124v-9.853l-9.004-14.147h22zm-20.249 1l8.253 12.853v8.491l1.996-1.071v-7.419l8.229-12.854h-18.478z";
  ctrl.iconMap['check'] = "M9 22l-10-10.598 2.798-2.859 7.149 7.473 13.144-14.016 2.909 2.806z";
  ctrl.iconMap['settings'] = "M12 8.666c-1.838 0-3.333 1.496-3.333 3.334s1.495 3.333 3.333 3.333 3.333-1.495 3.333-3.333-1.495-3.334-3.333-3.334m0 7.667c-2.39 0-4.333-1.943-4.333-4.333s1.943-4.334 4.333-4.334 4.333 1.944 4.333 4.334c0 2.39-1.943 4.333-4.333 4.333m-1.193 6.667h2.386c.379-1.104.668-2.451 2.107-3.05 1.496-.617 2.666.196 3.635.672l1.686-1.688c-.508-1.047-1.266-2.199-.669-3.641.567-1.369 1.739-1.663 3.048-2.099v-2.388c-1.235-.421-2.471-.708-3.047-2.098-.572-1.38.057-2.395.669-3.643l-1.687-1.686c-1.117.547-2.221 1.257-3.642.668-1.374-.571-1.656-1.734-2.1-3.047h-2.386c-.424 1.231-.704 2.468-2.099 3.046-.365.153-.718.226-1.077.226-.843 0-1.539-.392-2.566-.893l-1.687 1.686c.574 1.175 1.251 2.237.669 3.643-.571 1.375-1.734 1.654-3.047 2.098v2.388c1.226.418 2.468.705 3.047 2.098.581 1.403-.075 2.432-.669 3.643l1.687 1.687c1.45-.725 2.355-1.204 3.642-.669 1.378.572 1.655 1.738 2.1 3.047m3.094 1h-3.803c-.681-1.918-.785-2.713-1.773-3.123-1.005-.419-1.731.132-3.466.952l-2.689-2.689c.873-1.837 1.367-2.465.953-3.465-.412-.991-1.192-1.087-3.123-1.773v-3.804c1.906-.678 2.712-.782 3.123-1.773.411-.991-.071-1.613-.953-3.466l2.689-2.688c1.741.828 2.466 1.365 3.465.953.992-.412 1.082-1.185 1.775-3.124h3.802c.682 1.918.788 2.714 1.774 3.123 1.001.416 1.709-.119 3.467-.952l2.687 2.688c-.878 1.847-1.361 2.477-.952 3.465.411.992 1.192 1.087 3.123 1.774v3.805c-1.906.677-2.713.782-3.124 1.773-.403.975.044 1.561.954 3.464l-2.688 2.689c-1.728-.82-2.467-1.37-3.456-.955-.988.41-1.08 1.146-1.785 3.126";
  ctrl.iconMap['clipboard'] = "M 17 17 L 7 17 L 7 16 L 17 16 L 17 17 Z M 17 14 L 7 14 L 7 13 L 17 13 L 17 14 Z M 17 11 L 7 11 L 7 10 L 17 10 L 17 11 Z M 16 6 L 8 6 L 7 1 L 17 1 L 16 6 Z M 15.7 2 L 8.25 2 L 8.9 5 L 15.1 5 L 15.7 2 Z M 22 23 L 2 23 L 2 3 L 5.5 3 L 5.7 4 L 3 4 L 3 22 L 21 22 L 21 4 L 18.3 4 L 18.5 3 L 22 3 L 22 23 Z";
  ctrl.iconMap['sort-desc'] = "M11 21.883l-6.235-7.527-.765.644 7.521 9 7.479-9-.764-.645-6.236 7.529v-21.884h-1v21.883z";
  ctrl.iconMap['sort-asc'] = "M11 2.206l-6.235 7.528-.765-.645 7.521-9 7.479 9-.764.646-6.236-7.53v21.884h-1v-21.883z";
  ctrl.iconMap['key'] = "M12.451 17.337l-2.451 2.663h-2v2h-2v2h-6v-5l6.865-6.949c1.08 2.424 3.095 4.336 5.586 5.286zm11.549-9.337c0 4.418-3.582 8-8 8s-8-3.582-8-8 3.582-8 8-8 8 3.582 8 8zm-3-3c0-1.104-.896-2-2-2s-2 .896-2 2 .896 2 2 2 2-.896 2-2z";
  ctrl.iconMap['gears'] = "M17 10.645v-2.29c-1.17-.417-1.907-.533-2.28-1.431-.373-.9.07-1.512.6-2.625l-1.618-1.619c-1.105.525-1.723.974-2.626.6-.9-.373-1.017-1.116-1.431-2.28h-2.29c-.412 1.158-.53 1.907-1.431 2.28h-.001c-.9.374-1.51-.07-2.625-.6l-1.617 1.619c.527 1.11.973 1.724.6 2.625-.375.901-1.123 1.019-2.281 1.431v2.289c1.155.412 1.907.531 2.28 1.431.376.908-.081 1.534-.6 2.625l1.618 1.619c1.107-.525 1.724-.974 2.625-.6h.001c.9.373 1.018 1.118 1.431 2.28h2.289c.412-1.158.53-1.905 1.437-2.282h.001c.894-.372 1.501.071 2.619.602l1.618-1.619c-.525-1.107-.974-1.723-.601-2.625.374-.899 1.126-1.019 2.282-1.43zm-8.5 1.689c-1.564 0-2.833-1.269-2.833-2.834s1.269-2.834 2.833-2.834 2.833 1.269 2.833 2.834-1.269 2.834-2.833 2.834zm15.5 4.205v-1.077c-.55-.196-.897-.251-1.073-.673-.176-.424.033-.711.282-1.236l-.762-.762c-.52.248-.811.458-1.235.283-.424-.175-.479-.525-.674-1.073h-1.076c-.194.545-.25.897-.674 1.073-.424.176-.711-.033-1.235-.283l-.762.762c.248.523.458.812.282 1.236-.176.424-.528.479-1.073.673v1.077c.544.193.897.25 1.073.673.177.427-.038.722-.282 1.236l.762.762c.521-.248.812-.458 1.235-.283.424.175.479.526.674 1.073h1.076c.194-.545.25-.897.676-1.074h.001c.421-.175.706.034 1.232.284l.762-.762c-.247-.521-.458-.812-.282-1.235s.529-.481 1.073-.674zm-4 .794c-.736 0-1.333-.597-1.333-1.333s.597-1.333 1.333-1.333 1.333.597 1.333 1.333-.597 1.333-1.333 1.333zm-4 3.071v-.808c-.412-.147-.673-.188-.805-.505s.024-.533.212-.927l-.572-.571c-.389.186-.607.344-.926.212s-.359-.394-.506-.805h-.807c-.146.409-.188.673-.506.805-.317.132-.533-.024-.926-.212l-.572.571c.187.393.344.609.212.927-.132.318-.396.359-.805.505v.808c.408.145.673.188.805.505.133.32-.028.542-.212.927l.572.571c.39-.186.608-.344.926-.212.318.132.359.395.506.805h.807c.146-.409.188-.673.507-.805h.001c.315-.131.529.025.924.213l.572-.571c-.186-.391-.344-.609-.212-.927s.397-.361.805-.506zm-3 .596c-.552 0-1-.447-1-1s.448-1 1-1 1 .447 1 1-.448 1-1 1z";
  ctrl.iconMap['wand'] = "M4.908 2.081l-2.828 2.828 19.092 19.091 2.828-2.828-19.092-19.091zm2.121 6.363l-3.535-3.535 1.414-1.414 3.535 3.535-1.414 1.414zm1.731-5.845c1.232.376 2.197 1.341 2.572 2.573.377-1.232 1.342-2.197 2.573-2.573-1.231-.376-2.196-1.34-2.573-2.573-.375 1.232-1.34 2.197-2.572 2.573zm-5.348 6.954c-.498 1.635-1.777 2.914-3.412 3.413 1.635.499 2.914 1.777 3.412 3.411.499-1.634 1.778-2.913 3.412-3.411-1.634-.5-2.913-1.778-3.412-3.413zm9.553-3.165c.872.266 1.553.948 1.819 1.82.266-.872.948-1.554 1.819-1.82-.871-.266-1.553-.948-1.819-1.82-.266.871-.948 1.554-1.819 1.82zm4.426-6.388c-.303.994-1.082 1.772-2.075 2.076.995.304 1.772 1.082 2.077 2.077.303-.994 1.082-1.772 2.074-2.077-.992-.303-1.772-1.082-2.076-2.076z";
  ctrl.iconMap['user'] = "M19 7.001c0 3.865-3.134 7-7 7s-7-3.135-7-7c0-3.867 3.134-7.001 7-7.001s7 3.134 7 7.001zm-1.598 7.18c-1.506 1.137-3.374 1.82-5.402 1.82-2.03 0-3.899-.685-5.407-1.822-4.072 1.793-6.593 7.376-6.593 9.821h24c0-2.423-2.6-8.006-6.598-9.819z";  
  ctrl.iconMap['version'] = "M 14.9 1 L 12.293 1.005 L 16.507 7.18 L 16.5 23.1 L 18.5 23.1 L 18.5 6.4 L 14.9 1 Z M 10.4 1 L 1.581 1.004 L 1.584 23.13 L 15 23.1 L 15 7.7 L 10.4 1 Z M 16.8 1 L 20 5.8 L 20 23.1 L 22 23.1 L 22 4.9 L 19.3 1 L 16.8 1 Z";
  ctrl.iconMap['group'] = "M21.698 10.658l2.302 1.342-12.002 7-11.998-7 2.301-1.342 9.697 5.658 9.7-5.658zm-9.7 10.657l-9.697-5.658-2.301 1.343 11.998 7 12.002-7-2.302-1.342-9.7 5.657zm12.002-14.315l-12.002-7-11.998 7 11.998 7 12.002-7z";
  ctrl.iconMap['artifact'] = "M12,0 L2,12 L12,24 L22,12 L12,0z";
  
  ctrl.$onInit = function() {
    ctrl.path = ctrl.iconMap[ctrl.shape];
  }
}


module.exports = DatabusIconController;

/***/ },

/***/ "./js/components/entity-api-view/entity-api-view.js"
/*!**********************************************************!*\
  !*** ./js/components/entity-api-view/entity-api-view.js ***!
  \**********************************************************/
(module) {

function EntityApiViewController() {
  const ctrl = this;

  ctrl.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      console.log("Copied to clipboard");
    });
  };

  ctrl.register = async function () {
    ctrl.isRegistering = true;
    ctrl.isSuccess = false;
    ctrl.isError = false;
    
    if (ctrl.entity && ctrl.entity.register) {
      try {
        let response = await ctrl.entity.register();
        ctrl.log = response.data.log;
        ctrl.isSuccess = true;
      } catch(err) {
        ctrl.log = err.data.log;
        ctrl.isError = true;
      }
    }

    ctrl.isRegistering = false;
  };

  ctrl.setApiKeyName = function (name) {
    if (ctrl.entity && ctrl.entity.setApiKeyName) {
      ctrl.entity.setApiKeyName(name);
    }
  };
}

module.exports = EntityApiViewController;


/***/ },

/***/ "./js/components/entity-card/entity-card.js"
/*!**************************************************!*\
  !*** ./js/components/entity-card/entity-card.js ***!
  \**************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusUtils = __webpack_require__(/*! ../../utils/databus-utils */ "./js/utils/databus-utils.js");

// hinzufügen eines Controllers zum Modul
function EntityCardController($sce) {

  var ctrl = this;

  ctrl.$onInit = function() {

    if(ctrl.label == null || ctrl.label == "") {
      ctrl.label = DatabusUtils.uriToTitle(ctrl.uri);
    }
  }

  ctrl.formatResult = function(result) {
    return $sce.trustAsHtml(result);
  }
}


module.exports = EntityCardController;

/***/ },

/***/ "./js/components/entity-dropdown/entity-dropdown.js"
/*!**********************************************************!*\
  !*** ./js/components/entity-dropdown/entity-dropdown.js ***!
  \**********************************************************/
(module) {

function EntityDropdownController() {
  var ctrl = this;

  ctrl.showDrop = false;
  ctrl.selectedLabel = '';
  ctrl.searchQuery = '';
  ctrl.filteredItems = [];

  ctrl.$onInit = function () {
    ctrl.updateFilteredItems();
    ctrl.setSelectedLabel();
  };

  ctrl.$onChanges = function (changes) {
    if (changes.items || changes.selected) {
      ctrl.updateFilteredItems();

      if (ctrl.selected &&  Array.isArray(ctrl.items) && !ctrl.items?.some(i => i[ctrl.displayProperty] === ctrl.selected)) {
        ctrl.selected = null;
        ctrl.onSelect({ item: null }); 
      }

      ctrl.setSelectedLabel();
    }
  };

  ctrl.toggleDropdown = function () {
    if (!ctrl.loading && ctrl.items && ctrl.items.length > 0) {
      ctrl.showDrop = !ctrl.showDrop;
      ctrl.searchQuery = '';
      ctrl.updateFilteredItems();
    }
  };

  ctrl.selectItem = function (item) {
    ctrl.selectedLabel = item[ctrl.displayProperty];
    ctrl.showDrop = false;
    ctrl.onSelect({ item: item });
  };

  ctrl.updateFilteredItems = function () {
    if (!ctrl.items || !ctrl.displayProperty) {
      ctrl.filteredItems = [];
      return;
    }

    ctrl.filteredItems = ctrl.items.filter(function (item) {
      var val = item[ctrl.displayProperty] || '';
      return val.toLowerCase().indexOf(ctrl.searchQuery.toLowerCase()) !== -1;
    });
  };

  ctrl.setSelectedLabel = function () {
    if (!ctrl.selected || !ctrl.displayProperty) {
      ctrl.selectedLabel = ctrl.placeholder || 'Please select...';
      return;
    }

    // Attempt to match selected value in the list
    var match = (ctrl.items || []).find(function (item) {
      return item[ctrl.displayProperty] === ctrl.selected;
    });

    if (match) {
      ctrl.selectedLabel = match[ctrl.displayProperty];
    } else {
      // fallback in case selected value is not in the list
      ctrl.selectedLabel = ctrl.placeholder || 'Please select...';
      // ctrl.onSelect(null);
    }
  };
}

module.exports = EntityDropdownController;


/***/ },

/***/ "./js/components/error-notification/error-notifcation.js"
/*!***************************************************************!*\
  !*** ./js/components/error-notification/error-notifcation.js ***!
  \***************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const { DatabusMsg } = __webpack_require__(/*! ../../utils/messages */ "./js/utils/messages.js");

function ErrorNotificationController() {
  var ctrl = this;
  ctrl.expanded = false;

  ctrl.toggleExpand = function () {
    ctrl.expanded = !ctrl.expanded;
  };

  ctrl.get = function(key) {
    return DatabusMsg.get(key);
  }
}

module.exports = ErrorNotificationController;


/***/ },

/***/ "./js/components/expandable-arrow/expandable-arrow.js"
/*!************************************************************!*\
  !*** ./js/components/expandable-arrow/expandable-arrow.js ***!
  \************************************************************/
(module) {

// hinzufügen eines Controllers zum Modul
function ExpandableArrowController() {

  var ctrl = this;

  ctrl.$onInit = function() {
    if(ctrl.isReadonly == undefined) {
      ctrl.isReadonly = false;
    }

    
  }

  ctrl.change = function() {

    if(!ctrl.isReadonly) {
      ctrl.expanded = !ctrl.expanded;
      ctrl.onChange();
    }
  }
}

module.exports = ExpandableArrowController;



/***/ },

/***/ "./js/components/facets-view/facets-view.js"
/*!**************************************************!*\
  !*** ./js/components/facets-view/facets-view.js ***!
  \**************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const QueryNode = __webpack_require__(/*! ../../query-builder/query-node */ "./js/query-builder/query-node.js");
const DatabusConstants = __webpack_require__(/*! ../../utils/databus-constants */ "./js/utils/databus-constants.js");
const DatabusUris = __webpack_require__(/*! ../../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../../utils/databus-utils */ "./js/utils/databus-utils.js");

/**
 * Manages an array of facets with respect to a parent facets array.
 * Provides some convenient\ce methods to write to the facets array and
 * read from the parents facets.
 * DO NOT change the parent facets array in here.
 */
class FacetSettings {

  /**
   * Locally manages a facets array with respect to a parent
   * facets array
   * @param {[type]} facets       [description]
   * @param {[type]} parentFacets [description]
   */
  constructor(facets, parentFacets) {
    this.facets = facets;
    this.parentFacets = parentFacets;
  }

  /**
   * Change a setting (key, value) to a state (bool)
   * @param  {[type]} key    [description]
   * @param  {[type]} value    [description]
   * @param  {[type]} setState [description]
   * @return {[type]}          [description]
   */
  changeSetting(key, value, targetState) {
    var parentState = this.findParentSettingState(key, value);

    if (parentState != targetState) {
      this.createOrAddSetting(key, value, targetState);
    } else {
      this.removeSetting(key, value);
    }

    return targetState;
  }

  /**
   * Find the checked state specified in the parent setting array (if set)
   * based on a key and value
   * @param  {[type]} key [description]
   * @param  {[type]} value [description]
   * @return {[type]}       [description]
   */
  findParentSettingState(key, value) {
    if (this.parentFacets == undefined) {
      return false;
    }

    for (var p in this.parentFacets) {
      var setting = this.parentFacets[p];
      if (setting.key == key && setting.value == value) {
        return setting.checked;
      }
    }

    return false;
  }

  findOwnSettingState(key, value) {
    for (var p in this.facets) {
      var setting = this.facets[p];
      if (setting.key == key && setting.value == value) {
        return setting.checked;
      }
    }

    return false;
  }

  isOverride(key, value, state) {
    var parentState = this.findParentSettingState(key, value);
    return parentState != state;
  }

  createOrAddSetting(key, value, state) {
    for (var p in this.facets) {
      var setting = this.facets[p];
      if (p == key && setting.value == value) {
        setting.checked = state;
        return;
      }
    }

    this.facets[key] = { value: value, checked: state };
  }

  removeSetting(key, value) {
    for (var p in this.facets) {
      var setting = this.facets[p];
      if (setting.key == key && setting.value == value) {
        this.facets.splice(p, 1);
        return;
      }
    }
  }

}

function FacetsViewController($http, $scope) {

  var ctrl = this;
  ctrl.$http = $http;
  ctrl.maxEntries = 6;

  ctrl.$onInit = function () {

  }

  ctrl.$onChanges = function () {
    // create the queries...
    ctrl.isLoading = true;

    // wrap the node in the query node class
    ctrl.node = QueryNode.createFrom(ctrl.node);

    // Holds the view state as json
    ctrl.viewModel = {};

    if (ctrl.facets == undefined) {
      ctrl.facets = [];
    }

    var queryUri = ctrl.resourceType == 'version' ?
      ctrl.node.uri + '/' + ctrl.node.facetSettings[DatabusUris.DCT_HAS_VERSION][0].value
      : ctrl.node.uri;

    // Load the available resource facets
    // TODO: Remove resource type, can be derived from uri
    ctrl.$http.get('/app/utils/facets', {
      params: { uri: queryUri, type: ctrl.resourceType }
    }).then(function (result) {

      // Facets data has been loaded
      ctrl.facetsData = result.data;

      // Fix artifact facet values for groups, change URIs into artifact names
      var artifactFacetData = ctrl.facetsData[DatabusUris.DATABUS_ARTIFACT_PROPERTY];

      if (artifactFacetData != null) {
        for (var i in artifactFacetData.values) {
          artifactFacetData.values[i] = DatabusUtils.uriToName(artifactFacetData.values[i]);
        }
      }

      // Facet setting in this view is

      // - SETTING
      // ---- VALUE
      // ---- IS_CHECKED

      // Prepare visible facet settings and autofill data based on the facet data returned by the API
      // Create key base entries (unset, not overriden)
      for (var key in ctrl.facetsData) {

        var facetData = ctrl.facetsData[key];

        // Create a view data object for each facet
        ctrl.viewModel[key] = {};
        ctrl.viewModel[key].key = key;
        ctrl.viewModel[key].label = facetData.label;
        ctrl.viewModel[key].visibleFacetSettings = [];
        ctrl.viewModel[key].autofill = {};
        ctrl.viewModel[key].autofill.values = facetData.values;
        ctrl.viewModel[key].autofill.selectedValues = [];
        ctrl.viewModel[key].autofill.input = '';


        for (var v in facetData.values) {
          var value = facetData.values[v];
          ctrl.viewModel[key].visibleFacetSettings.push({
            value: value,
            checked: false,
            isOverride: false
          });
        }

        ctrl.viewModel[key].visibleFacetSettings.sort(function (a, b) {
          const valueA = a.value.toUpperCase();
          const valueB = b.value.toUpperCase();
          if (valueA > valueB) {
            return 1;
          }
          if (valueA < valueB) {
            return -1;
          }

          return 0;
        });

        // Show latest versions first
        if (key == DatabusUris.DCT_HAS_VERSION) {
          ctrl.viewModel[key].visibleFacetSettings.reverse();
        }

        // Only show the top few
        var length = ctrl.viewModel[key].visibleFacetSettings.length;
        ctrl.viewModel[key].visibleFacetSettings.length = Math.min(ctrl.maxEntries, length);
      }

      // If we show the browser for a version, remove the version facet
      if (ctrl.resourceType == 'version') {
        delete ctrl.viewModel[DatabusUris.DCT_HAS_VERSION];
      }

      // Add the "Latest Version" facet to the visible settings of the version facet
      if (ctrl.resourceType != 'version' && ctrl.viewModel[DatabusUris.DCT_HAS_VERSION] != undefined) {
        ctrl.viewModel[DatabusUris.DCT_HAS_VERSION].visibleFacetSettings.unshift({
          value: DatabusConstants.FACET_LATEST_VERSION_VALUE,
          checked: false,
          isOverride: false
        });

        // Apply the existing settings to the view model
        var fullFacets = ctrl.node.createFullFacetSettings();

        for (var key in fullFacets) {
          var facetSettingList = fullFacets[key];

          for (var i in facetSettingList) {
            var facetSetting = facetSettingList[i];

            var visibleFacetSetting = ctrl.getOrCreateVisibleFacetSetting(key, facetSetting.value);

            if (visibleFacetSetting != null) {
              visibleFacetSetting.checked = facetSetting.checked;
              visibleFacetSetting.isOverride = ctrl.node.isOverride(key, facetSetting.value, facetSetting.checked);
            }
          }
        }

        // If we're a group node, check for artifact nodes and add them as facets
        if (ctrl.resourceType == 'group') {

          for (var i in ctrl.node.childNodes) {
            var artifactNode = ctrl.node.childNodes[i];
            var facetValue = DatabusUtils.uriToName(artifactNode.uri)
            var visibleFacetSetting =
              ctrl.getOrCreateVisibleFacetSetting(DatabusUris.DATABUS_ARTIFACT_PROPERTY, facetValue);
            visibleFacetSetting.checked = true;
            visibleFacetSetting.isOverride = true;
          }

          if (ctrl.node.childNodes.length == 0) {


            ctrl.updateArtifactFilters(ctrl.node);

            var artifactFacetData = ctrl.facetsData[DatabusUris.DATABUS_ARTIFACT_PROPERTY];

            if (artifactFacetData != null) {

              // Add artifact nodes 
              for (var i in artifactFacetData.values) {
                artifactFacetData.values[i] = DatabusUtils.uriToName(artifactFacetData.values[i]);
              }
            }

            /*
            // Add artifact nodes per default
            for (var v of ctrl.viewModel[DatabusUris.DATABUS_ARTIFACT_PROPERTY].visibleFacetSettings) {
              var childUri = ctrl.node.uri + '/' + v.value;
              var artifactNode = new QueryNode(childUri, 'databus:artifact');
              QueryNode.addChild(ctrl.node, artifactNode);
            }*/


          }
        }

        ctrl.onChange();
        ctrl.onLoaded();
      }

      ctrl.isLoading = false;
    });
  }

  ctrl.updateArtifactFilters = function (groupNode) {

      // Clear all child nodes
    groupNode.childNodes.length = 0;

    var hasCheckedArtifactFacets = false;

    for (var setting of ctrl.viewModel[DatabusUris.DATABUS_ARTIFACT_PROPERTY].visibleFacetSettings) {
      hasCheckedArtifactFacets = hasCheckedArtifactFacets || setting.checked;
    }

    if (hasCheckedArtifactFacets) {

      for (var setting of ctrl.viewModel[DatabusUris.DATABUS_ARTIFACT_PROPERTY].visibleFacetSettings) {
        if (setting.checked) {
          var artifactUri = `${groupNode.uri}/${setting.value}`;
          if (QueryNode.findChildByUri(groupNode, artifactUri) == null) {
            var artifactNode = new QueryNode(artifactUri, 'databus:artifact');
            QueryNode.addChild(groupNode, artifactNode);
          }
        }
      }

    } else {

      var latestVersionSetting = QueryNode.findFacetSetting(groupNode,
        DatabusUris.DCT_HAS_VERSION,
        DatabusConstants.FACET_LATEST_VERSION_VALUE);

      if (latestVersionSetting != undefined && latestVersionSetting.checked) {

        var artifactFacetData = ctrl.facetsData[DatabusUris.DATABUS_ARTIFACT_PROPERTY];

        if (artifactFacetData != null) {

          // Add artifact nodes 
          for (var value of artifactFacetData.values) {
            var artifactUri = `${groupNode.uri}/${value}`;
            if (QueryNode.findChildByUri(groupNode, artifactUri) == null) {
              var artifactNode = new QueryNode(artifactUri, 'databus:artifact');
              QueryNode.addChild(groupNode, artifactNode);
            }
          }

        }
      }
    }

  }


  ctrl.getFacetLabel = function (value) {
    if (value == DatabusConstants.FACET_LATEST_VERSION_VALUE) {
      return DatabusConstants.FACET_LATEST_VERSION_LABEL;
    }

    return value;
  }
  /**
   * Changes the value of a key value (also applies to facets)
   * @param  {[type]} key [description]
   * @param  {[type]} value [description]
   * @param  {[type]} state [description]
   * @return {[type]}       [description]
   */
  ctrl.changeFacetValueState = function (key, value, targetState) {

    if (ctrl.resourceType == 'group' && key == DatabusUris.DATABUS_ARTIFACT_PROPERTY) {

      var visibleSetting = ctrl.getOrCreateVisibleFacetSetting(key, value);

      if (visibleSetting != null) {
        visibleSetting.checked = targetState;
        visibleSetting.isOverride = targetState;
      }

      ctrl.updateArtifactFilters(ctrl.node);

    }
    else {
      // apply change to view model
      ctrl.node.setFacet(key, value, targetState);

      var visibleSetting = ctrl.getOrCreateVisibleFacetSetting(key, value);

      if (visibleSetting != null) {
        visibleSetting.checked = targetState;
        visibleSetting.isOverride = ctrl.node.isOverride(key, value, targetState);
      }
    }

    if (ctrl.viewModel[key].autofill.selectedValues.length > 0) {
      ctrl.complete(ctrl.viewModel[key]);
    }

    ctrl.onChange();
  }

  /**
   * Gets or creates a new entry for a key value
   * for a given key and value
   * @param  {[type]} key [description]
   * @param  {[type]} value [description]
   * @return {[type]}       [description]
   */
  ctrl.getOrCreateVisibleFacetSetting = function (key, value) {

    if (ctrl.viewModel[key] == undefined) {
      // This is a facet that the node does not have, but a parent has

      var label = DatabusUtils.uriToName(key);
      label = label[0].toUpperCase() + label.slice(1);

      ctrl.viewModel[key] = {};
      ctrl.viewModel[key].key = key;
      ctrl.viewModel[key].label = label;
      ctrl.viewModel[key].visibleFacetSettings = [];
      ctrl.viewModel[key].autofill = {};
      ctrl.viewModel[key].autofill.values = [];
      ctrl.viewModel[key].autofill.selectedValues = [];
      ctrl.viewModel[key].autofill.input = '';
    }

    for (var i in ctrl.viewModel[key].visibleFacetSettings) {
      var facetSetting = ctrl.viewModel[key].visibleFacetSettings[i];
      if (facetSetting.value == value) {
        return facetSetting; // ctrl.facetSettings[key];
      }
    }

    var visibleSetting = {
      value: value,
    };

    ctrl.viewModel[key].visibleFacetSettings.push(visibleSetting);
    return visibleSetting;
  }

  // Get all active facets of a certain key
  ctrl.getActiveFilters = function (key) {
    var activeFilters = [];

    for (var f in ctrl.facets[key].items) {
      var filter = ctrl.facets[key].items[f];
      if (filter.checked) {
        activeFilters.push(filter);
      }
    }

    return activeFilters;
  }

  // Checks whether any filter for a key is set
  ctrl.hasActiveFilters = function (key) {
    for (var f in ctrl.facets[key].items) {
      var filter = ctrl.facets[key].items[f];
      if (filter.checked) {
        return true;
      }
    }

    return false;
  }

  ctrl.complete = function (facetData) {
    facetData.autofill.selectedValues.length = 0;
    for (var a in facetData.autofill.values) {
      var e = facetData.autofill.values[a];
      if (e.toLowerCase().indexOf(facetData.autofill.input.toLowerCase()) >= 0) {

        var include = true;

        for (var v in facetData.visibleFacetSettings) {
          var visibleSettings = facetData.visibleFacetSettings[v];
          if (visibleSettings.value == e.toLowerCase()) {
            include = false;
          }
        }

        if (include) {
          facetData.autofill.selectedValues.push(e);
        }
      }
    }
  }

  // Clears the autofill lists
  ctrl.clearAutofill = function () {
    var self = ctrl;
    for (var f in self.viewModel) {
      var data = self.viewModel[f];
      data.autofill.selectedValues.length = 0;
    }
  }
}

module.exports = FacetsViewController;


/***/ },

/***/ "./js/components/file-browser/file-browser.js"
/*!****************************************************!*\
  !*** ./js/components/file-browser/file-browser.js ***!
  \****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusConstants = __webpack_require__(/*! ../../utils/databus-constants */ "./js/utils/databus-constants.js");
const DatabusUtils = __webpack_require__(/*! ../../utils/databus-utils */ "./js/utils/databus-utils.js");

// hinzufügen eines Controllers zum Modul
function FileBrowserController($http, $scope) {

  var ctrl = this;

  ctrl.$http = $http;
  ctrl.activeTab = 0;
  ctrl.$scope = $scope;

  ctrl.$onInit = function() {

    ctrl.lastRequestRevision = 0;
    ctrl.tableLimit = 20;
    ctrl.sortProperty = 'version.value';
    ctrl.sortReverse = false;
    ctrl.isLoading = true;
    ctrl.queryResult = {};
  }

  ctrl.sortBy = function(property) {


    if(ctrl.sortProperty == property) {
      ctrl.sortReverse = !ctrl.sortReverse;
    }
    ctrl.sortProperty = property;
  }

  ctrl.getCellValues = function(binding, column) {

    if(binding[column.field] == undefined) {
      return "";
    }
    
    var value = binding[column.field].value;

    if(column.uriToName) {
      value = DatabusUtils.uriToName(value);
    }


    return value;

  }

  ctrl.formatUploadSize = function(size) {
    return DatabusUtils.formatFileSize(size);
  };

  ctrl.createRelativeUri = function(url) {
    var u = new URL(url);
    return u.pathname;
  }

  ctrl.formatVariant = function(value) {
    var variants = value.split(', ');
    value = "";
    for(variant of variants) {
      if(variant != undefined && variant != "") {
        value += variant + ", ";
      }
    }

    if(value == "") {
      return "none";
    }

    return value.substr(0, value.length - 2);
  }

  ctrl.querySparql = async function(query) {

    ctrl.isLoading = true;
    ctrl.totalSize = 0;
    ctrl.numFiles = 0;

    try {

      var req = {
        method: 'POST',
        url: DatabusConstants.DATABUS_SPARQL_ENDPOINT_URL,
        data: "format=json&query=" + encodeURIComponent(query),
        headers: {
          "Content-type" : "application/x-www-form-urlencoded"
        },
      }

      var updateResponse = await ctrl.$http(req); 

      var data = updateResponse.data;

      ctrl.isLoading = false;


      ctrl.queryResult.bindings = data.results.bindings;

      ctrl.queryResult.uriList = "";

      for(var b in ctrl.queryResult.bindings) {
        var binding = ctrl.queryResult.bindings[b];
        binding.size.numericalValue = parseInt(binding.size.value);
        ctrl.queryResult.uriList += binding.file.value + "\n";

        if(binding.variant != undefined) {
          binding.variant.value = ctrl.formatVariant(binding.variant.value);          
        }
        
     


        ctrl.totalSize += binding.size.numericalValue;
        ctrl.numFiles++;
      }

      ctrl.totalSize = ctrl.formatUploadSize(ctrl.totalSize);
      
      if(!$scope.$root.$$phase) {
        ctrl.$scope.$apply();
      }

    } catch(e) {
      console.log(e);
    }
  }

  /**
   * On each digest, check whether the settings array has changed, if so create new QUERIES
   * using the query builders
   * @return {[type]} [description]
   */
  ctrl.$doCheck = function() {

    if(ctrl.query != ctrl.fileQuery) {
      ctrl.fileQuery = ctrl.query;
      ctrl.querySparql(ctrl.fullQuery);
    }
  }
}



module.exports = FileBrowserController;

/***/ },

/***/ "./js/components/multiselect-dropdown/multiselect-dropdown.js"
/*!********************************************************************!*\
  !*** ./js/components/multiselect-dropdown/multiselect-dropdown.js ***!
  \********************************************************************/
(module) {

// hinzufügen eines Controllers zum Modul
function MultiselectDropdownController($timeout, $sce) {

  var ctrl = this;
  ctrl.$sce = $sce;
  ctrl.searchInput = "";


  ctrl.$onInit = function () {

  }

  ctrl.handleKey = function (e) {
    if (e.which === 9 || e.which === 13) {
      ctrl.showDrop = false;
    }
  }

  ctrl.getLabel = function (value) {

    if (value == '$latest') {
      return 'Latest Version';
    }

    if (value == '') {
      return 'None';
    }

    return value;
  }

  ctrl.hasContent = function () {
    return !((ctrl.input == undefined || ctrl.input.length == 0) && (ctrl.parentInput == undefined ||
      ctrl.parentInput.length == 0));
  }

  ctrl.valueComparator = function(v1, v2) {
    var isV1Included = ctrl.includesValue(ctrl.input, v1.value) 
      || ctrl.includesValue(ctrl.parentInput, v1.value);
    var isV2Included = ctrl.includesValue(ctrl.input, v2.value) 
    || ctrl.includesValue(ctrl.parentInput, v2.value);

    if(isV1Included != isV2Included) {
      return isV1Included ? -1 : 1;
    }

    if(v1.value == "None") {
      return -1;
    }


    if(v2.value == "None") {
      return 1;
    }

    return v1.value.localeCompare(v2.value);
  }
  
  
  ctrl.mergeSettings = function (parentSettings, childSettings) {
    var mergedSettings = {};

    // Set parent settings state
    if (parentSettings != undefined) {
      for (var setting of parentSettings) {
        mergedSettings[setting.value] = setting.checked;
      }
    }

    // Override with child settings
    for (var s in childSettings) {
      var setting = childSettings[s];
      mergedSettings[setting.value] = setting.checked;
    }

    return mergedSettings;
  }

  ctrl.list = function () {

    var mergedSettings = ctrl.mergeSettings(ctrl.parentInput, ctrl.input);

    var allEntries = Object.keys(mergedSettings).map(function (key, index) {

      var label = undefined;

      if (key == '') {
        label = '<i style="color: #a3a3a3;">None</i>';
      } else {
        label = ctrl.getLabel(key);
      }

      if (mergedSettings[key]) {
        return label;
      } else {
        return `<s>${label}</s>`;
      }
    });


    var list = [];
    var maxLength = 50;
    var length = 0;
    var hasOverflow = false;

    for(var entry of allEntries) {
      if(entry.length + length > maxLength) {
        hasOverflow = true;
        break;
      }

      length += entry.length;
      list.push(entry);
    }

    if(hasOverflow) {
      list.push('...');
    }
    
    return ctrl.$sce.trustAsHtml(list.join(', '));
  }


  ctrl.hideDropDelayed = function () {
    $timeout(function () {
      ctrl.showDrop = false;
    }, 120);
  }

  ctrl.includesValue = function (objs, value) {
    if (objs == undefined) {
      return false;
    }

    for (var obj of objs) {
      if (obj.value == value) {
        return true;
      }
    }

    return false;
  }

  ctrl.matchesSearch = function(value) {
    return value.includes(ctrl.searchInput);
  }

  ctrl.isChecked = function (objs, value) {
    if (objs == undefined) {
      return false;
    }

    for (var obj of objs) {
      if (obj.value == value) {
        return obj.checked;
      }
    }

    return false;
  }

  ctrl.veryStupidDelete = function (objs, value) {

    let index = -1;
    let k = 0;

    if (objs == undefined) {
      return false;
    }

    for (var obj of objs) {
      if (obj.value == value) {
        index = k;
        break;
      }

      k++;
    }

    objs.splice(k, 1);
  }

  ctrl.toggle = function (value) {

    if (ctrl.input == undefined) {
      ctrl.input = [];
    }

    var isSetByParent = ctrl.parentInput != undefined && ctrl.includesValue(ctrl.parentInput, value);

    if (!ctrl.includesValue(ctrl.input, value)) {
      ctrl.input.push({ value: value, checked: !isSetByParent });

    } else {

      ctrl.veryStupidDelete(ctrl.input, value);
    }

    ctrl.change();
  }


  ctrl.change = function () {
    $timeout(function () {
      ctrl.onChange();
    }, 50);;
  }
}


module.exports = MultiselectDropdownController;

/***/ },

/***/ "./js/components/nav-search/nav-search-controller.js"
/*!***********************************************************!*\
  !*** ./js/components/nav-search/nav-search-controller.js ***!
  \***********************************************************/
(module) {



// hinzufügen eines Controllers zum Modul
function NavSearchController($http, $interval, $sce, searchManager) {

  var ctrl = this;

  // TODO: get search extensions from the logged in user

  ctrl.searchManager = searchManager;
  ctrl.results = [];

  ctrl.formatResult = function (result) {
    return $sce.trustAsHtml(result);
  }

  ctrl.toggleFilter = function (key) {
    ctrl.filterActive[key] = !ctrl.filterActive[key];
    ctrl.search();
  }

  ctrl.navigateTo = function(uri) {
    window.location = uri;
  }

  ctrl.hideDropdown = function() {

  }

  ctrl.availableResourceTypes = ['Collection', 'Artifact', 'Group', 'Account', 'Version' ];

  ctrl.$onInit = function () {

    ctrl.searchInput = '';
    ctrl.isSearching = false;
    ctrl.searchCooldown = 1000;


    ctrl.filterActive = {};
    ctrl.filterVisible = {};


    if (ctrl.settings == undefined) {
      ctrl.minRelevance = 0.01;
      ctrl.maxResults = 50;
      ctrl.searchFilter = "";
      ctrl.resourceTypes = null;
      ctrl.placeholder = "Search the Databus..."
    } else {
      ctrl.minRelevance = ctrl.settings.minRelevance;
      ctrl.maxResults = ctrl.settings.maxResults;
      ctrl.searchFilter = ctrl.settings.filter;
      ctrl.resourceTypes = ctrl.settings.resourceTypes;
      ctrl.placeholder = ctrl.settings.placeholder;
    }

    for (var resourceType of ctrl.availableResourceTypes) {
      ctrl.filterActive[resourceType] = false;
      ctrl.filterVisible[resourceType] = ctrl.resourceTypes == null;
    }

    ctrl.numFilters = 0;

    if (ctrl.resourceTypes != null) {
      for (var resourceType of ctrl.resourceTypes) {
        ctrl.filterVisible[resourceType] = true;
        ctrl.numFilters++;
      }
    }
  }

  ctrl.isAnyFilterActive = function () {

    for (var resourceType of ctrl.availableResourceTypes) {

      if (!ctrl.filterVisible[resourceType]) {
        continue;
      }

      if (ctrl.filterActive[resourceType]) {
        return true;
      }
    }

    return false;
  }

  ctrl.baseQueryFormatter = function(query) {
    return `?query=${query}${ctrl.searchFilter}${ctrl.baseFilters}${ctrl.typeFilters}`
  }

  $interval(function () {

    if (ctrl.searchChanged) {

      var baseFilters = `&minRelevance=${ctrl.minRelevance}&maxResults=${ctrl.maxResults}`;
      var typeFilters = ``;
      var isAnyFilterActive = ctrl.isAnyFilterActive();


      for (var resourceType of ctrl.availableResourceTypes) {

        if (!ctrl.filterVisible[resourceType]) {
          continue;
        }

        if (ctrl.filterActive[resourceType] || !isAnyFilterActive) {

          if (typeFilters == ``) {
            typeFilters = `&typeName=`;
          }

          typeFilters += ` ${resourceType}`;
        }
      }

      ctrl.baseFilters = baseFilters;
      ctrl.typeFilters = typeFilters;
      ctrl.searchManager.baseAdapter.queryFormatter = ctrl.baseQueryFormatter;

      ctrl.searchManager.search(ctrl.searchInput).then(function success(results) {
        
        for(var result of results) {

          if(result.abstract != null) {
            result.abstract = result.abstract[result.abstract.length - 1];
          }
        }
        
        ctrl.results = results;

        
        ctrl.isSearching = false;
      }, function error(response) {
        ctrl.isSearching = false;
      });

      ctrl.searchChanged = false;
    };
  }, ctrl.searchCooldown);

  ctrl.search = function () {
    ctrl.isSearching = true;
    ctrl.searchChanged = true;
  };

};

module.exports = NavSearchController;



/***/ },

/***/ "./js/components/override-checkbox/override-checkbox.js"
/*!**************************************************************!*\
  !*** ./js/components/override-checkbox/override-checkbox.js ***!
  \**************************************************************/
(module) {



// hinzufügen eines Controllers zum Modul
function OverrideCheckboxController() {

  var ctrl = this;

  ctrl.$onInit = function() {

    if(ctrl.id == undefined) {
      ctrl.id = ctrl.label;
    }
  }

  ctrl.change = function() {

    if(!ctrl.readonly) {
      ctrl.onChange();
    }
  }
}

module.exports = OverrideCheckboxController;

/***/ },

/***/ "./js/components/search/search-controller.js"
/*!***************************************************!*\
  !*** ./js/components/search/search-controller.js ***!
  \***************************************************/
(module) {



// hinzufügen eines Controllers zum Modul
function SearchController($http, $interval, $sce, searchManager) {

  var ctrl = this;

  // TODO: get search extensions from the logged in user

  ctrl.searchManager = searchManager;
  ctrl.results = [];

  ctrl.formatResult = function (result) {
    return $sce.trustAsHtml(result);
  }

  ctrl.toggleFilter = function (key) {
    ctrl.filterActive[key] = !ctrl.filterActive[key];
    ctrl.search();
  }

  ctrl.availableResourceTypes = ['Collection', 'Artifact', 'Group', 'Account', 'Version' ];

  ctrl.$onInit = function () {

    ctrl.searchInput = '';
    ctrl.isSearching = false;
    ctrl.searchCooldown = 300;

    if (ctrl.settings == undefined) {
      ctrl.minRelevance = 0.01;
      ctrl.maxResults = 50;
      ctrl.searchFilter = "";
      ctrl.resourceTypes = null;
      ctrl.placeholder = "Search the Databus..."
    } else {
      ctrl.minRelevance = ctrl.settings.minRelevance;
      ctrl.maxResults = ctrl.settings.maxResults;
      ctrl.searchFilter = ctrl.settings.filter;
      ctrl.resourceTypes = ctrl.settings.resourceTypes;
      ctrl.placeholder = ctrl.settings.placeholder;
    }

    ctrl.filterActive = {};
    ctrl.filterVisible = {};

    for (var resourceType of ctrl.availableResourceTypes) {
      ctrl.filterActive[resourceType] = false;
      ctrl.filterVisible[resourceType] = ctrl.resourceTypes == null;
    }

    ctrl.numFilters = 0;

    if (ctrl.resourceTypes != null) {
      for (var resourceType of ctrl.resourceTypes) {
        ctrl.filterVisible[resourceType] = true;
        ctrl.numFilters++;
      }
    }
  }

  ctrl.isAnyFilterActive = function () {

    for (var resourceType of ctrl.availableResourceTypes) {

      if (!ctrl.filterVisible[resourceType]) {
        continue;
      }

      if (ctrl.filterActive[resourceType]) {
        return true;
      }
    }

    return false;
  }

  ctrl.baseQueryFormatter = function(query) {
    return `?query=${query}${ctrl.searchFilter}${ctrl.baseFilters}${ctrl.typeFilters}`
  }

  $interval(function () {

    if (ctrl.searchChanged) {

      var baseFilters = `&minRelevance=${ctrl.minRelevance}&maxResults=${ctrl.maxResults}`;
      var typeFilters = ``;
      var isAnyFilterActive = ctrl.isAnyFilterActive();


      for (var resourceType of ctrl.availableResourceTypes) {

        if (!ctrl.filterVisible[resourceType]) {
          continue;
        }

        if (ctrl.filterActive[resourceType] || !isAnyFilterActive) {

          if (typeFilters == ``) {
            typeFilters = `&typeName=`;
          }

          typeFilters += ` ${resourceType}`;
        }
      }

      ctrl.baseFilters = baseFilters;
      ctrl.typeFilters = typeFilters;
      ctrl.searchManager.baseAdapter.queryFormatter = ctrl.baseQueryFormatter;

      ctrl.searchManager.search(ctrl.searchInput).then(function success(results) {
        ctrl.results = results;
        ctrl.isSearching = false;
      }, function error(response) {
        ctrl.isSearching = false;
      });

      ctrl.searchChanged = false;
    };
  }, ctrl.searchCooldown);

  ctrl.search = function () {
    ctrl.isSearching = true;
    ctrl.searchChanged = true;
  };

};

module.exports = SearchController;



/***/ },

/***/ "./js/components/table-editor/table-editor.js"
/*!****************************************************!*\
  !*** ./js/components/table-editor/table-editor.js ***!
  \****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusUtils = __webpack_require__(/*! ../../utils/databus-utils */ "./js/utils/databus-utils.js");

// hinzufügen eines Controllers zum Modul
function TableEditorController() {

  var ctrl = this;

  ctrl.$onInit = function() {

    ctrl.selection = {};
    ctrl.edit = {};

    if(ctrl.model.groupMode == undefined) {
      ctrl.model.groupMode = true;
    }

    ctrl.setupColumns();
    ctrl.updateViewModel();
  }

  ctrl.getSpanWidth = function(row, cv) {
    var span = $(`#${row}_${cv}`);
    var width = span.width();

    if(width == undefined) {
      return 0;
    }

    return width + 22;
  }

  ctrl.editContentVariant = function(index) {

    ctrl.onEditContentVariant({ index: index});
  }

  ctrl.setupColumns = function() {

    ctrl.columns = [];
    ctrl.columns.push({ title:'File', width: 400, isReadonly : true });

    for(var c in ctrl.model.contentVariants) {
      var cv = ctrl.model.contentVariants[c];
      ctrl.columns.push({ title: cv.label, width: 120, isReadonly : false });
    }

    ctrl.columns.push({ title:'Actions', width: 120, isReadonly : true });
    ctrl.progressWidth = (115 + 200) + 'px';
  }

  ctrl.toggleGroupMode = function() {
    ctrl.model.groupMode = ! ctrl.model.groupMode;
    ctrl.updateViewModel();
  }

  ctrl.onShowInput = function($event) {
   
  }

  ctrl.deselect = function() {
    ctrl.edit.x = undefined;
    ctrl.edit.y = undefined;
    ctrl.selection.x = undefined;
    ctrl.selection.y = undefined;
    ctrl.selection.width = 0;
    ctrl.selection.height = 0;
  }

  ctrl.selectCell = function($event, x, y) {

    
    ctrl.edit.x = undefined;
    ctrl.edit.y = undefined;

    ctrl.edit.x = x;
    ctrl.edit.y = y; 
    ctrl.selection.x = x;
    ctrl.selection.y = y;
    ctrl.selection.width = 1;
    ctrl.selection.height = 1;
   
  }

  ctrl.analyzeFile = function(file) {
    ctrl.onAnalyzeFile({ file : file });
  }

  ctrl.onChangeCv = function(file, cv) {

    var index = ctrl.model.files.findIndex(f => f.uri == file.uri);
    
    for(var i = index + 1; i < index + file.rowspan; i++) {
      ctrl.model.files[i].contentVariants[cv.id] = file.contentVariants[cv.id];
    }
    
    ctrl.model.onChange();
  }

  ctrl.updateViewModel = function() {

    for(var f in ctrl.model.files) {
      ctrl.model.files[f].rowspan = 1;
    }

    /*
    if(ctrl.model.groupMode) {

      var i = 0;
      var step = 1;

      while(i + step < ctrl.model.files.length) {

        if(ctrl.model.files[i].name == ctrl.model.files[i + step].name) {
          // Swallow the cv setting of the next row
          // ctrl.model.files[i].rowspan++;
          // ctrl.model.files[i + step].rowspan = 0;

          for(var c in ctrl.model.contentVariants) {
            var cv = ctrl.model.contentVariants[c];
            ctrl.model.files[i + step].contentVariants[cv.id] = ctrl.model.files[i].contentVariants[cv.id];
          }

          step++;
        } else {
          i += step;
          step = 1;
        }
      }
    }*/


  }
  /**
   * Removes a specific distribution from an artifact
   * @param {*} artifact 
   * @param {*} file 
   */
  ctrl.removeFileFromArtifact = function(file, index) {
    ctrl.onRemoveFile({ file : file, index: index});
  }

  ctrl.$doCheck = function() { 

    var numFiles = DatabusUtils.objSize(ctrl.model.files);
    if(ctrl.numFiles != numFiles) {
      ctrl.updateViewModel();
      ctrl.numFiles = numFiles;
    }


    if(ctrl.columns == undefined) {
      return;
    }

    var columnCount = 4;

    for(var c in ctrl.model.contentVariants) {
      columnCount++;
    }

    ctrl.progressPosition = 45;
    for(var i = 0; i < columnCount - 3; i++) {
      ctrl.progressPosition += ctrl.columns[i].width;
    }
    ctrl.progressPosition = ctrl.progressPosition + 'px'

    if(ctrl.columns.length == columnCount) {
      return;
    }

    ctrl.setupColumns();
  }

  ctrl.change = function() {

  }
};

module.exports = TableEditorController;

/***/ },

/***/ "./js/components/type-tag/type-tag.js"
/*!********************************************!*\
  !*** ./js/components/type-tag/type-tag.js ***!
  \********************************************/
(module) {

// hinzufügen eines Controllers zum Modul
function TypeTagController() {

  var ctrl = this;

  ctrl.typeMap = {};
  ctrl.typeMap["Artifact"] = "is-artifact";
  ctrl.typeMap["Version"] = "is-version";
  ctrl.typeMap["Group"] = "is-group";
  ctrl.typeMap["Service"] = "is-service";
  ctrl.typeMap["Account"] = "is-consumer";
  ctrl.typeMap["Collection"] = "is-collection";
  ctrl.typeMap["BlogEntry"] = "is-blog";
  ctrl.typeMap["Databus"] = "is-version";
  ctrl.typeMap["Sparql"] = "is-grey";

  ctrl.iconMap = {};
  ctrl.iconMap["Artifact"] = "M12,0 L1,12 l11,12 l11,-12 L12,0z"; 
  ctrl.iconMap["Version"] = "M 14.9 1 L 12.293 1.005 L 16.507 7.18 L 16.5 23.1 L 18.5 23.1 L 18.5 6.4 L 14.9 1 Z M 10.4 1 L 1.581 1.004 L 1.584 23.13 L 15 23.1 L 15 7.7 L 10.4 1 Z M 16.8 1 L 20 5.8 L 20 23.1 L 22 23.1 L 22 4.9 L 19.3 1 L 16.8 1 Z";
  ctrl.iconMap["Group"] = "M21.698 10.658l2.302 1.342-12.002 7-11.998-7 2.301-1.342 9.697 5.658 9.7-5.658zm-9.7 10.657l-9.697-5.658-2.301 1.343 11.998 7 12.002-7-2.302-1.342-9.7 5.657zm12.002-14.315l-12.002-7-11.998 7 11.998 7 12.002-7z";
  ctrl.iconMap["Service"] = "M24 13.616v-3.232l-2.869-1.02c-.198-.687-.472-1.342-.811-1.955l1.308-2.751-2.285-2.285-2.751 1.307c-.613-.339-1.269-.613-1.955-.811l-1.021-2.869h-3.232l-1.021 2.869c-.686.198-1.342.471-1.955.811l-2.751-1.308-2.285 2.285 1.308 2.752c-.339.613-.614 1.268-.811 1.955l-2.869 1.02v3.232l2.869 1.02c.197.687.472 1.342.811 1.955l-1.308 2.751 2.285 2.286 2.751-1.308c.613.339 1.269.613 1.955.811l1.021 2.869h3.232l1.021-2.869c.687-.198 1.342-.472 1.955-.811l2.751 1.308 2.285-2.286-1.308-2.751c.339-.613.613-1.268.811-1.955l2.869-1.02zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z";
  ctrl.iconMap["Account"] = "M19 7.001c0 3.865-3.134 7-7 7s-7-3.135-7-7c0-3.867 3.134-7.001 7-7.001s7 3.134 7 7.001zm-1.598 7.18c-1.506 1.137-3.374 1.82-5.402 1.82-2.03 0-3.899-.685-5.407-1.822-4.072 1.793-6.593 7.376-6.593 9.821h24c0-2.423-2.6-8.006-6.598-9.819z";
  ctrl.iconMap["Collection"] = "M11.499 12.03v11.971l-10.5-5.603v-11.835l10.5 5.467zm11.501 6.368l-10.501 5.602v-11.968l10.501-5.404v11.77zm-16.889-15.186l10.609 5.524-4.719 2.428-10.473-5.453 4.583-2.499zm16.362 2.563l-4.664 2.4-10.641-5.54 4.831-2.635 10.474 5.775z";
  ctrl.iconMap["BlogEntry"] = "M21 9.662c-2.287.194-5.197 1.038-7 1.794v-1.064c1.933-.721 4.598-1.54 7-1.745v1.015zm0 2.031c-2.287.194-5.197 1.038-7 1.794v-1.064c1.933-.721 4.598-1.54 7-1.745v1.015zm0 2.031c-2.287.194-5.197 1.038-7 1.794v-1.064c1.933-.721 4.598-1.54 7-1.745v1.015zm0 2.031c-2.287.194-5.197 1.038-7 1.794v-1.064c1.933-.721 4.598-1.54 7-1.745v1.015zm0-9.951c-2.402.204-5.068 1.024-7 1.745v1.933c1.804-.756 4.713-1.6 7-1.794v-1.884zm-18 2.843c2.402.205 5.067 1.024 7 1.745v1.064c-1.803-.756-4.713-1.6-7-1.794v-1.015zm0 2.031c2.402.205 5.067 1.024 7 1.745v1.064c-1.803-.756-4.713-1.6-7-1.794v-1.015zm0 2.031c2.402.205 5.067 1.024 7 1.745v1.064c-1.803-.756-4.713-1.6-7-1.794v-1.015zm0 2.032c2.402.205 5.067 1.024 7 1.745v1.064c-1.803-.756-4.713-1.6-7-1.794v-1.015zm0-7.054c2.287.194 5.196 1.038 7 1.794v-1.933c-1.932-.72-4.598-1.54-7-1.744v1.883zm9-2.724c-3.063-1.671-7.776-2.755-12-2.963v17c4.289.206 8.195 1.249 12 3 3.805-1.751 7.711-2.794 12-3v-17c-4.224.208-8.937 1.292-12 2.963zm-10-.791c4.264.496 6.86 1.467 9 2.545v12.702c-2.968-1.184-5.939-1.95-9-2.271v-12.976zm20 12.975c-3.061.321-6.032 1.088-9 2.271v-12.701c2.187-1.103 4.757-2.051 9-2.544v12.974z";
  ctrl.iconMap["Databus"] = "m 0.76949155,0.7702454 v 5.24959 l 29.33129045,-10e-4 6.27262,8.8675006 -0.002,32.0824 4.7212,-0.002 V 0.7702354 Z m 18.43511045,8.3952603 -5.68354,0.006 7.1979,10.5484003 -0.004,27.24663 4.70393,-0.002 0.0167,-28.60108 z m -9.4730904,0.002 -8.96510005,0.002 0.004,37.7960503 16.79563045,-0.004 0.001,-26.29103 z m 13.2512904,0 5.59825,8.2188903 -0.0396,29.57614 4.70307,-0.002 0.006,-31.09587 -4.55858,-6.6940403 z";
  ctrl.iconMap["Sparql"] = "M383.476,267.343c-2.544-1.346-5.14-2.493-7.743-3.516l1.863-0.15c0,0-16.608-7.354-18.057-60.722  c-1.438-53.372,15.828-62.478,15.828-62.478l-2.48,0.109c13.045-6.69,24.265-17.267,31.669-31.216  c19.295-36.291,5.488-81.362-30.81-100.657C337.436-10.563,292.374,3.207,273.09,39.53c-7.927,14.899-10.178,31.273-7.677,46.733  l-0.851-1.306c0,0,4.373,19.365-41.032,47.55c-45.397,28.2-65.877,14.159-65.877,14.159l1.302,1.925  c-1.298-0.803-2.544-1.624-3.901-2.333c-36.306-19.294-81.38-5.509-100.667,30.804c-19.281,36.309-5.489,81.365,30.813,100.668  c27.064,14.364,58.974,10.36,81.461-7.655l-0.487,0.946c0,0,16.531-13.599,64.16,11.973c37.601,20.178,43.184,39.956,43.899,47.383  c-0.983,27.57,13.388,54.618,39.389,68.433c36.301,19.299,81.374,5.498,100.657-30.804  C433.571,331.704,419.786,286.624,383.476,267.343z M299.542,277.128c-6.018,2.129-23.203,4.487-59.389-14.921  c-39.187-21.04-45.005-38.615-45.855-43.891c0.557-6.401,0.202-12.791-0.891-19.02l0.239,0.359c0,0-3.189-17.096,41.65-44.943  c40.133-24.908,58.376-19.955,61.771-18.653c2.185,1.485,4.45,2.867,6.825,4.131c4.518,2.398,9.174,4.283,13.888,5.672  c5.52,5.257,15.678,20.178,16.733,59.413c1.078,39.535-10.533,54.779-16.865,60.168C311.122,268.399,305.022,272.34,299.542,277.128  z";

  ctrl.$onInit = function() {
    ctrl.class = ctrl.typeMap[ctrl.type];
    ctrl.icon = ctrl.iconMap[ctrl.type];
    ctrl.style = {};
    ctrl.style.width = ctrl.width + "px";
    ctrl.style.height = ctrl.height + "px";
    ctrl.viewBox = "0 0 24 24";

    if(ctrl.type == 'Databus') {
      ctrl.viewBox = "2 0 42 40";
    }

    if(ctrl.type == 'Sparql') {
      ctrl.viewBox = "40 0 430 420";
    }
  }
}

module.exports = TypeTagController;

/***/ },

/***/ "./js/components/uri-breadcrumbs/uri-breadcrumbs.js"
/*!**********************************************************!*\
  !*** ./js/components/uri-breadcrumbs/uri-breadcrumbs.js ***!
  \**********************************************************/
(module) {

// hinzufügen eines Controllers zum Modul
// TODO update base
function UriBreadcrumbsController() {

  var ctrl = this;

  ctrl.$onInit = function() {

    ctrl.entries = [];

    var uri = ctrl.uri;

    if(uri == undefined || uri == null) {
      return;
    }

    var url = new URL(uri);

    var extensions = url.pathname.split('/');
    var pathSoFar = '';

    if(ctrl.absolute == true) {
      pathSoFar = url.origin;
    }

    for(var e in extensions) {
      var extension = extensions[e];

      if(extension == '') {
        continue;
      }

      pathSoFar += "/" + extension;

      ctrl.entries.push({
        label: extension,
        uri: pathSoFar
      });
    }
  }
}

module.exports = UriBreadcrumbsController;



/***/ },

/***/ "./js/components/yasqe-text/yasqe-text.js"
/*!************************************************!*\
  !*** ./js/components/yasqe-text/yasqe-text.js ***!
  \************************************************/
(module) {

function YasqeTextController($scope, $element) {

  var ctrl = this;

  ctrl.textField = $element.find('#custom-query');
  ctrl.$scope = $scope;

  ctrl.$onInit = function () {

    ctrl.yasqe = new Yasqe(ctrl.textField[0], {
      lineNumbers: true,
      viewportMargin: Infinity,
      readOnly: ctrl.readOnly,
      autorefresh: true
    });

    if (ctrl.autoSize || !ctrl.hasSend) {
      var styleSheet = document.createElement("style")
      styleSheet.innerText = "";

      if (ctrl.autoSize) {
        styleSheet.innerText += ".CodeMirror { height: auto !important; } .CodeMirror-vscrollbar { display: none !important; } .resizeWrapper { display: none !important; }";
      }

      if (!ctrl.hasSend) {
        styleSheet.innerText += ".yasqe_buttons { display: none !important; }";
      }

      ctrl.textField[0].appendChild(styleSheet)
    }

    ctrl.yasqe.on('query', function() {
      ctrl.onSend();
    });

    ctrl.yasqe.on('change', function () {
      ctrl.query = ctrl.yasqe.getValue();
      ctrl.valid = !ctrl.yasqe.queryValid;

      if (!$scope.$root.$$phase) {
        ctrl.$scope.$apply();
      }

      ctrl.onChange();
    });

    if (ctrl.query != undefined) {
      ctrl.yasqe.setValue(ctrl.query);
    }
  }

  ctrl.$doCheck = function () {
    if (ctrl.yasqe != undefined && ctrl.yasqe.getValue() != ctrl.query) {
      if (ctrl.query != undefined) {
        ctrl.yasqe.setValue(ctrl.query);
      }
    }

    setTimeout(function () {
      ctrl.yasqe.refresh();
    }, 10);

  }
}

module.exports = YasqeTextController;

/***/ },

/***/ "./js/components/yasr-view/yasr-view.js"
/*!**********************************************!*\
  !*** ./js/components/yasr-view/yasr-view.js ***!
  \**********************************************/
(module) {

function YasrViewController($scope, $element) {

  var ctrl = this;

  ctrl.textField = $element.find('#custom-query');
  ctrl.$scope = $scope;

  ctrl.$onInit = function () {


    ctrl.yasr = new Yasr(ctrl.textField[0], {
      //lineNumbers: true,
      //viewportMargin: Infinity,
      //readOnly: ctrl.readOnly,
      //autorefresh: true
      prefixes : {
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
        dct: 'http://purl.org/dc/terms/',
        dcat: 'http://www.w3.org/ns/dcat#',
        databus: 'https://dataid.dbpedia.org/databus#',
        sec: 'https://w3id.org/security#',
        cert: 'http://www.w3.org/ns/auth/cert#',
        foaf: 'http://xmlns.com/foaf/0.1/',
        dbo: 'http://dbpedia.org/ontology/',
        "databus-cv": 'https://dataid.dbpedia.org/databus-cv#'
      }

    });

   


    /*
    if(ctrl.autoSize) {

     var styleSheet = document.createElement("style")
     styleSheet.innerText = ".CodeMirror { height: auto !important; } .CodeMirror-vscrollbar { display: none !important; } .resizeWrapper { display: none !important; }";
     ctrl.textField[0].appendChild(styleSheet)
    }

    ctrl.yasr.on('change', function() {
      ctrl.query = ctrl.yasqe.getValue();
      ctrl.valid = !ctrl.yasqe.queryValid;

      if(!$scope.$root.$$phase) {
        ctrl.$scope.$apply();
      }

      ctrl.onChange();
    });

   ctrl.yasqe.setValue(ctrl.query);*/
  }


  ctrl.$doCheck = function () {
    var dataString = JSON.stringify(ctrl.data);
    if (ctrl.yasr != undefined && dataString != ctrl.currentDataString) {
      ctrl.yasr.setResponse(ctrl.data)
      ctrl.currentDataString = dataString;
    }


    /*
    setTimeout(function() {
      ctrl.yasqe.refresh();
    }, 10);*/
  }
}

module.exports = YasrViewController;

/***/ },

/***/ "./js/page-controller/account-controller.js"
/*!**************************************************!*\
  !*** ./js/page-controller/account-controller.js ***!
  \**************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionManager = __webpack_require__(/*! ../collections/databus-collection-manager */ "./js/collections/databus-collection-manager.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const TabNavigation = __webpack_require__(/*! ../utils/tab-navigation */ "./js/utils/tab-navigation.js");

var DEFAULT_IMAGE = "https://picsum.photos/id/223/320/320";

// Controller for the header section

/**
 * 
 * @param {*} $scope 
 * @param {*} $http 
 * @param {*} $location 
 * @param {DatabusCollectionManager} collectionManager 
 * @returns 
 */
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

    function onCollectionManagerInitialized() {
      for (let guid in $scope.collectionManager.local) {
        let collection = $scope.collectionManager.local[guid];

        if(collection.accountName == undefined && collection.uri != undefined) {
          collection.accountName = DatabusUtils.getFirstSegment(collection.uri);
        }

        if (collection.accountName == $scope.accountName) {
          $scope.collectionList.push(collection);
        }
      }
    }

    $scope.collectionList = [];

    if(collectionManager.isInitialized) {
      onCollectionManagerInitialized();
    } else {
      collectionManager.subscribeOnInitialized(onCollectionManagerInitialized);
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
  $scope.collectionSearch.sortProperties = [
    { key: 'title', label: 'Title' },
    { key: 'issued', label: 'Issued Date' },
  ];
  $scope.collectionSearch.sortReverse = false;
  $scope.collectionSearch.toggleSort = function (value) {
    if ($scope.collectionSearch.sortProperty == value) {
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
  $scope.createCopy = function (collection) {
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

/***/ },

/***/ "./js/page-controller/artifact-controller.js"
/*!***************************************************!*\
  !*** ./js/page-controller/artifact-controller.js ***!
  \***************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionWrapper = __webpack_require__(/*! ../collections/databus-collection-wrapper */ "./js/collections/databus-collection-wrapper.js");
const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const DataIdCreator = __webpack_require__(/*! ../publish/dataid-creator */ "./js/publish/dataid-creator.js");
const QueryBuilder = __webpack_require__(/*! ../query-builder/query-builder */ "./js/query-builder/query-builder.js");
const QueryNode = __webpack_require__(/*! ../query-builder/query-node */ "./js/query-builder/query-node.js");
const QueryTemplates = __webpack_require__(/*! ../query-builder/query-templates */ "./js/query-builder/query-templates.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const TabNavigation = __webpack_require__(/*! ../utils/tab-navigation */ "./js/utils/tab-navigation.js");

// hinzufügen eines Controllers zum Modul
function ArtifactPageController($scope, $http, $sce, $location, collectionManager) {

  $scope.collectionManager = collectionManager;
  $scope.authenticated = data.auth.authenticated;
  $scope.auth = data.auth;
  $scope.utils = new DatabusWebappUtils($scope, $sce);
  $scope.accountName = $scope.utils.getAccountName();

  $scope.tabNavigation = new TabNavigation($scope, $location, [
    'files', 'versions', 'edit'
  ]);

  $scope.versions = data.versions;
  $scope.artifact = data.artifact;
  $scope.accountName = DatabusUtils.uriToName(DatabusUtils.navigateUp($scope.artifact.uri, 2));
  $scope.canEdit = $scope.accountName != null;
  $scope.pageTitle = DatabusUtils.stringOrFallback($scope.artifact.title,
    DatabusUtils.uriToTitle($scope.artifact.uri));

  if (data.auth.authenticated && $scope.canEdit) {

    $scope.formData = {};
    $scope.formData.group = {};
    $scope.formData.group.name = DatabusUtils.uriToName(DatabusUtils.navigateUp($scope.artifact.uri));
    $scope.formData.artifact = {};

    var abstract = DatabusUtils.createAbstractFromDescription($scope.artifact.description);
    $scope.formData.artifact.generateAbstract = abstract == $scope.artifact.abstract;
    $scope.formData.artifact.name = $scope.artifact.name;
    $scope.formData.artifact.title = $scope.artifact.title;
    $scope.formData.artifact.abstract = $scope.artifact.abstract;
    $scope.formData.artifact.description = $scope.artifact.description;

    $scope.dataidCreator = new DataIdCreator($scope.formData,  $scope.accountName);
  }

  $scope.fileSelector = {};
  $scope.fileSelector.config = {};
  $scope.fileSelector.config.authenticated = $scope.authenticated;
  $scope.fileSelector.config.columns = [];
  $scope.fileSelector.config.columns.push({ field: 'version', label: 'Version', width: '30%' });
  $scope.fileSelector.config.columns.push({ field: 'variant', label: 'Variant', width: '30%' });
  $scope.fileSelector.config.columns.push({ field: 'format', label: 'Format', width: '12%' });
  $scope.fileSelector.config.columns.push({ field: 'compression', label: 'Compression', width: '12%' });

  $scope.artifactNode = new QueryNode($scope.artifact.uri, 'databus:artifact');
  $scope.artifactNode.setFacet('http://purl.org/dc/terms/hasVersion', '$latest', true);

  $scope.groupNode = new QueryNode(DatabusUtils.navigateUp($scope.artifact.uri), 'databus:group');
  $scope.groupNode.addChild($scope.artifactNode);

  $scope.collectionWidgetSelectionData = {};
  $scope.collectionWidgetSelectionData.groupNode = $scope.groupNode;

  $scope.onFacetSettingsChanged = function () {
    $scope.fileSelector.query = QueryBuilder.build({
      node: $scope.artifactNode,
      template: QueryTemplates.DEFAULT_FILE_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });

    $scope.fileSelector.fullQuery = QueryBuilder.build({
      node: $scope.artifactNode,
      template: QueryTemplates.GROUP_PAGE_FILE_BROWSER_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });
  }

  $scope.onFacetSettingsChanged();


  $scope.onFileSelectionChanged = function (numFiles, totalSize) {
    $scope.fileSelector.numFiles = numFiles;
    $scope.fileSelector.totalSize = totalSize;
  };

  $scope.formatId = function (id) {
    return DatabusCollectionUtils.formatId(id);
  };

  $scope.addArtifactNodeToCollection = function () {

    if ($scope.collectionManager.activeCollection == null) {
      return;
    }

    var wrapper = new DatabusCollectionWrapper($scope.collectionManager.activeCollection);
    wrapper.addArtifactNode(
      $scope.artifact.uri,
      $scope.artifact.title,
      $scope.fileSelector.settings);

    $scope.collectionManager.saveLocally();
    $scope.statusCode = 1;
  };

  $scope.changeCollection = function (collection) {
    if (!$scope.authenticated) {
      return;
    }

    $scope.collectionManager.setActive(collection.uuid);
  }


  $scope.hideAutofill = function () {
    $scope.fileSelector.clearAutofill(function () {
      $scope.$apply();
    });
  }


  $scope.onDescriptionChanged = function () {
    if ($scope.formData == null) {
      return;
    }

    if (!$scope.formData.artifact.generateAbstract) {
      return;
    }

    $scope.formData.artifact.abstract =
      DatabusUtils.createAbstractFromDescription($scope.formData.artifact.description);
  }

  $scope.resetEdits = function () {
    $scope.formData.artifact.title = $scope.artifact.title;
    $scope.formData.artifact.abstract = $scope.artifact.abstract;
    $scope.formData.artifact.description = $scope.artifact.description;
  }

  $scope.saveArtifact = async function () {

    if ($scope.dataidCreator == null) {
      return;
    }

    var artifactUpdate = $scope.dataidCreator.createArtifactUpdate();

    var response = await $http.post(`/api/register`, artifactUpdate);

    if (response.status == 200) {
      $scope.artifact.title = $scope.formData.artifact.title;
      $scope.artifact.abstract = $scope.formData.artifact.abstract;
      $scope.artifact.description = $scope.formData.artifact.description;

      $scope.pageTitle = DatabusUtils.stringOrFallback($scope.artifact.title,
        DatabusUtils.uriToTitle($scope.artifact.uri));

      DatabusAlert.alert($scope, true, "Artifact Saved!");
      $scope.$apply();
    }
  }


}


module.exports = ArtifactPageController;


/***/ },

/***/ "./js/page-controller/collection-controller.js"
/*!*****************************************************!*\
  !*** ./js/page-controller/collection-controller.js ***!
  \*****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionUtils = __webpack_require__(/*! ../collections/databus-collection-utils */ "./js/collections/databus-collection-utils.js");
const DatabusCollectionWrapper = __webpack_require__(/*! ../collections/databus-collection-wrapper */ "./js/collections/databus-collection-wrapper.js");
const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");

function CollectionController($scope, $sce, $http, collectionManager) {

  $scope.auth = data.auth;
  $scope.collection = new DatabusCollectionWrapper(data.collection);
  $scope.authenticated = data.auth.authenticated;
  $scope.activeTab = 0;
  $scope.collectionManager = collectionManager;

  // Make some util functions available in the template
  $scope.utils = new DatabusWebappUtils($scope, $sce);
  $scope.accountName = $scope.utils.getAccountName();

  $scope.isOwn = false;

  if ($scope.authenticated) {
    $scope.collectionAccountName = DatabusUtils.uriToName(DatabusUtils.navigateUp($scope.collection.uri, 2));
    $scope.isOwn = $scope.accountName === $scope.collectionAccountName;
  }


  $scope.collectionViewModel = {};
  $scope.collectionViewModel.downloadScript = [];
  $scope.collectionViewModel.downloadScript.length = 3;
  $scope.collectionViewModel.downloadScript[0] = `query=$(curl -H "Accept:text/sparql" ${$scope.collection.uri})`;
  $scope.collectionViewModel.downloadScript[1] = `files=$(curl -X POST -H "Accept: text/csv" --data-urlencode "query=\${query}" ${DATABUS_RESOURCE_BASE_URL}/sparql | tail -n +2 | sed 's/\\r$//' | sed 's/"//g')`;
  $scope.collectionViewModel.downloadScript[2] = `while IFS= read -r file ; do wget $file; done <<< "$files"`;

  $scope.collectionViewModel.downloadManual = 'To fetch the query via *curl* run \n``` shell\n'
    + $scope.collectionViewModel.downloadScript[0] + '\n```'
    + '\n\n\nTo download the files additionally run\n``` shell\n'
    + $scope.collectionViewModel.downloadScript[1] + '\n'
    + $scope.collectionViewModel.downloadScript[2]
    + '\n```';

  $scope.collectionQuery = $scope.collection.createQuery();
  $scope.collectionManager = collectionManager;
  $scope.collectionFiles = "";


  DatabusCollectionUtils.getCollectionFileURLs($http, $scope.collection).then(function (result) {
    $scope.collectionFiles = result;
    $scope.$apply();
  }, function (err) {
    console.log(err);
  });


  if ($scope.authenticated) {
    $scope.username = data.auth.info.username;
  }

  $scope.formatUploadSize = function (size) {
    return DatabusUtils.formatFileSize(size);
  };



  $scope.editCopy = function () {
    if (!$scope.collectionManager.isInitialized) {
      return;
    }

    let localCopy = $scope.collectionManager.createCopy($scope.collection);

    window.location.href = `/app/collection-editor?uuid${localCopy.uuid}`;
  }

  $scope.createSnapshot = function () {
    if (!$scope.collectionManager.isInitialized) {
      return;
    }


    let collectionSnapshot = $scope.collectionManager.createSnapshot($scope.collection);
    window.location.href = `/app/collection-editor?uuid${collectionSnapshot.uuid}`;
  }

  
  $scope.editCollection = function () {

    if (!$scope.collectionManager.isInitialized) {
      return;
    }

    let localCopy = $scope.collectionManager.getCollectionByUri($scope.collection.uri);

    /// TODO Fabian - das sollte nicht passieren!
    if (localCopy === null) {
      console.log("editCollection failed. There is no collection with that uri: " + $scope.collection.uri)
      $scope.editCopy();
      return;
    }

    window.location.href = `/app/collection-editor?uuid=${localCopy.uuid}`;
  }


  $scope.downloadAsJson = function () {
    DatabusCollectionUtils.exportToJsonFile($scope.collection);
  }

  $scope.queryToClipboard = function () {

    $scope.utils.copyToClipboard($scope.collectionQuery);
    DatabusAlert.alert($scope, true, DatabusMessages.GENERIC_COPIED_TO_CLIPBOARD);

  }

  $scope.openInYasgui = function () {
    window.location.href = 'https://databus.dbpedia.org/yasgui?query=' + encodeURIComponent($scope.collectionQuery);
  }

  $scope.bashScriptToClipboard = function () {

    var bashscript = `${$scope.collectionViewModel.downloadScript[0]}
${$scope.collectionViewModel.downloadScript[1]}
${$scope.collectionViewModel.downloadScript[2]}`

    $scope.utils.copyToClipboard(bashscript);
    DatabusAlert.alert($scope, true, DatabusMessages.GENERIC_COPIED_TO_CLIPBOARD);
  }


  $scope.filesToClipboard = function () {
    $scope.utils.copyToClipboard($scope.collectionFiles);
    DatabusAlert.alert($scope, true, DatabusMessages.GENERIC_COPIED_TO_CLIPBOARD);
  }

}

module.exports = CollectionController;


/***/ },

/***/ "./js/page-controller/collections-editor-controller.js"
/*!*************************************************************!*\
  !*** ./js/page-controller/collections-editor-controller.js ***!
  \*************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionUtils = __webpack_require__(/*! ../collections/databus-collection-utils */ "./js/collections/databus-collection-utils.js");
const DatabusCollectionWrapper = __webpack_require__(/*! ../collections/databus-collection-wrapper */ "./js/collections/databus-collection-wrapper.js");
const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const QueryNode = __webpack_require__(/*! ../query-builder/query-node */ "./js/query-builder/query-node.js");
const DatabusMessages = __webpack_require__(/*! ../utils/databus-messages */ "./js/utils/databus-messages.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const TabNavigation = __webpack_require__(/*! ../utils/tab-navigation */ "./js/utils/tab-navigation.js");

/**
 * Controls the collection editor page
 * @param {*} $scope 
 * @param {*} $timeout 
 * @param {*} $http 
 * @param {*} $location 
 * @param {*} collectionManager 
 * @returns 
 */
async function CollectionsEditorController($scope, $timeout, $http, $location, collectionManager) {

  $scope.auth = data.auth;
  $scope.authenticated = data.auth.authenticated;
  $scope.baseUrl = DATABUS_RESOURCE_BASE_URL;

  // Check for proper authentication
  if (!$scope.authenticated) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  $scope.uuid = params.get('uuid');

  // Make some util functions available in the template
  $scope.utils = new DatabusWebappUtils($scope);
  $scope.collectionManager = collectionManager;
  
  let collection = $scope.collectionManager.local[$scope.uuid];

  if(collection == null) {
    // No working copy found
    return;
  }

  try {
      let collection = $scope.collectionManager.local[$scope.uuid];
      await $scope.collectionManager.tryInitialize(collection.accountName);
    } catch(err) {

    }

  $scope.collectionManager.setActive($scope.uuid);
  let activeCollection = $scope.collectionManager.activeCollection;
  
  $scope.accountName = $scope.utils.getOwnedAccountName(activeCollection.accountName);
  $scope.hasAccount = $scope.accountName != undefined;

  //if (!$scope.hasAccount) {
  //  return;
  //}

  // Create a tab navigation object for the tab navigation with locato
  $scope.tabNavigation = new TabNavigation($scope, $location, [
    'docu', 'content', 'preview', 'query', 'json', 'import'
  ]);

  // Make the manager available in the template
 //  $scope.collectionManager.setActiveCollection($scope.guid);

  // Form data object for input errors and extra fields and toggles
  $scope.form = {};
  $scope.form.title = {};
  $scope.form.identifier = {};
  $scope.form.identifier.value = "";
  $scope.form.abstract = {};
  $scope.form.description = {};
  $scope.form.isHidden = $scope.collectionManager.activeCollection.issued == undefined;
  $scope.form.collectionPublishTag = '';
  var description = $scope.collectionManager.activeCollection.description;
  var generatedAbstract = DatabusUtils.createAbstractFromDescription(description);
  $scope.form.generateAbstract = $scope.collectionManager.activeCollection.abstract == generatedAbstract;

  /**
   * Triggered when the description field gets changed.
   * Generates an abstract from the description. 
   * @returns 
   */
  $scope.onDescriptionChanged = function () {
    if ($scope.form == null) {
      return;
    }

    if ($scope.form.generateAbstract) {
      var description = $scope.collectionManager.activeCollection.description;
      var generatedAbstract = DatabusUtils.createAbstractFromDescription(description);
      $scope.collectionManager.activeCollection.abstract = generatedAbstract;
    }

    // Triggers saving to the local storage
    $scope.onActiveCollectionChanged();
  }


  /**
   * Called whenever an input field or similar gets changed. Persists the local changes in the local storage
   */
  $scope.onActiveCollectionChanged = function () {

    let collection = $scope.collectionManager.activeCollection;

    // Save to storage
    if ($scope.collectionManager.isInitialized) {
      $scope.collectionManager.saveLocally();
    }

    // Refresh query and json representation
    $scope.collectionQuery = new DatabusCollectionWrapper(collection).createQuery();
    $scope.collectionJson = $scope.getCollectionJson();

    if (collection != null) {
      collection.hasLocalChanges = $scope.collectionManager.hasLocalChanges(collection);
    }

    DatabusCollectionUtils.checkCollectionForm($scope.form, collection)
  }

  $scope.getStatusMessage = function (code) {
    return DatabusResponse.Message[code];
  }

  $scope.getStatusSuccess = function () {
    return $scope.statusCode >= 2000 && $scope.statusCode < 3000;
  }

  $scope.resetStatus = function () {
    $scope.statusCode = 0;
  }

  $scope.preview = function () {
    if ($scope.collectionManager.activeCollection.isDraft) {
      return;
    }

    var identifier = DatabusUtils.uriToName($scope.collectionManager.activeCollection.uri);
    window.location.href = `/${$scope.accountName}/collections/${identifier}`;
  }

  /**
   * Saves the collection to the remote server
   * @returns 
   */
  $scope.saveCollection = async function () {

    try {
      // Needs initialized CM
      if (!$scope.collectionManager.isInitialized) {
        return;
      }

      let collection = $scope.collectionManager.activeCollection;

      // Check whether the form values are correct
      if (!DatabusCollectionUtils.checkCollectionForm($scope.form, collection)) {
        return;
      }

      // Look for an existing identifier
      var identifier = undefined;

      // Either take the identifier from the form (draft) or the collection uri (published)
      if (collection.isDraft) {
        identifier = $scope.form.identifier.value;
      } else {
        identifier = DatabusUtils.uriToName($scope.collectionManager.activeCollection.uri);
      }

      $scope.isSaving = true;
      $scope.collectionManager.updateCollection($scope.accountName, identifier).then(function (response) {
        DatabusAlert.alert($scope, true, DatabusMessages.CEDIT_COLLECTION_SAVED);
        $scope.isSaving = false;
        $scope.$apply();
      }).catch(function (err) {
        console.log(err);
        DatabusAlert.alert($scope, false, DatabusMessages.CEDIT_COLLECTION_SAVE_FAILED);
        $scope.isSaving = false;
        $scope.$apply();
      });

    } catch (err) {
      console.log(err);
      DatabusAlert.alert($scope, false, err);
    }
  }

  $scope.unpublishCollection = async function () {

    if ($scope.collectionManager.activeCollection.isDraft) {
      return;
    }

    try {
      await $scope.collectionManager.unpublishActiveCollection();
      DatabusAlert.alert($scope, true, DatabusMessages.CEDIT_COLLECTION_UNPUBLISHED);
    } catch (err) {
      DatabusAlert.alert($scope, false, err);
      console.log(err);
    }
  }

  $scope.showDeleteModal = function () {
    $scope.deleteModalVisible = true;
  }

  $scope.hideDeleteModal = function () {
    $scope.deleteModalVisible = false;
  }

  $scope.deleteCollection = function () {
    if (!$scope.collectionManager.isInitialized) {
      return;
    }

    $scope.deleteModalVisible = false;

    $scope.collectionManager.deleteCollection($scope.username, $scope.form.identifier.value).then(function (response) {
      $scope.statusCode = response.code;
      $scope.collectionManager.selectFirstOrCreate();
      $scope.setActiveCollection($scope.collectionManager.activeCollection);
      $scope.$apply();
      $timeout($scope.resetStatus, $scope.modalTime);
    }).catch(function (err) {
      $scope.statusCode = err.code;
      $scope.$apply();
      $timeout($scope.resetStatus, $scope.modalTime);
    });
  }


  $scope.deleteLocally = function () {
    if (!$scope.collectionManager.isInitialized) {
      return;
    }

    if (!$scope.collectionManager.activeCollection.isDraft) {
      return;
    }

    $scope.collectionManager.deleteLocally();
    window.location.href = `/${$scope.accountName}/collections`;
  }

  $scope.downloadAsJson = function () {
    DatabusCollectionUtils.exportToJsonFile($scope.collectionManager.activeCollection);
  }

  /**
   * Discard local changes of the active collection and revert to the remote collection state
   * @returns 
   */
  $scope.discardChanges = function () {

    if (!$scope.collectionManager.activeCollection.hasLocalChanges) {
      return;
    }

    if ($scope.collectionManager.activeCollection.isDraft) {
      return;
    }

    $scope.collectionManager.discardLocalChanges();
    DatabusAlert.alert($scope, true, DatabusMessages.CEDIT_LOCAL_CHANGES_DISCARDED);
  }


  $scope.showLoadFromJson = function () {
    $scope.isLoadFromJsonVisible = true;
  }

  $scope.hideLoadFromJson = function () {
    $scope.isLoadFromJsonVisible = false;
  }

  $scope.loadFromJsonString = '';

  $scope.loadFromJson = function (loadFromJsonString) {
    try {

      
      var toLoad = JSON.parse(loadFromJsonString);

      var target = $scope.collectionManager.activeCollection;

      if (toLoad.label != undefined) {
        target.title = toLoad.label;
      }

      if (toLoad.title != undefined) {
        target.title = toLoad.title;
      }

      target.description = toLoad.description;
      target.abstract = toLoad.abstract;

      if (toLoad.content.generatedQuery != undefined || toLoad.content.customQueries) {
        // Datbaus 1.0 Syntax detected
        var replacedJson = loadFromJsonString
          .replace("dataid:", "databus:")
          .replace("http://dataid.dbpedia.org/ns/cv#",
          DatabusUris.DATABUS_CONTENT_VARIANT_PREFIX);

        var toLoad = JSON.parse(replacedJson);
        var databusNode = new QueryNode(DATABUS_RESOURCE_BASE_URL, null);

        target.content.root = new QueryNode(null, null);
        target.content.root.addChild(databusNode);

        for(var groupNode of toLoad.content.generatedQuery.root.childNodes) {
          databusNode.addChild(groupNode);
        }

        for(var customNode of toLoad.content.customQueries) {

          var label = customNode.label;
          var query = customNode.query;

          databusNode.addChild(new QueryNode(label, query));
        }

      } else {
        target.content = toLoad.content;
      }

      DatabusAlert.alert($scope, true, DatabusMessages.CEDIT_COLLECTION_IMPORTED);
      $scope.isLoadFromJsonVisible = false;
    } catch (e) {
      $scope.statusCode = DatabusMessages.CEDIT_COLLECTION_IMPORT_FAILED;
      console.log(e);
    }
  }

  $scope.getCollectionJson = function () {
    var copy = DatabusCollectionUtils.createCleanCopy($scope.collectionManager.activeCollection);
    delete copy.uuid;
    return copy;
  }

  $scope.onActiveCollectionChanged();
}

module.exports = CollectionsEditorController;

/***/ },

/***/ "./js/page-controller/frontpage-controller.js"
/*!****************************************************!*\
  !*** ./js/page-controller/frontpage-controller.js ***!
  \****************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");

/**
 * Controller of the front page
 * @param  {scope} $scope      [description]
 * @param  {http} $http       [description]
 * @param  {sce} $sce        [description]
 */
function FrontPageController($scope, $sce, $http) {

  $scope.databusName = DATABUS_NAME;

  $scope.auth = data.auth;

  $scope.activityChartData = {};
  $scope.activityChartData.isLoading = true;
  $scope.utils = new DatabusWebappUtils();

  $scope.searchQuery = "";
  $scope.searchSettings = {
    minRelevance: 20,
    maxResults: 25,
    placeholder: `Search the Databus...`,
    resourceTypes: undefined,
    filter: `&typeNameWeight=0`
  };

  $http.get(`/app/index/activity`).then(function (response) {
    $scope.activityChartData.entries = response.data;
    $scope.activityChartData.isLoading = false;
  }, function (err) {
    console.log(err);
  });

  $scope.uploadRankingData = {};
  $scope.uploadRankingData.isLoading = true;

  $http.get(`/app/index/ranking`).then(function (response) {
    $scope.uploadRankingData.data = response.data;
    $scope.uploadRankingData.isLoading = false;
  }, function (err) {
    console.log(err);
  });

  $scope.recentUploadsData = {};
  $scope.recentUploadsData.isLoading = true;

  $http.get(`/app/index/recent`).then(function (response) {
    $scope.recentUploadsData.data = response.data;
    $scope.recentUploadsData.isLoading = false;
  }, function (err) {
    console.log(err);
  });

   // Login function
   $scope.login = function () {
    window.location = '/app/login?redirectUrl=' + encodeURIComponent(window.location);
  }

  $scope.goToPage = function(path) {
    window.location = path;
  }

  $scope.account = function() {
    window.location = '/app/account';
  }

  for(var d in $scope.uploadRankingData) {
    $scope.uploadRankingData[d].uploadSize = DatabusUtils.formatFileSize($scope.uploadRankingData[d].uploadSize);
  }

  for(var d in $scope.recentUploadsData) {
    $scope.recentUploadsData[d].date = DatabusUtils.formatDate($scope.recentUploadsData[d].date);
  }
}


module.exports = FrontPageController;


/***/ },

/***/ "./js/page-controller/group-controller.js"
/*!************************************************!*\
  !*** ./js/page-controller/group-controller.js ***!
  \************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionWrapper = __webpack_require__(/*! ../collections/databus-collection-wrapper */ "./js/collections/databus-collection-wrapper.js");
const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const DataIdCreator = __webpack_require__(/*! ../publish/dataid-creator */ "./js/publish/dataid-creator.js");
const QueryBuilder = __webpack_require__(/*! ../query-builder/query-builder */ "./js/query-builder/query-builder.js");
const QueryNode = __webpack_require__(/*! ../query-builder/query-node */ "./js/query-builder/query-node.js");
const QueryTemplates = __webpack_require__(/*! ../query-builder/query-templates */ "./js/query-builder/query-templates.js");
const DatabusConstants = __webpack_require__(/*! ../utils/databus-constants */ "./js/utils/databus-constants.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const TabNavigation = __webpack_require__(/*! ../utils/tab-navigation */ "./js/utils/tab-navigation.js");

function GroupPageController($scope, $http, $sce, $interval, $location, collectionManager) {

  $scope.group = data.group;
  // $scope.accountName = DatabusUtils.uriToName(DatabusUtils.navigateUp($scope.group.uri));
  $scope.auth = data.auth;

  $scope.utils = new DatabusWebappUtils($scope, $sce);
  $scope.accountName = $scope.utils.getAccountName();


  $scope.tabNavigation = new TabNavigation($scope, $location, [
    'files', 'artifacts', 'edit'
  ]);

  $scope.dataSearchInput = "";
  $scope.dataSearchSettings = {
    minRelevance: 0.01,
    maxResults: 10,
    placeholder: `Search ${$scope.accountName}'s data...`,
    resourceTypes: ['Artifact'],
    filter: `&publisher=${$scope.accountName}&typeNameWeight=0&group=${$scope.group.name}`
  };


  $scope.group.hasData = false;
  $scope.group.hasArtifacts = false;
  $scope.isLoading = true;

  $http({
    method: 'GET',
    url: `/app/group/get-artifacts?uri=${encodeURIComponent($scope.group.uri)}`
  }).then(function successCallback(response) {

    $scope.artifacts = response.data;

    for (var artifact of $scope.artifacts) {
      if (artifact.latestVersionDate != undefined) {
        $scope.group.hasData = true;
      }

      artifact.title = DatabusUtils.stringOrFallback(artifact.title, artifact.latestVersionTitle);
      artifact.abstract = DatabusUtils.stringOrFallback(artifact.abstract, artifact.latestVersionAbstract);
      artifact.description = DatabusUtils.stringOrFallback(artifact.description, artifact.latestVersionDescription);
    }

    $scope.group.hasArtifacts = $scope.artifacts.length > 0;
    $scope.isLoading = false;
  }, function errorCallback(response) {
    $scope.isLoading = false;
  });


  $scope.pageTitle = DatabusUtils.stringOrFallback($scope.group.title,
    DatabusUtils.uriToTitle($scope.group.uri));


  $scope.canEdit = $scope.accountName != null;

  if (data.auth.authenticated && $scope.canEdit) {

    var abstract = DatabusUtils.createAbstractFromDescription($scope.group.description);
    $scope.formData = {};
    $scope.formData.group = {};
    $scope.formData.group.generateAbstract = abstract == $scope.group.abstract;
    $scope.formData.group.name = $scope.group.name;
    $scope.formData.group.title = $scope.group.title;
    $scope.formData.group.abstract = $scope.group.abstract;
    $scope.formData.group.description = $scope.group.description;

    $scope.dataidCreator = new DataIdCreator($scope.formData,  $scope.accountName);
  }

  $scope.onDescriptionChanged = function () {
    if ($scope.formData == null) {
      return;
    }

    if (!$scope.formData.group.generateAbstract) {
      return;
    }

    $scope.formData.group.abstract =
      DatabusUtils.createAbstractFromDescription($scope.formData.group.description);
  }

  $scope.resetEdits = function () {
    $scope.formData.group.title = $scope.group.title;
    $scope.formData.group.abstract = $scope.group.abstract;
    $scope.formData.group.description = $scope.group.description;
  }

  $scope.saveGroup = async function () {

    if ($scope.dataidCreator == null) {
      return;
    }

    var groupUpdate = $scope.dataidCreator.createGroupUpdate();

    var relativeUri = new URL($scope.group.uri).pathname;
    var response = await $http.post('/api/register', groupUpdate);

    if (response.status == 200) {
      $scope.group.title = $scope.formData.group.title;
      $scope.group.abstract = $scope.formData.group.abstract;
      $scope.group.description = $scope.formData.group.description;


      $scope.pageTitle = DatabusUtils.stringOrFallback($scope.group.title,
        DatabusUtils.uriToTitle($scope.group.uri));

      DatabusAlert.alert($scope, true, "Group Saved!");
      $scope.$apply();
    }
  }

  $scope.facetsView = {};
  $scope.facetsView.resourceUri = $scope.group.uri;
  $scope.facetsView.settings = [];
  $scope.facetsView.parentSettings = null;
  $scope.authenticated = data.auth.authenticated;
  $scope.selection = [];

  $scope.input = {};
  $scope.input.search = '';
  $scope.searchCooldown = 500;
  $scope.searchChanged = true;
  $scope.searchReady = true;

  $scope.fileSelector = {};
  $scope.fileSelector.config = {};
  $scope.fileSelector.config.authenticated = $scope.authenticated;
  $scope.fileSelector.config.columns = [];
  $scope.fileSelector.config.columns.push({ field: 'artifact', label: 'Artifact', width: '30%', uriToName: true });
  $scope.fileSelector.config.columns.push({ field: 'version', label: 'Version', width: '21%' });
  $scope.fileSelector.config.columns.push({ field: 'variant', label: 'Variant', width: '16%' });
  $scope.fileSelector.config.columns.push({ field: 'format', label: 'Format', width: '9%' });
  $scope.fileSelector.config.columns.push({ field: 'compression', label: 'Compression', width: '6%' });

  $scope.groupNode = new QueryNode($scope.group.uri, 'databus:group');
  $scope.groupNode.setFacet('http://purl.org/dc/terms/hasVersion', DatabusConstants.FACET_LATEST_VERSION_VALUE, true);

  $scope.onFacetSettingsChanged = function () {
    $scope.fileSelector.query = QueryBuilder.build({
      node: $scope.groupNode,
      template: QueryTemplates.DEFAULT_FILE_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });

    $scope.fileSelector.fullQuery = QueryBuilder.build({
      node: $scope.groupNode,
      template: QueryTemplates.GROUP_PAGE_FILE_BROWSER_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });
  }

  // $scope.onFacetSettingsChanged();

  $scope.collectionWidgetSelectionData = {};
  $scope.collectionWidgetSelectionData.groupNode = $scope.groupNode;

  $scope.onFileQueryResult = function (args) {
    if (args == null) return;
    $scope.collectionWidgetSelectionData.query = args.query;
  }

  $scope.collectionManager = collectionManager;

  $scope.findArtifact = function (uri) {
    return $scope.artifacts.find(function (a) { a.uri === uri; });
  }

  $scope.formatResult = function (result) {
    return $sce.trustAsHtml(result);
  }


  $scope.formatLicense = function (licenseUri) {
    var licenseName = DatabusUtils.uriToName(licenseUri);

    var html = '<div class="license-icon">' + licenseName + '</div>'
    return $sce.trustAsHtml(html);
  }

  for (var a in $scope.artifacts) {
    $scope.artifacts[a].date = $scope.formatDate($scope.artifacts[a].date);
    $scope.artifacts[a].licenseTag = $scope.formatLicense($scope.artifacts[a].license);
  }

  $scope.setSelectionStateAll = function (val) {
    if (val) {
      for (var a in $scope.artifacts) {
        $scope.select($scope.artifacts[a]);
      }
    } else {
      for (var a in $scope.artifacts) {
        $scope.deselect($scope.artifacts[a]);
      }
    }
  }

  $scope.toggleSelect = function (artifact) {
    if ($scope.isSelected(artifact)) {
      $scope.deselect(artifact);
    } else {
      $scope.select(artifact);
    }
  }

  $scope.select = function (artifact) {
    artifact.isSelected = true;
    $scope.selection.push(artifact.uri);
  }

  $scope.deselect = function (artifact) {
    artifact.isSelected = false;
    $scope.selection = $scope.selection.filter(function (value, index, arr) {
      return value !== artifact.uri;
    });
  }

  $scope.isSelected = function (artifact) {
    for (var s in $scope.selection) {
      if ($scope.selection[s] === artifact.uri) {
        return true;
      }
    }
    return false;
  }

  $scope.changeCollection = function (collection) {
    $scope.collectionManager.setActive(collection.uuid);
    $scope.search();
  }

  $scope.showCollectionModal = function () {
    $('#add-to-collection-modal').addClass('is-active');
  }

  $scope.hideCollectionModal = function () {
    $('#add-to-collection-modal').removeClass('is-active');
  }

  $scope.markdownToHtml = function (markdown) {

    var converter = window.markdownit();
    return $sce.trustAsHtml(converter.render(markdown));
  };


  $scope.invokeSearch = function () {
    if ($scope.searchReady) {
      $scope.search();
      $scope.searchReady = false;
    } else {
      $scope.searchChanged = true;
    }
  }

  $interval(function () {
    if ($scope.searchChanged) {
      $scope.search();
      $scope.searchChanged = false;
    }
    $scope.searchReady = true;
  }, $scope.searchCooldown);


  $scope.addSelectionToCollection = function () {

    if ($scope.collectionManager.activeCollection == null) {
      return;
    }

    var wrapper = new DatabusCollectionWrapper($scope.collectionManager.activeCollection);

    for (var s in $scope.selection) {
      var artifact = $scope.artifacts.find(function (a) { return a.uri === $scope.selection[s]; });
      wrapper.addArtifactNode(artifact.uri, artifact.label);
    }
    $scope.collectionManager.saveLocally();
    $scope.search();
  }

  $scope.updateArtifactState = function (wrapper, artifact) {
    artifact.alreadyAdded = wrapper.hasArtifact(artifact.uri);
    artifact.isSelected = artifact.alreadyAdded || $scope.selection.includes(artifact.uri);
  }



  $scope.search = function () {

    $scope.searchResult = [];

    var typeFilters = `&publisher=${$scope.accountName}&publisherWeight=0&typeName=Artifact&typeNameWeight=0&group=${$scope.group.name}&minRelevance=0.1`;

    $http({
      method: 'GET',
      url: '/api/search?query=' + $scope.input.search + typeFilters
    }).then(function successCallback(response) {

      for (var r in response.data.docs) {
        var result = response.data.docs[r];

        for (var artifact of $scope.artifacts) {
          if (result.id[0] == artifact.uri) {
            $scope.searchResult.push(artifact);
          }
        }
      }
    }, function errorCallback(response) {
    });
  }
}

module.exports = GroupPageController;

/***/ },

/***/ "./js/page-controller/header-controller.js"
/*!*************************************************!*\
  !*** ./js/page-controller/header-controller.js ***!
  \*************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

var DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");

// Controller for the header section
function HeaderController($scope, $http, collectionManager, searchManager) {

  $scope.auth = data.auth;
  $scope.authenticated = data.auth.authenticated;

  $scope.utils = new DatabusWebappUtils($scope);
  $scope.accountName = $scope.utils.getAccountName();
  

  // Check for cookie settings
  $scope.databusCookieConsentKey = 'databus_cookie_consent';
  let cookieConsent = window.localStorage.getItem($scope.databusCookieConsentKey);
  $scope.showCookieDialogue = cookieConsent === undefined;

  $scope.collectionManager = collectionManager;

  if ($scope.authenticated) {

    $scope.collectionManager.tryInitialize($scope.accountName);
    // Collection Manager Init
    // Initialize search manager
    searchManager.initialize();
  } else {
    $scope.collectionManager.clearSession();
  }

  $scope.hideAccountMenu = function() {
    $scope.isAccountMenuActive = false;
  }

  $scope.showAccountMenu = function() {
    $scope.isAccountMenuActive = true;
  }

  // Finds a display name for the account
  $scope.getAccountName = function () {
    if ($scope.auth.info.accountName) {
      return $scope.auth.info.accountName;
    }

    if ($scope.auth.info.oidc_email) {
      return $scope.auth.info.oidc_email;
    }

    if ($scope.auth.info.oidc_name) {
      return $scope.auth.info.oidc_name;
    }

    return null;
  }

  $scope.isMenuActive = false;
  $scope.isAccountMenuActive = false;

  // Coookieees
  $scope.giveCookieConsent = function () {
    window.localStorage.setItem($scope.databusCookieConsentKey, true);
    $scope.showCookieDialogue = false;
  }

  // Login function
  $scope.login = function () {
    window.location = '/app/login?redirectUrl=' + encodeURIComponent(window.location);
  }

  // Logout function
  $scope.logout = function () {
    $scope.hideAccountMenu();
    window.location = '/app/logout?redirectUrl=' + encodeURIComponent(window.location);
  }

  // ???
  $scope.size = function () {
    if ($scope.collectionManager == null) {
      return "";
    }

    var first = $scope.collectionManager.current;
    return first != null ? first.elements.length : "";
  }
}

module.exports = HeaderController;


/***/ },

/***/ "./js/page-controller/profile-controller.js"
/*!**************************************************!*\
  !*** ./js/page-controller/profile-controller.js ***!
  \**************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const SearchAdapter = __webpack_require__(/*! ../search/search-adapter */ "./js/search/search-adapter.js");
const DatabusMessages = __webpack_require__(/*! ../utils/databus-messages */ "./js/utils/databus-messages.js");
const DatabusConstants = __webpack_require__(/*! ../utils/databus-constants */ "./js/utils/databus-constants.js");
const AppJsonFormatter = __webpack_require__(/*! ../utils/app-json-formatter */ "./js/utils/app-json-formatter.js");

function ProfileController($scope, $http) {

  $scope.account = data.account;
  $scope.auth = data.auth;

  if (data.owner != null) {
    $scope.account.apiKeys = data.owner.apiKeys;
  }
  $scope.auth = data.auth;
  $scope.preferredDatabusUsername = "";
  $scope.createApiKeyName = ""
  $scope.createAccountError = "";
  $scope.createApiKeyError = "";
  $scope.addWebIdUri = "";
  $scope.deleteAccountName = "";
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

      if ($scope.isSubmitting) {
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
      keyname: $scope.createApiKeyName
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

    } catch (error) {
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

  $scope.addSecretary = function (account) {
    if (!$scope.editData.secretaries) {
      $scope.editData.secretaries = [];
    }

    $scope.editData.secretaries.push({
      accountName: '',
      hasWriteAccessTo: []
    });
  };

  $scope.removeSecretary = function (account, index) {
    $scope.editData.secretaries.splice(index, 1);
  };

  $scope.addNamespace = function (account, secIndex) {
    $scope.editData.secretaries[secIndex].hasWriteAccessTo.push('');
  };

  $scope.removeNamespace = function (account, secIndex, nsIndex) {
    $scope.editData.secretaries[secIndex].hasWriteAccessTo.splice(nsIndex, 1);
  };


  $scope.onCreateApiKeyNameChanged = function () {
    var hasError = !DatabusUtils.isValidResourceLabel($scope.createApiKeyName, 3, 20);
    $scope.createApiKeyError = hasError ? " API key name must have between 3 and 20 characters and match [A-Za-z0-9\\s_()\\.\\,\\-]*" : "";
  }


  $scope.removeSearchExtension = function (uri) {
    $http.post(`/api/account/mods/search-extensions/remove?uri=${encodeURIComponent(uri)}`)
      .then(function (result) {
        console.log(result);
        DatabusAlert.alert($scope, true, result.data);

        $scope.account.searchExtensions = $scope.account.searchExtensions.filter(function (e) {
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


  $scope.deleteAccount = async function () {
    let account = $scope.account;
    let name = $scope.deleteAccountName;

    try {
      let response = await $http.post(`/api/account/delete`, { accountName: name });

      window.location = `/app/user`;

    } catch (err) {
      console.error(err);
      DatabusAlert.alert($scope, false, err.data);
    }

  }

  $scope.updateAccount = async function () {

    if (!$scope.auth.authenticated) {
      return;
    }

    let account = {};
    account.uri = $scope.editData.uri;

    account.accountName = $scope.editData.accountName;
    account.label = $scope.editData.label;
    account.status = $scope.editData.about;
    account.imageUrl = $scope.editData.imageUrl;
    account.secretaries = $scope.editData.secretaries;


    try {
      await $http.post(`/api/account/update`, account);
      DatabusAlert.alert($scope, true, "Account saved.");

    } catch (err) {
      console.error(err);
      DatabusAlert.alert($scope, false, err.data);
    }
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

/***/ },

/***/ "./js/page-controller/publish-wizard-controller.js"
/*!*********************************************************!*\
  !*** ./js/page-controller/publish-wizard-controller.js ***!
  \*********************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const PublishSession = __webpack_require__(/*! ../publish/publish-session */ "./js/publish/publish-session.js");
const TabNavigation = __webpack_require__(/*! ../utils/tab-navigation */ "./js/utils/tab-navigation.js");

// Controller for the header section
async function PublishWizardController($scope, $http, $interval, focus, $q, $location) {

  $scope.login = function () {
    window.location = '/app/login?redirectUrl=' + encodeURIComponent(window.location);
  }

  $scope.utils = new DatabusWebappUtils($scope);

  $scope.tabNavigation = new TabNavigation($scope, $location, [
    '', 'group', 'artifact', 'version'
  ]);


  $scope.createAccount = function () {
    window.location = '/app/user';
  }

  // Login function
  $scope.login = function () {
    window.location = '/app/login?redirectUrl=' + encodeURIComponent(window.location);
  }

  $scope.authenticated = data.auth.authenticated;
  $scope.loadRequestCount = 0;
  $scope.texts = data.texts;

  $scope.nerdMode = {};
  $scope.nerdMode.enabled = false;
  $scope.nerdMode.customJson = "";
  $scope.nerdMode.logLevelOptions = ['error', 'info', 'debug'];
  $scope.nerdMode.logLevel = 'error';

  // controller does not work without authentication
  if (!$scope.authenticated) {
    return;
  }

  let accounts = data.auth.info.accounts;
  $scope.hasAccount = accounts != undefined && accounts.length > 0;

  $scope.accounts = [];

  for(let account of accounts) {
    $scope.accounts.push({
      accountName: account.accountName,
      apiKeys: account.apiKeys
    });
  }

  if (!$scope.hasAccount) {
    return;
  }

  // $scope.session = await PublishSession.createOrResume($http, data.auth.sub, $scope.accounts);

  $scope.session = new PublishSession($http, $interval, $scope.accounts, $scope.apiKeys);

}
  /**
   * Fetches existing groups and artifacts
  
  $scope.getContentForAccount = async function (accountName) {

    $scope.isAccountDataLoading = true;
    var uri = `/app/account/content?account=${encodeURIComponent(accountName)}`;
    var response = await $http.get(uri);
    $scope.isAccountDataLoading = false;

    // Put account artifacts, groups and name in one object
    var accountData = response.data;
    accountData.accountName = accountName;

    accountData.publisherUris = [];
    for (var p of data.publisherData) {
      accountData.publisherUris.push(p.publisherUri);
    }

    $scope.session = new PublishSession($http);

    /*
    $scope.$watch('session', function () {
      $scope.session.onChange();
    }, true);

    $scope.$apply();
   
  }

  // $scope.getContentForAccount(data.auth.info.accounts[0]);

  /**
   * LICENSES
  

  

  $scope.addFile = function (input) {

    var session = $scope.session;

    if (input == undefined || input.length == 0) {
      return;
    }

    $scope.loadRequestCount++;

    $http.get('/app/publish-wizard/fetch-file?url=' + encodeURIComponent(input)).then(function (response) {

      $scope.loadRequestCount--;
      if (response.data == null || response.data == "" || response.status != 200) {
        return;
      }

      session.addFile(response.data);

    }, function (err) { });
  }

  $scope.objSize = function (obj) {
    return DatabusUtils.objSize(obj);
  }

  $scope.removeFile = function (fileGroup) {
    var files = $scope.session.formData.version.files;
    files.splice(files.findIndex(f => f.uri == fileGroup.uri), 1);
    $scope.session.formData.version.isConfigDirty = true;
  }

  $scope.hasError = function (errorList, error) {
    return errorList.includes(error);
  }

  // Fetch links using the fetch-links API of the Databus
  $scope.fetchFiles = function (parentUri) {

    $http.get('/app/publish-wizard/fetch-resource-page?url=' + encodeURIComponent(parentUri)).then(function (response) {
      for (var i in response.data) {
        var uri = response.data[i];
        $scope.addFile(uri);
      }
    }, function (err) {
    });
  }

  $scope.addFiles = function (input) {
    var lines = input.split('\n');

    for (var line of lines) {
      if (line != undefined && line.length > 0) {
        $scope.addFile(line);
      }
    }
  }

  $scope.createTractate = function () {
    $scope.creatingTractate = true;
    $http.post('/api/tractate/v1/canonicalize', $scope.session.inputs.dataid).then(function (response) {
      $scope.session.formData.signature.tractate = response.data;
      $scope.creatingTractate = false;
    }, function (err) {
      $scope.creatingTractate = false;
      console.log(err);
    });
  }


  $scope.customPublish = async function () {
    var options = {}
    options.headers = {
      'Accept': 'application/json, text/plain',
      'Content-Type': 'application/json',
    }


    $scope.isPublishing = true;
    $http.post(`/api/publish?fetch-file-properties=true&log-level=${$scope.nerdMode.logLevel}`, $scope.nerdMode.customJson, options)
      .then(function (response) {
        $scope.publishLog = response.data.log;
        $scope.isPublishing = false;
      }, function (err) {
        $scope.publishLog = err.data.log;
        $scope.isPublishing = false;
        console.log(err);
      });
  }


  $scope.publish = async function () {
    var options = {}
    options.headers = {
      'Accept': 'application/json, text/plain',
      'Content-Type': 'application/json',
    }

    $scope.isPublishing = true;
    $http.post('/api/publish?fetch-file-properties=true&log-level=info', $scope.session.inputs.all, options)
      .then(function (response) {
        $scope.publishLog = response.data.log;
        $scope.isPublishing = false;
      }, function (err) {
        $scope.publishLog = err.data.log;
        $scope.isPublishing = false;
        console.log(err);
      });
  } */




module.exports = PublishWizardController;

/***/ },

/***/ "./js/page-controller/sparql-editor-controller.js"
/*!********************************************************!*\
  !*** ./js/page-controller/sparql-editor-controller.js ***!
  \********************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

var DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const SparqlExamples = __webpack_require__(/*! ../utils/sparql-examples */ "./js/utils/sparql-examples.js");

// Controller for the header section
function SparqlEditorController($scope, $http, $location) {


  $scope.storageKey = `${DATABUS_RESOURCE_BASE_URL}/sparql`;

  $scope.auth = data.auth;
  $scope.authenticated = data.auth.authenticated;
  $scope.utils = new DatabusWebappUtils($scope);


  $scope.editor = {};



  $scope.$on('$locationChangeSuccess', function () {
    var hash = $location.hash();

    if (hash && hash.startsWith('query')) {
      var tabIndex = parseInt(hash.replace('query', '')) - 1;

      // Only change if the tab exists and is different from current
      if (!isNaN(tabIndex) &&
        tabIndex >= 0 &&
        tabIndex < $scope.queryData.pages.length &&
        $scope.queryData.activeTab !== tabIndex) {
        $scope.goToTab(tabIndex);
        $scope.$applyAsync();
      }
    }
  });

  $scope.editor.exampleQueries = {};
  $scope.editor.exampleQueries.label = "Databus Example Queries";
  $scope.editor.exampleQueries.children = [];

  var simpleQueries = {
    label: "Simple Queries",
    children: []
  };

  var intermediateQueries = {
    label: "Intermediate Queries",
    children: []
  };

  simpleQueries.children.push({
    label: "Select all Databus Groups",
    query: `PREFIX databus: <https://dataid.dbpedia.org/databus#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX sec: <https://w3id.org/security#>
PREFIX cert: <http://www.w3.org/ns/auth/cert#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX databus-cv: <https://dataid.dbpedia.org/databus-cv#>
PREFIX dbo: <http://dbpedia.org/ontology/>

SELECT DISTINCT * WHERE {
  ?s a databus:Group .
}`
  });

  simpleQueries.children.push({
    label: "Select all Databus Artifacts",
    query: `PREFIX databus: <https://dataid.dbpedia.org/databus#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX sec: <https://w3id.org/security#>
PREFIX cert: <http://www.w3.org/ns/auth/cert#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX databus-cv: <https://dataid.dbpedia.org/databus-cv#>
PREFIX dbo: <http://dbpedia.org/ontology/>

SELECT DISTINCT * WHERE {
  ?s a databus:Artifact .
}`
  });

  simpleQueries.children.push({
    label: "Select all Databus Versions",
    query: `PREFIX databus: <https://dataid.dbpedia.org/databus#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX sec: <https://w3id.org/security#>
PREFIX cert: <http://www.w3.org/ns/auth/cert#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX databus-cv: <https://dataid.dbpedia.org/databus-cv#>
PREFIX dbo: <http://dbpedia.org/ontology/>

SELECT DISTINCT * WHERE {
  ?s a databus:Version .
}`
  });

  intermediateQueries.children.push({
    label: "Latest Version of Artifact",
    query: `PREFIX databus: <https://dataid.dbpedia.org/databus#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX sec: <https://w3id.org/security#>
PREFIX cert: <http://www.w3.org/ns/auth/cert#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX databus-cv: <https://dataid.dbpedia.org/databus-cv#>
PREFIX dbo: <http://dbpedia.org/ontology/>

SELECT ?version WHERE
{
  GRAPH ?g
  {
    ?version databus:artifact <INSERT_ARTIFACT_URI_HERE> .
    ?version dct:hasVersion ?v . 
  }
} 
ORDER BY DESC (STR(?v)) LIMIT 1`
  });


  $scope.editor.exampleQueries.children.push(simpleQueries);
  $scope.editor.exampleQueries.children.push(intermediateQueries);

  $scope.onExampleQueryClicked = function (node) {

    if (node.query == null) {
      return;
    }

    $scope.createQueryPage();

    var queryPage = $scope.queryData.pages[$scope.queryData.activeTab];

    queryPage.query = node.query;
    $scope.saveToStorage();
  }

  $scope.goToTab = function (index) {
    $scope.queryData.activeTab = index;
    $scope.saveToStorage();

    $location.hash(`query${index + 1}`);


    var queryPage = $scope.queryData.pages[$scope.queryData.activeTab];

    if ($scope.resultCache != null && $scope.resultCache[queryPage.name] != null) {
      $scope.editor.result = $scope.resultCache[queryPage.name];
    } else {
      $scope.editor.result = null;
    }
  }

  $scope.saveToStorage = function () {
    localStorage.setItem($scope.storageKey, JSON.stringify($scope.queryData));
  }

  $scope.deleteQueryPage = function ($index) {

    // Delete result cache entry
    var queryPage = $scope.queryData.pages[$scope.queryData.activeTab];
    if ($scope.resultCache != null && $scope.resultCache[queryPage.name] != null) {
      delete $scope.resultCache[queryPage.name];
      $scope.saveResultCache();
    }

    $scope.queryData.pages.splice($index, 1);

    if ($scope.queryData.pages.length == 0) {
      $scope.initialize();
    }
    else {
      var validTab = Math.min($scope.queryData.activeTab, $scope.queryData.pages.length - 1);

      if (validTab != $scope.queryData.activeTab) {
        $scope.goToTab(validTab);
      }
    }
  }

  $scope.createQueryPage = function () {

    var queryName = null;
    var queryNameIndex = 1;

    // find unoccupied name
    while (queryNameIndex < 100000) {

      // Create a candidate
      var hasName = true;
      queryName = `Query ${queryNameIndex}`;

      // Check if already in use
      for (var queryPage of $scope.queryData.pages) {
        if (queryPage.name == queryName) {
          hasName = false;
        }
      }

      // Found name, stop searching.
      if (hasName) {
        break;
      }

      queryNameIndex++;
    }

    $scope.queryData.pages.push({
      name: queryName,
      query: simpleQueries.children[0].query,
      endpoint: defaultEndpoint
    });

    $scope.goToTab($scope.queryData.pages.length - 1);

    $scope.saveToStorage();
  }

  $scope.saveResultCache = function () {
    sessionStorage.setItem($scope.storageKey, JSON.stringify($scope.resultCache));
  }

  $scope.initialize = function () {
    $scope.queryData = {};
    $scope.queryData.activeTab = 0;
    $scope.queryData.pages = [];
    $scope.createQueryPage();

    $scope.resultCache = {};
    $scope.saveResultCache();
  }

  var defaultEndpoint = `${DATABUS_RESOURCE_BASE_URL}/sparql`;

  var queryDataString = localStorage.getItem($scope.storageKey);
  var resultCacheString = sessionStorage.getItem($scope.storageKey);


  $scope.queryData = null;
  $scope.resultCache = JSON.parse(resultCacheString);

  try {
    $scope.queryData = JSON.parse(queryDataString);

    if ($scope.queryData == null || $scope.queryData.pages.length == 0) {
      $scope.initialize();
    }

    var queryPage = $scope.queryData.pages[$scope.queryData.activeTab];

    if ($scope.resultCache != null && $scope.resultCache[queryPage.name] != null) {
      $scope.editor.result = $scope.resultCache[queryPage.name];
    } else {
      $scope.editor.result = null;
    }

  }


  catch (e) {
    // Could not parse query data, create new!
    $scope.initialize();
  }

  var initialHash = $location.hash();
  if (initialHash && initialHash.startsWith('query')) {
    var initialTab = parseInt(initialHash.replace('query', '')) - 1;
    if (!isNaN(initialTab) &&
      initialTab >= 0 &&
      initialTab < $scope.queryData.pages.length) {
      $scope.queryData.activeTab = initialTab;
    }
  }

  $scope.editor.query = $scope.editor.exampleQueries[0];

  $scope.send = async function () {

    var queryPage = $scope.queryData.pages[$scope.queryData.activeTab];

    try {

      var res = await $http({
        method: 'POST',
        url: queryPage.endpoint,
        data: queryPage.query,
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/sparql-results+json'
        }
      });

      if ($scope.resultCache == null) {
        $scope.resultCache = {};
      }

      $scope.resultCache[queryPage.name] = res.data;
      $scope.saveResultCache();

      delete queryPage.err;
      $scope.editor.result = res.data;
    } catch (err) {
      console.log(err);
      queryPage.err = err;
    }

    $scope.$apply();
  }

  $scope.insertExampleQuery = function (query) {
    $scope.editor.query = query;
  }

}

module.exports = SparqlEditorController;


/***/ },

/***/ "./js/page-controller/user-settings-controller.js"
/*!********************************************************!*\
  !*** ./js/page-controller/user-settings-controller.js ***!
  \********************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const JsonldUtils = __webpack_require__(/*! ../utils/jsonld-utils */ "./js/utils/jsonld-utils.js");
const TabNavigation = __webpack_require__(/*! ../utils/tab-navigation */ "./js/utils/tab-navigation.js");

function UserSettingsController($scope, $http, $sce, $location) {
  $scope.auth = data.auth;
  $scope.accounts = data.accounts;

  $scope.inputs = {};

  $scope.inputs.newAccountLabel = "";
  $scope.inputs.newAccountName = "";
  $scope.inputs.newApiKeyName = "";

  $scope.tabNavigation = new TabNavigation($scope, $location, [
    ''
  ], function (index) {
    $scope.activeAccount = $scope.accounts[index - 1];
  });

  $scope.$watchCollection('accounts', function (newAccounts) {
    const accountNames = newAccounts.map(a => a.accountName);
    $scope.tabNavigation.tabKeys = [''].concat(accountNames);

    const currentHash = $location.hash();

    $scope.tabNavigation.onLocationHashChanged(currentHash, currentHash)

    if (currentHash && !$scope.tabNavigation.tabKeys.includes(currentHash)) {
      $location.hash('');
    }
  });

  // Iterate over each account and load its data
  $scope.accounts.forEach(function (account) {
    // Set loading state
    account.loading = true;

    var requestParams = {
      method: 'GET',
      url: '/' + encodeURIComponent(account.accountName),
      headers: {
        'Accept': 'application/ld+json',
        'X-Jsonld-Formatting': 'flatten'
      }
    }

    // Perform HTTP GET request to fetch additional data
    $http(requestParams)
      .then(function (response) {
        // Set loading to false when data is received
        account.loading = false;

        // Store additional info (stub)
        var graphs = response.data;
        var personGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.FOAF_PERSON);

        account.uri = `${DATABUS_RESOURCE_BASE_URL}/${account.accountName}`;
        account.label =  JsonldUtils.getFirstProperty(personGraph, DatabusUris.FOAF_NAME);
        account.status = JsonldUtils.getFirstProperty(personGraph, DatabusUris.FOAF_STATUS);
        account.imageUrl = JsonldUtils.getProperty(personGraph, DatabusUris.FOAF_IMG);
        account.secretaries = [];

        let accountGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.DATABUS_ACCOUNT);
        let secretaryIds = JsonldUtils.getRefArrayProperty(accountGraph, DatabusUris.DATABUS_SECRETARY_PROPERTY);

        for (let secretaryId of secretaryIds) {
          let secretaryGraph = JsonldUtils.getGraphById(graphs, secretaryId);

          let secretary = {};
          secretary.accountName = DatabusUtils.uriToName(JsonldUtils.getProperty(secretaryGraph, DatabusUris.DATABUS_ACCOUNT_PROPERTY));
          secretary.hasWriteAccessTo = JsonldUtils.getRefArrayProperty(secretaryGraph, DatabusUris.DATABUS_HAS_WRITE_ACCESS_TO);

          account.secretaries.push(secretary);
        }

      })
      .catch(function (error) {
        // Handle error and set loading to false
        account.loading = false;
        console.error('Failed to load account data for', account.name, error);
      });
  });

  // Button click handler to add account
  $scope.addAccount = async function () {

    try {

      await $http.post(`/api/account/create`, {
        name: $scope.inputs.newAccountName,
        label: $scope.inputs.newAccountLabel
      });

      $scope.accounts.push({
        label: $scope.inputs.newAccountLabel,
        accountName: $scope.inputs.newAccountName,
        uri: `${DATABUS_RESOURCE_BASE_URL}/${$scope.inputs.newAccountName}`
      });

      DatabusAlert.alert($scope, true, "Account created.");

    } catch (err) {
      console.error(err);
      DatabusAlert.alert($scope, false, err.data);
    }
  };

  // Button click handler to save account
  $scope.saveAccount = async function (account) {
    try {
      await $http.post(`/api/account/update`, account);
      DatabusAlert.alert($scope, true, "Account saved.");

    } catch (err) {
      console.error(err);
      DatabusAlert.alert($scope, false, err.data);
    }

  };

  // Button click handler to delete account
  $scope.deleteAccount = async function (account) {
    try {
      // Find index of the account using accountName
      const index = $scope.accounts.findIndex(acc => acc.accountName === account.accountName);

      if (index === -1) {
        throw new Error(`Account with name "${account.accountName}" not found.`);
      }

      console.log("Deleting account with accountName:", account.accountName);

      // Send delete request to server
      await $http.post(`/api/account/delete`, account);

      // Show success alert
      DatabusAlert.alert($scope, true, "Account deleted.");

      // Remove account from local array
      $scope.accounts.splice(index, 1);

    } catch (err) {
      console.error(err);
      const message = err.data || err.message || "Unknown error occurred.";
      DatabusAlert.alert($scope, false, message);
    }
  };




  $scope.goToUserSettings = function (accountName) {
    window.location.href = '/' + encodeURIComponent(accountName) + '#settings';
  }

  $scope.addWriteAccessUrl = function (account) {
    account.writeAccess.push('');
  };

  $scope.removeWriteAccessUrl = function (account, index) {
    account.writeAccess.splice(index, 1);
  };

  $scope.addApiKey = async function (account) {
    // Validate the name input only

    if (!$scope.inputs.newApiKeyName) {
      DatabusAlert.alert("API key name must be provided.");
      return;
    }

    const postData = {
      accountName: account.accountName,
      name: $scope.inputs.newApiKeyName
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
        $scope.inputs.newApiKeyName = '';

        DatabusAlert.alert($scope, true, "API key created.");
      } else {
        DatabusAlert.alert($scope, false, "Failed to create API key.");
      }

    } catch (error) {
      console.error('Error creating API key:', error);
      const message = err.data || err.message || "Unknown error occurred.";
      DatabusAlert.alert($scope, false, message);
    }
  };


  $scope.deleteApiKey = async function (account, apiKey) {
    try {
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

  $scope.addSecretary = function (account) {
    if (!account.secretaries) {
      account.secretaries = [];
    }

    account.secretaries.push({
      accountName: '',
      hasWriteAccessTo: []
    });
  };

  $scope.removeSecretary = function (account, index) {
    account.secretaries.splice(index, 1);
  };

  $scope.addNamespace = function (account, secIndex) {
    account.secretaries[secIndex].hasWriteAccessTo.push('');
  };

  $scope.removeNamespace = function (account, secIndex, nsIndex) {
    account.secretaries[secIndex].hasWriteAccessTo.splice(nsIndex, 1);
  };
}

module.exports = UserSettingsController;

/***/ },

/***/ "./js/page-controller/version-controller.js"
/*!**************************************************!*\
  !*** ./js/page-controller/version-controller.js ***!
  \**************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusWebappUtils = __webpack_require__(/*! ../utils/databus-webapp-utils */ "./js/utils/databus-webapp-utils.js");
const JsonldUtils = __webpack_require__(/*! ../utils/jsonld-utils */ "./js/utils/jsonld-utils.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const QueryNode = __webpack_require__(/*! ../query-builder/query-node */ "./js/query-builder/query-node.js");
const TabNavigation = __webpack_require__(/*! ../utils/tab-navigation */ "./js/utils/tab-navigation.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DataIdCreator = __webpack_require__(/*! ../publish/dataid-creator */ "./js/publish/dataid-creator.js");
const QueryTemplates = __webpack_require__(/*! ../query-builder/query-templates */ "./js/query-builder/query-templates.js");
const DatabusCollectionWrapper = __webpack_require__(/*! ../collections/databus-collection-wrapper */ "./js/collections/databus-collection-wrapper.js");
const QueryBuilder = __webpack_require__(/*! ../query-builder/query-builder */ "./js/query-builder/query-builder.js");
const AppJsonFormatter = __webpack_require__(/*! ../utils/app-json-formatter */ "./js/utils/app-json-formatter.js");

function VersionPageController($scope, $http, $sce, $location, collectionManager) {

  $scope.navigation = new TabNavigation($scope, $location, [
    'files', 'mods', 'edit'
  ]);

  $scope.auth = data.auth;
  $scope.utils = new DatabusWebappUtils($scope, $sce);
  $scope.accountName = $scope.utils.getAccountName();

  $scope.collectionManager = collectionManager;
  $scope.authenticated = data.auth.authenticated;
  $scope.versionGraph = data.graph;
  $scope.version = AppJsonFormatter.formatVersionData(data.graph);

  $scope.queryResult = {};
  $scope.addToCollectionQuery = "";
  $scope.collectionModalVisible = false;

  $scope.publisherName = DatabusUtils.uriToName(DatabusUtils.navigateUp($scope.version.uri, 3));
  $scope.canEdit = $scope.accountName != null;

  if (data.auth.authenticated && $scope.canEdit) {

    $scope.licenseQuery = "";
    $scope.filterLicenses = function (licenseQuery) {

      if (data.licenseData == null) {
        return;
      }

      // billo-suche mit lowercase und tokenization 
      var tokens = licenseQuery.toLowerCase().split(' ');
      $scope.filteredLicenseList = data.licenseData.results.bindings.filter(function (l) {
        for (var token of tokens) {
          if (!l.title.value.toLowerCase().includes(token)) {
            return false;
          }
        }

        return true;
      });
    }

    $scope.filterLicenses("");

    $scope.formData = {};

    $scope.formData.group = {};
    $scope.formData.group.name = DatabusUtils.uriToName(DatabusUtils.navigateUp($scope.version.uri, 2));

    $scope.formData.artifact = {};
    $scope.formData.artifact.name = DatabusUtils.uriToName(DatabusUtils.navigateUp($scope.version.uri, 1));

    var abstract = DatabusUtils.createAbstractFromDescription($scope.version.description);

    $scope.formData.version = {};
    $scope.formData.version.generateAbstract = abstract == $scope.version.abstract;
    $scope.formData.version.name = $scope.version.name;
    $scope.formData.version.title = $scope.version.title;
    $scope.formData.version.abstract = $scope.version.abstract;
    $scope.formData.version.description = $scope.version.description;
    $scope.formData.version.license = $scope.version.license;
    $scope.formData.version.attribution = $scope.version.attribution;
    $scope.formData.version.wasDerivedFrom = $scope.version.wasDerivedFrom;

    $scope.formData.signature = {};
    $scope.formData.signature.autoGenerateSignature = true;
    $scope.formData.signature.selectedPublisherUri = $scope.version.publisher;

    $scope.dataidCreator = new DataIdCreator($scope.formData, data.auth.info.accountName);
  }

  $scope.onDescriptionChanged = function () {
    if ($scope.formData == null) {
      return;
    }

    if (!$scope.formData.version.generateAbstract) {
      return;
    }

    $scope.formData.version.abstract =
      DatabusUtils.createAbstractFromDescription($scope.formData.version.description);
  }

  $scope.resetEdits = function () {
    $scope.formData.version.title = $scope.version.title;
    $scope.formData.version.abstract = $scope.version.abstract;
    $scope.formData.version.description = $scope.version.description;
  }

  $scope.saveVersion = async function () {

    try {
      if ($scope.dataidCreator == null) {
        return;
      }
      var relativeUri = new URL($scope.version.uri).pathname;

      var response = await $http({
        method: 'GET',
        url: relativeUri,
        headers: {
          'Accept': 'application/ld+json',
          'X-Jsonld-Formatting': 'flatten'
        }
      });

      var graphs = response.data;
      var versionGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.DATABUS_VERSION);

      JsonldUtils.setLiteral(versionGraph, DatabusUris.DCT_TITLE, DatabusUris.XSD_STRING,
        $scope.formData.version.title);
      JsonldUtils.setLiteral(versionGraph, DatabusUris.DCT_ABSTRACT, DatabusUris.XSD_STRING,
        $scope.formData.version.abstract);
      JsonldUtils.setLiteral(versionGraph, DatabusUris.DCT_DESCRIPTION, DatabusUris.XSD_STRING,
        $scope.formData.version.description);
      JsonldUtils.setLink(versionGraph, DatabusUris.DCT_LICENSE, $scope.formData.version.license);
      JsonldUtils.setLiteral(versionGraph, DatabusUris.DATABUS_ATTRIBUTION, DatabusUris.XSD_STRING,
        $scope.formData.version.attribution);

      if ($scope.formData.version.wasDerivedFrom) {
        JsonldUtils.setLink(versionGraph, DatabusUris.PROV_WAS_DERIVED_FROM,
          $scope.formData.version.wasDerivedFrom);
      }

      var response = await $http.put(`/api/register`, graphs);

      if (response.status == 200) {
        $scope.version.title = $scope.formData.version.title;
        $scope.version.abstract = $scope.formData.version.abstract;
        $scope.version.description = $scope.formData.version.description;
        $scope.version.license = $scope.formData.version.license;
        $scope.version.attribution = $scope.formData.version.attribution;
        $scope.version.wasDerivedFrom = $scope.formData.version.wasDerivedFrom;

        DatabusAlert.alert($scope, true, "Version Saved!");
        $scope.$apply();
      }
    } catch (err) {
      DatabusAlert.alert($scope, false, "Failed to save version!");
    }
  }

  $scope.modsAmountMinimized = 5;
  $scope.modsMaxAmount = $scope.modsAmountMinimized;

  $scope.showAllMods = function () {
    $scope.modsMaxAmount = 10000000;
  }

  $scope.hideAllMods = function () {
    $scope.modsMaxAmount = $scope.modsAmountMinimized;
  }

  $scope.fileSelector = {};
  $scope.fileSelector.config = {};
  $scope.fileSelector.config.authenticated = $scope.authenticated;
  $scope.fileSelector.config.columns = [];
  $scope.fileSelector.config.columns.push({ field: 'variant', label: 'Variant', width: '45%' });
  $scope.fileSelector.config.columns.push({ field: 'format', label: 'Format', width: '15%' });
  $scope.fileSelector.config.columns.push({ field: 'compression', label: 'Compression', width: '15%' });

  $scope.artifactNode = new QueryNode($scope.version.artifact, 'databus:artifact');
  $scope.artifactNode.setFacet('http://purl.org/dc/terms/hasVersion', $scope.version.name, true);

  $scope.groupNode = new QueryNode(DatabusUtils.navigateUp($scope.version.artifact), 'databus:group');
  $scope.groupNode.addChild($scope.artifactNode);

  $scope.collectionWidgetSelectionData = {};
  $scope.collectionWidgetSelectionData.groupNode = $scope.groupNode;

  $scope.onFacetSettingsChanged = function () {
    $scope.fileSelector.query = QueryBuilder.build({
      node: $scope.artifactNode,
      template: QueryTemplates.DEFAULT_FILE_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });

    $scope.fileSelector.fullQuery = QueryBuilder.build({
      node: $scope.artifactNode,
      template: QueryTemplates.GROUP_PAGE_FILE_BROWSER_TEMPLATE,
      resourceBaseUrl: DATABUS_RESOURCE_BASE_URL
    });
  }

  $scope.onFacetSettingsChanged();

  $scope.hideAutofill = function () {
    $scope.fileSelector.clearAutofill(function () {
      $scope.$apply();
    });
  }

  $scope.onFileSelectionChanged = function (numFiles, totalSize, query) {
    $scope.addToCollectionQuery = query;
  }

  $scope.showCollectionModal = function () {
    $scope.collectionModalVisible = true;
  }

  $scope.hideCollectionModal = function () {
    $scope.collectionModalVisible = false;
  }

  $scope.addFilter = function (selected, key) {
    $scope.fileSelector.addFilter(selected, key);
    $scope.updateQueryBuilder();
  }

  $scope.addQueryToCollection = function () {
    $scope.collectionManager.addElement($scope.queryBuilder.query);
    $scope.hideCollectionModal();
  };

  $scope.addQueryToCollection = function () {

    if ($scope.collectionManager.activeCollection == null) {
      return;
    }

    var wrapper = new DatabusCollectionWrapper($scope.collectionManager.activeCollection);
    wrapper.addCustomQueryNode('Select ' + $scope.versionData.label + ' files', $scope.addToCollectionQuery);
    $scope.collectionManager.saveLocally();
    $scope.collectionModalVisible = false;
  }

  $scope.formatMods = function (results) {
    var mods = results.replace(",", "&nbsp;");
    return $sce.trustAsHtml(mods);
  }

  $scope.formatModFile = function (uri) {
    return DatabusUtils.uriToName(uri);
  }

  $scope.downloadMetadataAsFile = async function () {
    var response = await $http({
      method: 'GET',
      url: $scope.version.uri,
      headers: {
        'Accept': 'application/ld+json',
      }
    });

    $scope.download(`${$scope.version.name}.jsonld`, JSON.stringify(response.data, null, 3));
  }

  $scope.download = function (filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }


}

module.exports = VersionPageController;

/***/ },

/***/ "./js/publish/artifact-data.js"
/*!*************************************!*\
  !*** ./js/publish/artifact-data.js ***!
  \*************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const EntityHandler = __webpack_require__(/*! ./entity-handler */ "./js/publish/entity-handler.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const GroupData = __webpack_require__(/*! ./group-data */ "./js/publish/group-data.js");

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


/***/ },

/***/ "./js/publish/databus-sparql-client.js"
/*!*********************************************!*\
  !*** ./js/publish/databus-sparql-client.js ***!
  \*********************************************/
(module) {

class DatabusSparqlClient {

    constructor($http) {
        this.$http = $http;
    }

    /**
     * Generic SPARQL query runner.
     * @param {string} query - SPARQL query string.
     * @returns {Promise<Array>} - Query result bindings.
     */
    async runQuery(query) {
        const config = {
            method: 'POST',
            url: `/sparql`,
            headers: {
                'Accept': 'application/sparql-results+json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: `query=${encodeURIComponent(query)}`
        };

        try {
            const response = await this.$http(config);
            return response.data.results.bindings || [];
        } catch (err) {
            console.error('SPARQL query failed:', err);
            return [];
        }
    }

    /**
     * Fetches groups for a given Databus account.
     * @param {string} accountName - The account name (e.g., 'myaccount').
     * @returns {Promise<Array>} - List of groups with basic metadata.
     */
    async getGroups(accountName) {
        const query = `
            PREFIX databus: <https://dataid.dbpedia.org/databus#>

            SELECT DISTINCT ?group WHERE {
                ?group a databus:Group .
                ?group databus:account <${DATABUS_RESOURCE_BASE_URL}/${accountName}> .
            }
        `;

        const bindings = await this.runQuery(query);

        return bindings.map(binding => ({
            uri: binding.group.value,
            name: binding.group.value.split('/').pop(),
        }));
    }

    async getArtifacts(accountName, groupName) {
        const query = `
            PREFIX databus: <https://dataid.dbpedia.org/databus#>

            SELECT DISTINCT ?group WHERE {
                ?group a databus:Artifact .
                ?group databus:group <${DATABUS_RESOURCE_BASE_URL}/${accountName}/${groupName}> .
            }
        `;

        const bindings = await this.runQuery(query);

        return bindings.map(binding => ({
            uri: binding.group.value,
            name: binding.group.value.split('/').pop(),
        }));
    }

    async getVersions(accountName, groupName, artifactName) {
        const query = `
            PREFIX databus: <https://dataid.dbpedia.org/databus#>

            SELECT DISTINCT ?group WHERE {
                ?group a databus:Version .
                ?group databus:artifact <${DATABUS_RESOURCE_BASE_URL}/${accountName}/${groupName}/${artifactName}> .
            }
        `;

        const bindings = await this.runQuery(query);

        return bindings.map(binding => ({
            uri: binding.group.value,
            name: binding.group.value.split('/').pop(),
        }));
    }
}

module.exports = DatabusSparqlClient;


/***/ },

/***/ "./js/publish/dataid-creator.js"
/*!**************************************!*\
  !*** ./js/publish/dataid-creator.js ***!
  \**************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");

class DataIdCreator {

  constructor(formData, accountName) {
    this.accountName = accountName;
    this.formData = formData;
  }

  createInputs() {
    var group = this.createGroupUpdate();
    var artifact = this.createArtifactUpdate();
    var dataid = this.createVersionUpdate();

    var result = {
      "@context": this.getContext(),
      "@graph": []
    };

    if (group != undefined) {
      for (var graph of group["@graph"]) {
        result["@graph"].push(graph);
      }
    }

    if (artifact != undefined) {
      for (var graph of artifact["@graph"]) {
        result["@graph"].push(graph);
      }
    }

    if (dataid != undefined) {
      for (var graph of dataid["@graph"]) {
        result["@graph"].push(graph);
      }
    }

    return {
      context: this.getContext(),
      group: group,
      artifact: artifact,
      dataid: dataid,
      all: result
    };
  }

  getValidString(value) {
    if(value == undefined || value.length == 0) {
      return undefined;
    }

    return value;
  }

  getContext() {
    if(DATABUS_CONTEXT_URL != undefined && DatabusUtils.isValidHttpUrl(DATABUS_CONTEXT_URL)) {
      return DATABUS_CONTEXT_URL;
    }

    return DATABUS_CONTEXT[DatabusUris.JSONLD_CONTEXT];
  }

  createGroupUpdate() {

    var accountUri = `${DATABUS_RESOURCE_BASE_URL}/${this.accountName}`;

    return {
      "@context": this.getContext(),
      "@graph": [
        {
          "@id": `${accountUri}/${this.formData.group.name}`,
          "@type": "Group",
          "title": this.getValidString(this.formData.group.title),
          "abstract": this.getValidString(this.formData.group.abstract),
          "description": this.getValidString(this.formData.group.description)
        }
      ]
    };
  }

  createArtifactUpdate() {
    
    if (this.formData.artifact.generateMetadata == 'none') {
      return undefined;
    }

    var accountUri = `${DATABUS_RESOURCE_BASE_URL}/${this.accountName}`;

    return {
      "@context": this.getContext(),
      "@graph": [
        {
          "@id": `${accountUri}/${this.formData.group.name}/${this.formData.artifact.name}`,
          "@type": "Artifact",
          "title": this.getValidString(this.formData.artifact.title),
          "abstract": this.getValidString(this.formData.artifact.abstract),
          "description": this.getValidString(this.formData.artifact.description)
        }
      ]
    };
  }

  createVersionUpdate() {

    if (this.formData.version.generateMetadata == 'none') {
      return undefined;
    }

    var accountUri = `${DATABUS_RESOURCE_BASE_URL}/${this.accountName}`;
    var versionUri = `${accountUri}/${this.formData.group.name}/${this.formData.artifact.name}/${this.formData.version.name}`

    var artifact = this.formData.artifact;
    var version = this.formData.version;

    var graph = {
      "@type": [ "Version", "Dataset" ],
      "@id": versionUri,
      "publisher": this.formData.signature.selectedPublisherUri,
      "hasVersion": version.name,
      "title": version.title,
      "abstract": version.abstract,
      "description": version.description,
      "license": version.license,
      "attribution": version.attribution,
      "wasDerivedFrom": version.wasDerivedFrom,
      "distribution": []
    }

    if (this.formData.signature.selectedPublisherUri == this.formData.signature.defaultPublisherUri) {
      delete graph.publisher;
    }

    if (!this.formData.signature.autoGenerateSignature) {
      graph["proof"] = {
        '@type': "DatabusTractateV1",
        'signature': this.formData.signature.userSignature
      };
    }

    var customVariants = [];

    for (var fg in version.files) {

      var file = version.files[fg];

      var variantSuffix = '';
      for (var c in version.contentVariants) {
        var cv = version.contentVariants[c];
        var value = file.contentVariants[cv.id];

        if (value == undefined || value == "") {
          continue;
        }

        variantSuffix += '_' + cv.id + '=' + value;
      }

      var fileName = artifact.name; 

      var distributionUri = `${versionUri}#${fileName}`;
      var fileUri = `${versionUri}/${fileName}${variantSuffix}`;

      distributionUri += variantSuffix;

      if (file.formatExtension != 'none') {
        distributionUri += '.' + file.formatExtension;
        fileUri += '.' + file.formatExtension;
      }

      if (file.compression != 'none') {
        distributionUri += '.' + file.compression;
        fileUri += '.' + file.compression;
      }

      var distribution = {
        "@type": "Part",
        "formatExtension": file.formatExtension,
        "compression": file.compression,
        "downloadURL": file.uri,
        "byteSize": file.byteSize,
        "sha256sum": file.sha256sum,
      };

      for (var c in version.contentVariants) {
        var cv = version.contentVariants[c];
        var value = file.contentVariants[cv.id];

        if (value == undefined || value == "") {
          continue;
          // value = "";
        }

        distribution['dcv:' + cv.id] = value;

        if (!customVariants.includes(cv.id)) {
          customVariants.push(cv.id);
        }
      }

      graph.distribution.push(distribution);
    }

    var result = {
      "@context": this.getContext(),
      "@graph": [graph]
    }

    return result;
  }
}

module.exports = DataIdCreator;


/***/ },

/***/ "./js/publish/entity-handler.js"
/*!**************************************!*\
  !*** ./js/publish/entity-handler.js ***!
  \**************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusSparqlClient = __webpack_require__(/*! ./databus-sparql-client */ "./js/publish/databus-sparql-client.js");

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

  getURI() {
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
        url: `/api/register?log-level=info`,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        data: this.postBody
      });

      return response;
    } catch (err) {
      console.error('Entity registration failed:', err);
      throw err;
    }
  }
}

module.exports = EntityHandler;


/***/ },

/***/ "./js/publish/group-data.js"
/*!**********************************!*\
  !*** ./js/publish/group-data.js ***!
  \**********************************/
(module, __unused_webpack_exports, __webpack_require__) {

const EntityHandler = __webpack_require__(/*! ./entity-handler */ "./js/publish/entity-handler.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const DatabusSparqlClient = __webpack_require__(/*! ./databus-sparql-client */ "./js/publish/databus-sparql-client.js");

class GroupData extends EntityHandler {
  constructor($http, accounts, apiKeys) {
    super('databus_registration_group_data', $http, null, accounts, apiKeys);
   
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

  getURI() {
    return `${DATABUS_RESOURCE_BASE_URL}/${this.accountName}/${this.name}`;
  }

  validate() {
    this.errors = [];
    this.warnings = [];

    if (!DatabusUtils.isValidGroupName(this.name)) {
      this.errors.push('err_invalid_group_name');
    }

    if(this.sendmode == 'curl' && !this.apiKeyName) {
      this.errors.push('err_no_api_key');
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


/***/ },

/***/ "./js/publish/publish-data.js"
/*!************************************!*\
  !*** ./js/publish/publish-data.js ***!
  \************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");

/**
 * Handles shasum creation (and possibly other file stats)
 */
class PublishData {

  constructor(data) {

    if (data != null) {
      this.account = data.account ?? {};
      this.group = data.group ?? {};
      this.artifact = data.artifact ?? {};
      this.version = data.version ?? {};
      this.files = data.files ?? {};
      this.signature = data.signature;
    }

    if (data == null) {

      this.account = {};
      this.group = {};
      this.artifact = {};
      this.version = {};
      this.files = {};
      this.signature = undefined;

      this.group.generateMetadata = 'create';
      this.group.generateAbstract = true;
      this.artifact.generateMetadata = 'create';
      this.artifact.generateAbstract = true;
      this.version.generateMetadata = 'create';
      this.version.generateAbstract = true;
      this.version.useArtifactTitle = true;
      this.signature = this.createSignatureData();
    }
  }

  createSignatureData() {
    var signature = {};
    signature.publisherUris = [];

    signature.publisherUris = this.account.publisherUris;
    signature.defaultPublisherUri = `${DATABUS_RESOURCE_BASE_URL}/${this.account.accountName}#this`
    signature.selectedPublisherUri = signature.defaultPublisherUri;
    signature.autoGenerateSignature = true;
    signature.autoGenerateSignatureLocked = false;
    signature.userSignature = '';

    return signature;
  }

  hasError(error) {

  }

  clearErrors() {
    this.group.errors = [];
    this.artifact.errors = [];
    this.version.errors = [];
    this.files.errors = [];
    this.group.warnings = [];
    this.artifact.warnings = [];
    this.version.warnings = [];
  }
  /**
   * Validates the tree
   */
  validate() {

    var hasErrors = false;
    this.group.errors = [];
    this.artifact.errors = [];
    this.version.errors = [];
    this.files.errors = [];
    this.group.warnings = [];
    this.artifact.warnings = [];
    this.version.warnings = [];


    if (!DatabusUtils.isValidGroupName(this.group.name)) {
      this.group.errors.push('err_invalid_group_title');
      hasErrors = true;
    }

    var self = this;

    var existingGroup = this.account.groups.filter(function (value) {
      return value.name == self.group.name;
    });

    if (existingGroup.length > 0 && this.group.generateMetadata == 'create') {
      this.group.warnings.push('warning_group_exists');
    }

    var existingArtifact = this.account.artifacts.filter(function (value) {
      return value.groupName == self.group.name && value.name == self.artifact.name;
    });

    if (existingArtifact.length > 0 && this.artifact.generateMetadata == 'create') {
      this.artifact.warnings.push('warning_artifact_exists');
    }

    if (this.group.generateAbstract) {
      this.group.abstract = DatabusUtils.createAbstractFromDescription(this.group.description);
    }

    if (this.version.generateAbstract) {
      this.version.abstract = DatabusUtils.createAbstractFromDescription(this.version.description);
    }

    if (this.version.useArtifactTitle) {
      this.version.title = this.artifact.title;
    }

    if (this.artifact.generateAbstract) {
      this.artifact.abstract = DatabusUtils.createAbstractFromDescription(this.artifact.description);
    }

    if (this.group.publishGroupOnly) {
      this.hasConfigurationError = hasErrors;
      return;
    }

    if (this.artifact.generateMetadata != 'none') {
      if (!DatabusUtils.isValidArtifactName(this.artifact.name)) {
        this.artifact.errors.push('err_invalid_artifact_title');
        hasErrors = true;
      }
    }

    var versionUri = `${DATABUS_RESOURCE_BASE_URL}/${this.account.accountName}/${this.group.name}/${this.artifact.name}/${this.version.name}`;

    var existingVersion = this.account.versions.filter(function (value) {
      return value == versionUri;
    });

    if (existingVersion.length > 0) {
      this.version.warnings.push('warning_version_exists');
    }

    if (this.version.generateMetadata != 'none') {

      if (!DatabusUtils.isValidVersionIdentifier(this.version.name)) {
        this.version.errors.push('err_invalid_version_title');
        hasErrors = true;
      }

      if (!DatabusUtils.isValidUrl(this.version.license)) {
        this.version.errors.push('err_invalid_version_license');
        hasErrors = true;
      }

      if (!DatabusUtils.isValidResourceText(this.version.abstract, 1)) {
        this.version.errors.push('err_invalid_version_abstract');
        hasErrors = true;
      }

      if (!DatabusUtils.isValidResourceText(this.version.description, 1)) {
        this.version.errors.push('err_invalid_version_description');
        hasErrors = true;
      }


      if (DatabusUtils.objSize(this.version.files) == 0) {
        this.files.errors.push('err_no_files');
        hasErrors = true;
      }

      if (this.version.isConfigDirty) {


        var files = [];
        for (var f in this.version.files) {
          this.version.files[f].errors = [];
          files.push(this.version.files[f]);
        }

        this.cvSplit(this.version, files, 0);
        this.version.isConfigDirty = false;
      }
    }

    this.hasConfigurationError = hasErrors;
  }

  addFile(file) {


    if (this.version.files == undefined) {
      this.version.files = [];
    }


    for (var f in this.version.files) {
      if (file.url == this.version.files[f].url) {
        return;
      }
    }

    var uri = file.url;
    var uriParts = uri.split('/');
    var name = uriParts.pop();
    var nameComponents = name.split('.');
    name = nameComponents[0];

    if (name.length > 50) {
      name = name.substr(0, 50) + '...';
    }

    name = decodeURIComponent(name);
    // Files with uri as key!!

    this.version.files.push({
      id: uri,
      uri: file.url,
      name: name,
      contentVariants: file.contentVariants != null ? file.contentVariants : {},
      compression: file.compression,
      formatExtension: file.formatExtension,
      rowspan: 1,
    });

    this.version.files.sort(function (a, b) {
      var nameA = a.name;
      var nameB = b.name;

      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }

      return 0;
    });

    this.version.isConfigDirty = true;
  }

  addContentVariant(variant) {

    if (variant == undefined || variant == '') {
      return;
    }

    if (this.version.contentVariants == undefined) {
      this.version.contentVariants = [];
    }

    for (var c in this.version.contentVariants) {
      if (this.version.contentVariants[c].id == variant) {
        return;
      }
    }

    this.version.contentVariants.push({
      label: variant,
      id: variant,
      fillRegex: '',
      toLower: true,
      pruneWhitespaces: true
    });

    this.version.isConfigDirty = true;
  }


  removeContentVariant(variant) {

    this.version.contentVariants = this.version.contentVariants.filter(function (d) {
      return d.id != variant.id;
    });

    for (var f in this.version.files) {
      var file = this.version.files[f];
      delete file.contentVariants[variant.id];
    }

    this.version.isConfigDirty = true;
  }

  fill(variant) {

    var val = variant.fillRegex;

    for (var file of this.version.files) {

      if (variant.toLower) {
        val = val.toLowerCase();
      }

      if (variant.pruneWhitespaces) {
        val = val.replaceAll(' ', '');
      }

      if (!variant.overwrite && file.contentVariants[variant.id] != undefined
        && file.contentVariants[variant.id].length > 0) {
        continue;
      }

      file.contentVariants[variant.id] = val;
    }

    this.version.isConfigDirty = true;
  }

  fillByRegex(variant) {
    var regex = new RegExp(variant.fillRegex);

    for (var f in this.version.files) {
      var file = this.version.files[f];
      var matches = file.name.match(regex);

      if (matches != null) {
        var val = matches[0];

        if (variant.toLower) {
          val = val.toLowerCase();
        }

        if (variant.pruneWhitespaces) {
          val = val.replaceAll(' ', '');
        }

        if (!variant.overwrite && file.contentVariants[variant.id] != undefined
          && file.contentVariants[variant.id].length > 0) {
          continue;
        }

        file.contentVariants[variant.id] = val;
      }
    }

    this.version.isConfigDirty = true;
  }

  createVersionName(v) {
    if (v == 0) {
      this.version.name = new Date().toISOString().slice(0, 10);
    }

    if (v == 1) {
      this.version.name = new Date().toISOString().slice(0, 13);
    }
  }

  getRowIndex(files, name) {
    var k = 1;
    for (var f in files) {
      if (files[f].name == name) {
        return k;
      }

      k++;
    }

    return -1;
  }


  cvSplit(artifact, files, cvIndex) {

    if (files.length <= 1) {
      return;
    }

    if (artifact.contentVariants == undefined) {
      artifact.contentVariants = [];
    }
    // if end of cvs, assign errors to all files if files.length > 1
    if (cvIndex - 2 >= artifact.contentVariants.length) {

      if (files.length > 1) {

        var cvHints = [];

        if (artifact.contentVariants.length == 0) {
          cvHints.push('No content variants have been added yet. Add content variants in the files panel in order to tag your files.');
        } else {
          for (var c in artifact.contentVariants) {
            var cv = artifact.contentVariants[c];
            var value = files[0].contentVariants[cv.id];

            if (value == undefined || value == '') {
              value = 'none';
            }

            cvHints.push(cv.id + ': ' + value);
          }
        }

        for (var f in files) {

          var index = 0;

          if (f == 0) {
            var index = this.getRowIndex(artifact.files, files[1].name);
          } else {
            var index = this.getRowIndex(artifact.files, files[0].name);
          }

          var errorMessage = 'The Databus requires any two files to be distinguishable by either their format, compression or any content variant. You have added a file with the exact same format, compression and content variants at row '
            + index + ' (' +
            cvHints.join(', ') + ').';

          files[f].errors.push({ key: 'err_duplicate_file', message: errorMessage });
        }
      }

      return;
    }

    // else create buckets and sort files into buckets
    var buckets = {};

    for (var f in files) {
      var file = files[f];

      var key = null;

      if (cvIndex == 0) {
        key = file.formatExtension;
      } else if (cvIndex == 1) {
        key = file.compression;
      } else {
        key = file.contentVariants[artifact.contentVariants[cvIndex - 2].id];
      }

      if (key == undefined || key == '') {
        key = '$_none$';
      }

      if (buckets[key] == undefined) {
        buckets[key] = [];
      }

      buckets[key].push(file);
    }

    // iterate buckets and call recursively
    for (var b in buckets) {
      this.cvSplit(artifact, buckets[b], cvIndex + 1);
    }
  }


  getOrCreateFileGroup(fileGroupId, name) {

    if (this.version.files == null) {
      this.version.files = {};
    }

    if (this.version.files[fileGroupId] == undefined) {

      this.version.files[fileGroupId] = {
        id: fileGroupId,
        name: name,
        contentVariants: {},
        distributions: [],
        artifactId: undefined,
        groupId: undefined,
      };
    }

    return this.version.files[fileGroupId];
  }

}

module.exports = PublishData;

/***/ },

/***/ "./js/publish/publish-session.js"
/*!***************************************!*\
  !*** ./js/publish/publish-session.js ***!
  \***************************************/
(module, __unused_webpack_exports, __webpack_require__) {


const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const JsonldUtils = __webpack_require__(/*! ../utils/jsonld-utils */ "./js/utils/jsonld-utils.js");
const PublishData = __webpack_require__(/*! ./publish-data */ "./js/publish/publish-data.js");
const DataIdCreator = __webpack_require__(/*! ./dataid-creator */ "./js/publish/dataid-creator.js");
const DatabusSparqlClient = __webpack_require__(/*! ./databus-sparql-client */ "./js/publish/databus-sparql-client.js");
const GroupHandler = __webpack_require__(/*! ./group-data */ "./js/publish/group-data.js");
const ArtifactHandler = __webpack_require__(/*! ./artifact-data */ "./js/publish/artifact-data.js");
const VersionHandler = __webpack_require__(/*! ./version-handler */ "./js/publish/version-handler.js");

class PublishSession {

    static sessionStorageKey = 'databus_upload';
    static sessionStorageIgnoreKeys = [
        '$$hashKey',
        'eventListeners',
        'hasLocalChanges',
        'fileFilterInput',
        'fileSuggestions',
        'progress',
        'streamQueue'
    ];


    constructor($http, $interval, accounts, apiKeys) {

        this.$http = $http;
        this.accounts = accounts;
        this.sparqlClient = new DatabusSparqlClient($http);
        this.formData = new PublishData();

        this.group = new GroupHandler($http, accounts, apiKeys);
        this.artifact = new ArtifactHandler($http, accounts, apiKeys);
        this.version = new VersionHandler($http, $interval, accounts, apiKeys);

        this.reset();
    }



    reset() {
        this.accountData = {};
        this.groupData = {};
        this.artifactData = {};
        this.versionData = {};
    }

    update() {
        this.validate();
        this.save();
    }

    async selectAccount(account) {
        this.accountData = {
            name: account.name,
            isValid: true
        };

        // Fetch groups for account here:
        this.groups = await this.sparqlClient.getGroups(this.accountData.name);
        

        this.save();
    }

    async selectGroup(targetGroup) {

        if (targetGroup == null) {
            return;
        }

        var group = this.formData.group;
        var artifact = this.formData.artifact;

        group.name = targetGroup.name;
        group.title = targetGroup.title;
        group.abstract = targetGroup.abstract;
        group.description = targetGroup.description;

        if (this.currentGroup == null || this.currentGroup.name != targetGroup.name) {
            this.currentGroup = targetGroup;

            if (this.formData.artifact.generateMetadata == 'existing') {
                this.currentArtifact = null;
                this.setCreateNewArtifact('create');
            }
        }
    }

    createNewGroup() {
        this.formData.group.name = "";
        this.formData.group.title = "";
        this.formData.group.abstract = "";
        this.formData.group.description = "";

        this.save();
    }

    selectArtifact(targetArtifact) {
        if (targetArtifact == null) {
            return;
        }

        var artifact = this.formData.artifact;
        artifact.name = targetArtifact.name;
        artifact.title = targetArtifact.title;
        artifact.abstract = targetArtifact.abstract;
        artifact.description = targetArtifact.description;
        this.currentArtifact = targetArtifact;

        this.availableVersions = this.accountData.versions.filter(function (v) {
            return v.startsWith(targetArtifact.uri);
        });
    }

    selectVersion = function (versionUri) {

        try {
            var relativeUri = new URL(versionUri).pathname;
            var options = {
                method: 'GET',
                url: relativeUri,
                headers: {
                    'Accept': 'application/ld+json',
                    'X-Jsonld-Formatting': 'flatten'
                }
            };

            var version = this.formData.version;
            version.isLoading = true;

            var self = this;

            this.$http(options).then(function (response) {

                var version = self.formData.version;
                version.isLoading = false;

                var versionData = response.data;
                var versionGraph = JsonldUtils.getTypedGraph(versionData, DatabusUris.DATABUS_VERSION);

                version.name = DatabusUtils.uriToName(versionGraph[DatabusUris.JSONLD_ID]);
                version.title = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_TITLE);
                version.abstract = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_ABSTRACT);
                version.description = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_DESCRIPTION);
                version.attribution = JsonldUtils.getProperty(versionGraph, DatabusUris.DATABUS_ATTRIBUTION);
                version.license = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_LICENSE);
                version.derivedFrom = JsonldUtils.getProperty(versionGraph, DatabusUris.PROV_WAS_DERIVED_FROM);
                version.contentVariants = [];

                var contentVariantGraphs = JsonldUtils.getTypedGraphs(versionData, DatabusUris.RDF_PROPERTY);

                for (var contentVariantGraph of contentVariantGraphs) {

                    var variantName = DatabusUtils.uriToName(contentVariantGraph[DatabusUris.JSONLD_ID]);
                    self.formData.addContentVariant(variantName);
                }

                // Add Files!
                var fileGraphs = JsonldUtils.getTypedGraphs(versionData, DatabusUris.DATABUS_PART);
                version.files = [];

                for (var fileGraph of fileGraphs) {

                    var fileUri = JsonldUtils.getProperty(fileGraph, DatabusUris.DCAT_DOWNLOAD_URL);



                    var file = {
                        id: fileUri,
                        url: fileUri,
                        name: DatabusUtils.uriToName(fileUri),
                        compression: JsonldUtils.getProperty(fileGraph, DatabusUris.DATABUS_COMPRESSION),
                        formatExtension: JsonldUtils.getProperty(fileGraph, DatabusUris.DATABUS_FORMAT_EXTENSION),
                        contentVariants: {}
                    }

                    for (var contentVariant of version.contentVariants) {
                        var variantUri = `${DatabusUris.DATABUS_CONTENT_VARIANT_PREFIX}${contentVariant.id}`;
                        var variantValue = JsonldUtils.getProperty(fileGraph, variantUri);

                        if (variantValue != null) {
                            file.contentVariants[contentVariant.id] = variantValue;
                        }
                    }

                    self.formData.addFile(file);
                }


                // Save the preset values
                delete version.preset;
                version.preset = JSON.parse(JSON.stringify(version));
            });


        } catch (err) {
            console.log(err);
        }
    }

    addFile(file) {
        this.formData.addFile(file);
    }


    setCreateNewGroup(value) {
        this.formData.group.generateMetadata = value;
        if (value == 'create') {
            this.formData.group.name = "";
            this.formData.group.title = "";
            this.formData.group.abstract = "";
            this.formData.group.description = "";
            this.formData.group.generateAbstract = true;
            this.currentGroup = null;

            if (this.formData.artifact.generateMetadata == 'existing') {
                this.setCreateNewArtifact('create');
            }
        } else if (value == 'existing') {
            var hasGroups = DatabusUtils.objSize(this.accountData.groups) > 0;

            if (!hasGroups) {
                this.setCreateNewGroup('create');
                return;
            }

            if (this.currentGroup == null) {
                for (var group of this.accountData.groups) {
                    this.selectGroup(group);
                    break;
                }
            }
        }
    }

    setCreateNewArtifact(value) {
        this.formData.artifact.generateMetadata = value;

        if (value == 'create') {

            this.availableVersions = [];
            this.formData.artifact.name = "";
            this.formData.artifact.title = "";
            this.formData.artifact.description = "";
            this.currentArtifact = null;

            if (this.formData.version.generateMetadata == 'existing') {
                this.setCreateNewVersion('create');
            }

        } else if (value == 'existing') {

            if (!this.currentGroup.hasArtifacts) {
                this.setCreateNewArtifact('create');
                return;
            }

            if (this.currentArtifact == null) {
                this.selectArtifact(this.currentGroup.artifacts[0]);
            }
        } else {

            this.availableVersions = [];
            if (this.formData.version.generateMetadata != 'none') {
                this.setCreateNewVersion('none');
            }
        }
    }

    setCreateNewVersion(value) {
        this.formData.version.generateMetadata = value;

        if (value == 'create') {


        } else if (value == 'existing') {

            if (this.availableVersions.length == 0) {
                this.setCreateNewVersion('create');
                return;
            }

            this.selectVersion(this.availableVersions[0]);
        }

    }
    currentGroupHasArtifacts() {
        if (this.formData.group.generateMetadata == 'create') {
            return false;
        }

        return this.currentGroup.artifacts != null && this.currentGroup.artifacts.length > 0;
    }

    initializeField(source, name, defaultValue) {
        this[name] = source != null ? source[name] : defaultValue;
    }

    save() {

        let data = {
            accountData: this.accountData,
            groupData: this.groupData,
            artifactData: this.artifactData,
            versionData: this.versionData,
            formData: this.formData,
        }


        try {
            var sessionDataString = JSON.stringify(data, function (key, value) {
                if (PublishSession.sessionStorageIgnoreKeys.includes(key)) {
                    return undefined;
                }
                return value;
            });

            window.sessionStorage.setItem(PublishSession.sessionStorageKey, sessionDataString);
        } catch (e) {
            console.log(e);
        }
    }

    static resume($http, sub, accountData) {

        var sessionData = JSON.parse(window.sessionStorage.getItem(PublishSession.sessionStorageKey));

        if (sessionData == null || sessionData.sub == null) {
            return null;
        }

        if (sub != sessionData.sub) {
            return null;
        }

        var publishSession = new PublishSession($http, sessionData, accountData);

        return publishSession;
    }

    onChange() {
        this.validate();
        this.inputs = this.dataIdCreator.createInputs();
        this.save();

        if (this.dataIdCreator != undefined) {
            this.inputs = this.dataIdCreator.createInputs();

            this.isReadyForUpload =
                !this.formData.artifact.errors.length > 0 &&
                !this.formData.group.errors.length > 0 &&
                !this.formData.version.errors.length > 0 &&
                !this.formData.files.errors.length > 0;
        }
    }

    onChangeGroup() {

        let group = this.formData.group;

        group.errors = [];
        group.warnings = [];

        if (!DatabusUtils.isValidGroupName(group.name)) {
            group.errors.push('err_invalid_group_name');
        }

        var existingGroup = this.groups.filter(function (value) {
            return value.name == self.group.name;
        });

        if (existingGroup.length > 0 && group.mode == 'create') {
            group.warnings.push('warning_group_exists');
        }

        this.save();
    }

    getValidString(value) {
        if (value == undefined || value.length == 0) {
            return undefined;
        }

        return value;
    }

    updateGroupBody() {
        var accountUri = `${DATABUS_RESOURCE_BASE_URL}/${this.accountData.name}`;

        this.groupBody = {
            "@context": this.getContext(),
            "@graph": [
                {
                    "@id": `${accountUri}/${this.formData.group.name}`,
                    "@type": "Group",
                    "title": this.getValidString(this.formData.group.title),
                    "abstract": this.getValidString(this.formData.group.abstract),
                    "description": this.getValidString(this.formData.group.description)
                }
            ]
        };
    }

    getContext() {
        if (DATABUS_CONTEXT_URL != undefined && DatabusUtils.isValidHttpUrl(DATABUS_CONTEXT_URL)) {
            return DATABUS_CONTEXT_URL;
        }

        return DATABUS_CONTEXT[DatabusUris.JSONLD_CONTEXT];
    }

    onChangeArtifact() {

        let artifact = this.formData.artifact;

        artifact.errors = [];
        artifact.warnings = [];

        if (!DatabusUtils.isValidArtifactName(artifact.name)) {
            artifact.errors.push('err_invalid_artifact_name');
        }

        if (this.artifacts != null) {
            var existingArtifact = this.artifacts.filter(function (value) {
                return value.name == self.group.name;
            });

            if (existingArtifact.length > 0 && artifact.mode == 'create') {
                artifact.warnings.push('warning_group_exists');
            }
        }

        this.save();

    }
}

module.exports = PublishSession;


/***/ },

/***/ "./js/publish/version-handler.js"
/*!***************************************!*\
  !*** ./js/publish/version-handler.js ***!
  \***************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const EntityHandler = __webpack_require__(/*! ./entity-handler */ "./js/publish/entity-handler.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusUris = __webpack_require__(/*! ../utils/databus-uris */ "./js/utils/databus-uris.js");
const GroupData = __webpack_require__(/*! ./group-data */ "./js/publish/group-data.js");

class VersionHandler extends EntityHandler {
  constructor($http, $interval, accounts, apiKeys) {
    super('databus_registration_version_data', $http, $interval, accounts, apiKeys);
  }

  initialize(data) {
    const validAccount = data && this.accounts.some(acc => acc.accountName === data.accountName);

    if (validAccount) {
      Object.assign(this, data);
    } else {
      this.accountName = this.accounts[0]?.name;
    }

    if (this.apiKeyName == null && this.apiKeys != null && this.apiKeys.length > 0) {
      this.apiKeyName = this.apiKeys[0].keyname;
    }

    this.pageIndex ??= 0;
    this.sendmode ??= 'register';
    this.files ??= [];
    this.contentVariants ??= [];

    if (!this.contentVariants.some(v => v.id == 'formatExtension')) {
      this.contentVariants.push({
        label: 'Format',
        id: 'formatExtension',
        custom: false
      });
    }

    if (!this.contentVariants.some(v => v.id == 'compression')) {
      this.contentVariants.push({
        label: 'Compression',
        id: 'compression',
        custom: false
      });
    }

    let self = this;

    this.$interval(function () {
      if (self.hasLicenseQueryChanged) {

        self.$http.get(`/app/publish-wizard/licenses?limit=30&keyword=${self.licenseQuery}`)
          .then(function (response) {
            self.filteredLicenseList = response.data.results.bindings;
          });

        self.hasLicenseQueryChanged = false;
      }

    }, 300);

    this.licenseQuery = "";
    this.filterLicenses();
    this.onAccountNameChanged();
    this.onGroupNameChanged();
    this.onArtifactNameChanged();
  }

  getURI() {
    return `${DATABUS_RESOURCE_BASE_URL}/${this.accountName}/${this.groupName}/${this.artifactName}/${this.name}`;
  }

  setLicense(license) {
    this.license = license;
    this.onChange();
  }

  filterLicenses() {
    this.hasLicenseQueryChanged = true;
  }

  validate() {
    this.errors = [];
    this.warnings = [];

    if (!DatabusUtils.isValidVersionIdentifier(this.name)) {
      this.errors.push('err_invalid_version_name');
    }

    if (!DatabusUtils.isValidGroupName(this.groupName)) {
      this.errors.push('err_no_group_selected');
    }

    if (!DatabusUtils.isValidArtifactName(this.artifactName)) {
      this.errors.push('err_no_artifact_selected');
    }

    if (!DatabusUtils.isValidResourceLabel(this.title)) {
      this.errors.push('err_invalid_version_title');
    }

    if (!DatabusUtils.isValidResourceText(this.abstract, 1)) {
      this.errors.push('err_invalid_version_abstract');
    }

    if (!DatabusUtils.isValidResourceText(this.description, 1)) {
      this.errors.push('err_invalid_version_description');
    }

    if (!DatabusUtils.isValidUrl(this.license)) {
      this.errors.push('err_invalid_version_license');
    }

    if (this.files.length == 0) {
      this.errors.push('err_no_files');
    }

    for (let file of this.files) {
      file.errors = [];
    }

    this.fileErrors = [];

    this.cvSplit(this.files, 0);

    for (let file of this.files) {
      for (let error of file.errors) {
        this.errors.push(error);
        this.fileErrors.push(error);
      }
    }

    const exists = this.artifactList?.some(a => a.name === this.name);
    if (exists) {
      this.warnings.push('warning_artifact_exists');
    }
  }

  getSaveData() {
    return {
      accountName: this.accountName,
      groupName: this.groupName,
      artifactName: this.artifactName,
      name: this.name,
      title: this.title,
      abstract: this.abstract,
      description: this.description,
      sendmode: this.sendmode,
      apiKeyName: this.apiKeyName,
      wasDerivedFrom: this.wasDerivedFrom,
      attribution: this.attribution,
      license: this.license,
      pageIndex: this.pageIndex,
      contentVariants: this.contentVariants,
      files: this.files
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

  async setArtifactName(artifactName) {
    if (this.artifactName !== artifactName) {
      this.artifactName = artifactName;
      await this.onArtifactNameChanged();
    }
  }

  async onArtifactNameChanged() {
    this.isLoadingVersions = true;
    this.versionList = await this.sparqlClient.getVersions(this.accountName, this.groupName, this.artifactName);
    this.isLoadingVersions = false;
    this.onChange();
  }


  updateOutputs() {

    const artifactUri = `${DATABUS_RESOURCE_BASE_URL}/${GroupData.getStringOrMissing(this.accountName)}/${GroupData.getStringOrMissing(this.groupName)}/${GroupData.getStringOrMissing(this.artifactName)}`;
    let versionUri = `${artifactUri}/${GroupData.getStringOrMissing(this.name)}`;

    let graph = {
      "@id": versionUri,
      "@type": "Version",
      "title": this.getValidString(this.title),
      "abstract": this.getValidString(this.abstract),
      "description": this.getValidString(this.description),
      "license": this.getValidString(this.license),
      "attribution": this.getValidString(this.attribution),
      "wasDerivedFrom": this.getValidString(this.wasDerivedFrom),
    }

    graph.distribution = [];


    let customVariants = [];

    for (var fg in this.files) {

      var file = this.files[fg];

      var variantSuffix = '';
      for (var c in this.contentVariants) {
        var cv = this.contentVariants[c];
        var value = file.contentVariants[cv.id];

        if (value == undefined || value == "") {
          continue;
        }

        variantSuffix += '_' + cv.id + '=' + value;
      }

      let fileName = this.artifactName;

      var distributionUri = `${versionUri}#${fileName}`;
      var fileUri = `${versionUri}/${fileName}${variantSuffix}`;

      distributionUri += variantSuffix;

      let formatExtension = this.getValidString(file.contentVariants['formatExtension']);

      if (formatExtension == undefined) {
        formatExtension = 'none';
      }

      if (formatExtension != 'none') {
        distributionUri += '.' + formatExtension;
        fileUri += '.' + formatExtension;
      }

      let compression = this.getValidString(file.contentVariants['compression']);

      if (compression == undefined) {
        compression = 'none';
      }

      if (compression != 'none') {
        distributionUri += '.' + compression;
        fileUri += '.' + compression;
      }

      var distribution = {
        "@type": "Part",
        "formatExtension": formatExtension,
        "compression": compression,
        "downloadURL": file.uri,
        "byteSize": file.byteSize,
        "sha256sum": file.sha256sum,
      };

      for (var c in this.contentVariants) {
        var cv = this.contentVariants[c];

        if (!cv.custom) {
          continue;
        }

        var value = file.contentVariants[cv.id];

        if (value == undefined || value == "") {
          continue;
        }

        distribution['dcv:' + cv.label] = value;

        if (!customVariants.includes(cv.id)) {
          customVariants.push(cv.id);
        }
      }

      graph.distribution.push(distribution);
    }




    this.postBody = {
      "@context": this.getContext(),
      "@graph": [
        graph
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

  createVersionName(v) {
    if (v == 0) {
      this.name = new Date().toISOString().slice(0, 10);
    }

    if (v == 1) {
      this.name = new Date().toISOString().slice(0, 13);
    }

    this.onChange();
  }

  changePage(diff) {
    this.pageIndex = Math.max(0, this.pageIndex + diff);
    this.onChange();
  };

  addContentVariant(variant) {

    if (variant == undefined || variant == '') {
      return;
    }

    if (this.contentVariants == undefined) {
      this.contentVariants = [];
    }

    for (var c in this.contentVariants) {
      if (this.contentVariants[c].id == variant) {
        return;
      }
    }

    this.contentVariants.push({
      label: variant,
      id: DatabusUtils.uuidv4(),
      fillRegex: '',
      toLower: true,
      pruneWhitespaces: true,
      custom: true,
    });

    this.onChange();
  }


  removeContentVariant(variant) {
    this.contentVariants = this.contentVariants.filter(function (d) {
      return d.id != variant.id;
    });

    for (var f in this.files) {
      var file = this.files[f];
      delete file.contentVariants[variant.id];
    }

    this.editContentVariant = null;
    this.onChange();
  }

  addFiles(input) {
    var lines = input.split('\n');
    for (var line of lines) {
      if (line != undefined && line.length > 0) {
        this.addFile(line);
      }
    }
  }

  addFile(file) {

    if (typeof file === 'string') {
      file = { url: file };
    }

    if (this.files == undefined) {
      this.files = [];
    }

    // Check if already added
    for (var f in this.files) {
      if (file.url == this.files[f].url) {
        return;
      }
    }

    var uri = file.url;
    var uriParts = uri.split('/');
    var name = uriParts.pop();
    var nameComponents = name.split('.');
    name = nameComponents[0];

    if (name.length > 50) {
      name = name.substr(0, 50) + '...';
    }

    name = decodeURIComponent(name);
    // Files with uri as key!!

    this.files.push({
      id: uri,
      uri: file.url,
      name: name,
      contentVariants: file.contentVariants != null ? file.contentVariants : {},
      rowspan: 1,
    });

    this.files.sort(function (a, b) {
      var nameA = a.name;
      var nameB = b.name;

      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }

      return 0;
    });

    let k = 1;

    for (let file of this.files) {
      file.rowIndex = k++;
    }

    this.onChange();
  }

  removeFile = function (file, index) {
    this.files.splice(index, 1);
    this.onChange();
  }


  fill(variant) {

    var val = variant.fillRegex;

    for (var file of this.files) {

      if (variant.toLower) {
        val = val.toLowerCase();
      }

      if (variant.pruneWhitespaces) {
        val = val.replaceAll(' ', '');
      }

      if (!variant.overwrite && file.contentVariants[variant.id] != undefined
        && file.contentVariants[variant.id].length > 0) {
        continue;
      }

      file.contentVariants[variant.id] = val;
    }

    this.onChange();
  }

  fillByRegex(variant) {
    var regex = new RegExp(variant.fillRegex);

    for (var file of this.files) {
      var matches = file.name.match(regex);

      if (matches != null) {
        var val = matches[0];

        if (variant.toLower) {
          val = val.toLowerCase();
        }

        if (variant.pruneWhitespaces) {
          val = val.replaceAll(' ', '');
        }

        if (!variant.overwrite && file.contentVariants[variant.id] != undefined
          && file.contentVariants[variant.id].length > 0) {
          continue;
        }

        file.contentVariants[variant.id] = val;
      }
    }

    this.onChange();
  }

  getRowIndex(files, name) {
    var k = 1;
    for (var f in files) {
      if (files[f].name == name) {
        return k;
      }

      k++;
    }

    return -1;
  }


  cvSplit(files, cvIndex) {

    if (files.length <= 1) {
      return;
    }

    if (this.contentVariants == undefined) {
      this.contentVariants = [];
    }
    // if end of cvs, assign errors to all files if files.length > 1
    if (cvIndex - 2 >= this.contentVariants.length) {

      if (files.length > 1) {

        var cvHints = [];

        if (this.contentVariants.length == 0) {
          cvHints.push('No content variants have been added yet. Add content variants in the files panel in order to tag your files.');
        } else {
          for (var c in this.contentVariants) {
            var cv = this.contentVariants[c];
            var value = files[0].contentVariants[cv.id];

            if (value == undefined || value == '') {
              value = 'none';
            }

            cvHints.push(cv.id + ': ' + value);
          }
        }

        for (let file of files) {

          var errorMessage = 'Row ' + file.rowIndex + ' (' +
            cvHints.join(', ') + ').';

          file.errors.push({ key: 'err_duplicate_file', message: errorMessage });
        }
      }

      return;
    }

    // else create buckets and sort files into buckets
    var buckets = {};

    for (var f in files) {
      var file = files[f];

      var key = null;

      if (cvIndex == 0) {
        key = file.formatExtension;
      } else if (cvIndex == 1) {
        key = file.compression;
      } else {
        key = file.contentVariants[this.contentVariants[cvIndex - 2].id];
      }

      if (key == undefined || key == '') {
        key = '$_none$';
      }

      if (buckets[key] == undefined) {
        buckets[key] = [];
      }

      buckets[key].push(file);
    }

    // iterate buckets and call recursively
    for (var b in buckets) {
      this.cvSplit(buckets[b], cvIndex + 1);
    }
  }

  onEditContentVariant(index) {
    this.editContentVariant = this.contentVariants[index];
  }

}

module.exports = VersionHandler;


/***/ },

/***/ "./js/query-builder/query-builder.js"
/*!*******************************************!*\
  !*** ./js/query-builder/query-builder.js ***!
  \*******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const QueryNode = __webpack_require__(/*! ./query-node */ "./js/query-builder/query-node.js");

class QueryBuilder {

  static build(config) {
    var builder = new QueryBuilder();
    return builder.createQuery(config.node, config.template, config.resourceBaseUrl, config.root);
  }


  isValidHttpUrl(string) {
    let url;

    try {
      url = new URL(string);
    } catch (_) {
      return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
  }

  uniqueList(arr) {
    var u = {}, a = [];
    for (var i = 0, l = arr.length; i < l; ++i) {
      if (!u.hasOwnProperty(arr[i])) {
        a.push(arr[i]);
        u[arr[i]] = 1;
      }
    }
    return a;
  }

  createQuery(node, template, resourceBaseUrl, root) {

    this.result = '';
    this.baseNode = node;
    this.root = root != undefined ? root : node;
    this.cvCounter = 0;
    this.resourceBaseUrl = resourceBaseUrl;
    this.select = template.select;
    this.template = template.body;
    this.templateInsertionKey = template.placeholder != undefined ? template.placeholder : `%QUERY%`;
    this.prefixes = template.prefixes;
    this.aggregate = template.aggregate;
    this.stringSuffix = '';

    this.appendLine(this.select, 0);
    this.appendLine(`{`, 0);
    this.createNodeSubquery(node, template.indent, false);
    this.appendLine(`}`, 0);

    if (this.aggregate != undefined) {
      this.appendLine(this.aggregate, 0);
    }

    this.prependPrefixes();
    return this.result;
  }

  removeAndCollectPrefixes(query) {
    var lines = query.split('\n');
    var result = "";

    for (var line of lines) {
      if (line.toLowerCase().startsWith('prefix')) {
        this.prefixes.push(line);
      } else {
        result += line + '\n';
      }
    }

    return result.substring(0, result.length - 1);
  }

  prependPrefixes() {

    this.prefixes = this.uniqueList(this.prefixes);

    for (var line of this.prefixes) {
      this.prependLine(line, 0);
    }
  }

  appendTemplateHeader(indent) {
    for (var line of this.template) {

      if (line == this.templateInsertionKey) {
        break;
      }

      this.appendLine(line, indent);
    }
  }

  appendTemplateFooter(indent) {
    var write = false;

    for (var line of this.template) {

      if (write) {
        this.appendLine(line, indent);
      }

      if (line == this.templateInsertionKey) {
        write = true;
      }
    }
  }

  appendTemplate(node, indent) {

    this.appendTemplateHeader(indent);
    this.createNodeSubquery(node, indent + 1, true);

    if (node.property == null && node.childNodes.length == 0) {
      this.appendLine(`?distribution a dataid:Nonsense .`, indent + 1)
    }

    this.appendTemplateFooter(indent);
  }

  /**
   * Create a subquery for any query node. The subquery consist of the node facets and
   * a UNION of child node queries (this function is called revursively on the child nodes)
   * @param {*} node 
   */
  createNodeSubquery(node, indent, hasService) {
    // Initialize empty result

    if (hasService == undefined) {
      hasService = false;
    }

    // Get source...
    var sourceUri = this.findSourceUri(node);

    if (!hasService && sourceUri != null) {

      if (sourceUri != this.resourceBaseUrl) {
        this.appendLine(`SERVICE <${sourceUri}/sparql>`, indent);
        this.appendLine(`{`, indent);

        this.appendTemplate(node, indent + 1);
        this.appendLine(`}`, indent);

      } else {
        this.appendTemplate(node, indent);
      }

      return;
    }

    if (node.uri != null) {

      if (!this.isValidHttpUrl(node.uri)) {

        // Custom query node
        var query = this.removeAndCollectPrefixes(node.property);
        var lines = query.split('\n');
        for (var line of lines) {
          this.appendLine(line, indent);
        }

        return;
      }
    }

    // If a node property was set, add it as a restriction
    if (node.property != undefined) {
      this.appendLine(`?dataset ${node.property} <${node.uri}> .`, indent);
      // If no property was set, we are dealing with a source node
    } else {

    }

    // Create the node facets sub query 
    this.createNodeFacetsSubquery(node, indent);

    // Call recursively on the children and UNION the results

    var k = 0;

    for (var i in node.childNodes) {
      if (k > 0) this.appendLine('UNION', indent);

      if (node.childNodes[i].childNodes == null) {
        return;
      }

      if (node.childNodes[i].property == undefined && node.childNodes[i].childNodes.length == 0) {
        continue;
      }

      this.appendLine('{', indent);
      this.createNodeSubquery(node.childNodes[i], indent + 1, hasService);
      this.appendLine('}', indent);
      k++
    }

    return this.result;
  }

  findSourceUri(node) {
    if (node.uri == null) {
      return null;
    }

    if (!this.isValidHttpUrl(node.uri)) {
      return null;
    }

    var url = new URL(node.uri);
    return url.origin;
  }

  /**
   * Create restrictions that only occur on this node and none of its children
   * Added restriction have to be enriched with their parent node settings
   * @param {*} groupNode 
   */
  createNodeFacetsSubquery(node, indent) {

    var facetUris = this.findAllNodeFacets(node);

    // Iterate over all the facet settings of the node
    for (var i in facetUris) {

      var facetUri = facetUris[i];

      // We only add facets to the node if the facet is not overriden by any child nodes
      if (!this.hasFacetOverride(node, facetUri)) {

        // We create the subquery while merging the facet settings from this node to the root of the query tree
        this.createFacetSubquery(node, facetUri, indent);
      }
    }
  }

  // Check whether any child node of the passed node overrides a specific facet
  hasFacetOverride(node, facetUri) {

    // If we don't have any children, there are no overrides
    if (node.childNodes.length == 0) {
      return false;
    }

    // ======= SPECIAL TREATMENT OF VERSION/LATEST =======
    // Treat as if overriden (leaf nodes already excluded)
    // ===================================================
    if (facetUri == 'http://purl.org/dc/terms/hasVersion') {
      for (var i in node.facetSettings[facetUri]) {
        if (node.facetSettings[facetUri][i].value == '$latest') {
          return true;
        }
      }
    }

    // Iterate through the child nodes
    for (var i in node.childNodes) {
      var childNode = node.childNodes[i];

      // If the child node overrides the facet then yes, we have an override
      if (childNode.facetSettings[facetUri] != undefined) {
        return true;
      }

      // If any of the child node's children has an override, we have an override
      if (this.hasFacetOverride(childNode, facetUri)) {
        return true;
      }
    }

    // Nothing found in the children? No override!
    return false;
  }

  /**
   * Generates the sub query for a specific node and facet
   * @param {*} node 
   * @param {*} facetUri 
   */
  createFacetSubquery(node, facetUri, indent) {
    var first = true;


    // If we add a facet setting, we have to include the facets of all the ancestor nodes
    var settings = this.createEnrichedSettings(node, facetUri);
    settings = settings.filter(function (s) {
      return s.checked;
    });

    if (settings.length == 1) {
      var facetSettingEntry = settings[0];
      if (!facetSettingEntry.checked) return;

      if (facetSettingEntry.value == '$latest' && facetUri == 'http://purl.org/dc/terms/hasVersion') {
        // Add the special latest version facet value restriction.
        this.appendLine('{', indent);
        this.appendLine('?distribution dct:hasVersion ?version {', indent + 1);
        this.appendLine('SELECT (?v as ?version) { ', indent + 2);
        this.appendLine('GRAPH ?g2 { ', indent + 3);
        this.appendLine(`?dataset ${node.property} <${node.uri}> . `, indent + 4);
        this.appendLine('?dataset dct:hasVersion ?v . ', indent + 4);
        this.appendLine('}', indent + 3);
        this.appendLine('} ORDER BY DESC (STR(?version)) LIMIT 1 ', indent + 2);
        this.appendLine('}', indent + 1);
        this.appendLine('}', indent);
      }
      else {
        // Add the facet value restriction
        this.appendLine(`{ ?distribution <${facetUri}> '${facetSettingEntry.value}'${this.stringSuffix} . }`, indent);
      }
    }
    else if (settings.length > 1) {

      // More than one value for this facet

      if (facetUri == 'http://purl.org/dc/terms/hasVersion') {

        // Iterate..
        for (var i in settings) {

          var facetSettingEntry = settings[i];
          if (!facetSettingEntry.checked) continue;

          if (!first) this.appendLine("UNION", indent);

          if (facetSettingEntry.value == '$latest' && facetUri == 'http://purl.org/dc/terms/hasVersion') {
            // Add the special latest version facet value restriction.
            this.appendLine('{', indent);
            this.appendLine('?distribution dct:hasVersion ?version {', indent + 1);
            this.appendLine('SELECT (?v as ?version) { ', indent + 2);
            this.appendLine('GRAPH ?g2 { ', indent + 3);
            this.appendLine(`?dataset ${node.property} <${node.uri}> . `, indent + 4);
            this.appendLine('?dataset dct:hasVersion ?v . ', indent + 4);
            this.appendLine('}', indent + 3);
            this.appendLine('} ORDER BY DESC (STR(?version)) LIMIT 1 ', indent + 2);
            this.appendLine('}', indent + 1);
            this.appendLine('}', indent);
          }
          else {
            // Add the facet value restriction
            this.appendLine(`{ ?distribution <${facetUri}> '${facetSettingEntry.value}'${this.stringSuffix} . }`, indent);
          }

          // If we have more than one value for this facet we need a UNION
          first = false;
        }

      } else {
        this.appendLine('{', indent);
        this.appendLine(`?distribution <${facetUri}> ?c${this.cvCounter} .`, indent + 1);
        this.appendLine(`VALUES ?c${this.cvCounter} {`, indent + 1);

        for (var i in settings) {
          var facetSettingEntry = settings[i];
          if (!facetSettingEntry.checked) continue;
          this.appendLine(`'${facetSettingEntry.value}'${this.stringSuffix}`, indent + 2);
        }
        this.appendLine(`}`, indent + 1);
        this.appendLine(`}`, indent);
        this.cvCounter++;
      }
    }
  }

  /**
   * Create a list of all the node facets and all overriden ancestor facets that might not be explicitly
   * included in the node facet list
   * @param {*} node 
   */
  findAllNodeFacets(node) {
    var facetUris = [];

    for (var facetUri in node.facetSettings) {
      facetUris.push(facetUri);
    }

    var parentNode = QueryNode.findParentNodeRecursive(this.root, node); // node.parent;

    while (parentNode != undefined) {

      for (var facetUri in parentNode.facetSettings) {

        // check the base node -> if current node is the base, include all parent facets
        // on the way too the root
        if (node != this.baseNode && !this.hasFacetOverride(parentNode, facetUri)) {
          continue;
        }


        if (facetUris.includes(facetUri)) {
          continue;
        }

        facetUris.push(facetUri);
      }

      parentNode = QueryNode.findParentNodeRecursive(this.root, parentNode); // parentNode.parent;
    }

    return facetUris;
  }

  /**
   * For a given facet, add up all the active settings up to the root node of the
   * query tree. Node settings override ancestor node settings.
   * @param {*} node 
   * @param {*} facetUri 
   */
  createEnrichedSettings(node, facetUri) {
    var result = [];
    for (var i in node.facetSettings[facetUri]) {
      result.push(node.facetSettings[facetUri][i]);
    }

    var parentNode = QueryNode.findParentNodeRecursive(this.root, node); // node.parent;

    while (parentNode != undefined) {

      for (var i in parentNode.facetSettings[facetUri]) {
        var parentSetting = parentNode.facetSettings[facetUri][i];
        var hasSetting = false;
        for (var j in result) {
          if (result[j].value == parentSetting.value) {
            hasSetting = true;
            break;
          }
        }

        if (!hasSetting) {
          result.push(parentSetting);
        }
      }

      parentNode = QueryNode.findParentNodeRecursive(this.root, parentNode); //parentNode.parent;
    }


    return result;
  }

  /**
   * Appens a line to the global result prepending a specified number of tab characters
   * @param {*} line 
   * @param {*} indent 
   */
  appendLine(line, indent) {
    for (var i = 0; i < indent; i++) this.result += '\t';
    this.result += line;
    this.result += '\n';
  }

  /**
   * Appens a line to the global result prepending a specified number of tab characters
   * @param {*} line 
   * @param {*} indent 
   */
  prependLine(line, indent) {
    var text = '';
    for (var i = 0; i < indent; i++) text += '\t';
    text += line;
    this.result = text + '\n' + this.result;
  }
}

module.exports = QueryBuilder;


/***/ },

/***/ "./js/query-builder/query-node.js"
/*!****************************************!*\
  !*** ./js/query-builder/query-node.js ***!
  \****************************************/
(module) {

/**
 * A query node is a node in a query tree. A query tree can be built for any hierarchical selection
 * on the databus, such as publishers, groups, artifacts and collections.
 * Each node may declare a range of restrictions. Restrictions can then be overriden again by
 * any child node in the hierarchy.
 * 
 * EXAMPLE: Group node says: Select everything in English. One specific artifact child node of the
 * group node then states: I don't want to select English, I will select German. 
 * 
 * A query tree can then be translated into a SPARQL query that tries to use as few statements as possible
 * to fetch the desired data
 */
class QueryNode {

  /**
   * Creates a new QueryNode with a resource URI and a property. The property will be added to the
   * query as a forced and non-overrideable restriction
   * @param {*} uri 
   * @param {*} property 
   */
  constructor(uri, property) {
    this.uri = uri;
    this.property = property;
    this.childNodes = [];
    this.facetSettings = {};
  }

  // Set or unset a facet of the query node
  setFacet(key, value, checked) {

    var list = this.facetSettings[key];

    if(list == undefined) {
      this.facetSettings[key] = [];
      list = this.facetSettings[key];
    }

    if(!this.isOverride(key, value, checked)) {
      
      for(var i = 0; i < list.length; i++) {
        if(list[i].value == value) {
          list.splice(i, 1);
        }
      }

      if(list.length == 0) {
        delete this.facetSettings[key];
      }
      
      return;
    }

    for(var i in list) {
      if(list[i].value == value) {
        list[i].checked = checked;
        return;
      }
    }
   
    list.push({ value : value, checked : checked });
  }

  

  /**
   * Check whether a certain facet setting is an override in the hierarchy
   * @param {*} key 
   * @param {*} value 
   * @param {*} checked 
   */
  isOverride(key, value, checked) {

    if(checked == undefined) {
      var setting = QueryNode.findFacetSetting(this, key, value);
      checked = setting != null ? setting.checked : false;
    }

    var parentSetting = QueryNode.findInheritedSetting(this.parent, key, value);

    if(parentSetting == undefined) {
      return checked;
    }

    return parentSetting.checked != checked;
  }

  /**
   * Add a child node to this node
   * @param {*} node 
   */
  addChild(node) {
    this.childNodes.push(node);
    // node.parent = this;
  }

  static removeChildByUri(node, uri) {
    for(var i = 0; i < node.childNodes.length; i++) {
      if(node.childNodes[i].uri == uri) {
        node.childNodes.splice(i, 1);
        return;
      }

      QueryNode.removeChildByUri(node.childNodes[i], uri);
    }
  }

  static findChildByUri(node, uri) {
    for(let i = 0; i < node.childNodes.length; i++) {
      if(node.childNodes[i].uri === uri) {
        node.childNodes[i] = QueryNode.createFrom(node.childNodes[i]);
        return node.childNodes[i];
      }

      let result = QueryNode.findChildByUri(node.childNodes[i], uri);

      if(result != null) {
        return result;
      }
    }

    return null;  
  }

  hasFacetSetting(key, value) {
    for(var i in this.facetSettings[key]) {

      var setting = this.facetSettings[key][i];

      if(setting.value == value) {
        return true;
      }
    }

    return false;
  }

   /**
   * Create a settings object with all the facet settings active for this node (inluding inherited settings)
   * @param {*} node 
   */
  createFullFacetSettings() {
    
    var fullSettings = {};

    for(var facetUri in this.facetSettings) {
      fullSettings[facetUri] = JSON.parse(JSON.stringify(this.facetSettings[facetUri]));
    }

    var parentNode = this.parent;

    while(parentNode != undefined) {

      for(var facetUri in parentNode.facetSettings) {

        if(fullSettings[facetUri] == undefined) {
          fullSettings[facetUri] = [];
        }
        
        for(var i in parentNode.facetSettings[facetUri]) {

          var parentSetting = parentNode.facetSettings[facetUri][i];

          if(!this.hasFacetSetting(facetUri, parentSetting.value)) {
            fullSettings[facetUri].push(JSON.parse(JSON.stringify(parentSetting)));
          }
        }
      }

      parentNode = parentNode.parent;
    }

    return fullSettings;
  }

  static serialize(queryNode) {
    // QueryNode.clearParents(queryNode);
    var result = JSON.stringify(queryNode);
    // QueryNode.assignParents(queryNode);
    return result;
  }


  static addChild(node, child) {
    node.childNodes.push(child);
    // child.parent = node;
  }

  static mergeAddChild(root, child) {
    var existingNode = QueryNode.findChildByUri(root, child.uri);

    if(existingNode == null) {
      QueryNode.addChild(root, child); 
      return true;
    }

    if(child.childNodes.length == 0) {
      return false;
    }

    for(var i in child.childNodes) {
      QueryNode.mergeAddChild(existingNode, child.childNodes[i]);
    }
  }

  /*
  static clearParents(queryNode) {
    queryNode.parent = null;
    for(var i = 0; i < queryNode.childNodes.length; i++) {
      QueryNode.clearParents(queryNode.childNodes[i]);
    }
  }

  static assignParents(queryNode) {
    for(var i = 0; i < queryNode.childNodes.length; i++) {
      queryNode.childNodes[i].parent = queryNode;
      QueryNode.assignParents(queryNode.childNodes[i]);
    }
  }
*/

  static expandAll(queryNode) {
    queryNode.expanded = true;
    for(var i = 0; i < queryNode.childNodes.length; i++) {
      QueryNode.expandAll(queryNode.childNodes[i]);
    }
  }

  static findParentNodeRecursive(parent, node) {

    if(node.uri == null) {
      return null;
    }
    
    if(parent.childNodes == null || parent.childNodes.length == 0) {
      return null;
    }

    for(var child of parent.childNodes) {
      if(child.uri == node.uri) {
        return parent;
      }
    }     
    
    for(var child of parent.childNodes) {
      var recParent = QueryNode.findParentNodeRecursive(child, node);

      if(recParent != null) {
        return recParent;
      }
    }

    return null;
  }

  /**
   * Copy constructor to use the QueryNode class inside of angular components
   * @param {*} obj 
   */
  static createFrom(obj) {
    var tmpNode = new QueryNode(obj.uri, obj.property);
    tmpNode.childNodes = obj.childNodes;
    tmpNode.facetSettings = obj.facetSettings;
    // tmpNode.parent = obj.parent;
    tmpNode.files = obj.files;
    return tmpNode;
  }

  static createSubTree(obj) {
    var node = QueryNode.createFrom(obj);
    node.facetSettings = node.createFullFacetSettings();
    // node.parent = null;
    return node;
  }

  /**
   * Search a specific node for a certain facet setting
   * @param {*} node 
   * @param {*} key 
   * @param {*} value 
   */
  static findFacetSetting(node, key, value) {
    if(node == undefined || node.facetSettings == undefined) {
      return undefined;
    }

    var settingsList = node.facetSettings[key];

    if(settingsList == undefined) {
      return undefined;
    }

    for(var i in settingsList) {
      var setting = settingsList[i];

      if(setting.value == value) {
        return setting;
      }
    }

    return undefined;
  }

  static findInheritedSetting(node, key, value) {
    
    if(node == null) {
      return undefined;
    }

    var setting = QueryNode.findFacetSetting(node, key, value);

    if(setting == undefined) {
      return QueryNode.findInheritedSetting(node.parent, key, value);
    }

    return setting;
  }
}

module.exports = QueryNode;


/***/ },

/***/ "./js/query-builder/query-templates.js"
/*!*********************************************!*\
  !*** ./js/query-builder/query-templates.js ***!
  \*********************************************/
(module) {

/**
 * Query Templates can be defined as object with the fields:
 * > select
 * > body
 * > aggregate
 * 
 * The select is a SPARQL select statement. The body is an array of strings with each string being a line of a 
 * SPARQL query. The string %QUERY% can be used to insert the query generated by the QueryBuilder. The aggregate
 * is a SPARQL aggregate statement.
 */
 class QueryTemplates {

  static DEFAULT_PREFIXES = [
    `PREFIX databus: <https://dataid.dbpedia.org/databus#>`,
    `PREFIX dcv: <https://dataid.dbpedia.org/databus-cv#>`,
    `PREFIX dct:    <http://purl.org/dc/terms/>`,
    `PREFIX dcat:   <http://www.w3.org/ns/dcat#>`,
    `PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>`,
    `PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>`
  ];

  static COLLECTION_TABLE_ROW_QUERY = `
PREFIX databus: <https://dataid.dbpedia.org/databus#>
PREFIX dcv: <https://dataid.dbpedia.org/databus-cv#>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX dcat:   <http://www.w3.org/ns/dcat#>
PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?file SAMPLE(?version) SAMPLE(?title) SAMPLE(?abstract) SAMPLE(?license) SAMPLE(?size) SAMPLE(?format) SAMPLE(?compression) (GROUP_CONCAT(DISTINCT ?var; SEPARATOR=', ') AS ?variant) WHERE {
  <%DISTRIBUTION%> databus:file ?file .
  <%DISTRIBUTION%> databus:formatExtension ?format .
  <%DISTRIBUTION%> databus:compression ?compression .
  <%DISTRIBUTION%> dcat:byteSize ?size .
  ?version dcat:distribution <%DISTRIBUTION%> .
  ?version dct:title ?title .
  ?version dct:abstract ?abstract.
  ?version dct:license ?license .

  OPTIONAL { <%DISTRIBUTION%> ?p  ?var. ?p rdfs:subPropertyOf databus:contentVariant . }
} GROUP BY ?file
`;

static COLLECTION_TABLE_QUERY = `
PREFIX databus: <https://dataid.dbpedia.org/databus#>
PREFIX dcv: <https://dataid.dbpedia.org/databus-cv#>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX dcat:   <http://www.w3.org/ns/dcat#>
PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?distribution SAMPLE(?file) AS ?file SAMPLE(?version) AS ?version SAMPLE(?title) AS ?title SAMPLE(?abstract) AS ?abstract SAMPLE(?license) AS ?license SAMPLE(?size) AS ?size SAMPLE(?format) AS ?format SAMPLE(?compression) AS ?compression (GROUP_CONCAT(DISTINCT ?var; SEPARATOR=', ') AS ?variant) WHERE {
  VALUES ?distribution {
    %DISTRIBUTIONS%
  }
  ?distribution databus:file ?file .
  ?distribution databus:formatExtension ?format .
  ?distribution databus:compression ?compression .
  ?distribution dcat:byteSize ?size .
  ?version dcat:distribution ?distribution .
  ?version dct:title ?title .
  ?version dct:abstract ?abstract.
  ?version dct:license ?license .
  OPTIONAL { ?distribution ?p  ?var. ?p rdfs:subPropertyOf databus:contentVariant . }
} GROUP BY ?distribution
`;

  static COLLECTION_STATISTICS_TEMPLATE = {
    indent: 1,
    prefixes: QueryTemplates.DEFAULT_PREFIXES,
    select: `SELECT DISTINCT ?dataset ?file ?license ?size WHERE`,
    body: [
      `GRAPH ?g`,
      `{`,
      `%QUERY%`,
      `\t?dataset dcat:distribution ?distribution .`,
      `\t?distribution databus:file ?file .`,
      `\tOPTIONAL { ?dataset dct:license ?license . }`,
      `\tOPTIONAL { ?distribution dcat:byteSize ?size . }`,
      `}`
    ]
  };

  static COLLECTION_FILES_TEMPLATE = {
    prefixes: QueryTemplates.DEFAULT_PREFIXES,
    indent: 1,
    select: `SELECT DISTINCT ?version ?dataset ?distribution ?title ?description (GROUP_CONCAT(DISTINCT ?file; SEPARATOR=", ") AS ?files) ?license ?size ?format (GROUP_CONCAT(DISTINCT ?var; SEPARATOR=', ') AS ?variant) WHERE`,
    body: [
      `GRAPH ?g`,
      `{`,
      `%QUERY%`,
      `\t?distribution databus:file ?file .`,
      `\t?distribution databus:formatExtension ?format .`,
      `\tOPTIONAL { ?distribution ?p  ?var. ?p rdfs:subPropertyOf databus:contentVariant . }`,
      `\tOPTIONAL { ?dataset dct:license ?license . }`,
      `\tOPTIONAL { ?distribution dcat:byteSize ?size . }`,
      `\t?dataset dcat:distribution ?distribution .`,
      `\t?dataset dct:hasVersion ?version .`,
      `\t?dataset dct:title ?title .`,
      `\t?dataset dct:description ?description.`,
      `}`
    ],
    aggregate: `GROUP BY ?version ?dataset ?distribution ?title ?description ?license ?size ?format`
  };

  /**
   * Selects files with additional information for group pages
   */
   static GROUP_PAGE_FILE_BROWSER_TEMPLATE = {
    prefixes: QueryTemplates.DEFAULT_PREFIXES,
    indent: 1,
    select: `SELECT DISTINCT ?file ?version ?artifact ?license ?size ?format ?compression (GROUP_CONCAT(DISTINCT ?var; SEPARATOR=', ') AS ?variant) WHERE`,
    body: [

      `GRAPH ?g`,
      `{`,
      `%QUERY%`,
      `\t?dataset dcat:distribution ?distribution .`,
      `\t?distribution databus:file ?file .`,
      `\t?distribution databus:formatExtension ?format .`,
      `\t?distribution databus:compression ?compression .`,
      `\t?dataset dct:license ?license .`,
      `\t?dataset dct:hasVersion ?version .`,
      `\t?dataset databus:artifact ?artifact .`,
      `\tOPTIONAL { ?distribution ?p ?var. ?p rdfs:subPropertyOf databus:contentVariant . }`,
      `\tOPTIONAL { ?distribution dcat:byteSize ?size . }`,
      `}`
    ],
    aggregate: `GROUP BY ?file ?version ?artifact ?license ?size ?format ?compression`
  };

  /**
   * Selects files with additional information
   */
  static NODE_FILE_TEMPLATE = {
    prefixes: QueryTemplates.DEFAULT_PREFIXES,
    indent: 1,
    select: `SELECT DISTINCT ?file ?license ?size ?format ?compression (GROUP_CONCAT(DISTINCT ?var; SEPARATOR=', ') AS ?variant) WHERE`,
    body: [

      `GRAPH ?g`,
      `{`,
      `%QUERY%`,
      `\t?dataset dcat:distribution ?distribution .`,
      `\t?distribution databus:file ?file .`,
      `\t?distribution databus:formatExtension ?format .`,
      `\t?distribution databus:compression ?compression .`,
      `\t?dataset dct:license ?license .`,
      `\tOPTIONAL { ?distribution ?p ?var. ?p rdfs:subPropertyOf databus:contentVariant . }`,
      `\tOPTIONAL { ?distribution dcat:byteSize ?size . }`,
      `}`
    ],
    aggregate: `GROUP BY ?file ?license ?size ?format ?compression`
  };

  /**
   * The default selection (only file)
   */
  static DEFAULT_FILE_TEMPLATE = {
    prefixes: QueryTemplates.DEFAULT_PREFIXES,
    indent: 1,
    select: `SELECT ?file WHERE`,
    body: [
      `GRAPH ?g`,
      `{`,
      `%QUERY%`,
      `\t?dataset dcat:distribution ?distribution .`,
      `\t?distribution databus:file ?file .`,
      `}`,
    ]
  };

  static DISTRIBUTIONS_TEMPLATE = {
    prefixes: QueryTemplates.DEFAULT_PREFIXES,
    indent: 1,
    select: `SELECT ?distribution WHERE`,
    body: [
      `GRAPH ?g`,
      `{`,
      `%QUERY%`,
      `\t?dataset dcat:distribution ?distribution .`,
      `}`,
    ]
  };

  /**
   * The default selection (only file)
   */
   static CUSTOM_QUERY_FILE_TEMPLATE = {
    prefixes: QueryTemplates.DEFAULT_PREFIXES,
    indent: 1,
    select: `SELECT ?file WHERE`,
    body: [
      `{`,
      `%QUERY%`,
      `}`,
    ]
  };
}

module.exports = QueryTemplates;

/***/ },

/***/ "./js/search/search-adapter.js"
/*!*************************************!*\
  !*** ./js/search/search-adapter.js ***!
  \*************************************/
(module) {





class SearchAdapter {

    static list = [
        { 
            name: 'lookup',
            label: 'Lookup',
            factory: this.lookup
        }
        /*
        {
            name: 'virtuoso',
            label: 'Virtuoso SPARQL',
            factory: this.virtuoso
        }
        */
    ];

    constructor($http, endpoint, queryFormatter, resultFormatter) {
        this.http = $http;
        this.endpoint = endpoint;
        this.queryFormatter = queryFormatter;
        this.resultFormatter = resultFormatter;
    }

    static inferResourceTypes(docs) {
        // TODO:
    }
    

    static lookup($http, endpoint) {
        return new SearchAdapter($http, endpoint, function(query) {
            return `?query=${query}&format=json`;
        }, function(response) {
            var docs = response.data.docs;
            SearchAdapter.inferResourceTypes(docs);
            return docs;
        });
    }

    static virtuoso($http, endpoint) {
        var virtuosoAdapter = new SearchAdapter($http, endpoint, function (query) {
            var querySelector = /(?<=\?|&)query=[^(&#)]*/;

            // TODO: get the query input from the query
        }, function (results) {
            // TODO: format virtuoso search results
        });

        return virtuosoAdapter;
    }

   

    async search(query) {
        try {
            if (this.queryFormatter != null) {
                query = this.queryFormatter(query);
            }

            var results = await this.http.get(`${this.endpoint}${query}`);

            if (this.resultFormatter != null) {
                return this.resultFormatter(results);
            }

            return results;
        } catch (err) {
            console.log(err);
            return null;
        }
    }
}

module.exports = SearchAdapter;

/***/ },

/***/ "./js/search/search-manager.js"
/*!*************************************!*\
  !*** ./js/search/search-manager.js ***!
  \*************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const AppJsonFormatter = __webpack_require__(/*! ../utils/app-json-formatter */ "./js/utils/app-json-formatter.js");
const SearchAdapter = __webpack_require__(/*! ./search-adapter */ "./js/search/search-adapter.js");

class SearchManager {

    constructor($http, $interval) {
        this.http = $http;
        this.searchExtensions = [];

        this.baseAdapter = SearchAdapter.lookup(this.http, `/api/search`);
        this.searchExtensions.push({
            endpointUri: `/api/search`,
            adapterName: `lookup`,
            adapter: this.baseAdapter
        });
    }

    mergeResults(results, documents) {
        for(var document of documents) {
            results.push(document);
        }

        return results;
    }

    async search(queryUrl, documentFilter) {

        var results = [];

        for (var searchExtension of this.searchExtensions) {

            try {

                var documents = await searchExtension.adapter.search(queryUrl);

                if(documentFilter != undefined) {
                    documents = documents.filter(documentFilter);
                }
                
                results = this.mergeResults(results, documents);

            } catch(err) {

            }
        }

        return results;
    }

    async initialize() {

        var auth = data.auth;

        if (!auth.authenticated) {
            return;
        }

        if(auth.info.accountName == undefined) {
            return;
        }

        /*

        var options = {
            method: 'GET',
            url: `/${ auth.info.accountName }`,
            headers: {
                'Accept': 'application/ld+json',
                'X-Jsonld-Formatting': 'flatten',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        }

        var response = await this.http(options);
        var accountData = AppJsonFormatter.formatAccountData(response.data);
        var extensions = JSON.parse(JSON.stringify(accountData.searchExtensions));

        for (var searchExtension of extensions) {

            switch (searchExtension.adapterName) {
                case 'lookup':
                    searchExtension.adapter = SearchAdapter.lookup(this.http, searchExtension.endpointUri);
                    break;
            }

            this.searchExtensions.push(searchExtension);

        })*/
    }
}

module.exports = SearchManager;


/***/ },

/***/ "./js/utils/app-json-formatter.js"
/*!****************************************!*\
  !*** ./js/utils/app-json-formatter.js ***!
  \****************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusConstants = __webpack_require__(/*! ./databus-constants */ "./js/utils/databus-constants.js");
const DatabusUris = __webpack_require__(/*! ./databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ./databus-utils */ "./js/utils/databus-utils.js");
const JsonldUtils = __webpack_require__(/*! ./jsonld-utils */ "./js/utils/jsonld-utils.js");

/**
 * Translates expanded jsonld into web-app compatible json
 */
class AppJsonFormatter {

  static async createAccountGraphs(uri, name, label, img, secretaries, status) {
    var name = UriUtils.uriToName(uri);
  
    var rsaKeyGraph = {};
    rsaKeyGraph[DatabusUris.JSONLD_TYPE] = DatabusUris.CERT_RSA_PUBLIC_KEY;
    rsaKeyGraph[DatabusUris.RDFS_LABEL] = DatabusConstants.WEBID_SHARED_PUBLIC_KEY_LABEL;
    rsaKeyGraph[DatabusUris.CERT_MODULUS] = signer.getModulus();
    rsaKeyGraph[DatabusUris.CERT_EXPONENT] = 65537;
  
    var personUri = `${uri}${DatabusConstants.WEBID_THIS}`;

    var personGraph = {};
    personGraph[DatabusUris.JSONLD_ID] = personUri;
    personGraph[DatabusUris.JSONLD_TYPE] = [ DatabusUris.FOAF_PERSON, DatabusUris.DBP_DBPEDIAN ];
    personGraph[DatabusUris.FOAF_ACCOUNT] = JsonldUtils.refTo(uri);
    personGraph[DatabusUris.DATABUS_ACCOUNT_PROPERTY] = uri;
    personGraph[DatabusUris.CERT_KEY] = [ rsaKeyGraph ];
    personGraph[DatabusUris.FOAF_NAME] = label;

    if(img != null) {
      personGraph[DatabusUris.FOAF_IMG] = img;
    }

     if(status != null) {
      personGraph[DatabusUris.FOAF_STATUS] = status;
    }

    var profileUri = `${uri}${DatabusConstants.WEBID_DOCUMENT}`;
  
    var profileDocumentGraph = {};
    profileDocumentGraph[DatabusUris.JSONLD_ID] = profileUri;
    profileDocumentGraph[DatabusUris.JSONLD_TYPE] = DatabusUris.FOAF_PERSONAL_PROFILE_DOCUMENT;
    profileDocumentGraph[DatabusUris.FOAF_MAKER] = JsonldUtils.refTo(personUri);
    profileDocumentGraph[DatabusUris.FOAF_PRIMARY_TOPIC] = JsonldUtils.refTo(personUri);
  
    var accountGraph = {}
    accountGraph[DatabusUris.JSONLD_ID] = uri;
    accountGraph[DatabusUris.JSONLD_TYPE] = DatabusUris.DATABUS_ACCOUNT;
    accountGraph[DatabusUris.FOAF_ACCOUNT_NAME] = name;
    accountGraph[DatabusUris.DATABUS_NAME] = name;

    if(secretaries != null) {

      accountGraph[DatabusUris.DATABUS_SECRETARY_PROPERTY] = [];

      for(var secretary of secretaries) {

        let secretaryAccountUri = `${secretary.accountName}`;

        let secretaryGraph = {};
        secretaryGraph[DatabusUris.JSONLD_TYPE] = DatabusUris.DATABUS_SECRETARY;
        secretaryGraph[DatabusUris.DATABUS_ACCOUNT_PROPERTY] = JsonldUtils.refTo(secretaryAccountUri);

        if(secretary.hasWriteAccessTo != undefined) {
          secretaryGraph[DatabusUris.DATABUS_HAS_WRITE_ACCESS_TO] = [];

          for(var writeAccess of secretary.hasWriteAccessTo) {
            secretaryGraph[DatabusUris.DATABUS_HAS_WRITE_ACCESS_TO].push(JsonldUtils.refTo(writeAccess));
          }
        }

        accountGraph[DatabusUris.DATABUS_SECRETARY_PROPERTY].push(secretaryGraph);
      }
    }

    let expandedGraphs = [
      accountGraph,
      personGraph,
      profileDocumentGraph
    ];
    
    return await jsonld.compact(expandedGraphs, JsonldLoader.DEFAULT_CONTEXT_URL);
  }
  
  static createAccountData(accountUri, accountLabel, accountStatus, accountImage) {

    var personUri = `${accountUri}${DatabusConstants.WEBID_THIS}`;

    var accountJsonLd = {};

    var accountGraph = {};
    accountGraph[DatabusUris.JSONLD_ID] = accountUri;
    accountGraph[DatabusUris.JSONLD_TYPE] = DatabusUris.DATABUS_ACCOUNT;

    var personGraph = {};
    personGraph[DatabusUris.JSONLD_ID] = personUri;
    personGraph[DatabusUris.JSONLD_TYPE] = DatabusUris.FOAF_PERSON;
    personGraph[DatabusUris.FOAF_NAME] = accountLabel;
    personGraph[DatabusUris.FOAF_ACCOUNT] = JsonldUtils.refTo(accountUri);

    if (accountStatus != null) {
      personGraph[DatabusUris.FOAF_STATUS] = accountStatus;
    }

    if (accountImage != null) {
      personGraph[DatabusUris.FOAF_IMG] = JsonldUtils.refTo(accountImage);
    }


    return [
      accountGraph,
      personGraph
    ];
  }

  static formatGroupData(graphs) {
    var result = {};

    // ?uri ?title ?abstract ?description
    var groupGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.DATABUS_GROUP);

    result.uri = groupGraph[DatabusUris.JSONLD_ID];
    result.title = JsonldUtils.getProperty(groupGraph, DatabusUris.DCT_TITLE);
    result.abstract = JsonldUtils.getProperty(groupGraph, DatabusUris.DCT_ABSTRACT);
    result.description = JsonldUtils.getProperty(groupGraph, DatabusUris.DCT_DESCRIPTION);
    result.name = DatabusUtils.uriToResourceName(result.uri);
    return result;
  }

  static formatArtifactData(graphs) {
    var result = {};
    // ?uri ?title ?abstract ?description
    var artifactGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.DATABUS_ARTIFACT);

    result.uri = artifactGraph[DatabusUris.JSONLD_ID];
    result.title = JsonldUtils.getProperty(artifactGraph, DatabusUris.DCT_TITLE);
    result.abstract = JsonldUtils.getProperty(artifactGraph, DatabusUris.DCT_ABSTRACT);
    result.description = JsonldUtils.getProperty(artifactGraph, DatabusUris.DCT_DESCRIPTION);
    result.name = DatabusUtils.uriToResourceName(result.uri);
    return result;


  }

  static formatAccountData(graphs) {
    var result = {};

    var accountGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.DATABUS_ACCOUNT);
    var personGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.FOAF_PERSON);

    result.uri = accountGraph[DatabusUris.JSONLD_ID];
    result.accountName = DatabusUtils.uriToResourceName(result.uri);
    result.label = JsonldUtils.getFirstProperty(personGraph, DatabusUris.FOAF_NAME);
    result.imageUrl = JsonldUtils.getFirstProperty(personGraph, DatabusUris.FOAF_IMG);
    result.about = JsonldUtils.getFirstProperty(personGraph, DatabusUris.FOAF_STATUS);
    result.webIds = [];
    result.searchExtensions = [];

    var extensionGraphs = JsonldUtils.getTypedGraphs(graphs, DatabusUris.DATABUS_SEARCH_EXTENSION);

    for (var extensionGraph of extensionGraphs) {
      result.searchExtensions.push({
        endpointUri: JsonldUtils.getProperty(extensionGraph, DatabusUris.DATABUS_SEARCH_EXTENSION_ENDPOINT),
        adapterName: JsonldUtils.getProperty(extensionGraph, DatabusUris.DATABUS_SEARCH_EXTENSION_ADAPTER),
      });
    }

    for (var graph of graphs) {

      if (graph[DatabusUris.JSONLD_ID] == personGraph[DatabusUris.JSONLD_ID]) {
        continue;
      }

      if (graph[DatabusUris.FOAF_ACCOUNT] != undefined) {
        result.webIds.push(graph[DatabusUris.JSONLD_ID]);
      }
    }

    result.secretaries = [];
    var secretaryGraphs = JsonldUtils.getTypedGraphs(graphs, DatabusUris.DATABUS_SECRETARY);

    for (var secretaryGraph of secretaryGraphs) {
      var secretaryData = {
        accountName: JsonldUtils.getProperty(secretaryGraph, DatabusUris.DATABUS_ACCOUNT_PROPERTY),
        hasWriteAccessTo: []
      };

      var writeAccessUris = secretaryGraph[DatabusUris.DATABUS_HAS_WRITE_ACCESS_TO];

      if (Array.isArray(writeAccessUris)) {
        for (var item of writeAccessUris) {
          if (typeof item === 'object' && item['@id']) {
            secretaryData.hasWriteAccessTo.push(item['@id']);
          } else if (typeof item === 'string') {
            secretaryData.hasWriteAccessTo.push(item);
          }
        }
      }

      result.secretaries.push(secretaryData);
    }

    return result;
  }

  static formatVersionData(versionGraph) {


    var version = {};
    version.uri = versionGraph[DatabusUris.JSONLD_ID];
    version.title = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_TITLE);
    version.abstract = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_ABSTRACT);
    version.description = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_DESCRIPTION);
    version.artifact = JsonldUtils.getProperty(versionGraph, DatabusUris.DATABUS_ARTIFACT_PROPERTY);
    version.license = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_LICENSE);
    version.attribution = JsonldUtils.getProperty(versionGraph, DatabusUris.DATABUS_ATTRIBUTION);
    version.wasDerivedFrom = JsonldUtils.getProperty(versionGraph, DatabusUris.PROV_WAS_DERIVED_FROM);
    version.issued = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_ISSUED);
    version.name = JsonldUtils.getProperty(versionGraph, DatabusUris.DCT_HAS_VERSION);

    return version;
  }

  static formatCollectionData(graphs) {
    var collectionGraph = JsonldUtils.getTypedGraph(graphs, DatabusUris.DATABUS_COLLECTION);

    var result = {};

    result.uri = collectionGraph[DatabusUris.JSONLD_ID];
    result.title = JsonldUtils.getProperty(collectionGraph, DatabusUris.DCT_TITLE);
    result.abstract = JsonldUtils.getProperty(collectionGraph, DatabusUris.DCT_ABSTRACT);
    result.description = JsonldUtils.getProperty(collectionGraph, DatabusUris.DCT_DESCRIPTION);
    result.issued = JsonldUtils.getProperty(collectionGraph, DatabusUris.DCT_ISSUED);
    result.publisher = JsonldUtils.getProperty(collectionGraph, DatabusUris.DCT_PUBLISHER);
    result.account = JsonldUtils.getProperty(collectionGraph, DatabusUris.DATABUS_ACCOUNT_PROPERTY);

    var content = JsonldUtils.getProperty(collectionGraph, DatabusUris.DATABUS_COLLECTION_CONTENT)
    result.content = DatabusUtils.tryParseJson(unescape(content));

    return result;
  }
}

module.exports = AppJsonFormatter;


/***/ },

/***/ "./js/utils/databus-constants.js"
/*!***************************************!*\
  !*** ./js/utils/databus-constants.js ***!
  \***************************************/
(module) {



class DatabusConstants {
    static FACET_DEFAULT_SUBQUERY =
        "\n\t{ " +
        "\n\t\t?distribution <%FACET%> '%VALUE%'^^<http://www.w3.org/2001/XMLSchema#string> . " +
        "\n\t} ";

    static FACET_DEFAULT_SUBQUERY_PLACEHOLDER_FACET = "%FACET%";
    static FACET_DEFAULT_SUBQUERY_PLACEHOLDER_VALUE = "%VALUE%";
    static FACET_LATEST_VERSION_VALUE = "$latest";
    static FACET_LATEST_VERSION_LABEL = "Latest Version";

    static WEBID_THIS = "#this";
    static WEBID_DOCUMENT = "#doc";
    static WEBID_SHARED_PUBLIC_KEY_LABEL = "Shared Databus Public Key";

    static FACET_LASTEST_ARTIFACT_VERSION_SUBQUERY =
        "\n\t{" +
        "\n\t\t?distribution dct:hasVersion ?latestVersion " +
        "\n\t\t{" +
        "\n\t\t\tSELECT (?version as ?latestVersion) WHERE { " +
        "\n\t\t\t\t?dataset databus:artifact <%ARTIFACT_URI%> . " +
        "\n\t\t\t\t?dataset dct:hasVersion ?version . " +
        "\n\t\t\t} ORDER BY DESC (?version) LIMIT 1 " +
        "\n\t\t} " +
        "\n\t}";

    static FACET_LASTEST_GROUP_VERSION_SUBQUERY =
        "\n\t{" +
        "\n\t\t?distribution dct:hasVersion ?latestVersion " +
        "\n\t\t{" +
        "\n\t\t\tSELECT (?version as ?latestVersion) WHERE { " +
        "\n\t\t\t\t?dataset databus:group <%ARTIFACT_URI%> . " +
        "\n\t\t\t\t?dataset dct:hasVersion ?version . " +
        "\n\t\t\t} ORDER BY DESC (?version) LIMIT 1 " +
        "\n\t\t} " +
        "\n\t}";

    static FACET_SUBQUERY_UNION = "\n\tUNION";
    static DATABUS_SPARQL_ENDPOINT_URL = "/sparql";
}

module.exports = DatabusConstants;

/***/ },

/***/ "./js/utils/databus-facets-cache.js"
/*!******************************************!*\
  !*** ./js/utils/databus-facets-cache.js ***!
  \******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const { DATABUS_CONTENT_VARIANT_PREFIX } = __webpack_require__(/*! ./databus-uris */ "./js/utils/databus-uris.js");
const DatabusUris = __webpack_require__(/*! ./databus-uris */ "./js/utils/databus-uris.js");
const DatabusUtils = __webpack_require__(/*! ./databus-utils */ "./js/utils/databus-utils.js");

class DatabusFacetsCache {

  constructor($http) {
    this._facets = {};
    this._http = $http;
    this._regex = new RegExp('%RESOURCE_URI%', "g");

    this.pathLengthToQueryMap = {
      2: DatabusFacetsCache.GET_GROUP_FACETS,
      3: DatabusFacetsCache.GET_ARTIFACT_FACETS
    }

    this._facetMetadata = {};
    
    this._facetMetadata[DatabusUris.DCT_HAS_VERSION] = "Version";
    this._facetMetadata[DatabusUris.DATABUS_FORMAT_EXTENSION] = "Format";
    this._facetMetadata[DatabusUris.DATABUS_CONTENT_VARIANT_PREFIX + "lang"] = "Language";
    this._facetMetadata[DatabusUris.DATABUS_CONTENT_VARIANT_PREFIX + "domain"] = "Domain";
    this._facetMetadata[DatabusUris.DATABUS_CONTENT_VARIANT_PREFIX + "tag"] = "Tag";
    this._facetMetadata[DatabusUris.DATABUS_COMPRESSION] = "Compression";
    
  }

  async get(resource) {

    if (this._facets[resource] != undefined) {
      return {
        uri : resource,
        facets: this._facets[resource]
      };
    }

    var url = new URL(resource);
    var origin = url.origin;
    var pathLength = DatabusUtils.getResourcePathLength(resource);

    var query = this.pathLengthToQueryMap[pathLength];


    if (query == undefined) {
      return null;
    }

    query = query.replace(this._regex, resource);

    var req = {
      method: 'POST',
      url: `${origin}/sparql?query=`,
      data: `format=json&query=${encodeURIComponent(query)}`,
      headers: {
        "Content-type": "application/x-www-form-urlencoded"
      },
    }

    var response = await this._http(req);

    var result = {};

    for (var binding of response.data.results.bindings) {

      var property = binding.property.value;

      if (result[property] == undefined) {
        result[property] = {};

        var label = this._facetMetadata[property] != undefined ? this._facetMetadata[property] : 
          DatabusUtils.uriToName(property);

        result[binding.property.value].label = label;
        result[binding.property.value].values = []
      }

      result[binding.property.value].values.push(binding.value.value);
    }

    this._facets[resource] = result;
    
    return {
      uri : resource,
      facets: this._facets[resource]
    };
  }


  static GET_GROUP_FACETS = `
  PREFIX databus: <https://dataid.dbpedia.org/databus#>
  PREFIX dcv: <https://dataid.dbpedia.org/databus-cv#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dcat:  <http://www.w3.org/ns/dcat#>
  PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
  
  SELECT DISTINCT ?property ?value WHERE {
    {
      GRAPH ?g {
        ?dataset databus:group <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution dct:hasVersion ?value .
        BIND(dct:hasVersion AS ?property)
      }
    }
    UNION
    {
      GRAPH ?g {
        ?dataset databus:group <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution databus:formatExtension ?value .
        BIND(databus:formatExtension AS ?property)
      }
    }
    UNION
    {
      GRAPH ?g {
        ?dataset databus:group <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution databus:compression ?value .
        BIND(databus:compression AS ?property)
      }
    }
    UNION
    {
      GRAPH ?g {
        ?dataset databus:group <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution ?property ?value .
        ?property rdfs:subPropertyOf databus:contentVariant .
      }
    }
  }
  `;

  static GET_ARTIFACT_FACETS = `
  PREFIX databus: <https://dataid.dbpedia.org/databus#>
  PREFIX dcv: <https://dataid.dbpedia.org/databus-cv#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dcat:  <http://www.w3.org/ns/dcat#>
  PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
  
  SELECT DISTINCT ?property ?value WHERE {
    GRAPH ?g {
    {
        BIND(dct:hasVersion AS ?property)
        ?dataset databus:artifact <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution dct:hasVersion ?value .
    }
    UNION
    {
        BIND(databus:formatExtension AS ?property)
        ?dataset databus:artifact <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution databus:formatExtension ?value .
    }
    UNION
    {
        BIND(databus:compression AS ?property)
        ?dataset databus:artifact <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution databus:compression ?value .
    }
    UNION
    {
        ?dataset databus:artifact <%RESOURCE_URI%> .
        ?dataset dcat:distribution ?distribution . 
        ?distribution ?property ?value .
        ?property rdfs:subPropertyOf databus:contentVariant .
      }
    }
  }`;



}

module.exports = DatabusFacetsCache;

/***/ },

/***/ "./js/utils/databus-messages.js"
/*!**************************************!*\
  !*** ./js/utils/databus-messages.js ***!
  \**************************************/
(module) {


class DatabusMessages {

  // Collection Editor
  static CEDIT_INVALID_IDENTIFIER = 'The identifier must match the following regular expression: #REGEX#';
  static CEDIT_INVALID_TITLE = 'The title must match the following regular expression: #REGEX#';
  static CEDIT_INVALID_ABSTRACT = 'The abstract must match the following regular expression: #REGEX#';
  static CEDIT_INVALID_DESCRIPTION = 'The description must match the following regular expression: #REGEX#';
  static CEDIT_COLLECTION_IMPORT_FAILED = 'Failed to import the collection';
  static CEDIT_COLLECTION_IMPORTED = 'Collection imported successfully';
  static CEDIT_COLLECTION_SAVED = 'Collection saved successfully';
  static CEDIT_COLLECTION_SAVE_FAILED = 'Failed to save the collection';
  static CEDIT_COLLECTION_UNPUBLISHED = 'Collection unpublished successfully';
  static CEDIT_LOCAL_CHANGES_DISCARDED = 'Local changes discarded';

  // Generic
  static GENERIC_COPIED_TO_CLIPBOARD = 'Copied to clipboard!';

  // Account 
  static ACCOUT_PROFILE_SAVED = 'Profile changes have been saved';

  static ACCOUNT_API_KEY_CREATED = 'API key created';

  static ACCOUNT_WEBID_LINKED = 'External WebId has been linked to your profile';

  
}

  module.exports = DatabusMessages;


/***/ },

/***/ "./js/utils/databus-uris.js"
/*!**********************************!*\
  !*** ./js/utils/databus-uris.js ***!
  \**********************************/
(module) {


class DatabusUris {

  // JSONLD
  static JSONLD_TYPE = '@type';
  static JSONLD_ID = '@id';
  static JSONLD_VALUE = '@value';
  static JSONLD_LANGUAGE = '@language';
  static JSONLD_CONTEXT = '@context';
  static JSONLD_GRAPH = '@graph';

  // Databus
  static DATABUS_DATABUS = 'https://dataid.dbpedia.org/databus#Databus';
  static DATABUS_PART = 'https://dataid.dbpedia.org/databus#Part';
  static DATABUS_VERSION = 'https://dataid.dbpedia.org/databus#Version';
  static DATABUS_GROUP = 'https://dataid.dbpedia.org/databus#Group';
  static DATABUS_ACCOUNT = 'https://dataid.dbpedia.org/databus#Account';
  static DATABUS_ARTIFACT = 'https://dataid.dbpedia.org/databus#Artifact';
  static DATABUS_VERSION_PROPERTY = 'https://dataid.dbpedia.org/databus#version';
  static DATABUS_GROUP_PROPERTY = 'https://dataid.dbpedia.org/databus#group';
  static DATABUS_ACCOUNT_PROPERTY = 'https://dataid.dbpedia.org/databus#account';
  static DATABUS_HAS_ARTIFACT = 'https://dataid.dbpedia.org/databus#hasArtifact';
  static DATABUS_HAS_VERSION = 'https://dataid.dbpedia.org/databus#hasVersion';
  static DATABUS_NAME = 'https://dataid.dbpedia.org/databus#name';
  
  static DATABUS_SECRETARY_PROPERTY = 'https://dataid.dbpedia.org/databus#secretary';
  static DATABUS_SECRETARY = 'https://dataid.dbpedia.org/databus#Secretary';
  static DATABUS_HAS_WRITE_ACCESS_TO = 'https://dataid.dbpedia.org/databus#hasWriteAccessTo';

  static DATABUS_ARTIFACT_PROPERTY = 'https://dataid.dbpedia.org/databus#artifact';
  static DATABUS_FORMAT = 'https://dataid.dbpedia.org/databus#format';
  static DATABUS_FORMAT_EXTENSION = 'https://dataid.dbpedia.org/databus#formatExtension';
  static DATABUS_CONTENT_VARIANT = 'https://dataid.dbpedia.org/databus#contentVariant';
  static DATABUS_CONTENT_VARIANT_PREFIX = 'https://dataid.dbpedia.org/databus-cv#';
  static DATABUS_SHASUM = 'https://dataid.dbpedia.org/databus#sha256sum';
  static DATABUS_COLLECTION = 'https://dataid.dbpedia.org/databus#Collection';
  static DATABUS_FILE = 'https://dataid.dbpedia.org/databus#file';
  static DATABUS_COMPRESSION = 'https://dataid.dbpedia.org/databus#compression';
  static DATABUS_ATTRIBUTION = 'https://dataid.dbpedia.org/databus#attribution';
  static DATABUS_PREVIEW = 'https://dataid.dbpedia.org/databus#preview';
  static DATABUS_COLLECTION_CONTENT = 'https://dataid.dbpedia.org/databus#collectionContent';
  static DATABUS_TRACTATE_V1 = 'https://dataid.dbpedia.org/databus#DatabusTractateV1';
  static DATABUS_PLUGIN = 'https://dataid.dbpedia.org/databus#Plugin';
  static DATABUS_SEARCH_EXTENSION = 'https://dataid.dbpedia.org/databus#SearchExtension';
  static DATABUS_SEARCH_EXTENSION_ADAPTER = 'https://dataid.dbpedia.org/databus#searchExtensionAdapter';
  static DATABUS_SEARCH_EXTENSION_ENDPOINT = 'https://dataid.dbpedia.org/databus#searchExtensionEndpoint';
  static DATABUS_EXTENDS = 'https://dataid.dbpedia.org/databus#extends';
  
  // DCT
  static DCT_PUBLISHER = 'http://purl.org/dc/terms/publisher';
  static DCT_HAS_VERSION = 'http://purl.org/dc/terms/hasVersion';
  static DCT_ISSUED = 'http://purl.org/dc/terms/issued';
  static DCT_CREATED = 'http://purl.org/dc/terms/created';
  static DCT_MODIFIED = 'http://purl.org/dc/terms/modified';
  static DCT_DISTRIBUTION = 'http://purl.org/dc/terms/distribution';
  static DCT_SUBJECT = 'http://purl.org/dc/terms/subject';
  static DCT_CREATOR = 'http://purl.org/dc/terms/creator'
  static DCT_TITLE = 'http://purl.org/dc/terms/title'
  static DCT_ABSTRACT = 'http://purl.org/dc/terms/abstract'
  static DCT_DESCRIPTION = 'http://purl.org/dc/terms/description'
  static DCT_LICENSE = 'http://purl.org/dc/terms/license';

  // DCAT
  static DCAT_DOWNLOAD_URL = 'http://www.w3.org/ns/dcat#downloadURL';
  static DCAT_BYTESIZE = 'http://www.w3.org/ns/dcat#byteSize';
  static DCAT_DISTRIBUTION = 'http://www.w3.org/ns/dcat#distribution';


  // SEC
  static SEC_PROOF = 'https://w3id.org/security#proof';
  static SEC_SIGNATURE = 'https://w3id.org/security#signature';

  // RDF
  static RDF_PROPERTY = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property';

  // RDFS
  static RDFS_SUB_PROPERTY_OF = 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf';
  static RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

  // XSD
  static XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime';
  static XSD_DECIMAL = 'http://www.w3.org/2001/XMLSchema#decimal';
  static XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

  // SHACL
  static SHACL_VALIDATION_REPORT = 'http://www.w3.org/ns/shacl#ValidationReport';
  static SHACL_VALIDATION_RESULT = 'http://www.w3.org/ns/shacl#ValidationResult';
  static SHACL_CONFORMS = 'http://www.w3.org/ns/shacl#conforms';
  static SHACL_RESULT_MESSAGE = 'http://www.w3.org/ns/shacl#resultMessage';

  // FOAF
  static FOAF_PERSONAL_PROFILE_DOCUMENT = 'http://xmlns.com/foaf/0.1/PersonalProfileDocument';
  static FOAF_ACCOUNT = 'http://xmlns.com/foaf/0.1/account';
  static FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';
  static FOAF_STATUS = 'http://xmlns.com/foaf/0.1/status';
  static FOAF_PERSON = 'http://xmlns.com/foaf/0.1/Person';
  static FOAF_PRIMARY_TOPIC = 'http://xmlns.com/foaf/0.1/primaryTopic';
  static FOAF_MAKER = 'http://xmlns.com/foaf/0.1/maker';
  static FOAF_ACCOUNT_NAME = 'http://xmlns.com/foaf/0.1/accountName';
  static FOAF_IMG = 'http://xmlns.com/foaf/0.1/img';

  // S4AC
  static S4AC_ACCESS_POLICY = 'http://ns.inria.fr/s4ac/v2#AccessPolicy';
  static S4AC_ACCESS_CREATE = 'http://ns.inria.fr/s4ac/v2#Create';
  static S4AC_HAS_ACCESS_PRIVILEGE = 'http://ns.inria.fr/s4ac/v2#hasAccessPrivilege';

  // CERT
  static CERT_KEY = 'http://www.w3.org/ns/auth/cert#key';
  static CERT_MODULUS = 'http://www.w3.org/ns/auth/cert#modulus';
  static CERT_EXPONENT = 'http://www.w3.org/ns/auth/cert#exponent';
  static CERT_RSA_PUBLIC_KEY = 'http://www.w3.org/ns/auth/cert#RSAPublicKey';

  // PROV
  static PROV_WAS_DERIVED_FROM = 'http://www.w3.org/ns/prov-o#wasDerivedFrom';

  // DBP
  static DBP_DBPEDIAN = 'http://dbpedia.org/ontology/DBpedian';
}

module.exports = DatabusUris;


/***/ },

/***/ "./js/utils/databus-utils.js"
/*!***********************************!*\
  !*** ./js/utils/databus-utils.js ***!
  \***********************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusCollectionUtils = __webpack_require__(/*! ../collections/databus-collection-utils */ "./js/collections/databus-collection-utils.js");
var markdownit = __webpack_require__(/*! markdown-it */ "markdown-it");
const moment = __webpack_require__(/*! moment/moment */ "moment/moment");
const DatabusUris = __webpack_require__(/*! ./databus-uris */ "./js/utils/databus-uris.js");
const ApiError = __webpack_require__(/*! ../../../server/app/common/utils/api-error */ "../server/app/common/utils/api-error.js");

class DatabusUtils {

  static stringOrFallback(value, fallback) {
    if (value != null && value.length > 0) {
      return value;
    }

    return fallback;
  }

  static resemblesTrue(value) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['true', '1', 'yes', 'on'].includes(normalized);
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    return false;
  }

  static isValidResourceIdentifier(identifier, min) {
    var identifierRegex = /^[a-z-]+$/;
    return this.checkField(identifier, identifierRegex, min, 50);
  }

  static formatQuery(query, placeholderMappings) {

    if (placeholderMappings == undefined) {
      return query;
    }

    for (var placeholder in placeholderMappings) {
      var re = new RegExp('%' + placeholder + '%', "g");
      query = query.replace(re, placeholderMappings[placeholder]);
    }

    return query;
  }

  static isValidVersionIdentifier(identifier) {
    var labelRegex = /^[A-Za-z0-9_\.\-]*$/;
    return this.checkField(identifier, labelRegex, 3, 50);
  }

  static isValidResourceText(value, min, max) {
    var textRegex = /^[\x00-\x7F\n]*$/;
    return this.checkField(value, textRegex, min, max);
  }

  static isValidAccountName(identifier) {
    var labelRegex = /^[a-z][0-9a-z_\-]+[0-9a-z]$/;
    return this.checkField(identifier, labelRegex, 3, 15);
  }

  static timeStringNow() {
    return new Date(Date.now()).toISOString();
  }

  static isValidGroupName(name) {
    var labelRegex = /[a-zA-Z0-9_\-\.]{3,50}$/;
    return this.checkField(name, labelRegex, 3, 50);
  }

  static isValidArtifactName(name) {
    var labelRegex = /[a-zA-Z0-9_\-\.]{3,50}$/;
    return this.checkField(name, labelRegex, 3, 50);
  }

  static isValidUrl(value) {
    var textRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    return textRegex.test(value);
  }

  static isValidResourceLabel(value, min, max) {
    var labelRegex = /^[A-Za-z0-9\s_()\.\,\-]*$/;
    return this.checkField(value, labelRegex, min, max);
  }

  static objSize(obj) {
    var size = 0, key;
    for (key in obj) {
      if (obj.hasOwnProperty(key)) size++;
    }
    return size;
  }

  static uniqueList(arr) {
    var u = {}, a = [];
    for (var i = 0, l = arr.length; i < l; ++i) {
      if (!u.hasOwnProperty(arr[i])) {
        a.push(arr[i]);
        u[arr[i]] = 1;
      }
    }
    return a;
  }


  static formatFileSize(size) {
    if (size == undefined) {
      return '0 KB'
    }

    if (size < 1024) return size + " B";
    else if (size < 1048576) return Math.round(size / 1024) + " KB";
    else if (size < 1073741824) return (Math.round(10 * size / 1048576) / 10) + " MB";
    else return (Math.round(100 * size / 1073741824) / 100) + " GB";
  };

  static checkField(value, regex, min, max) {
    if (value == undefined) {
      return false;
    }

    if (max > 0 && value.length > max) {
      return false;
    }

    if (value.length < min) {
      return false;
    }

    return regex.test(value);
  }

  // Creates a v4 uuid
  static uuidv4() {
    return '___xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static tryParseJson(str) {
    return JSON.parse(str);
  }

  static uriToTitle(uri) {
    if (uri == null) {
      return null;
    }

    var result = uri.substr(uri.lastIndexOf('/') + 1);
    result = result.substr(result.lastIndexOf('#') + 1);

    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  static uriToName(uri) {
    if (uri == null) {
      return null;
    }

    var result = uri.substr(uri.lastIndexOf('/') + 1);
    result = result.substr(result.lastIndexOf('#') + 1);

    if (result.includes('.')) {
      result = result.substr(0, result.lastIndexOf('.'));
    }

    return result;
  }

  static uriToResourceName(uri) {
    if (uri == null) {
      return null;
    }

    var result = uri.substr(uri.lastIndexOf('/') + 1);

    if (result.includes('#')) {
      result = result.substr(0, result.indexOf('#'));
    }

    return result;
  }

  static isValidHttpUrl(string) {
    let url;

    try {
      url = new URL(string);
    } catch (_) {
      return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
  }

  static isValidHttpsUrl(string) {
    let url;

    try {
      url = new URL(string);
    } catch (_) {
      return false;
    }

    return url.protocol === "https:";
  }


  static navigateUp(uri, steps) {

    if (steps == undefined) {
      steps = 1;
    }

    for (var i = 0; i < steps; i++) {
      uri = uri.substr(0, uri.lastIndexOf('/'));
    }

    if (uri.includes('#')) {
      uri = uri.substr(0, uri.lastIndexOf('#'));
    }

    return uri;
  }

  static copyStringToClipboard(str) {
    // Create new element
    var el = document.createElement('textarea');
    // Set value (string to be copied)
    el.value = str;
    // Set non-editable to avoid focus and move outside of view
    el.setAttribute('readonly', '');
    el.style = { position: 'absolute', left: '-9999px' };
    document.body.appendChild(el);
    // Select text inside element
    el.select();
    // Copy text to clipboard
    document.execCommand('copy');
    // Remove temporary element
    document.body.removeChild(el);
  }

  static serialize(collectionObject, ignoreKeys) {

    if (ignoreKeys == undefined) {
      ignoreKeys = [
        'parent',
        '$$hashKey',
        'expanded',
        'files',
        'eventListeners',
        'hasLocalChanges',
        'published'
      ];
    }

    return JSON.stringify(collectionObject, function (key, value) {
      if (ignoreKeys.includes(key)) {
        return undefined;
      }

      return value;
    });
  }

  static createCleanCopy(jsonData) {
    var data = JSON.parse(DatabusCollectionUtils.serialize(jsonData));
    return data;
  }

  static lineCount(text) {
    return (text.match(/^\s*\S/gm) || "").length
  }


  static getResourcePathLength(uri) {
    var parts = DatabusUtils.splitResourceUri(uri);

    if (parts.length == 1 && parts[0] == "") {
      return 0;
    }

    return parts.length;
  }

  static splitResourceUri(uri) {

    var url = new URL(uri);
    uri = url.pathname;

    if (uri.startsWith('/')) {
      uri = uri.substr(1);
    }
    if (uri.endsWith('/')) {
      uri = uri.substr(0, uri.length - 1);
    }

    return uri.split('/');
  }

  static formatDate(date) {
    return moment(date).format('MMM Do YYYY') + " (" + moment(date).fromNow() + ")";
  }

  static exportToJsonFile(jsonData) {

    var ignoreKeys = [
      'parent',
      '$$hashKey',
      'expanded',
      'files',
      'eventListeners',
      'hasLocalChanges',
      'published',
      'uuid'
    ];

    let dataStr = DatabusCollectionUtils.serialize(jsonData, ignoreKeys);
    let dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    let exportFileDefaultName = 'data.json';

    let linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  static async parseN3(data, maxQuads) {
    return new Promise((resolve, reject) => {

      const quads = [];
      const prefixes = [];

      const parser = new N3.Parser();

      parser.parse(data, (e, q, p) => {
        if (e) {
          reject(e);
          return;
        }

        if (quads.length > maxQuads || q == null) {
          resolve({ quads: quads, prefixes: prefixes });
        }

        if (q) {
          quads.push(q);
        }
      });
    });
  }

  static async parseDatabusManifest(data) {

    var parsedData = await DatabusUtils.parseN3(data, 100);

    for (var quad of parsedData.quads) {

      if (quad.predicate.id == `http://www.w3.org/1999/02/22-rdf-syntax-ns#type`
        && quad.object.id == DatabusUris.DATABUS_DATABUS) {

        return {
          uri: quad.subject.id
        }
      }
    }

    return undefined;
  }

  static getFirstSegment(uri) {
    try {
      const url = new URL(uri);
      return url.pathname.split('/').filter(Boolean)[0] || null;
    } catch {
      return null;
    }
  }

  static parseMarkdown(markdown) {

    if (markdown == null) {
      return null;
    }

    var markdownParser = markdownit();
    return markdownParser.parse(markdown);
  }

  static renderMarkdown(markdown) {

    if (markdown == null) {
      return null;
    }

    var markdownParser = markdownit();
    return markdownParser.render(markdown);
  }

  /**
   * Create a dct:abstract from the content of a dct:description
   * @param {*} description 
   */
  static createAbstractFromDescription(description) {

    if (description == null) {
      return null;
    }

    try {
      var tokens = this.parseMarkdown(description);


      var paragraphFound = false;
      var result = "";

      if (tokens == null) {
        return result;
      }

      var firstParagraphText = null;

      for (var i = 0; i < tokens.length; i++) {

        var token = tokens[i];
        var appendText = null;

        if (token.type == 'inline' && tokens[i - 1].type == 'paragraph_open' && token.level == 1) {
          result = token.content;
          break;
        }

      }

      return result;

    } catch (err) {
      console.log(err);
      return undefined;
    }
  }

  /**
   * Find groups files that are not distinguishable
   * @param {Array of file URIs} files 
   * @param {Array of content variant names} contentVariants 
   * @param {Index in the array of content variants} index 
   * @returns 
   */
  static cvSplit(distributionGraphs, contentVariantUris, contentVariantIndex) {

    var errorList = [];

    if (distributionGraphs.length <= 1) {
      return errorList;
    }

    if (contentVariantIndex >= contentVariantUris.length) {

      // Check buckets for double entries if (files.length > 1) {
      if (distributionGraphs.length > 1) {

        var error = {};
        error.downloadURLs = [];

        for (var distribution of distributionGraphs) {

          error.downloadURLs.push(distribution[DatabusUris.DCAT_DOWNLOAD_URL][0][DatabusUris.JSONLD_ID]);
        }

        error[DatabusUris.DATABUS_FORMAT_EXTENSION] =
          distributionGraphs[0][DatabusUris.DATABUS_FORMAT_EXTENSION][0][DatabusUris.JSONLD_VALUE];

        error[DatabusUris.DATABUS_COMPRESSION] =
          distributionGraphs[0][DatabusUris.DATABUS_COMPRESSION][0][DatabusUris.JSONLD_VALUE];

        for (var contentVariantUri of contentVariantUris) {
          error[contentVariantUri] = distributionGraphs[0][contentVariantUri] != null ?
            distributionGraphs[0][contentVariantUri][0][DatabusUris.JSONLD_VALUE] : 'none'
        }

        errorList.push(error);
      }
    } else {

      var contentVariantUri = contentVariantUris[contentVariantIndex];

      // else create buckets and sort files into buckets
      var buckets = {};

      for (var distribution of distributionGraphs) {

        var variantValue = distribution[contentVariantUri];

        if (variantValue != undefined) {
          variantValue = variantValue[0]['@value'];
        }

        if (variantValue == undefined || variantValue == '') {
          variantValue = '$_none$';
        }

        if (buckets[variantValue] == undefined) {
          buckets[variantValue] = [];
        }

        buckets[variantValue].push(distribution);
      }


      // iterate buckets and call recursively
      for (var b in buckets) {

        for (var error of DatabusUtils.cvSplit(buckets[b],
          contentVariantUris, contentVariantIndex + 1, errorList)) {
          errorList.push(error);
        }
      }
    }

    return errorList;
  }

}

module.exports = DatabusUtils;


/***/ },

/***/ "./js/utils/databus-webapp-utils.js"
/*!******************************************!*\
  !*** ./js/utils/databus-webapp-utils.js ***!
  \******************************************/
(module, __unused_webpack_exports, __webpack_require__) {

const DatabusAlert = __webpack_require__(/*! ../components/databus-alert/databus-alert */ "./js/components/databus-alert/databus-alert.js");
const DatabusUtils = __webpack_require__(/*! ../utils/databus-utils */ "./js/utils/databus-utils.js");
const DatabusMessages = __webpack_require__(/*! ./databus-messages */ "./js/utils/databus-messages.js");

class DatabusWebappUtils {

  constructor($scope, $sce) {
    this.scope = $scope;
    this.sce = $sce;
  }

  goTo(page) {
    window.location = page;
  }
  
  createAccount() {
    window.location = '/app/account';
  }

  
  getAccountName() {

    let accountName = window.location.pathname.split('/')[1];

    if(accountName.length < 4) {
      return null;
    }

    return this.getOwnedAccountName(accountName);
  }

  getOwnedAccountName(accountName) {
    if(!this.scope.auth.authenticated || this.scope.auth.info == null) {
      return null;
    }

    let userInfo = this.scope.auth.info;

    if(!Array.isArray(userInfo.accounts) || userInfo.accounts.length == 0) {
      return null;
    }

    let account = userInfo.accounts.find(a => a.accountName == accountName);

    if(account == null) {
      return null;
    }

    return account.accountName;
  }

  login() {
    window.location = '/app/login?redirectUrl=' + encodeURIComponent(window.location);
  }

  logout() {
    window.location = '/app/logout?redirectUrl=' + encodeURIComponent(window.location);
  }

  formatDateFromNow(date) {
    return moment(date).fromNow();
  }

  markdownToHtml(markdown) {

    if(this.sce == null) {
      return markdown;
    }

    var markdown = DatabusUtils.renderMarkdown(markdown);

    return this.sce.trustAsHtml(markdown);
  };

  formatDate(date) {
    return DatabusUtils.formatDate(date); // moment(date).format('MMM Do YYYY') + " (" + moment(date).fromNow() + ")";
  }

  formatLongDate(longString) {
    var number = new Number(longString);
    var dateTime = new Date(number);
    return this.formatDate(dateTime);
  }

  formatFileSize (size) {
    return DatabusUtils.formatFileSize(size);
  }

  getPathname(uri) {
    var url = new URL(uri);
    return url.pathname;
  }

  objSize(obj) {
    return DatabusUtils.objSize(obj);
  }

  navigateUp(uri) {
    return DatabusUtils.navigateUp(uri);
  }

  uriToName(uri) {
    return DatabusUtils.uriToName(uri); 
  }

  uriToResourceName(uri) {
    return DatabusUtils.uriToResourceName(uri);
  }

  isValidHttpsUrl(url) {
    return DatabusUtils.isValidHttpsUrl(url);
  }

  copyToClipboard(str) {

    if(typeof str === 'object') {
      str = JSON.stringify(str, null, 3);
    }

    // Create new element
    var el = document.createElement('textarea');
    // Set value (string to be copied)
    el.value = str;
    // Set non-editable to avoid focus and move outside of view
    el.setAttribute('readonly', '');
    el.style = { position: 'absolute', left: '-9999px' };
    document.body.appendChild(el);
    // Select text inside element
    el.select();
    // Copy text to clipboard
    document.execCommand('copy');
    // Remove temporary element
    document.body.removeChild(el);

    DatabusAlert.alert(this.scope, true, DatabusMessages.GENERIC_COPIED_TO_CLIPBOARD);
  }
}

module.exports = DatabusWebappUtils;


/***/ },

/***/ "./js/utils/jsonld-utils.js"
/*!**********************************!*\
  !*** ./js/utils/jsonld-utils.js ***!
  \**********************************/
(module, __unused_webpack_exports, __webpack_require__) {

/* module decorator */ module = __webpack_require__.nmd(module);
const DatabusUris = __webpack_require__(/*! ./databus-uris */ "./js/utils/databus-uris.js");


class JsonldUtils {

  static refTo(uri) {
    var result = {};
    result[DatabusUris.JSONLD_ID] = uri;
    return result;
  }

  static getTypedGraph(graphs, graphType) {

    for (var g in graphs) {
      var graph = graphs[g];

      if (graph[DatabusUris.JSONLD_TYPE] != undefined && graph[DatabusUris.JSONLD_TYPE].includes(graphType)) {
        return graph;
      }
    }

    return null;
  }

  static setLiteral(graph, property, type, value) {
    graph[property] = [];

    var entry = {};
    entry[DatabusUris.JSONLD_TYPE] = type;
    entry[DatabusUris.JSONLD_VALUE] = value;

    graph[property].push(entry);
  }

  static setLink(graph, property, uri) {
    graph[property] = [];

    var entry = {};
    entry[DatabusUris.JSONLD_ID] = uri;

    graph[property].push(entry);
  }

  static getGraphById = function (graphs, id) {
    return graphs.find(g => g[DatabusUris.JSONLD_ID] === id);
  };

  static getRefArrayProperty = function (graph, propertyUri) {
    const val = graph[propertyUri];
    if (!val) return [];
    return val.map(v => v[DatabusUris.JSONLD_ID]);
  };

  static getProperty(graph, property) {
    if (graph[property] == undefined) {
      return null;
    }

    if (graph[property].length == 1) {
      var value = graph[property][0];

      if (value[DatabusUris.JSONLD_VALUE] != null) {
        return value[DatabusUris.JSONLD_VALUE];
      }

      if (value[DatabusUris.JSONLD_ID] != null) {
        return value[DatabusUris.JSONLD_ID];
      }

      return null;
    } else {
      var result = [];

      for (var value of graph[property]) {

        if (value[DatabusUris.JSONLD_VALUE] != null) {
          result.push(value[DatabusUris.JSONLD_VALUE]);
        }

        if (value[DatabusUris.JSONLD_ID] != null) {
          result.push(value[DatabusUris.JSONLD_ID]);
        }
      }

      if (result.length > 0) {
        return result;
      }
    }

    return null;
  }

  static getFirstProperty(graph, property) {
    if (graph[property] == undefined) {
      return null;
    }

    const values = graph[property];

    if (values.length === 0) {
      return null;
    }

    if (values.length === 1) {
      const value = values[0];

      if (value[DatabusUris.JSONLD_VALUE] != null) {
        return value[DatabusUris.JSONLD_VALUE];
      }

      if (value[DatabusUris.JSONLD_ID] != null) {
        return value[DatabusUris.JSONLD_ID];
      }

      return null;
    }

    for (const value of values) {
      if (value[DatabusUris.JSONLD_VALUE] != null) {
        return value[DatabusUris.JSONLD_VALUE];
      }

      if (value[DatabusUris.JSONLD_ID] != null) {
        return value[DatabusUris.JSONLD_ID];
      }
    }

    return null;
  }


  static getGraphById(graphs, id) {
    for (var g in graphs) {
      var graph = graphs[g];

      if (graph[DatabusUris.JSONLD_ID] != undefined && graph[DatabusUris.JSONLD_ID] == id) {
        return graph;
      }
    }

    return null;
  }

  static getTypedGraphs(graphs, graphType) {
    var result = [];

    for (var g in graphs) {
      var graph = graphs[g];

      if (graph[DatabusUris.JSONLD_TYPE] != undefined &&
        graph[DatabusUris.JSONLD_TYPE].includes(graphType)) {
        result.push(graph);
      }
    }

    return result;
  }

  static getSubPropertyGraphs(graphs, propertyUri) {

    var result = [];

    for (var graph of graphs) {
      if (graph[DatabusUris.RDFS_SUB_PROPERTY_OF] == undefined) {
        continue;
      }

      for (var property of graph[DatabusUris.RDFS_SUB_PROPERTY_OF]) {
        if (property[DatabusUris.JSONLD_ID] == propertyUri) {
          result.push(graph);
        }
      }
    }

    return result;
  }


  static getFirstObject(graph, key) {
    var obj = graph[key];

    if (obj == undefined || obj.length < 1) {
      return null;
    }

    return obj[0];
  }

  static getFirstObjectUri(graph, property) {
    // Get the object    
    const obj = graph[property];

    // Not found -> null
    if (!obj) {
      return null;
    }

    // If it is an array...
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === 'object' && DatabusUris.JSONLD_ID in item) {
          return item[DatabusUris.JSONLD_ID];
        }
      }
    } else if (typeof obj === 'object' && DatabusUris.JSONLD_ID in obj) {
      return obj[DatabusUris.JSONLD_ID];
    }

    return null;
  }
}



if ( true && module && module.exports)
  module.exports = JsonldUtils;

/***/ },

/***/ "./js/utils/messages.js"
/*!******************************!*\
  !*** ./js/utils/messages.js ***!
  \******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   DatabusMsg: () => (/* binding */ DatabusMsg)
/* harmony export */ });
class DatabusMsg {
  static messages = {
    err_invalid_group_name: "Please enter between 3 to 50 characters. \nRegex: [a-zA-Z0-9_\\-\\.]{3,50}$",
    err_no_group_selected: "Please select a group",
    err_no_artifact_selected: "Please select an artifact",
    
    err_invalid_artifact_name: "Please enter between 3 to 50 characters. \nRegex: [a-zA-Z0-9_\\-\\.]{3,50}$",
    err_invalid_version_name: "Please enter between 3 to 50 characters. \nRegex: [a-zA-Z0-9_\\-\\.]{3,50}$",
    err_invalid_version_title: "The version title is missing.",
    err_invalid_version_abstract: "The version abstract is missing.",
    err_invalid_version_description: "The version description is missing.",
    err_invalid_version_license: "The license is invalid. Please enter a license URI.",
    err_no_files: "You have to upload at least one file.",
    err_not_analyzed: "This file has not been analzyed yet.",
    warning_group_exists: "A group with this name already exists. Publishing will overwrite its metadata.",
    warning_artifact_exists: "An artifact with this name already exists. Publishing will overwrite its metadata.",
    warning_version_exists: "A version with this name already exists. Publishing will overwrite its metadata. This is not recommended, as other users might use your version identifier as a data dependency."
  };

  static get(key) {
    return this.messages[key] || "Unknown validation key.";
  }
}


/***/ },

/***/ "./js/utils/sparql-examples.js"
/*!*************************************!*\
  !*** ./js/utils/sparql-examples.js ***!
  \*************************************/
(module) {

/**
 * Query Templates can be defined as object with the fields:
 * > select
 * > body
 * > aggregate
 * 
 * The select is a SPARQL select statement. The body is an array of strings with each string being a line of a 
 * SPARQL query. The string %QUERY% can be used to insert the query generated by the QueryBuilder. The aggregate
 * is a SPARQL aggregate statement.
 */
class SparqlExamples {

  static LIST = `PREFIX databus: <https://dataid.dbpedia.org/databus#>
SELECT DISTINCT * WHERE {
  ?s a databus:Artifact .
}`;
}

module.exports = SparqlExamples;

/***/ },

/***/ "./js/utils/tab-navigation.js"
/*!************************************!*\
  !*** ./js/utils/tab-navigation.js ***!
  \************************************/
(module) {


class TabNavigation {

  constructor($scope, $location, tabKeys, onNavigateCallback) {
    this.location = $location;
    this.tabKeys = tabKeys;
    this.activeTab = 0;
    this.onNavigateCallback = onNavigateCallback;

    var self = this;
    // Watch the location hash and tell the tabnavigation that it changed
    $scope.$watch(function () {
      return $location.hash();
    }, function (newVal, oldVal) {
      self.onLocationHashChanged(newVal, oldVal)
    }, false);
  }


  onLocationHashChanged(value, oldVal) {
    for (var i in this.tabKeys) {
      var tabKey = this.tabKeys[i];
      if (value == tabKey) {
        this.activeTab = i;

        if(this.onNavigateCallback != null) {
          this.onNavigateCallback(this.activeTab);
        }
        return;
      }
    }

    this.activeTab = 0;
    if(this.onNavigateCallback != null) {
      this.onNavigateCallback(this.activeTab);
    }
  }

  /**
   * Change the tab - set location hash and scroll up
   * @param {*} value 
   */
  navigateTo(value, scrollToTop) {
    this.location.hash(value);

    if(scrollToTop == true) {
      window.scrollTo(0, 0);
    }
  }

}

module.exports = TabNavigation;

/***/ },

/***/ "markdown-it"
/*!*****************************!*\
  !*** external "markdownit" ***!
  \*****************************/
(module) {

"use strict";
module.exports = self["markdownit"];

/***/ },

/***/ "moment/moment"
/*!*************************!*\
  !*** external "moment" ***!
  \*************************/
(module) {

"use strict";
module.exports = self["moment"];

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!***********************************!*\
  !*** ./js/angular-application.js ***!
  \***********************************/
const AccountPageController = __webpack_require__(/*! ./page-controller/account-controller */ "./js/page-controller/account-controller.js");
const ArtifactPageController = __webpack_require__(/*! ./page-controller/artifact-controller */ "./js/page-controller/artifact-controller.js");
const FrontPageController = __webpack_require__(/*! ./page-controller/frontpage-controller */ "./js/page-controller/frontpage-controller.js");
const HeaderController = __webpack_require__(/*! ./page-controller/header-controller */ "./js/page-controller/header-controller.js");
const CollectionController = __webpack_require__(/*! ./page-controller/collection-controller */ "./js/page-controller/collection-controller.js");
const CollectionsEditorController = __webpack_require__(/*! ./page-controller/collections-editor-controller */ "./js/page-controller/collections-editor-controller.js");
const GroupPageController = __webpack_require__(/*! ./page-controller/group-controller */ "./js/page-controller/group-controller.js");
const ProfileController = __webpack_require__(/*! ./page-controller/profile-controller */ "./js/page-controller/profile-controller.js");
const PublishWizardController = __webpack_require__(/*! ./page-controller/publish-wizard-controller */ "./js/page-controller/publish-wizard-controller.js");
const VersionPageController = __webpack_require__(/*! ./page-controller/version-controller */ "./js/page-controller/version-controller.js");
const UserSettingsController = __webpack_require__(/*! ./page-controller/user-settings-controller */ "./js/page-controller/user-settings-controller.js");
const DatabusCollectionManager = __webpack_require__(/*! ./collections/databus-collection-manager */ "./js/collections/databus-collection-manager.js");
const SearchManager = __webpack_require__(/*! ./search/search-manager */ "./js/search/search-manager.js");
const SearchController = __webpack_require__(/*! ./components/search/search-controller */ "./js/components/search/search-controller.js");
const DatabusAlertController = __webpack_require__(/*! ./components/databus-alert/databus-alert-controller */ "./js/components/databus-alert/databus-alert-controller.js");
const EntityCardController = __webpack_require__(/*! ./components/entity-card/entity-card */ "./js/components/entity-card/entity-card.js");
const OverrideCheckboxController = __webpack_require__(/*! ./components/override-checkbox/override-checkbox */ "./js/components/override-checkbox/override-checkbox.js");
const AutofillDropdownController = __webpack_require__(/*! ./components/autofill-dropdown/autofill-dropdown */ "./js/components/autofill-dropdown/autofill-dropdown.js");
const DatabusIconController = __webpack_require__(/*! ./components/databus-icon/databus-icon */ "./js/components/databus-icon/databus-icon.js");
const TypeTagController = __webpack_require__(/*! ./components/type-tag/type-tag */ "./js/components/type-tag/type-tag.js");
const CollectionEditorWidgetController = __webpack_require__(/*! ./components/collection-editor-widget/collection-editor-widget */ "./js/components/collection-editor-widget/collection-editor-widget.js");
const CollectionHierarchyControllerTwo = __webpack_require__(/*! ./components/collection-hierarchy-two/collection-hierarchy */ "./js/components/collection-hierarchy-two/collection-hierarchy.js");
const UriBreadcrumbsController = __webpack_require__(/*! ./components/uri-breadcrumbs/uri-breadcrumbs */ "./js/components/uri-breadcrumbs/uri-breadcrumbs.js");
const TableEditorController = __webpack_require__(/*! ./components/table-editor/table-editor */ "./js/components/table-editor/table-editor.js");
const MultiselectDropdownController = __webpack_require__(/*! ./components/multiselect-dropdown/multiselect-dropdown */ "./js/components/multiselect-dropdown/multiselect-dropdown.js");
const FileBrowserController = __webpack_require__(/*! ./components/file-browser/file-browser */ "./js/components/file-browser/file-browser.js");
const FacetsViewController = __webpack_require__(/*! ./components/facets-view/facets-view */ "./js/components/facets-view/facets-view.js");
const ExpandableArrowController = __webpack_require__(/*! ./components/expandable-arrow/expandable-arrow */ "./js/components/expandable-arrow/expandable-arrow.js");
const YasqeTextController = __webpack_require__(/*! ./components/yasqe-text/yasqe-text */ "./js/components/yasqe-text/yasqe-text.js");
const YasrViewController = __webpack_require__(/*! ./components/yasr-view/yasr-view */ "./js/components/yasr-view/yasr-view.js");
const CollectionStatisticsController = __webpack_require__(/*! ./components/collection-statistics/collection-statistics */ "./js/components/collection-statistics/collection-statistics.js");
const CollectionNodeController = __webpack_require__(/*! ./components/collection-node/collection-node */ "./js/components/collection-node/collection-node.js");
const CollectionSearchController = __webpack_require__(/*! ./components/collection-search/collection-search */ "./js/components/collection-search/collection-search.js");
const CollectionStatusController = __webpack_require__(/*! ./components/collection-status/collection-status */ "./js/components/collection-status/collection-status.js");
const CollectionDataTableController = __webpack_require__(/*! ./components/collection-data-table/collection-data-table */ "./js/components/collection-data-table/collection-data-table.js");
const AccountHistoryController = __webpack_require__(/*! ./components/account-history/account-history */ "./js/components/account-history/account-history.js");
const SparqlEditorController = __webpack_require__(/*! ./page-controller/sparql-editor-controller */ "./js/page-controller/sparql-editor-controller.js");
const BetterDropdownController = __webpack_require__(/*! ./components/better-dropdown/better-dropdown */ "./js/components/better-dropdown/better-dropdown.js");
const NavSearchController = __webpack_require__(/*! ./components/nav-search/nav-search-controller */ "./js/components/nav-search/nav-search-controller.js");
const EntityDropdownController = __webpack_require__(/*! ./components/entity-dropdown/entity-dropdown */ "./js/components/entity-dropdown/entity-dropdown.js");
const EntityApiViewController = __webpack_require__(/*! ./components/entity-api-view/entity-api-view */ "./js/components/entity-api-view/entity-api-view.js");
const ErrorNotificationController = __webpack_require__(/*! ./components/error-notification/error-notifcation */ "./js/components/error-notification/error-notifcation.js");

var databusApplication = angular.module("databusApplication", [])
  .controller("HeaderController", ["$scope", "$http", "collectionManager", HeaderController])
  .factory('collectionManager', [ "$interval", "$http", function ($interval, $http) { return new DatabusCollectionManager($http, $interval, 'databus_collections'); }])
  .factory('searchManager', [ "$interval", "$http", function ($interval, $http) { return new SearchManager($http, $interval); }])
  .factory('focus', ["$timeout", "$window", function ($timeout, $window) {
    return function (id) {
      $timeout(function () {
        var element = $window.document.getElementById(id);
        if (element)
          element.focus();
      });
    };
  }])
  .controller("UserSettingsController", [ "$scope", "$http", "$sce", "$location", UserSettingsController])
  .controller("HeaderController", ["$scope", "$http", "collectionManager", "searchManager", HeaderController])
  .controller("AccountPageController", ["$scope", "$http", "$location", "collectionManager", AccountPageController])
  .controller("FrontPageController", ["$scope", "$sce", "$http", FrontPageController])
  .controller("ArtifactPageController", ["$scope", "$http", "$sce", "$location", "collectionManager", ArtifactPageController])
  .controller("CollectionController", ["$scope", "$sce", "$http", "collectionManager", CollectionController])
  .controller("CollectionsEditorController", ["$scope", "$timeout", "$http", "$location", "collectionManager", CollectionsEditorController])
  .controller("GroupPageController", ["$scope", "$http", "$sce", "$interval", "$location", "collectionManager", GroupPageController])
  .controller("ProfileController", ["$scope", "$http", ProfileController])
  .controller("SparqlEditorController", ["$scope", "$http", "$location", SparqlEditorController])
  .controller("PublishWizardController", ["$scope", "$http", "$interval", "focus", "$q", "$location", PublishWizardController])
  .controller("VersionPageController", ["$scope", "$http", "$sce", "$location", "collectionManager", VersionPageController])
  .directive('uploadRanking', function () {
    return {
      restrict: 'E',
      replace: true,
      templateUrl: '/website/templates/upload-ranking.html',
      scope: {
        data: '=data'
      }
    }
  });
 
function config($locationProvider) {
  $locationProvider.html5Mode({
    enabled: true,
    requireBase: false,
    rewriteLinks: false
  });
};

databusApplication.filter('collectionfilter', function() {
  return function(input, search) {
    if (!input) return input;
    
    var expected = '';

    if (search != null) {
      expected = ('' + search).toLowerCase();
    }

    var result = [];

    angular.forEach(input, function(value, key) {
      if(value.title == undefined) {
        return;
      }
      
      if(value.title.toLowerCase().includes(expected)) {
        result.push(value); 
      }
    });

    return result;
  }
});

databusApplication.config(['$locationProvider', config]);

// Components
databusApplication.component('overrideCheckbox', {
  templateUrl: '/js/components/override-checkbox/override-checkbox.html',
  controller: OverrideCheckboxController,
  bindings: {
    checkValue: '<',
    label: '<',
    id: '<',
    readonly: '<',
    isOverride: '<',
    onChange: '&'
  }
});

databusApplication.component('errorTag', {
  controller: ErrorNotificationController,
  templateUrl: '/js/components/error-notification/error-notification.html',
  bindings: {
    entity: '<',
    key: '@',
    texts: '<'
  }
});

databusApplication.component('entityDropdown', {
  bindings: {
    placeholder: '@',
    items: '<',
    displayProperty: '@',
    loading: '<',
    selected: '<',
    onSelect: '&'
  },
  controller: EntityDropdownController,
  templateUrl: '/js/components/entity-dropdown/entity-dropdown.html'
});

databusApplication.component('entityApiView', {
    bindings: {
      entity: '<',
      apiKeys: '<',
      texts: '<',
      publishLog: '<'
    },
    controller: EntityApiViewController,
    templateUrl: '/js/components/entity-api-view/entity-api-view.html'
  });



databusApplication.component('accountHistory', {
  templateUrl: '/js/components/account-history/account-history.html',
  controller: [ '$http', AccountHistoryController ],
  bindings: {
    accountName: '<'
  }
});

// Components
databusApplication.component('databusAlert', {
  templateUrl: '/js/components/databus-alert/databus-alert.html',
  controller: [ '$scope', '$timeout', DatabusAlertController ],
});

databusApplication.component('entityCard', {
  templateUrl: '/js/components/entity-card/entity-card.html',
  controller: ['$sce', EntityCardController ],
  bindings: {
    label: '<',
    uri: '<',
    desc: '<',
    date: '<',
    type: '<',
    imageUrl: '<',
    absolute: '<'
  }
});

databusApplication.component('search', {
  templateUrl: '/js/components/search/search.html',
  controller: ['$http', '$interval', '$sce', 'searchManager', SearchController],
  bindings: {
    searchInput: '=',
    settings: '<',
  }
});


databusApplication.component('navSearch', {
  templateUrl: '/js/components/nav-search/nav-search.html',
  controller: ['$http', '$interval', '$sce', 'searchManager', NavSearchController],
  bindings: {
    searchInput: '=',
    settings: '<',
  }
});

/*
databusApplication.component('databusSearch', {
  templateUrl: '/js/components/databus-search/databus-search.html',
  controller: ['$http', '$interval', '$sce', DatabusSearchController],
  bindings: {
    filters: '=',
    input: '='
  }
});*/

databusApplication.component('autofillDropdown', {
  templateUrl: '/js/components/autofill-dropdown/autofill-dropdown.html',
  controller: ['$timeout', AutofillDropdownController ],
  bindings: {
    input: '=',
    values: '<',
    isDisabled: '<',
    placeholder: '@',
    onChange: '&'
  }
});


databusApplication.component('databusIcon', {
  templateUrl: '/js/components/databus-icon/databus-icon.html',
  controller: DatabusIconController,
  bindings: {
    size: '<',
    shape: '<',
    onClick: '&',
    isClickable: '<',
    color: '<'
  }
});

databusApplication.component('typeTag', {
  templateUrl: '/js/components/type-tag/type-tag.html',
  controller: TypeTagController,
  bindings: {
    type: '<',
    height: '<',
    width: '<',
  }
});

/*

databusApplication.component('collectionEditor', {
  templateUrl: '/js/components/collection-editor/collection-editor.html',
  controller: ['$http', '$location', '$sce', CollectionEditorController],
  bindings: {
    collection: '=',
    readonly: '<',
    onPublish: '&',
    onDelete: '&',
    loggedIn: '<'
  }
});*/

databusApplication.component('collectionEditorWidget', {
  templateUrl: '/js/components/collection-editor-widget/collection-editor-widget.html',
  controller: ['collectionManager', '$scope', CollectionEditorWidgetController ],
  bindings: {
    selection: '<',
    collection: '=',
  }
});

/*
databusApplication.component('collectionHierarchy', {
  templateUrl: '/js/components/collection-hierarchy/collection-hierarchy.html',
  controller: ['$http', '$location', '$sce', CollectionHierarchyController],
  bindings: {
    collection: '=',
    readonly: '<',
    onPublish: '&',
    onDelete: '&',
    loggedIn: '<',
    onChange: '&'
  }
});*/

databusApplication.component('collectionHierarchyTwo', {
  templateUrl: '/js/components/collection-hierarchy-two/collection-hierarchy.html',
  controller: ['$http', '$location', '$sce', '$scope', 'collectionManager', CollectionHierarchyControllerTwo ],
  bindings: {
    collection: '=',
    onChange: '&',
    onAddContent: '&'
  }
});

databusApplication.component('collectionNode', {
  templateUrl: '/js/components/collection-node/collection-node.html',
  controller: CollectionNodeController,
  bindings: {
    node: '<',
    readonly: '<',
    onRemoveNode: '&',
    onClick: '&',
    count: '<',
    isExpandable: '<'
  }
});

databusApplication.component('collectionSearch', {
  templateUrl: '/js/components/collection-search/collection-search.html',
  controller: ['collectionManager', '$http', '$interval', '$sce', CollectionSearchController ],
  bindings: {
    collection: '=',
    targetDatabusUrl: '<',
    onComponentAdded: '&'
  }
});

databusApplication.component('collectionStatistics', {
  templateUrl: '/js/components/collection-statistics/collection-statistics.html',
  controller: ['$http', '$scope', '$location', '$sce', CollectionStatisticsController ],
  bindings: {
    collection: '<'
  }
});

databusApplication.component('collectionStatus', {
  templateUrl: '/js/components/collection-status/collection-status.html',
  controller: ['$http', '$location', '$sce', CollectionStatusController ],
  bindings: {
    hasLocalChanges: '<',
    isPublished: '<',
    isDraft: '<',
  }
});

/*

databusApplication.component('editLabel', {
  templateUrl: '/js/components/edit-label/edit-label.html',
  controller: ['$element', EditLabelController],
  bindings: {
    text: '=',
    singleLine: '<',
    onBlur: '&',
    onChange: '&'
  }
});*/

databusApplication.component('expandableArrow', {
  templateUrl: '/js/components/expandable-arrow/expandable-arrow.html',
  controller: ExpandableArrowController,
  bindings: {
    expanded: '=',
    onChange: '&',
    isReadonly: '<'
  }
});

databusApplication.component('facetsView', {
  templateUrl: '/js/components/facets-view/facets-view.html',
  controller: ['$http', '$scope', FacetsViewController ],
  bindings: {
    node: '=',
    readonly: '<',
    resourceType: '@',
    onChange: '&',
    onLoaded: '&'
  }
});

databusApplication.component('facetsViewHorizontal', {
  templateUrl: '/js/components/facets-view/facets-view-horizontal.html',
  controller: ['$http', '$scope', FacetsViewController ],
  bindings: {
    node: '=',
    readonly: '<',
    resourceType: '@',
    onChange: '&',
    onLoaded: '&'
  }
});

databusApplication.component('fileBrowser', {
  templateUrl: '/js/components/file-browser/file-browser.html',
  controller: ['$http', '$scope', FileBrowserController ],
  bindings: {
    resourceUri: '<',
    resourceType: '@',
    node: '<',
    facetSettings: '<',
    parentFacetSettings: '<',
    query: '<',
    fullQuery: '<',
    config: '<'
  }
});

/*

databusApplication.component('multiselectArtifactDropdown', {
  templateUrl: '/js/components/multiselect-artifact-dropdown/multiselect-artifact-dropdown.html',
  controller: ['$timeout', '$sce', MultiselectArtifactDropdownController],
  bindings: {
    data: '<',
    node: '<',
    values: '<',
    isDisabled: '<',
    icon: '<',
    onChange: '&'
  }
});*/

databusApplication.component('multiselectDropdown', {
  templateUrl: '/js/components/multiselect-dropdown/multiselect-dropdown.html',
  controller: ['$timeout', '$sce', MultiselectDropdownController],
  bindings: {
    parentInput: '<',
    input: '=',
    values: '<',
    isDisabled: '<',
    placeholder: '@',
    onChange: '&'
  }
});

databusApplication.component('tableEditor', {
  templateUrl: '/js/components/table-editor/table-editor.html',
  controller: TableEditorController,
  bindings: {
    model: '=',
    onRemoveFile: '&',
    onEditContentVariant: '&',
    onAnalyzeFile: '&',
    analysisProcesses: '<'
  }
});

databusApplication.component('uriBreadcrumbs', {
  templateUrl: '/js/components/uri-breadcrumbs/uri-breadcrumbs.html',
  controller: UriBreadcrumbsController,
  bindings: {
    uri: '<',
    absolute: '<'
  }
});


databusApplication.component('yasqeText', {
  templateUrl: '/js/components/yasqe-text/yasqe-text.html',
  controller: ['$scope', '$element', YasqeTextController ],
  bindings: {
    query: '=',
    autoSize: '<',
    readOnly: '<',
    onChange: '&',
    onSend: '&',
    hasSend: '<'
  }
});

databusApplication.component('betterDropdown', {
  templateUrl: '/js/components/better-dropdown/better-dropdown.html',
  controller: ['$scope', '$interval', '$element', BetterDropdownController ],
  bindings: {
    rootNode: '=',
    onNodeClicked: '&',
    icon: '<',
    label: '<'
  }
});


databusApplication.component('yasrView', {
  templateUrl: '/js/components/yasr-view/yasr-view.html',
  controller: ['$scope', '$element', YasrViewController ],
  bindings: {
    data: '=',
    autoSize: '<',
    readOnly: '<',
    onChange: '&'
  }
});

databusApplication.component('collectionDataTable', {
  templateUrl: '/js/components/collection-data-table/collection-data-table.html',
  controller: ['$http', '$scope', '$location', '$sce', CollectionDataTableController],
  bindings: {
    collection: '<'
  }
});


databusApplication.directive('selectOnClick', ['$window', function ($window) {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      element.on('click', function () {
        if (!$window.getSelection().toString() && this.readonly == false) {
          // Required for mobile Safari
          this.setSelectionRange(0, this.value.length)
        }
      });
    }
  };
}]);

databusApplication.directive('focusMe', ['$timeout', '$parse', function ($timeout, $parse) {
  return {
    //scope: true,   // optionally create a child scope
    link: function (scope, element, attrs) {
      var model = $parse(attrs.focusMe);
      scope.$watch(model, function (value) {
        if (value === true) {
          $timeout(function () {
            element[0].focus();
          });
        }
      });
    }
  };
}]);

databusApplication.directive('eventFocus', function (focus) {
  return function (scope, elem, attr) {
    elem.on(attr.eventFocus, function () {
      focus(attr.eventFocusId);
    });

    // Removes bound events in the element itself
    // when the scope is destroyed
    scope.$on('$destroy', function () {
      elem.off(attr.eventFocus);
    });
  };
});



databusApplication.directive('uploaderRanking', function () {
  return {
    restrict: 'E',
    replace: true,
    template: '<div><table class="table is-size-6 is-fullwidth"><thead><tr><th>User</th><th>Uploads</th><th>Derived Data</th></tr></thead><tbody><tr ng-repeat="row in data"><td><a href="{{ row.accountUri }}">{{ row.account }}</a></td><td>{{ row.numUploads }}</td><td>{{ row.uploadSize }}</td></tr></tbody></table></div>',
    scope: {
      data: '=data',
    }
  }
});


databusApplication.directive('groupsTable', function () {
  return {
    restrict: 'E',
    replace: true,
    template: '<div><table class="table is-size-6 is-fullwidth"><thead><tr><th>Group Id</th><th># Artifacts</th></tr></thead><tbody><tr ng-repeat="row in data"><td><a href="{{ row.uri }}">{{ row.label }}</a></td><td>{{ row.artifactCount }}</td></tr></tbody></table></div>',
    scope: {
      data: '=data',
    }
  }
});


databusApplication.directive('activityChart', function () {
  return {
    restrict: 'E',
    replace: true,
    template: '<svg class="chart"></svg>',
    scope: {
      data: '=data',
      height: '=height'
    },
    link: function (scope, element, attrs) {

      var svgHeight = scope.height;

      for (d in scope.data) {
        scope.data[d].date = new Date(scope.data[d].date);
      }

      var svg = d3.select(element[0])
        .attr("id", "graph")
        .attr("width", "107%")
        .attr("height", svgHeight);

      var bounds = svg.node().getBoundingClientRect();
      var svgWidth = bounds.width;

      var margin = { top: 20, right: 50, bottom: 60, left: 50 };
      var width = svgWidth - margin.left - margin.right;
      var height = svgHeight - margin.top - margin.bottom;

      var g = svg.append("g")
        .attr("transform",
          "translate(" + margin.left + "," + margin.top + ")"
        );

      var x = d3.scaleTime().rangeRound([0, width]);
      var y = d3.scaleLinear().rangeRound([height, 0]);

      var line = d3.line()
        .x(function (d) { return x(d.date) })
        .y(function (d) { return y(d.value) })

      x.domain(d3.extent(scope.data, function (d) { return d.date }));
      y.domain(d3.extent(scope.data, function (d) { return d.value }));

      g.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("y", 0)
        .attr("x", 9)
        .attr("dy", ".35em")
        .attr("transform", "rotate(90)")
        .style("text-anchor", "start");

      g.append("g")
        .call(d3.axisLeft(y))
        .append("text")
        .attr("fill", "#000")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", "1em")
        .attr("font-size", "1.1em")
        .attr("text-anchor", "end")
        .text("Uploaded Data (GByte)");

      var path = g.append("path")
        .datum(scope.data)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("stroke-width", 2)
        .attr("d", line);
    }
  }
});

databusApplication.directive('onFinishRender', ['$timeout', '$parse', function ($timeout, $parse) {
  return {
    restrict: 'A',
    link: function (scope, element, attr) {
      if (scope.$last === true) {
        $timeout(function () {
          scope.$emit('ngRepeatFinished');
          if (!!attr.onFinishRender) {
            $parse(attr.onFinishRender)(scope);
          }
        });
      }
    }
  }
}]);

databusApplication.directive('clickOutside', [
  '$document', '$parse', '$timeout',
  clickOutside
]);

/**
     * @ngdoc directive
     * @name angular-click-outside.directive:clickOutside
     * @description Directive to add click outside capabilities to DOM elements
     * @requires $document
     * @requires $parse
     * @requires $timeout
     **/
 function clickOutside($document, $parse, $timeout) {
  return {
      restrict: 'A',
      link: function($scope, elem, attr) {

          // postpone linking to next digest to allow for unique id generation
          $timeout(function() {
              var classList = (attr.outsideIfNot !== undefined) ? attr.outsideIfNot.split(/[ ,]+/) : [],
                  fn;

              function eventHandler(e) {
                  var i,
                      element,
                      r,
                      id,
                      classNames,
                      l;

                  // check if our element already hidden and abort if so
                  if (angular.element(elem).hasClass("ng-hide")) {
                      return;
                  }

                  // if there is no click target, no point going on
                  if (!e || !e.target) {
                      return;
                  }

                  // loop through the available elements, looking for classes in the class list that might match and so will eat
                  for (element = e.target; element; element = element.parentNode) {
                      // check if the element is the same element the directive is attached to and exit if so (props @CosticaPuntaru)
                      if (element === elem[0]) {
                          return;
                      }
                      
                      // now we have done the initial checks, start gathering id's and classes
                      id = element.id,
                      classNames = element.className,
                      l = classList.length;

                      // Unwrap SVGAnimatedString classes
                      if (classNames && classNames.baseVal !== undefined) {
                          classNames = classNames.baseVal;
                      }

                      // if there are no class names on the element clicked, skip the check
                      if (classNames || id) {

                          // loop through the elements id's and classnames looking for exceptions
                          for (i = 0; i < l; i++) {
                              //prepare regex for class word matching
                              r = new RegExp('\\b' + classList[i] + '\\b');

                              // check for exact matches on id's or classes, but only if they exist in the first place
                              if ((id !== undefined && id === classList[i]) || (classNames && r.test(classNames))) {
                                  // now let's exit out as it is an element that has been defined as being ignored for clicking outside
                                  return;
                              }
                          }
                      }
                  }

                  // if we have got this far, then we are good to go with processing the command passed in via the click-outside attribute
                  $timeout(function() {
                      fn = $parse(attr['clickOutside']);
                      fn($scope, { event: e });
                  });
              }

              // if the devices has a touchscreen, listen for this event
              if (_hasTouch()) {
                  $document.on('touchstart', eventHandler);
              }

              // still listen for the click event even if there is touch to cater for touchscreen laptops
              $document.on('click', eventHandler);

              // when the scope is destroyed, clean up the documents event handlers as we don't want it hanging around
              $scope.$on('$destroy', function() {
                  if (_hasTouch()) {
                      $document.off('touchstart', eventHandler);
                  }

                  $document.off('click', eventHandler);
              });

              /**
               * @description Private function to attempt to figure out if we are on a touch device
               * @private
               **/
              function _hasTouch() {
                  // works on most browsers, IE10/11 and Surface
                  return 'ontouchstart' in window || navigator.maxTouchPoints;
              };
          });
      }
  };
}

})();

/******/ })()
;
//# sourceMappingURL=main.js.map