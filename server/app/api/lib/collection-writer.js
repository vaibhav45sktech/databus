const DatabusUris = require('../../../../public/js/utils/databus-uris');
const DatabusUtils = require('../../../../public/js/utils/databus-utils.js');
const JsonldUtils = require('../../../../public/js/utils/jsonld-utils.js');
const ResourceWriter = require('./resource-writer.js');

class CollectionWriter extends ResourceWriter {

  constructor(logger) {
    super(logger);
  }

  async onCreateGraphs() {

    var inputCollectionGraph = JsonldUtils.getGraphById(this.inputGraphs, this.uri);

    var collectionGraph = {};
    collectionGraph[DatabusUris.JSONLD_ID] = this.uri;
    collectionGraph[DatabusUris.JSONLD_TYPE] = DatabusUris.DATABUS_COLLECTION;
    collectionGraph[DatabusUris.DATABUS_NAME] = this.resource.getArtifact();
    collectionGraph[DatabusUris.DATABUS_ACCOUNT_PROPERTY] = JsonldUtils.refTo(this.resource.getAccountURI());
    collectionGraph[DatabusUris.DATABUS_COLLECTION_CONTENT] = inputCollectionGraph[DatabusUris.DATABUS_COLLECTION_CONTENT];

    if(inputCollectionGraph[DatabusUris.DCT_TITLE] != null) {
      collectionGraph[DatabusUris.DCT_TITLE] = inputCollectionGraph[DatabusUris.DCT_TITLE];
    }

    if(inputCollectionGraph[DatabusUris.DCT_DESCRIPTION] != null) {
      collectionGraph[DatabusUris.DCT_DESCRIPTION] = inputCollectionGraph[DatabusUris.DCT_DESCRIPTION];
    }

    if(inputCollectionGraph[DatabusUris.DCT_ISSUED] != null) {
      collectionGraph[DatabusUris.DCT_ISSUED] = inputCollectionGraph[DatabusUris.DCT_ISSUED];
    }

    var timeString = DatabusUtils.timeStringNow();

    // Set times
    if (collectionGraph[DatabusUris.DCT_CREATED] == undefined) {
      collectionGraph[DatabusUris.DCT_CREATED] = [{}];
      collectionGraph[DatabusUris.DCT_CREATED][0][DatabusUris.JSONLD_TYPE] = DatabusUris.XSD_DATE_TIME;
      collectionGraph[DatabusUris.DCT_CREATED][0][DatabusUris.JSONLD_VALUE] = timeString;
    }

    if (collectionGraph[DatabusUris.DCT_MODIFIED] == undefined) {
      collectionGraph[DatabusUris.DCT_MODIFIED] = [{}];
      collectionGraph[DatabusUris.DCT_MODIFIED][0][DatabusUris.JSONLD_TYPE] = DatabusUris.XSD_DATE_TIME;
      collectionGraph[DatabusUris.DCT_MODIFIED][0][DatabusUris.JSONLD_VALUE] = timeString;
    }

    collectionGraph[DatabusUris.DCT_MODIFIED] = inputCollectionGraph[DatabusUris.DCT_ISSUED];

    if(inputCollectionGraph[DatabusUris.DCT_ABSTRACT] != null) {
      collectionGraph[DatabusUris.DCT_ABSTRACT] = inputCollectionGraph[DatabusUris.DCT_ABSTRACT];
    } else if (collectionGraph[DatabusUris.DCT_DESCRIPTION] != null) {
      collectionGraph[DatabusUris.DCT_DESCRIPTION] = DatabusUtils.createAbstractFromDescription(collectionGraph[DatabusUris.DCT_DESCRIPTION]);
    }

    return [
      collectionGraph
    ];
  }

  getSHACLFilePath() {
    return './res/shacl/collection.shacl'
  }
}

module.exports = CollectionWriter;
