# useful-js-modules

A growing collection of **reusable JavaScript and TypeScript utility modules** — small, focused, drop-in helpers that work in any project. No frameworks, no build step, no bloat: just readable, ESM-first code with JSDoc types that you can import as-is or vendor into your own codebase.

This repo is a long-term home for modules across any domain: CLI tooling, validation, formatting, parsing, math, dates, geography, browser helpers, and whatever else proves useful. The modules listed below are the current contents, not the limit of what belongs here.

## Why this repo?

- **Tiny and readable** — each module is a single file you can read in one sitting and vendor if you want to.
- **Zero build step** — native ESM, works directly in Node.js 20.16+ and Bun.
- **Sensible defaults** — batteries-included where it matters (help text, validation, error messages) without config ceremony.
- **Copy, don't couple** — no shared runtime, no monorepo tooling. Take the one file you need.

## Modules

Everything currently in the repo. New modules land here as they're added.

| Module | What it does | Dependencies |
| --- | --- | --- |
| [`args.js`](#argsjs--cli-argument-parser) | Declarative CLI argument parsing with types, aliases, required flags, and generated `--help` | None |
| [`bd.js`](#bdjs--bangladesh-point-in-country-check) | Fast offline check for whether a `[lng, lat]` point is inside Bangladesh | None |
| [`numCheck.js`](#numcheckjs--phone-number-identification) | Parse and validate international phone numbers, with country/type detection | `libphonenumber-js` |

## Getting started

Clone the repo and import the module you need directly:

```bash
git clone https://github.com/ShoyebOP/useful-js-modules.git
cd useful-js-modules
```

```js
// ESM
import { defineArgs } from "./useful-js-modules/args.js";
import { isInBangladesh } from "./useful-js-modules/bd.js";
import { identifyNumber } from "./useful-js-modules/numCheck.js";
```

Only `numCheck.js` has an external dependency:

```bash
npm install libphonenumber-js
# or: bun add libphonenumber-js
```

---

## `args.js` — CLI argument parser

A thin, declarative layer on top of the runtime's native [`util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig) (Node.js and Bun both ship it). You describe your flags once, and you get parsing, type coercion, validation, `--help`, and friendly errors for free.

### Quick start

```js
import { defineArgs } from "./args.js";

const args = defineArgs({
  input:   { type: "string",  alias: "i", required: true, help: "Input file" },
  output:  { type: "string",  alias: "o", default: "out", help: "Output file (no extension)" },
  limit:   { type: "number",  alias: "n", default: 100, help: "Max records" },
  dryRun:  { type: "boolean", alias: "d", help: "Print what would happen" },
  columns: { type: "array",   alias: "c", help: "Columns to include (repeatable)" },
});

console.log(args.input);   // string
console.log(args.limit);   // number
console.log(args.dryRun);  // boolean
console.log(args.columns); // string[] | undefined
console.log(args._);       // positional arguments
```

```bash
node main.js -i data.csv --limit 50 -c id -c name --dry-run
node main.js --input=data.csv --no-dry-run
node main.js --help
```

`--help` prints a generated usage block:

```
Usage: node main.js [options] [--] [positional...]

Options:
  -i, --input <string>      Input file (required)
  -o, --output <string>     Output file (no extension) (default: "out")
  -n, --limit <number>      Max records (default: 100)
  -d, --dryRun              Print what would happen
  -c, --columns <array>     Columns to include (repeatable)
  -h, --help                Show this help message
```

### Spec reference

Each key in the object passed to `defineArgs()` becomes a parsed property on the returned object.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `"string" \| "number" \| "boolean" \| "array"` | `"string"` | How the value is interpreted. |
| `alias` | `string` | — | Single-letter short flag, e.g. `"i"` for `-i`. |
| `default` | `unknown` | — | Value used when the flag is omitted. |
| `required` | `boolean` | `false` | Exit with a usage error if the flag is missing. |
| `help` | `string` | — | Description shown in `--help`. |

### Accepted syntax

| Form | Example |
| --- | --- |
| Long flag | `--input data.csv` |
| Long flag with `=` | `--input=data.csv` |
| Short flag | `-i data.csv` |
| Short flag with `=` | `-i=data.csv` |
| Kebab-case alias of camelCase | `--dry-run` for `dryRun` |
| Boolean negation | `--no-dry-run` sets `false` |
| Repeated array values | `-c id -c name` → `["id", "name"]` |
| Negative numbers | `--offset -5` |
| End of flags | `--` puts the rest in `args._` |
| Positionals | Anything not attached to a flag |

### Return value

```js
{
  input: "data.csv",
  limit: 50,
  dryRun: true,
  _: ["positional", "values"],
}
```

### Non-exiting mode

By default, errors and `--help` call `process.exit()`. For tests, libraries, or embedding, disable that:

```js
import { defineArgs, ArgError } from "./args.js";

try {
  const args = defineArgs(spec, { exitOnError: false });
  if (args.help) {
    // caller decides what to do
  }
} catch (error) {
  if (error instanceof ArgError) {
    console.error(error.message);
    console.error(error.help); // generated usage text
  }
}
```

You can also pass an explicit argv array, which makes the parser easy to unit test:

```js
defineArgs(spec, { argv: ["--input", "data.csv", "--limit", "10"] });
```

### Behavior notes

- Values can be space-separated or use `=`.
- Values starting with `-` should use the `=` form (negative numbers are detected automatically).
- Unknown flags, invalid numbers, and missing required flags produce a clear error and exit code `1`.
- Requires Node.js 20.16+ (for `--no-` negation support) or Bun 1.x.
- Exports: `defineArgs`, `formatHelp`, and the `ArgError` class.

---

## `bd.js` — Bangladesh point-in-country check

An offline, dependency-free **point-in-polygon** test for Bangladesh. Useful for validating user locations, filtering geotagged data, or geofencing without calling a geocoding API.

The boundary comes from **geoBoundaries BGD ADM0** (CC0 1.0, public domain), simplified with Douglas–Peucker (~1 km tolerance) and rounded to 3 decimal places (~110 m). It covers the mainland plus 16 rings of islands, including Saint Martin.

### Usage

```js
import { isInBangladesh } from "./bd.js";

isInBangladesh(90.4125, 23.8103); // true  — Dhaka
isInBangladesh(91.7832, 22.3569); // true  — Chattogram
isInBangladesh(88.3639, 22.5726); // false — Kolkata (India)
isInBangladesh(90.0, 0.0);        // false — Indian Ocean
```

The default export is the same function:

```js
import isInBangladesh from "./bd.js";
```

### API

```ts
isInBangladesh(lng: number, lat: number): boolean
```

| Parameter | Description |
| --- | --- |
| `lng` | Longitude, e.g. `90.4125` |
| `lat` | Latitude, e.g. `23.8103` |

Returns `true` when the coordinate is inside Bangladesh, `false` otherwise. Non-finite inputs (strings, `NaN`, `Infinity`) return `false` instead of throwing.

### Behavior notes

- **Land boundary only** — points offshore in territorial waters return `false`.
- A cheap bounding-box check runs before the polygon test, so out-of-region points are rejected immediately.
- Coordinate order is **[longitude, latitude]**, matching GeoJSON.
- Accuracy is intentionally trade-off friendly: sub-kilometre precision with a data set small enough to keep in a single file.
- Boundary data: [geoBoundaries](https://www.geoboundaries.org/) BGD ADM0, CC0 1.0.

---

## `numCheck.js` — phone number identification

A small wrapper around [`libphonenumber-js`](https://www.npmjs.com/package/libphonenumber-js) (the `max` metadata build) that turns a raw phone number into a normalized, machine-readable result instead of throwing on bad input.

### Install

```bash
npm install libphonenumber-js
# or: bun add libphonenumber-js
```

### Usage

```js
import { identifyNumber } from "./numCheck.js";

identifyNumber("+8801712345678");
// {
//   country: "BD",
//   callingCode: "880",
//   type: "MOBILE",
//   valid: true,
//   number: "+880 1712 345678"
// }

identifyNumber("01712345678", "BD");
// same result, using the default country to interpret the national format

identifyNumber("+14155552671");
// { country: "US", callingCode: "1", type: "FIXED_LINE_OR_MOBILE", valid: true, number: "+1 415 555 2671" }

identifyNumber("");
// { status: "empty" }

identifyNumber("not a number");
// { status: "invalid_or_unrecognized" }
```

### API

```ts
identifyNumber(number: string | number, country?: string): Result
```

| Parameter | Description |
| --- | --- |
| `number` | Phone number in international (`+880...`) or national (`017...`) format. |
| `country` | Optional ISO 3166-1 alpha-2 country code used to interpret national-format numbers, e.g. `"BD"`, `"US"`. |

Successful result:

| Field | Type | Description |
| --- | --- | --- |
| `country` | `string \| null` | Detected ISO country code, e.g. `"BD"`. |
| `callingCode` | `string` | Country calling code without `+`, e.g. `"880"`. |
| `type` | `string \| null` | Number type, e.g. `"MOBILE"`, `"FIXED_LINE"`, `"FIXED_LINE_OR_MOBILE"`, `"TOLL_FREE"`, `"VOIP"`. |
| `valid` | `boolean` | Whether the number is valid for its region and type. |
| `number` | `string` | Number formatted in international form. |

Failure result:

| Field | Value | When |
| --- | --- | --- |
| `status` | `"empty"` | Input was empty or whitespace. |
| `status` | `"unrecognized"` | The parser returned no result. |
| `status` | `"invalid_or_unrecognized"` | Parsing threw, e.g. on malformed input. |

### Behavior notes

- Never throws on bad input — check for a `status` field to detect failures.
- Uses the `libphonenumber-js/max` metadata build for the widest number-type coverage (larger bundle than `/min` or `/mobile`).
- `valid` reflects libphonenumber's validation rules; a parsed number can exist but still be invalid.

---

## Repository structure

```
useful-js-modules/
├── args.js       # CLI argument parser (zero dependencies)
├── bd.js         # Bangladesh point-in-country check (zero dependencies)
├── numCheck.js   # Phone number identification (libphonenumber-js)
├── LICENSE       # MIT
└── README.md
```

## Compatibility

| Runtime | Status |
| --- | --- |
| Node.js 20.16+ | ✅ Supported |
| Bun 1.x+ | ✅ Supported |
| Deno | ⚠️ `args.js`/`bd.js` should work; `numCheck.js` needs an npm-compatible resolution |

All modules are native ESM (`import` / `export`) with no transpilation step.

## Contributing

Issues and pull requests are welcome. A good module for this repo is:

1. **Single file** — no build tooling or internal dependencies.
2. **Focused** — solves one clearly documented problem.
3. **Documented** — JSDoc on the public API and an entry in this README.
4. **Tested** — include a small usage example or test with your PR.

## License

[MIT](./LICENSE) © [ShoyebOP](https://github.com/ShoyebOP)
