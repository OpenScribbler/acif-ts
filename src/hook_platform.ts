import { AcifBodyHashError } from "./body_hash";
import { canonicalizeHook, translateEventName, validateReferencedPath } from "./hook";
import { canonicalJson } from "./canonical";

export interface Diagnostic {
  readonly id: string;
  readonly message?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface TagProvenance {
  [handlerIndex: number]: {
    [scriptIndex: number]: {
      [os: string]: "declared" | "inferred-from-convention";
    }
  };
}

export interface CanonicalizationResult {
  readonly hook: any;
  readonly provenance: TagProvenance;
  readonly diagnostics: readonly Diagnostic[];
}

export interface PreAbstractedProviderConfig {
  readonly provider: string;
  readonly path: string;
  readonly content?: unknown;
}

/**
 * Validates and canonicalizes a hook block, applying §7.1 and §7.2 rules
 * in full to command handler scripts.
 */
export function canonicalizeHookWithPlatform(hookInput: unknown): CanonicalizationResult {
  const hook = canonicalizeHook(hookInput);

  const provenance: TagProvenance = {};
  const diagnostics: Diagnostic[] = [];

  const handlers = (hook.handlers as any[]) || [];
  for (let hIdx = 0; hIdx < handlers.length; hIdx++) {
    const handler = handlers[hIdx];
    if (handler.type === "command") {
      const scripts = handler.scripts;
      if (!Array.isArray(scripts) || scripts.length === 0) {
        throw new Error(
          `The 'scripts' field is required and must be a non-empty array for handler of type 'command' at index ${hIdx}.`
        );
      }

      // Step 1: Normalize and validate each script's os/arch
      const handlerOsProvenance: Record<string, "declared" | "inferred-from-convention"> = {};

      const normalizedScripts = scripts.map((script, sIdx) => {
        const canonicalScript: Record<string, unknown> = { ...script };

        // 7.1 Closed OS enum; absence and empty semantics
        if ("os" in script) {
          const osVal = script.os;
          if (!Array.isArray(osVal)) {
            throw new Error(`The 'os' field must be an array at index ${sIdx} under handler ${hIdx}.`);
          }
          if (osVal.length === 0) {
            throw new AcifBodyHashError(
              "acif.hook.script_os_empty",
              "The 'os' array must not be empty. Remedy: Please specify at least one canonical OS (windows, linux, darwin), or omit 'os' for a default/unconstrained entry.",
              { script: sIdx }
            );
          }

          // Provider aliases (e.g. osx) are rewritten before validation
          const rewrittenOs = osVal.map((o) => {
            if (typeof o !== "string") {
              throw new Error(`The 'os' array element must be a string. Received: ${typeof o}.`);
            }
            return o === "osx" ? "darwin" : o;
          });

          // Sort by UTF-8 byte order and remove duplicates
          const uniqueSortedOs = Array.from(new Set(rewrittenOs)).sort();

          // Validate against closed OS enum
          const validOs = new Set(["windows", "linux", "darwin"]);
          for (const os of uniqueSortedOs) {
            if (!validOs.has(os)) {
              throw new AcifBodyHashError(
                "acif.hook.script_os_invalid",
                `The OS '${os}' is invalid at script index ${sIdx}. Remedy: Please use 'windows', 'linux', or 'darwin'.`,
                { os, script: sIdx }
              );
            }
          }

          canonicalScript.os = uniqueSortedOs;

          // Record default provenance as "declared"
          uniqueSortedOs.forEach((os) => {
            handlerOsProvenance[os] = "declared";
          });
        }

        if ("arch" in script) {
          const archVal = script.arch;
          if (!Array.isArray(archVal)) {
            throw new Error(`The 'arch' field must be an array at index ${sIdx} under handler ${hIdx}.`);
          }
          if (archVal.length === 0) {
            throw new AcifBodyHashError(
              "acif.hook.script_arch_empty",
              "The 'arch' array must not be empty. Remedy: Please specify at least one architecture, or omit the 'arch' field.",
              { script: sIdx }
            );
          }

          const uniqueSortedArch = Array.from(
            new Set(
              archVal.map((a) => {
                if (typeof a !== "string") {
                  throw new Error(`The 'arch' array element must be a string. Received: ${typeof a}.`);
                }
                return a;
              })
            )
          ).sort();

          canonicalScript.arch = uniqueSortedArch;
        }

        return canonicalScript;
      });

      // Step 2: Disjointness verification (§7.2)
      // 1. At most one default entry. Violation -> acif.hook.script_default_ambiguous
      const defaultIndices: number[] = [];
      normalizedScripts.forEach((s, idx) => {
        if (!("os" in s)) {
          defaultIndices.push(idx);
        }
      });
      if (defaultIndices.length > 1) {
        throw new AcifBodyHashError(
          "acif.hook.script_default_ambiguous",
          "At most one default (unconstrained) script entry is allowed per handler. Remedy: Please partition the platforms using explicit 'os:' tags, or remove duplicate default entries."
        );
      }

      // 2. For every enum member o, at most one constrained entry matches o
      // Violation -> acif.hook.script_platform_ambiguous; payload names colliding OS value(s) and colliding entry indices
      const osMembers = ["windows", "linux", "darwin"];
      for (const os of osMembers) {
        const matchingIndices: number[] = [];
        normalizedScripts.forEach((s, idx) => {
          const sOs = (s as any).os;
          if (Array.isArray(sOs) && sOs.includes(os)) {
            matchingIndices.push(idx);
          }
        });
        if (matchingIndices.length > 1) {
          throw new AcifBodyHashError(
            "acif.hook.script_platform_ambiguous",
            `Ambiguous script entry for platform '${os}' (matching indices: ${matchingIndices.join(", ")}). Remedy: Please partition 'os' tags uniquely across script entries so that each OS maps to at most one entry.`,
            {
              os,
              entries: matchingIndices,
            }
          );
        }
      }

      // Step 3: Sort final script list for canonical output
      normalizedScripts.forEach((s, idx) => {
        (s as any).__originalIndex = idx;
      });

      normalizedScripts.sort((left, right) => {
        const leftCopy = { ...left };
        const rightCopy = { ...right };
        delete leftCopy.__originalIndex;
        delete rightCopy.__originalIndex;
        const leftJson = canonicalJson(leftCopy);
        const rightJson = canonicalJson(rightCopy);
        return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
      });

      // Construct final scripts and provenance map
      provenance[hIdx] = {};
      const finalScripts = normalizedScripts.map((s: any, newIdx) => {
        delete s.__originalIndex;
        provenance[hIdx][newIdx] = {};
        if (Array.isArray(s.os)) {
          s.os.forEach((os: string) => {
            provenance[hIdx][newIdx][os] = handlerOsProvenance[os] || "declared";
          });
        }
        return s;
      });

      handler.scripts = finalScripts;
    }
  }

  return { hook, provenance, diagnostics };
}

/**
 * Helper to get the filename extension.
 */
function getFilenameExtension(path: string): string {
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === 0) {
    return "";
  }
  return filename.slice(dotIndex);
}

