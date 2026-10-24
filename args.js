/**
 * ============================================================================
 * CLI ARGUMENTS - READ THIS BEFORE ADDING A NEW ONE
 * ============================================================================
 *
 * Parsing is delegated to the runtime's native `util.parseArgs` (Bun implements
 * the same Node API). argv is read from `Bun.argv` under Bun and from
 * `process.argv` under Node. This file only adds the things parseArgs lacks:
 * help generation, required checks, number/array handling, kebab-case aliases,
 * `--no-` negation, and error reporting.
 *
 * Usage:
 *
 *   const args = defineArgs(spec);
 *   const safe = defineArgs(spec, { exitOnError: false });
 *
 * Options:
 *   argv         Argument list to parse. Default: runtime argv without the
 *                runtime and script path.
 *   exitOnError  true (default)  - print help/error and process.exit().
 *                false           - never exits: `--help` returns { help: true }
 *                                  and errors throw ArgError (err.help has the
 *                                  generated usage), so the caller decides.
 *
 * 1. Declare
 * ----------
 * Add an entry to the object passed to defineArgs():
 *
 *   output: {
 *     type: "string",  // "string" | "number" | "boolean" | "array"
 *     alias: "o",      // optional single-letter flag (-o)
 *     default: "out",  // optional; used when the flag is omitted
 *     required: true,  // optional; exits with a usage error when missing
 *     help: "Output file (without extension)", // shown in --help
 *   }
 *
 * More examples:
 *   input:   { type: "string",  alias: "i", required: true, help: "..." }
 *   limit:   { type: "number",  alias: "n", default: 100 }
 *   dryRun:  { type: "boolean", alias: "d" }
 *   columns: { type: "array",   alias: "c" }  // repeat: -c a -c b
 *
 * 2. Use
 * ------
 *   args.input    // string
 *   args.limit    // number
 *   args.dryRun   // boolean
 *   args.columns  // string[]
 *   args._        // positional arguments not attached to a flag
 *
 * 3. Call
 * -------
 *   bun main.js -i d
 *   bun main.js --input d
 *   bun main.js --input=d
 *   bun main.js --dry-run --no-dry-run   // booleans (--no-* sets false)
 *   bun main.js --help                   // generated from the spec
 *
 * Notes:
 *   - Values can be space separated or use "=".
 *   - camelCase names also accept kebab-case: args.dryRun -> --dry-run.
 *   - Values starting with "-" need the "=" form (negative numbers are handled).
 *   - "--" stops flag parsing; the rest lands in args._.
 *   - Unknown flags, invalid values, and missing required flags exit with 1.
 *   - Requires Node 20.16+ (for --no- negation) or Bun 1.x.
 * ============================================================================
 */

import { parseArgs as parseNative } from "node:util";

/** @typedef {"string" | "number" | "boolean" | "array"} ArgType */

/**
 * @typedef {object} ArgSpec
 * @property {ArgType} [type]      Value type. Defaults to "string".
 * @property {string} [alias]      Single-letter alias, e.g. "i" for -i.
 * @property {unknown} [default]   Value used when the flag is omitted.
 * @property {boolean} [required]  Reject the run when the flag is missing.
 * @property {string} [help]       Description printed by --help.
 *
 * @typedef {Record<string, any> & { _: string[], help?: boolean }} Args
 */

/** Thrown instead of exiting when `exitOnError` is false. */
export class ArgError extends Error {
  /** @param {string} message @param {string} help */
  constructor(message, help) {
    super(message);
    this.name = "ArgError";
    this.help = help;
  }
}

/**
 * @param {Record<string, ArgSpec>} spec
 * @param {{ argv?: string[], exitOnError?: boolean }} [config]
 * @returns {Args}
 */
export function defineArgs(spec, config = {}) {
  const { argv = runtimeArgv(), exitOnError = true } = config;
  const help = formatHelp(spec);

  // parseArgs would reject --help as an unknown flag, so handle it first.
  if (argv.includes("-h") || argv.includes("--help")) {
    if (exitOnError) {
      console.log(help);
      process.exit(0);
    }
    return { _: [], help: true };
  }

  const { options, names } = buildOptions(spec);

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseNative({
      args: normalize(argv, options, names),
      options,
      strict: true,
      allowPositionals: true,
      allowNegative: true,
    }));
  } catch (error) {
    fail(error.message, help, exitOnError);
  }

  const args = { _: positionals };
  for (const [name, def] of Object.entries(spec)) {
    const type = def.type ?? "string";
    let value = values[name];

    if (type === "number" && value !== undefined) {
      const number = Number(value);
      if (String(value).trim() === "" || Number.isNaN(number)) {
        fail(`option --${name} expects a number, got "${value}"`, help, exitOnError);
      }
      value = number;
    }

    if (def.required) {
      const missing = Array.isArray(value) ? value.length === 0 : value === undefined;
      if (missing) fail(`missing required option --${name}`, help, exitOnError);
    }

    args[name] = value;
  }

  return args;
}

