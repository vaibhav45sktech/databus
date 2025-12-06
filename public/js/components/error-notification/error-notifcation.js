const { DatabusMsg } = require("../../utils/messages");

function ErrorNotificationController() {
  var ctrl = this;
  ctrl.expanded = false;
  ctrl.code = $ctrl.key;


  ctrl.toggleExpand = function () {
    ctrl.expanded = !ctrl.expanded;
  };

  ctrl.get = function(key) {
    return DatabusMsg.get(key);
  }
}

module.exports = ErrorNotificationController;