/**
 * Implements §7.4 Provider-mechanism canonicalization mapping.
 */
export function canonicalizeProviderPlatform(
  config: PreAbstractedProviderConfig,
  eventName?: string
): CanonicalizationResult {
  // Step 1: Envelope
  if (config.content === undefined || config.content === null) {
    throw new AcifBodyHashError(
      "acif.hook.platform_mechanism_malformed",
      "The pre-abstracted provider configuration content is missing or null. Remedy: Please ensure a decodable configuration content is present in the 'content' field."
    );
  }

  let decodedContent: unknown;
  if (typeof config.content === "string") {
    try {
      decodedContent = JSON.parse(config.content);
    } catch (e) {
      throw new AcifBodyHashError(
        "acif.hook.platform_mechanism_malformed",
        `Failed to parse configuration content as JSON: ${(e as Error).message}. Remedy: Please ensure the content is valid, decodable JSON.`,
        { error: (e as Error).message }
      );
    }
  } else {
    decodedContent = config.content;
  }

  // Step 2: Hook-block passthrough
  if (
    decodedContent !== null &&
    typeof decodedContent === "object" &&
    !Array.isArray(decodedContent) &&
    "event" in decodedContent
  ) {
    return canonicalizeHookWithPlatform(decodedContent);
  }

  // Step 3: Token membership
  const token = config.provider;
  const canonicalToken = token === "per-os-key-map-provider" ? "per-os-key-map" : token;
  const CLOSED_TOKENS = new Set(["per-os-key-map", "dual-shell-fields", "filename-extension-convention"]);

  if (!CLOSED_TOKENS.has(canonicalToken)) {
    throw new AcifBodyHashError(
      "acif.hook.platform_unmappable",
      `The mechanism token '${token}' is not recognized. Remedy: Please use a supported mechanism token (e.g., 'per-os-key-map', 'dual-shell-fields', or 'filename-extension-convention').`,
      { provider: token }
    );
  }

  // Step 4: Shape predicate
  if (decodedContent === null || typeof decodedContent !== "object" || Array.isArray(decodedContent)) {
    throw new AcifBodyHashError(
      "acif.hook.platform_mechanism_malformed",
      "The configuration content must be a plain JSON object. Remedy: Please ensure the configuration is a structured key-value mapping.",
      { provider: token }
    );
  }

  const obj = decodedContent as Record<string, unknown>;
  const mappedScripts: any[] = [];
  const diagnostics: Diagnostic[] = [];

  if (canonicalToken === "per-os-key-map") {
    // Validate per-os-key-map shape
    const keysToCheck = ["windows", "linux", "osx", "command"];
    for (const key of keysToCheck) {
      if (key in obj) {
        if (typeof obj[key] !== "string") {
          throw new AcifBodyHashError(
            "acif.hook.platform_mechanism_malformed",
            `The key '${key}' under mechanism 'per-os-key-map' must be a string entrypoint path. Remedy: Please specify a string value.`,
            { provider: token, key }
          );
        }
      }
    }

    const hasBaseCommand = "command" in obj;
    const passthroughKeys = Object.keys(obj).filter((k) => !keysToCheck.includes(k));
    if (passthroughKeys.length > 0 && !hasBaseCommand) {
      throw new AcifBodyHashError(
        "acif.hook.platform_mechanism_malformed",
        `Passthrough keys [${passthroughKeys.join(", ")}] are present under mechanism 'per-os-key-map' without a base 'command' field. Remedy: Please add a 'command' field to carry these passthrough properties.`,
        { provider: token, passthroughKeys }
      );
    }

    // Perform canonical mapping
    const pathEntries = new Map<string, string[]>(); // path -> list of os values
    if (obj.windows !== undefined) {
      const p = validateReferencedPath(obj.windows as string);
      const existing = pathEntries.get(p) || [];
      existing.push("windows");
      pathEntries.set(p, existing);
    }
    if (obj.linux !== undefined) {
      const p = validateReferencedPath(obj.linux as string);
      const existing = pathEntries.get(p) || [];
      existing.push("linux");
      pathEntries.set(p, existing);
    }
    if (obj.osx !== undefined) {
      const p = validateReferencedPath(obj.osx as string);
      const existing = pathEntries.get(p) || [];
      existing.push("darwin"); // osx renamed darwin
      pathEntries.set(p, existing);
    }

    for (const [p, osList] of pathEntries.entries()) {
      const uniqueSortedOs = Array.from(new Set(osList)).sort();
      mappedScripts.push({
        type: "file",
        path: p,
        os: uniqueSortedOs,
      });
    }

    if (hasBaseCommand) {
      const passthrough: Record<string, unknown> = {};
      passthroughKeys.forEach((k) => {
        passthrough[k] = obj[k];
      });

      mappedScripts.push({
        type: "file",
        path: validateReferencedPath(obj.command as string),
        ...passthrough,
      });
    }
  } else if (canonicalToken === "dual-shell-fields") {
    // Validate dual-shell-fields shape
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      throw new AcifBodyHashError(
        "acif.hook.platform_mechanism_malformed",
        "The configuration object for 'dual-shell-fields' is empty. Remedy: Please specify at least one of 'bash' or 'powershell' keys.",
        { provider: token }
      );
    }
    for (const key of keys) {
      if (key !== "bash" && key !== "powershell") {
        throw new AcifBodyHashError(
          "acif.hook.platform_mechanism_malformed",
          `The key '${key}' is invalid under mechanism 'dual-shell-fields'. Remedy: Only 'bash' and 'powershell' keys are allowed.`,
          { provider: token, key }
        );
      }
      if (typeof obj[key] !== "string") {
        throw new AcifBodyHashError(
          "acif.hook.platform_mechanism_malformed",
          `The key '${key}' under mechanism 'dual-shell-fields' must carry a string path. Remedy: Please provide a string value.`,
          { provider: token, key }
        );
      }
    }

    // Perform canonical mapping
    if (obj.bash !== undefined) {
      mappedScripts.push({
        type: "file",
        path: validateReferencedPath(obj.bash as string),
        os: ["darwin", "linux"],
      });
    }
    if (obj.powershell !== undefined) {
      mappedScripts.push({
        type: "file",
        path: validateReferencedPath(obj.powershell as string),
        os: ["windows"],
      });
    }

    diagnostics.push({
      id: "acif.hook.platform_shell_os_proxy",
      message: "Inferred OS constraints from dual-shell fields 'bash' and 'powershell'.",
    });
  } else if (canonicalToken === "filename-extension-convention") {
    // Validate filename-extension-convention shape
    if (!("file" in obj)) {
      throw new AcifBodyHashError(
        "acif.hook.platform_mechanism_malformed",
        "The 'file' field is required under mechanism 'filename-extension-convention'. Remedy: Please specify the 'file' field.",
        { provider: token }
      );
    }
    if (typeof obj.file !== "string") {
      throw new AcifBodyHashError(
        "acif.hook.platform_mechanism_malformed",
        "The 'file' field under mechanism 'filename-extension-convention' must be a string path. Remedy: Please specify a string value.",
        { provider: token }
      );
    }

    // Perform canonical mapping
    const fileVal = validateReferencedPath(obj.file as string);
    const ext = getFilenameExtension(fileVal);

    if (ext === ".ps1" || ext === ".cmd" || ext === ".bat") {
      mappedScripts.push({
        type: "file",
        path: fileVal,
        os: ["windows"],
      });
      diagnostics.push({
        id: "acif.hook.platform_filename_inferred",
        message: `Successfully inferred OS constraints (windows) from filename extension for path '${fileVal}'.`,
        params: { path: fileVal },
      });
    } else if (ext === ".sh" || ext === "") {
      mappedScripts.push({
        type: "file",
        path: fileVal,
        os: ["darwin", "linux"],
      });
      diagnostics.push({
        id: "acif.hook.platform_filename_inferred",
        message: `Successfully inferred OS constraints (darwin, linux) from filename extension for path '${fileVal}'.`,
        params: { path: fileVal },
      });
    } else {
      mappedScripts.push({
        type: "file",
        path: fileVal,
      });
      diagnostics.push({
        id: "acif.hook.platform_filename_uninferable",
        message: `Could not infer OS constraints from filename extension for path '${fileVal}'. Defaulting to unconstrained.`,
        params: { path: fileVal },
      });
    }
  }

  // Construct complete hook to ingest
  const actualEvent = translateEventName(eventName || "before_tool_execute");
  const hookToIngest = {
    event: actualEvent,
    handlers: [
      {
        type: "command",
        scripts: mappedScripts,
        async: false,
      },
    ],
  };

  const result = canonicalizeHookWithPlatform(hookToIngest);

  // Override provenance values for inferred mechanisms
  if (canonicalToken === "dual-shell-fields" || canonicalToken === "filename-extension-convention") {
    const prov = result.provenance;
    for (const hIdx of Object.keys(prov)) {
      const hProvenance = prov[Number(hIdx)];
      for (const sIdx of Object.keys(hProvenance)) {
        const sProvenance = hProvenance[Number(sIdx)];
        for (const os of Object.keys(sProvenance)) {
          sProvenance[os] = "inferred-from-convention";
        }
      }
    }
  }

  return {
    hook: result.hook,
    provenance: result.provenance,
    diagnostics: [...diagnostics, ...result.diagnostics],
  };
}

