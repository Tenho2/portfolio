/**
 * ESLint, deliberately narrow.
 *
 * Why this exists
 *   The application is a large classic script split across four files, plus the
 *   Node tooling that generates and tests it. The existing suites compile and
 *   exercise the code, so syntax errors and behaviour regressions are covered -
 *   but nothing looks for the static mistakes that only surface on a rarely-hit
 *   path: a reference to a name that does not exist, a variable that is never
 *   used (dead code), a duplicated key, an unreachable branch.
 *
 *   `no-undef` matters most after the module split: reaching for a private of
 *   app/i18n.js or app/storage.js is a ReferenceError that blanks a panel rather
 *   than failing a build. `no-unused-vars` already paid for itself by finding
 *   otherLayout(), which had been dead since the layout switcher was rewritten.
 *
 * What it deliberately does NOT do
 *   Style. No eqeqeq, no-var, prefer-const, no-console or camelcase: this code
 *   base uses loose null checks, var and function hoisting on purpose, and its
 *   console diagnostics are intended. Turning those on would bury the real
 *   findings. Formatting is Prettier's job and already runs in `npm run check`.
 *
 *   Generated pages, HTML and SQL are not linted here: app/app.js and the other
 *   modules are the sources, the pages are build output, and check-sql.mjs
 *   already covers the migrations.
 *
 * Run with: npm run lint:js
 */
import globals from "globals";

/** Logic errors only. A warning still fails `npm run check` (--max-warnings=0). */
const rules = {
  /* References, declarations and shapes. */
  "no-undef": "error",
  "no-redeclare": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-duplicate-case": "error",
  "no-unused-vars": [
    "error",
    {
      args: "none",
      caughtErrors: "none",
      varsIgnorePattern: "^_",
    },
  ],

  /* Control flow that cannot do what it looks like it does. */
  "no-unreachable": "error",
  "no-fallthrough": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-empty": ["error", { allowEmptyCatch: true }],

  /* Assignments and comparisons against the wrong thing. */
  "no-const-assign": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-self-assign": "error",
  "no-self-compare": "error",
  "no-unsafe-negation": "error",
  "no-unsafe-optional-chaining": "error",
  "no-sparse-arrays": "error",
  "use-isnan": "error",
  "valid-typeof": "error",

  /* A soft warning: Object.prototype methods are sometimes shadowed by data. */
  "no-prototype-builtins": "warn",
  /* Catches a BOM or non-breaking space that reached the middle of a source
     file. It is invisible in every editor and turns into a syntax error only
     when the file is compiled on a different toolchain. */
  "no-irregular-whitespace": "error",

  /* Style rules that produced noise rather than bugs. Explicit, so a future
     reader does not "helpfully" enable them. */
  eqeqeq: "off",
  "no-var": "off",
  "prefer-const": "off",
  "no-console": "off",
  camelcase: "off",
};

const language = {
  ecmaVersion: 2022,
};

export default [
  {
    ignores: [
      "node_modules/**",
      "ev-tracker*.html",
      "index.html",
      "icons/**",
      "supabase/**",
    ],
  },
  {
    /* Classic scripts: one shared scope per file, browser only. */
    files: ["app/*.js"],
    languageOptions: {
      ...language,
      sourceType: "script",
      globals: {
        ...globals.browser,
        /* Loaded from CDNs by the page, not imported by app/app.js. */
        Chart: "readonly",
        L: "readonly",
        supabase: "readonly",
        /* Published by app/stations.js, which runs before this script. */
        StationData: "readonly",
      },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules,
  },
  {
    /* The service worker is a classic script with worker globals, not browser
       ones. Linting it closes the last shell file the narrow pass skipped. */
    files: ["sw.js"],
    languageOptions: {
      ...language,
      sourceType: "script",
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules,
  },
  {
    /* The build script and every test/tool run under Node, as ES modules. */
    files: ["app/shell.mjs", "tools/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ...language,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules,
  },
];
