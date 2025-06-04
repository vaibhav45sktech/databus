function EntityApiViewController() {
  const ctrl = this;

  ctrl.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      console.log("Copied to clipboard");
    });
  };

  ctrl.register = function () {
    if (ctrl.entity && ctrl.entity.register) {
      ctrl.entity.register();
    }
  };

  ctrl.setApiKeyName = function (name) {
    if (ctrl.entity && ctrl.entity.setApiKeyName) {
      ctrl.entity.setApiKeyName(name);
    }
  };
}

module.exports = EntityApiViewController;
