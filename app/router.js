// bugnote/app/router.js — View routing and navigation
// Depends on: utils.js, state.js (must be loaded first)

(function () {
  const ns = window.bugnote;

  const routeByView = {
    issues: "/",
    settings: "/settings",
  };

  const viewByRoute = {
    "/": "issues",
    "/issues": "issues",
    "/settings": "settings",
  };

  ns.routeByView = routeByView;
  ns.viewByRoute = viewByRoute;

  function viewFromPath(path) {
    return viewByRoute[path.replace(/\/+$/, "") || "/"] || "issues";
  }

  function syncViewFromRoute(replace) {
    switchView(viewFromPath(window.location.pathname), { replace: !!replace });
  }

  function switchView(view, options) {
    options = options || {};
    const els = ns.els;
    const nextView = routeByView[view] ? view : "issues";
    els.navItems.forEach((button) => button.classList.toggle("active", button.dataset.view === nextView));
    els.views.forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === nextView));
    document.title = nextView === "settings" ? "Settings - BugNote" : "BugNote";
    const nextPath = routeByView[nextView];
    if (options.push && window.location.pathname !== nextPath) {
      history.pushState({ view: nextView }, "", nextPath);
    } else if (options.replace && window.location.pathname !== nextPath) {
      history.replaceState({ view: nextView }, "", nextPath);
    }
    if (nextView === "settings" && typeof switchSettingsTab === "function") {
      switchSettingsTab("github");
    }
  }

  function switchSettingsTab(tabId) {
    const els = ns.els;
    els.settingsSubtabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.settingsTab === tabId));
    els.settingsTabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.settingsTabPanel === tabId));
  }

  ns.viewFromPath = viewFromPath;
  ns.syncViewFromRoute = syncViewFromRoute;
  ns.switchView = switchView;
  ns.switchSettingsTab = switchSettingsTab;
})();
