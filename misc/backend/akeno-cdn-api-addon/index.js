const Units = require("akeno:units");
const backend = require('akeno:backend');
const webserver = require('akeno:web');

const fs = require("fs");
const path = require("path");

/*
    The base URL syntax is as follows:
    /version/[components]/file

    Eg.
    /x.y.z/index.js
        -> Loads the core.
    /x.y.z/select.js
        -> Loads only the select component (no core).
    /x.y.z/select,modal/index.js
        -> Loads the core and the select and modal components as a bundle.
    /x.y.z/select,modal/bundle.js
        -> Loads only the select and modal components as a bundle (no core).
*/

const cacheManager = new backend.helper.CacheManager({});
const betaFileMtimeCache = new Map();

// Modern browsers (Q2 2026)
const ESBUILD_LATEST = ["chrome145", "firefox148"];
// const ESBUILD_LATEST = ["ES2025"];

// Baseline (default, good balance)
const ESBUILD_MODERN = ["chrome108", "firefox102"];
// I am guessing safari15 had problems with private fields as they get a polyfill despite having support, though safari is problematic all around, ill just skip it

// Oldest still supported versions
const ESBUILD_LEGACY = ["chrome61", "firefox60", "safari12", "edge79"];

// Friendly reminder: LS does not support Internet Explorer.
// Stop using browsers this old, it's simply dangerous and there is no good reason to, if someone upstream insists on it, tell them to stop and stay away form whatever they are doing.
// Unless it's something that doesn't connect to the internet;
// I do want to eventually support backporting to old devices whose had a hardcoded old browser or simply don't have the capability of running a modern one (Symbian, Tizen, old Androids, legacy Windows/OSX etc.).
// Till then, there isn't an official support for this, and LS is primarily a modern-focused library.

// Use modern JS features
cacheManager.esbuildTargets = ESBUILD_MODERN;

const BASE_PATH = path.resolve(__dirname, "../../../"),
      DIST_PATH = BASE_PATH + "/misc/backend/akeno-cdn-api-addon/versions/",
      CORE_MARKER = "\u0000"; // Special marker for the core component, to ensure it is in the first position.

const LATEST = fs.readFileSync(BASE_PATH + "/version", "utf8").trim();

let VERSIONS = new Set([...fs.readdirSync(DIST_PATH).filter(file => {
    return fs.statSync(DIST_PATH + "/" + file).isDirectory();
})]);

const COMPONENTS = JSON.parse(fs.readFileSync(BASE_PATH + "/misc/components.json", "utf8"));

// Alias some versions when necessary
// Note: This API no longer supports versions < 3.0.0, as they used a completely different format.
const VERSION_ALIAS = {
    // LTS (at the end of each major version, this corresponds to the latest patch with compatible API, and may receive updates or backports)
    "3.0_lts": "4.0.2",
    "4.0_lts": "4.0.2",
    // "5.0_lts": "5.3.0", // Upcomming

    "4.0.0": "4.0.2",
    "4.0.1": "4.0.2",

    // 5.0.0 to 5.2.4 -> 5.2.5
    "5.0.0": "5.2.5",
    "5.0.1": "5.2.5",
    "5.0.2": "5.2.5",
    "5.1.0": "5.2.5",
    "5.2.0": "5.2.5",
    "5.2.1": "5.2.5",
    "5.2.2": "5.2.5",
    "5.2.3": "5.2.5",
    "5.2.4": "5.2.5",

    // 5.2.6 -> 5.2.7 (5.2.6 was only a small patch)
    "5.2.6": "5.2.7",

    "6.0.0-alpha.0": "6.0.0-alpha.2",
    "6.0.0-alpha.1": "6.0.0-alpha.2", // Hotfix for a bug in alpha.1
};

// If true, the patch version will be ignored and only the minor/major version will be used for caching (patch will be used for client/CDN cache breaking).
// For this to work, patch versions must be compatible with the minor/major version, aka don't do anything breaking.
// This may become an issue at some point, but the goal is to avoid storing every single patch separately.
// The tragedy is that I have been historically pretty inconsistent in semantic versioning...
// Use VERSION_ALIAS instead.
let IGNORE_PATCH_VERSION = false;

