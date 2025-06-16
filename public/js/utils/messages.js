export class DatabusMsg {
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
