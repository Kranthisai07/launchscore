// Publishable keys only. These must never be reported as secrets (SEC-001 negative control).
// The Supabase URL is a SEC-005 detection (reported in `detected`, never a finding).
(function () {
  var config = {
    stripePublishableKey: "{{STRIPE_PK_TEST}}",
    supabaseAnonKey: "{{SUPABASE_ANON_JWT}}",
    supabaseUrl: "{{SUPABASE_URL}}",
  };
  document.documentElement.setAttribute("data-ready", String(Boolean(config.stripePublishableKey)));
})();
