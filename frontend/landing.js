
document.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");
  const year = document.getElementById("currentYear");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  if (menuButton && navLinks) {
    menuButton.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");

      menuButton.setAttribute("aria-expanded", String(isOpen));
      menuButton.setAttribute(
        "aria-label",
        isOpen ? "Close navigation" : "Open navigation"
      );
    });

    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open navigation");
      });
    });
  }
});
