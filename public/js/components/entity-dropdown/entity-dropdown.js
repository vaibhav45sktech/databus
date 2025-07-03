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
