# Software Bill of Materials

**Project:** EV Multi-Tracker / portfolio  
**Version:** 1.0.0  
**Generated:** 2026-10-25  
**Scope:** static browser application, its CDN runtime libraries, and the npm development toolchain.

The application itself has no npm runtime dependencies. It is plain HTML, CSS and JavaScript served as static files.

## Runtime components

| Component             | Version                | Source                                                            | License      |
| --------------------- | ---------------------- | ----------------------------------------------------------------- | ------------ |
| Chart.js              | 4.4.4                  | https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js | MIT          |
| Leaflet               | 1.9.4                  | https://unpkg.com/leaflet@1.9.4/dist/leaflet.js                   | BSD-2-Clause |
| @supabase/supabase-js | 2.x (floating CDN tag) | https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2              | MIT          |

## Direct development dependencies

| Package       | Locked version | License |
| ------------- | -------------- | ------- |
| eslint        | 9.39.5         | MIT     |
| globals       | 17.13.0        | MIT     |
| html-validate | 9.7.1          | MIT     |
| jsdom         | 30.1.2         | MIT     |
| prettier      | 3.9.9          | MIT     |

## Transitive npm dependencies

The following packages are pulled in by the direct development dependencies. Versions are the locked versions from `package-lock.json`.

| Package                                                         | Version | License       |
| --------------------------------------------------------------- | ------- | ------------- |
| @asamuzakjp/css-color                                           | 7.1.3   | MIT           |
| @asamuzakjp/css-color/node_modules/lru-cache                    | 11.5.3  | BlueOak-1.0.0 |
| @asamuzakjp/dom-selector                                        | 9.2.4   | MIT           |
| @asamuzakjp/dom-selector/node_modules/lru-cache                 | 11.5.3  | BlueOak-1.0.0 |
| @bramus/specificity                                             | 2.4.2   | MIT           |
| @csstools/color-helpers                                         | 6.1.2   | MIT-0         |
| @csstools/css-calc                                              | 3.4.3   | MIT           |
| @csstools/css-color-parser                                      | 4.2.6   | MIT           |
| @csstools/css-parser-algorithms                                 | 4.0.2   | MIT           |
| @csstools/css-syntax-patches-for-csstree                        | 1.1.15  | MIT-0         |
| @csstools/css-tokenizer                                         | 4.0.2   | MIT           |
| @eslint-community/eslint-utils                                  | 4.10.1  | MIT           |
| @eslint-community/eslint-utils/node_modules/eslint-visitor-keys | 3.4.3   | Apache-2.0    |
| @eslint-community/regexpp                                       | 4.12.2  | MIT           |
| @eslint/config-array                                            | 0.21.2  | Apache-2.0    |
| @eslint/config-array/node_modules/brace-expansion               | 1.1.21  | MIT           |
| @eslint/config-array/node_modules/minimatch                     | 3.1.5   | ISC           |
| @eslint/config-helpers                                          | 0.4.2   | Apache-2.0    |
| @eslint/core                                                    | 0.17.0  | Apache-2.0    |
| @eslint/eslintrc                                                | 3.3.7   | MIT           |
| @eslint/eslintrc/node_modules/ajv                               | 6.15.0  | MIT           |
| @eslint/eslintrc/node_modules/brace-expansion                   | 1.1.21  | MIT           |
| @eslint/eslintrc/node_modules/globals                           | 14.0.0  | MIT           |
| @eslint/eslintrc/node_modules/json-schema-traverse              | 0.4.1   | MIT           |
| @eslint/eslintrc/node_modules/minimatch                         | 3.1.5   | ISC           |
| @eslint/js                                                      | 9.39.5  | MIT           |
| @eslint/object-schema                                           | 2.1.7   | Apache-2.0    |
| @eslint/plugin-kit                                              | 0.4.1   | Apache-2.0    |
| @exodus/bytes                                                   | 1.16.0  | MIT           |
| @html-validate/stylish                                          | 4.3.0   | MIT           |
| @humanfs/core                                                   | 0.19.2  | Apache-2.0    |
| @humanfs/node                                                   | 0.16.8  | Apache-2.0    |
| @humanfs/types                                                  | 0.15.0  | Apache-2.0    |
| @humanwhocodes/module-importer                                  | 1.0.1   | Apache-2.0    |
| @humanwhocodes/retry                                            | 0.4.3   | Apache-2.0    |
| @isaacs/cliui                                                   | 8.0.2   | ISC           |
| @pkgjs/parseargs                                                | 0.11.0  | MIT           |
| @sidvind/better-ajv-errors                                      | 4.0.0   | Apache-2.0    |
| @types/estree                                                   | 1.0.9   | MIT           |
| @types/json-schema                                              | 7.0.15  | MIT           |
| acorn                                                           | 8.19.0  | MIT           |
| acorn-jsx                                                       | 5.3.2   | MIT           |
| ajv                                                             | 8.20.0  | MIT           |
| ansi-regex                                                      | 6.4.0   | MIT           |
| ansi-styles                                                     | 6.2.3   | MIT           |
| argparse                                                        | 2.0.1   | Python-2.0    |
| balanced-match                                                  | 1.0.2   | MIT           |
| bidi-js                                                         | 1.1.0   | MIT           |
| brace-expansion                                                 | 2.1.7   | MIT           |
| callsites                                                       | 3.1.0   | MIT           |
| chalk                                                           | 4.1.2   | MIT           |
| chalk/node_modules/ansi-styles                                  | 4.3.0   | MIT           |
| color-convert                                                   | 2.0.1   | MIT           |
| color-name                                                      | 1.1.4   | MIT           |
| concat-map                                                      | 0.0.1   | MIT           |
| cross-spawn                                                     | 7.0.6   | MIT           |
| css-tree                                                        | 3.2.1   | MIT           |
| data-urls                                                       | 8.0.0   | MIT           |
| debug                                                           | 4.4.3   | MIT           |
| decimal.js                                                      | 10.6.0  | MIT           |
| deep-is                                                         | 0.1.4   | MIT           |
| eastasianwidth                                                  | 0.2.0   | MIT           |
| emoji-regex                                                     | 9.2.2   | MIT           |
| entities                                                        | 8.1.0   | BSD-2-Clause  |
| escape-string-regexp                                            | 4.0.0   | MIT           |
| eslint-scope                                                    | 8.4.0   | BSD-2-Clause  |
| eslint-visitor-keys                                             | 4.2.1   | Apache-2.0    |
| eslint/node_modules/ajv                                         | 6.15.0  | MIT           |
| eslint/node_modules/brace-expansion                             | 1.1.21  | MIT           |
| eslint/node_modules/json-schema-traverse                        | 0.4.1   | MIT           |
| eslint/node_modules/minimatch                                   | 3.1.5   | ISC           |
| espree                                                          | 10.4.0  | BSD-2-Clause  |
| esquery                                                         | 1.7.0   | BSD-3-Clause  |
| esrecurse                                                       | 4.3.0   | BSD-2-Clause  |
| estraverse                                                      | 5.3.0   | BSD-2-Clause  |
| esutils                                                         | 2.0.3   | BSD-2-Clause  |
| fast-deep-equal                                                 | 3.1.3   | MIT           |
| fast-json-stable-stringify                                      | 2.1.0   | MIT           |
| fast-levenshtein                                                | 2.0.6   | MIT           |
| fast-uri                                                        | 3.1.8   | BSD-3-Clause  |
| file-entry-cache                                                | 8.0.0   | MIT           |
| find-up                                                         | 5.0.0   | MIT           |
| flat-cache                                                      | 4.0.1   | MIT           |
| flatted                                                         | 3.4.4   | ISC           |
| foreground-child                                                | 3.3.1   | ISC           |
| glob                                                            | 10.5.0  | ISC           |
| glob-parent                                                     | 6.0.2   | ISC           |
| has-flag                                                        | 4.0.0   | MIT           |
| html-encoding-sniffer                                           | 7.0.0   | MIT           |
| ignore                                                          | 5.3.2   | MIT           |
| import-fresh                                                    | 3.3.1   | MIT           |
| imurmurhash                                                     | 0.1.4   | MIT           |
| is-extglob                                                      | 2.1.1   | MIT           |
| is-fullwidth-code-point                                         | 3.0.0   | MIT           |
| is-glob                                                         | 4.0.3   | MIT           |
| is-potential-custom-element-name                                | 1.0.1   | MIT           |
| isexe                                                           | 2.0.0   | ISC           |
| jackspeak                                                       | 3.4.3   | BlueOak-1.0.0 |
| js-yaml                                                         | 4.3.2   | MIT           |
| jsdom/node_modules/lru-cache                                    | 11.5.3  | BlueOak-1.0.0 |
| json-buffer                                                     | 3.0.1   | MIT           |
| json-schema-traverse                                            | 1.0.0   | MIT           |
| json-stable-stringify-without-jsonify                           | 1.0.1   | MIT           |
| keyv                                                            | 4.5.4   | MIT           |
| kleur                                                           | 4.1.5   | MIT           |
| levn                                                            | 0.4.1   | MIT           |
| locate-path                                                     | 6.0.0   | MIT           |
| lodash.merge                                                    | 4.6.2   | MIT           |
| lru-cache                                                       | 10.4.3  | ISC           |
| mdn-data                                                        | 2.27.1  | CC0-1.0       |
| minimatch                                                       | 9.0.9   | ISC           |
| minimist                                                        | 1.2.8   | MIT           |
| minipass                                                        | 7.1.3   | BlueOak-1.0.0 |
| ms                                                              | 2.1.3   | MIT           |
| natural-compare                                                 | 1.4.0   | MIT           |
| optionator                                                      | 0.9.4   | MIT           |
| p-limit                                                         | 3.1.0   | MIT           |
| p-locate                                                        | 5.0.0   | MIT           |
| package-json-from-dist                                          | 1.0.1   | BlueOak-1.0.0 |
| parent-module                                                   | 1.0.1   | MIT           |
| parse5                                                          | 8.0.1   | MIT           |
| path-exists                                                     | 4.0.0   | MIT           |
| path-key                                                        | 3.1.1   | MIT           |
| path-scurry                                                     | 1.11.1  | BlueOak-1.0.0 |
| prelude-ls                                                      | 1.2.1   | MIT           |
| prompts                                                         | 2.4.2   | MIT           |
| prompts/node_modules/kleur                                      | 3.0.3   | MIT           |
| punycode                                                        | 2.3.1   | MIT           |
| require-from-string                                             | 2.0.2   | MIT           |
| resolve-from                                                    | 4.0.0   | MIT           |
| saxes                                                           | 6.0.0   | ISC           |
| semver                                                          | 7.8.5   | ISC           |
| shebang-command                                                 | 2.0.0   | MIT           |
| shebang-regex                                                   | 3.0.0   | MIT           |
| signal-exit                                                     | 4.1.0   | ISC           |
| sisteransi                                                      | 1.0.5   | MIT           |
| source-map-js                                                   | 1.2.2   | BSD-3-Clause  |
| string-width                                                    | 5.1.2   | MIT           |
| string-width-cjs                                                | 4.2.3   | MIT           |
| string-width-cjs/node_modules/ansi-regex                        | 5.0.1   | MIT           |
| string-width-cjs/node_modules/emoji-regex                       | 8.0.0   | MIT           |
| string-width-cjs/node_modules/strip-ansi                        | 6.0.1   | MIT           |
| strip-ansi                                                      | 7.2.0   | MIT           |
| strip-ansi-cjs                                                  | 6.0.1   | MIT           |
| strip-ansi-cjs/node_modules/ansi-regex                          | 5.0.1   | MIT           |
| strip-json-comments                                             | 3.1.1   | MIT           |
| supports-color                                                  | 7.2.0   | MIT           |
| tldts                                                           | 7.4.16  | MIT           |
| tldts-core                                                      | 7.4.16  | MIT           |
| tough-cookie                                                    | 6.0.2   | BSD-3-Clause  |
| tr46                                                            | 7.0.0   | MIT           |
| type-check                                                      | 0.4.0   | MIT           |
| undici                                                          | 8.11.2  | MIT           |
| uri-js                                                          | 4.4.1   | BSD-2-Clause  |
| w3c-xmlserializer                                               | 6.0.0   | MIT           |
| webidl-conversions                                              | 8.0.1   | BSD-2-Clause  |
| whatwg-mimetype                                                 | 5.0.0   | MIT           |
| whatwg-url                                                      | 17.2.0  | MIT           |
| which                                                           | 2.0.2   | ISC           |
| word-wrap                                                       | 1.2.5   | MIT           |
| wrap-ansi                                                       | 8.1.0   | MIT           |
| wrap-ansi-cjs                                                   | 7.0.0   | MIT           |
| wrap-ansi-cjs/node_modules/ansi-regex                           | 5.0.1   | MIT           |
| wrap-ansi-cjs/node_modules/ansi-styles                          | 4.3.0   | MIT           |
| wrap-ansi-cjs/node_modules/emoji-regex                          | 8.0.0   | MIT           |
| wrap-ansi-cjs/node_modules/string-width                         | 4.2.3   | MIT           |
| wrap-ansi-cjs/node_modules/strip-ansi                           | 6.0.1   | MIT           |
| xml-name-validator                                              | 5.0.0   | Apache-2.0    |
| xmlchars                                                        | 2.2.0   | MIT           |
| yocto-queue                                                     | 0.1.0   | MIT           |

## External data services

- **Digitraffic / Fintraffic** — Finnish charging-station registry and road-weather camera data.
- **OpenStreetMap / Overpass** — charging-station data outside Finland.
- **Nominatim** — address and place lookup.

These are network services, not bundled software. Their availability and terms are separate from this repository's dependency tree.

## Notes

- The Supabase CDN URL uses the floating major tag `@2`; the exact resolved version can change without a repository change. Pin an exact version before relying on this SBOM for reproducible builds.
- `package-lock.json` remains the authoritative npm dependency lock.
- This inventory was generated from `package-lock.json`; regenerate it when dependencies change.
