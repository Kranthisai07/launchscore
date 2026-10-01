// Planted for SEC-001 and HYG-005 (the Supabase URL is a SEC-005 detection). Every key here is fake and assembled at serve time.
(function () {
  var config = {
    stripePublishableKey: "{{STRIPE_PK_TEST}}",
    supabaseAnonKey: "{{SUPABASE_ANON_JWT}}",
    supabaseUrl: "{{SUPABASE_URL}}",
    stripeSecretKey: "{{STRIPE_SK_LIVE}}",
    supabaseServiceKey: "{{SUPABASE_SERVICE_JWT}}",
  };
  document.documentElement.setAttribute("data-ready", String(Boolean(config.supabaseUrl)));
})();

// Planted for HYG-005: throws on load, so the browser logs a console error.
undefinedWidget.init();
//# sourceMappingURL=app.js.map
