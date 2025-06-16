
const DatabusUtils = require("../utils/databus-utils");
const DatabusUris = require("../utils/databus-uris");
const JsonldUtils = require("../utils/jsonld-utils");
const PublishData = require("./publish-data");
const DataIdCreator = require("./dataid-creator");
const DatabusSparqlClient = require("./databus-sparql-client");
const GroupHandler = require("./group-data");
const ArtifactHandler = require("./artifact-data");
const VersionHandler = require("./version-handler");

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