export interface SelectionResult<T> {
  readonly selected: T | null;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Implements §7.3 Selection.
 * Runtime selection for a command handler on target OS is total.
 */
export function selectScript<T extends { readonly os?: readonly string[] }>(
  scripts: readonly T[],
  targetOs: string
): SelectionResult<T> {
  if (targetOs !== "windows" && targetOs !== "linux" && targetOs !== "darwin") {
    throw new AcifBodyHashError(
      "acif.hook.script_os_invalid",
      `The target OS '${targetOs}' is invalid. Remedy: Please use 'windows', 'linux', or 'darwin'.`,
      { os: targetOs }
    );
  }

  // 1. If exactly one constrained entry matches targetOs, select it.
  const constrainedMatches = scripts.filter((s) => s.os && s.os.includes(targetOs));
  if (constrainedMatches.length > 0) {
    return {
      selected: constrainedMatches[0],
      diagnostics: [],
    };
  }

  // 2. Otherwise, if a default entry exists, select it.
  const defaultEntry = scripts.find((s) => !("os" in s) || s.os === undefined);
  if (defaultEntry) {
    return {
      selected: defaultEntry,
      diagnostics: [],
    };
  }

  // 3. Otherwise no entry is selected: the handler is a defined no-op on targetOs.
  return {
    selected: null,
    diagnostics: [
      {
        id: "acif.hook.script_no_platform_match",
        message: `No script entry matches the target OS '${targetOs}'. Remedy: Please provide a default script entry or include '${targetOs}' in one of the script's 'os' tag sets.`,
        params: { os: targetOs },
      },
    ],
  };
}
