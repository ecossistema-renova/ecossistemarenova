(function () {
  const storageKey = "oyag-theme";
  const root = document.documentElement;
  const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  let saved = null;
  try { saved = localStorage.getItem(storageKey); } catch (_) {}
  const initial = saved === "light" || saved === "dark" ? saved : (systemDark ? "dark" : "light");
  root.dataset.theme = initial;
  root.style.colorScheme = initial;

  function label(theme) {
    return theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro";
  }

  function render(button, theme) {
    button.innerHTML = theme === "dark"
      ? '<span aria-hidden="true">☀</span><span class="theme-toggle-label">Claro</span>'
      : '<span aria-hidden="true">☾</span><span class="theme-toggle-label">Escuro</span>';
    button.setAttribute("aria-label", label(theme));
    button.title = label(theme);
    button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }

  function setTheme(theme, persist) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      try { localStorage.setItem(storageKey, theme); } catch (_) {}
    }
    document.querySelectorAll(".theme-toggle").forEach(function (button) {
      render(button, theme);
    });
    window.dispatchEvent(new CustomEvent("oyag:themechange", { detail: { theme: theme } }));
  }

  function mountToggle() {
    if (document.querySelector(".theme-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.addEventListener("click", function () {
      setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
    render(button, root.dataset.theme);

    const publicActions = document.querySelector(".topbar .actions, .topbar .header-actions");
    const workspaceUser = document.querySelector(".workspace > header .user, .workspace header .user");
    const authCard = document.querySelector(".auth-card");
    if (publicActions) publicActions.prepend(button);
    else if (workspaceUser && workspaceUser.parentElement) workspaceUser.parentElement.insertBefore(button, workspaceUser);
    else if (authCard) authCard.prepend(button);
    else document.body.prepend(button);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountToggle);
  else mountToggle();

  if (!saved && window.matchMedia) {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = function (event) { setTheme(event.matches ? "dark" : "light", false); };
    if (query.addEventListener) query.addEventListener("change", sync);
  }
})();