const LATEST_MAJOR = LATEST.split(".")[0] || "0";
const LATEST_PATCH = LATEST.split(".")[2] || "0";

const isWindows = process.platform === "win32";

module.exports = new class LS_API extends Units.Addon {
    constructor() {
        super({
            name: "LS CDN API Addon",
        });

        if(isWindows) {
            this.warn("Warning: The LS backend is not supported on Windows and may break!");
        }
    }

    reload() {
        // Reload hook, clear cache
        cacheManager.clear();
        betaFileMtimeCache.clear();

        VERSIONS = new Set([...fs.readdirSync(DIST_PATH).filter(file => {
            return fs.statSync(DIST_PATH + "/" + file).isDirectory();
        })]);
    }

    async onRequest(req, res) {
        const segments = backend.helper.getPathSegments({ path: req.path.slice(3).toLowerCase() });
        if (segments.length < 2) return backend.helper.error(req, res, 2);
        
        if(segments[0] === "icons") {
            this.serveIcons(req, res, segments);
        }

        const version = this.getEffectiveVersion(segments[0]);
        const isBeta = version === "beta" || version === "alpha";

        let VERSION_PATH = DIST_PATH + path.posix.resolve("/", version);

        if (isWindows || isBeta) {
            // Windows is quite unreliable with symlinks (or does not provide them at all in some environments), so we skip them entirely and just use dist.
            // This is incorrect, but you shouldn't use Windows for production servers anyway, this API does not support Windows, so functionality is not guaranteed either way.
            // VERSION_PATH = version === "alpha"? BASE_PATH + "/v6/dist": BASE_PATH + "/dist";
            VERSION_PATH = BASE_PATH + "/dist";
        } else {
            if(!VERSIONS.has(version)) {
                if(!Units.Version.isValid(version)) {
                    return backend.helper.error(req, res, `Value "${version}" is not a valid semantic version`, 404);
                }

                if(Units.Version.matches(version, "4.0.0", "<")) {
                    return backend.helper.error(req, res, `Versions older than 3.0.0, including "${version}" are no longer supported. Please use 4.0.2 or later.`, 410);
                }

                if(Units.Version.matches(version, LATEST, ">")) {
                    return backend.helper.error(req, res, `Version "${version}" does not exist yet, are you from the future?`, 404);
                }

                return backend.helper.error(req, res, `Version "${version}" was not found`, 404);
            }
        }

        let file = segments.length === 2? segments[1]: segments[2];

        const first_index = file.indexOf(".");
        const last_index = file.lastIndexOf(".");

        if (first_index === -1) return backend.helper.error(req, res, 43, null, "404");

        const file_name = file.slice(0, first_index);
        const do_compress = file.indexOf(".min") !== -1;

        const ext = file.slice(last_index + 1);

        const type = (ext === "js" || ext === "mjs")? "js": ext;
        if(type !== "js" && type !== "css") return backend.helper.error(req, res, 43, null, "404");

        const wildcard = segments[1] === "*";
        const unsortedList = wildcard? COMPONENTS[type] : segments.length === 2? []: segments[1].split(",");
        let components = [];

        if (file_name === "index" || file_name === "core" || file_name === "ls") {
            unsortedList.push(CORE_MARKER); // Special marker
        } else if (file_name !== "bundle") {
            unsortedList.push(file_name);
        }

        if (components.length === 0) {
            let last = "";
            unsortedList.sort();
            for (let i = 0, len = unsortedList.length; i < len; i++) {
                let v = unsortedList[i];
                if (!v) continue;
                if (v !== last) {
                    components.push(v);
                    last = v;
                }
            }
        }

        const compatibilityQuery = req.getQuery("compat");
        const useEsm = ext === "mjs" || req.getQuery("esm") !== undefined;
        const compatibility = !compatibilityQuery? ESBUILD_MODERN: (compatibilityQuery === "latest"? ESBUILD_LATEST : compatibilityQuery === "legacy"? ESBUILD_LEGACY : compatibilityQuery === "ancient"? ESBUILD_ANCIENT : ESBUILD_MODERN);

        const CACHE_KEY = `${version}:${type}:${components.join(",")}:${compatibility?.join(",")}${useEsm? ":esm": ""}`;
        const mimeType = type === "js"? "text/javascript": "text/css";
        const suggestedCompressionAlgorithm = isBeta? backend.compression.format.NONE: backend.helper.getUsedCompression(req, mimeType); // uws aah
        const currentFileMtimes = new Map();
        const componentPaths = [];

        for(let component of components) {
            let component_path = component === CORE_MARKER? VERSION_PATH + "/ls." + type: VERSION_PATH  + "/" + type + "/" + component + "." + type;

            if((isWindows || isBeta) && component_path.includes("dist") && !component_path.includes("css")) {
                // Windows workaround
                component_path = component_path.replace("dist/", "");
            }

            if(!fs.existsSync(component_path)) {
                if(version === "4.0.2" || wildcard){
                    // Legacy or LTS releases had a less strict API, & when using wildcard we don't really care if some components are missing, as we are just trying to return all available.
                    continue;
                }

                return backend.helper.error(req, res, `Component "${component === CORE_MARKER ? "core" : component}" was not found`, 404);
            }

            componentPaths.push(component_path);

            if(isBeta) {
                currentFileMtimes.set(component_path, fs.statSync(component_path).mtimeMs);
            }
        }

        let shouldRefresh = !cacheManager.cache.has(CACHE_KEY);

        if(isBeta && !shouldRefresh) {
            const cachedFileMtimes = betaFileMtimeCache.get(CACHE_KEY);
            const isBetaCacheValid = !!cachedFileMtimes
                && cachedFileMtimes.size === currentFileMtimes.size
                && [...currentFileMtimes.entries()].every(([filePath, mtime]) => cachedFileMtimes.get(filePath) === mtime);

            shouldRefresh = !isBetaCacheValid;
        }

        // Check cache
        if(shouldRefresh) {
            let result = [];
            for(let component_path of componentPaths) {
                result.push("\n", fs.readFileSync(component_path, "utf8"));
            }

            // TODO: Always iife when targets are low to avoid esbuild polluting the global scope with variables
            cacheManager.esbuildFormat = (version === "alpha" || version[0] === "6")? "cjs": "iife";
            cacheManager.esbuildTargets = compatibility;

            // We pass data as a string, because we do code processing with esbuild etc.
            // It gets converted to a buffer internally later.
            await cacheManager.refresh(CACHE_KEY, isBeta? {
                // 'Cache-Control': 'no-cache, no-store',
                // 'Pragma': 'no-cache',
                // 'Expires': '0'
                'Cache-Control': 'public, max-age=5, stale-while-revalidate=10' // Short cache duration
            }: null, null, result.join(""), mimeType);

            if(useEsm && cacheManager.replaceContent) { // (replaceContent is new)
                // ESBuild is being kind of terrible at ESM to CJS conversion, so we do it ourselves the other way around in a very ugly hacky way
                // But yes the only difference is literally just two words (idk i'm not an ESM fan)
                cacheManager.replaceContent(CACHE_KEY, "export default " + cacheManager.getContent(CACHE_KEY).toString());
            }

            if(isBeta) {
                betaFileMtimeCache.set(CACHE_KEY, currentFileMtimes);
            }
        }

        cacheManager.serve(req, res, CACHE_KEY, null, {
            codeCompression: do_compress
        }, suggestedCompressionAlgorithm);
    }

    async serveIcons(req, res, segments) {
        // Serving the iconfont is going to be simpler as it is a single static file
        // We just need to decide where the dist files will go
        const version = segments[0];
        

        // TODO
    }

    getEffectiveVersion(version) {
        if (version === "latest") {
            return LATEST;
        }

        if (VERSION_ALIAS[version]) {
            return VERSION_ALIAS[version];
        }

        if (IGNORE_PATCH_VERSION && version.startsWith(LATEST_MAJOR + ".")) {
            const last_index = version.lastIndexOf(".");
            if (last_index !== -1) {
                version = version.slice(0, last_index) + "." + LATEST_PATCH;
            }
        }

        return version;
    }
}

