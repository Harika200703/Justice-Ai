
const API_BASE_URL =
  window.JUSTICE_AI_CONFIG?.API_BASE_URL || "http://127.0.0.1:8000";

const TOKEN_KEY = "justice_ai_token";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("authForm");
  const card = document.getElementById("authCard");
  const title = document.getElementById("formTitle");
  const subtitle = document.getElementById("formSubtitle");
  const submitButton = document.getElementById("submitButton");
  const switchText = document.getElementById("switchMode");
  const switchButton = document.getElementById("switchAuth");
  const nameField = document.getElementById("nameField");
  const confirmField = document.getElementById("confirmField");
  const loginOptions = document.getElementById("loginOptions");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");

  if (!form || !switchButton || !submitButton) {
    console.error("Justice AI: Required authentication elements are missing.");
    return;
  }

  let isRegister = false;

  function setMode(registerMode) {
    isRegister = registerMode;

    card?.classList.toggle("register-mode", isRegister);

    if (title) {
      title.innerHTML = isRegister
        ? 'Create your account<span>.</span>'
        : 'Welcome back<span>.</span>';
    }

    if (subtitle) {
      subtitle.textContent = isRegister
        ? "Create an account to access your legal intelligence workspace."
        : "Sign in to continue your legal journey.";
    }

    if (submitButton) {
      const label = submitButton.querySelector("span");
      if (label) {
        label.textContent = isRegister
          ? "Create your account"
          : "Sign in to your account";
      } else {
        submitButton.textContent = isRegister
          ? "Create your account"
          : "Sign in to your account";
      }
    }

    // The current backend stores email and password, not a user's name.
    // Keep the unsupported name field hidden.
    if (nameField) nameField.hidden = true;

    if (confirmField) confirmField.hidden = !isRegister;
    if (confirmPassword) {
      confirmPassword.required = isRegister;
      confirmPassword.value = "";
    }

    if (loginOptions) loginOptions.hidden = isRegister;

    switchText.innerHTML = isRegister
      ? 'Already have an account? <button type="button" id="switchAuth">Sign in</button>'
      : 'New to Justice AI? <button type="button" id="switchAuth">Create an account</button>';

    // Rebind the button after updating its markup.
    document.getElementById("switchAuth")?.addEventListener("click", () => {
      setMode(!isRegister);
    });

    const passwordLabel = document.querySelector(
      'label[for="password"]'
    );
    if (passwordLabel) {
      passwordLabel.textContent = isRegister ? "Create password" : "Password";
    }

    if (password) {
      password.autocomplete = isRegister
        ? "new-password"
        : "current-password";
    }

    const message = document.getElementById("formMessage");
    if (message) {
      message.textContent = "";
      message.style.display = "none";
    }

    // Update browser validation for the selected form.
    form.reset();
  }

  function showMessage(message, type = "error") {
    const element = document.getElementById("formMessage");

    if (!element) {
      alert(message);
      return;
    }

    element.textContent = message;
    element.style.display = "block";
    element.style.color = type === "success" ? "#15803d" : "#dc2626";
    element.style.background =
      type === "success" ? "#f0fdf4" : "#fff7f6";
    element.style.borderColor =
      type === "success" ? "#bbf7d0" : "#f0cfca";
  }

  switchButton.addEventListener("click", () => {
    setMode(!isRegister);
  });

  // Initial page setup.
  setMode(false);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email")?.value.trim() || "";
    const passwordValue = password?.value || "";
    const confirmation = confirmPassword?.value || "";

    if (!email || !passwordValue) {
      showMessage("Please enter your email and password.");
      return;
    }

    if (isRegister && passwordValue.length < 8) {
      showMessage("Your password must contain at least 8 characters.");
      return;
    }

    if (isRegister && passwordValue !== confirmation) {
      showMessage("Passwords do not match.");
      return;
    }

    const originalLabel = submitButton.querySelector("span")?.textContent;
    submitButton.disabled = true;

    const label = submitButton.querySelector("span");
    if (label) {
      label.textContent = isRegister
        ? "Creating account..."
        : "Signing in...";
    }

    try {
      const endpoint = isRegister
        ? "/api/auth/register"
        : "/api/auth/login";

      // AuthRequest on the existing backend accepts email and password.
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password: passwordValue,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        let detail = data.detail || data.message;

        if (Array.isArray(detail)) {
          detail = detail.map((item) => item.msg).join(" ");
        }

        throw new Error(
          detail ||
          `Request failed (${response.status}). Please try again.`
        );
      }

      if (isRegister) {
        setMode(false);

        const emailInput = document.getElementById("email");
        if (emailInput) emailInput.value = email;

        showMessage(
          "Account created successfully! You can now sign in.",
          "success"
        );
        return;
      }

      const token =
        data.access_token || data.token || data.accessToken;

      if (!token) {
        throw new Error(
          "Login succeeded without an authentication token. Please check the backend response."
        );
      }

      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);

      window.location.href = "overview.html";
    } catch (error) {
      console.error("Justice AI authentication error:", error);
      showMessage(
        error.message || "Authentication failed. Please try again."
      );
    } finally {
      submitButton.disabled = false;

      if (label && document.contains(label)) {
        label.textContent =
          originalLabel ||
          (isRegister ? "Create your account" : "Sign in to your account");
      }
    }
  });
});
