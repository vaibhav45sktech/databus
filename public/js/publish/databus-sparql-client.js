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
