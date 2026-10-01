// Publishable keys only. These must never be reported as secrets (SEC-001 negative control).
(function () {
  var config = {
    stripePublishableKey: "{{STRIPE_PK_TEST}}",
    supabaseAnonKey: "{{SUPABASE_ANON_JWT}}",
  };
  document.documentElement.setAttribute("data-ready", String(Boolean(config.stripePublishableKey)));
})();