/**
 * Module provider addon for Akeno (so it can be loaded as @use("ls")).
 * TODO: Make a standalone version that doesn't require the full server & source
 */
const EXTRAGON_CDN = backend.config.getBlock("web").get("extragon_cdn_url", String) || (backend.config.getBlock("web").get("extragon_cdn_use_localhost", Boolean) || process.env.AKENO_CDN_LOCALHOST) ? `https://cdn.extragon.localhost` : `https://cdn.extragon.cloud`;

const PARSER_FLAGS = {
    USING_LS_CSS: 1,
    USING_LS_JS: 2,
    USING_LS: 3,
    GOOGLE_FONTS_PRECONNECT: 4,
    SET_DEFAULT_CHARSET: 5,
    SET_DEFAULT_VIEWPORT: 6
};

const LS_API_LATEST_SUPPORTED = "6.0.0";

const blockProcessor = ({ attrib, version, components, scriptAttributes, context, block }) => {
    if (!version) {
        if (context.data.app && context.data.app.lsVersion) {
            version = context.data.app.lsVersion;
        } else if (context.data.ls_version) {
            version = context.data.ls_version; // Use previously specified version (outdated fallback)
        } else {
            console.error(`Error in app "${context.data.path}": No version was specified for LS in your app. context is no longer supported - you need to specify a version, for example ${attrib}:${LATEST}. To get the latest version, use ${attrib}:latest, but context is not recommended for production environments.`);
            return;
        }
    }

    if (version === "latest") version = LATEST;

    context.data.ls_version = version;
    
    const is_merged = attrib === "ls";

    // Bypass CDN for beta versions
    const CDN_ORIGIN = version === "beta" ? EXTRAGON_CDN.replace("cdn.", "cdn-origin.") : EXTRAGON_CDN;

    if(attrib === "ls.icons") {
        context.write(`<link rel=stylesheet href="${CDN_ORIGIN}/ls/icons/${version}/ls-icons.${context.data.compress ? "min." : ""}css">`);
        return;
    }

    let components_string;

    const singularCSSComponent = attrib.startsWith("ls.css.") ? attrib.substring(8).toLowerCase() : null;
    if (singularCSSComponent && COMPONENTS.css.includes(singularCSSComponent)) {
        components = [singularCSSComponent];
    }

    const singularJSComponent = attrib.startsWith("ls.js.") ? attrib.substring(6).toLowerCase() : null;
    if (singularJSComponent && COMPONENTS.js.includes(singularJSComponent)) {
        components = [singularJSComponent];
    }

    if (is_merged || attrib === "ls.css" || singularCSSComponent) {
        const cssComponents = is_merged ? components.filter(value => COMPONENTS.css.includes(value)) : components;
        const useSingular = cssComponents.length === 1 && ((context.data.flags.has(PARSER_FLAGS.USING_LS_CSS)) || singularCSSComponent);
        components_string = cssComponents.join();

        if (components_string.length !== 0) {
            context.write(`<link rel=stylesheet href="${CDN_ORIGIN}/ls/${version}/${(components_string && !useSingular) ? components_string + "/" : ""}${useSingular ? components_string : (context.data.flags.has(PARSER_FLAGS.USING_LS_CSS)) ? "bundle" : "ls"}.${context.data.compress ? "min." : ""}css">`);
            context.data.flags.set(PARSER_FLAGS.USING_LS_CSS);
        }
    }

    if (is_merged || attrib === "ls.js" || singularJSComponent) {
        const jsComponents = is_merged ? components.filter(value => COMPONENTS.js.includes(value)) : components;
        const useSingular = jsComponents.length === 1 && ((context.data.flags.has(PARSER_FLAGS.USING_LS_JS)) || singularJSComponent);
        components_string = jsComponents.join();

        if (components_string.length !== 0) {
            context.write(`<script src="${CDN_ORIGIN}/ls/${version}/${(components_string && !useSingular) ? components_string + "/" : ""}${useSingular ? components_string : (context.data.flags.has(PARSER_FLAGS.USING_LS_JS)) ? "bundle" : "ls"}.${context.data.compress ? "min." : ""}js"${scriptAttributes}></script>`);
            context.data.flags.set(PARSER_FLAGS.USING_LS_JS);
        }
    }

    context.data.flags.set(PARSER_FLAGS.USING_LS);
};

if(webserver.registerModuleProvider) webserver.registerModuleProvider("ls", blockProcessor); // Catches ls**:version[components]