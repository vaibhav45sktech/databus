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