/**
 * Translate our richer spec into parseArgs options plus a flag -> name map.
 *
 * @param {Record<string, ArgSpec>} spec
 */
function buildOptions(spec) {
  const options = {};
  const names = new Map();

  for (const [name, def] of Object.entries(spec)) {
    const type = def.type ?? "string";
    const option = { type: type === "boolean" ? "boolean" : "string" };

    if (def.alias) option.short = def.alias;
    if (type === "array") option.multiple = true;

    if (def.default !== undefined) {
      // parseArgs only knows string/boolean, so number defaults are stringified.
      option.default = type === "number" ? String(def.default) : def.default;
    } else if (type === "boolean") {
      option.default = false;
    }

    options[name] = option;
    names.set(`--${name}`, name);
    names.set(`--${toKebabCase(name)}`, name);
    if (def.alias) names.set(`-${def.alias}`, name);
  }

  return { options, names };
}

/**
 * Rewrite argv into the small set of forms parseArgs understands natively:
 *   --dry-run / --no-dry-run  -> --dryRun / --no-dryRun
 *   -i=value                  -> --input=value
 *   --limit -5                -> --limit=-5
 *
 * @param {string[]} argv
 * @param {Record<string, any>} options
 * @param {Map<string, string>} names
 * @returns {string[]}
 */
function normalize(argv, options, names) {
  const tokens = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--") {
      tokens.push(token, ...argv.slice(i + 1));
      break;
    }

    // Short options do not accept "=" in parseArgs, so rewrite -i=value to
    // --input=value (keeping values that themselves start with "-").
    const short = /^(-[^-][^=]*)=(.*)$/s.exec(token);
    if (short) {
      const shortName = names.get(short[1]);
      tokens.push(shortName ? `--${shortName}=${short[2]}` : short[1]);
      if (!shortName) tokens.push(short[2]);
      continue;
    }

    const negated = token.startsWith("--no-");
    const body = negated ? token.slice(5) : token;
    const eq = body.indexOf("=");
    const rawFlag = eq === -1 ? body : body.slice(0, eq);
    const flag = negated ? `--${rawFlag}` : rawFlag;
    const inline = eq === -1 ? undefined : body.slice(eq + 1);
    const name = names.get(flag);

    // Unknown flags are passed through so parseArgs reports them.
    if (!name) {
      tokens.push(token);
      continue;
    }

    if (negated) {
      tokens.push(inline === undefined ? `--no-${name}` : `--no-${name}=${inline}`);
      continue;
    }

    // parseArgs treats "--limit -5" as ambiguous; attach negative numbers.
    const next = argv[i + 1];
    if (
      options[name].type === "string" &&
      inline === undefined &&
      next !== undefined &&
      /^-\d/.test(next)
    ) {
      tokens.push(`--${name}=${next}`);
      i++;
      continue;
    }

    tokens.push(inline === undefined ? `--${name}` : `--${name}=${inline}`);
  }

  return tokens;
}

/**
 * Build the --help text for a spec.
 *
 * @param {Record<string, ArgSpec>} spec
 * @returns {string}
 */
export function formatHelp(spec) {
  const rows = Object.entries(spec).map(([name, def]) => {
    const type = def.type ?? "string";
    const value = type === "boolean" ? "" : ` <${type}>`;
    const alias = def.alias ? `-${def.alias}, ` : "    ";
    const notes = [];
    if (def.required) notes.push("required");
    if (def.default !== undefined) notes.push(`default: ${JSON.stringify(def.default)}`);

    const help = [def.help, notes.length ? `(${notes.join(", ")})` : ""]
      .filter(Boolean)
      .join(" ");

    return [`${alias}--${name}${value}`, help];
  });

  const width = Math.max(0, ...rows.map(([flags]) => flags.length));
  const lines = [
    `Usage: ${runtimeName()} ${scriptName()} [options] [--] [positional...]`,
    "",
    "Options:",
    ...rows.map(([flags, help]) => `  ${flags.padEnd(width)}  ${help}`.trimEnd()),
    `  ${"-h, --help".padEnd(width)}  Show this help message`,
  ];

  return lines.join("\n");
}

/** @param {string} message @param {string} help @param {boolean} exit */
function fail(message, help, exit) {
  if (!exit) throw new ArgError(message, help);
  console.error(`error: ${message}`);
  console.error(`\n${help}`);
  process.exit(1);
}

/** Argument list without the runtime and script path. */
function runtimeArgv() {
  return typeof Bun !== "undefined" ? Bun.argv.slice(2) : process.argv.slice(2);
}

function runtimeName() {
  return process.argv[0]?.split(/[\\/]/).pop() ?? "node";
}

function scriptName() {
  return process.argv[1]?.split(/[\\/]/).pop() ?? "script";
}

/** @param {string} name */
function toKebabCase(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
