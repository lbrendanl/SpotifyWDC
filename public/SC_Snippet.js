$.getJSON("./standard_connections.json")
.done(function(standard_connections_json) {
    schemaCallback(scehma_json, standard_connections_json.connections);
})
.fail(function(jqxhr, textStatus, error) {
    var err = textStatus + ", " + error;
    console.log("Request Failed: " + err);
});