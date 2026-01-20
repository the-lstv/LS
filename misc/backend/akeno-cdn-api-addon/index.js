const Units = require("akeno:units");
const backend = require('akeno:backend');

const fs = require("fs");
const path = require("path");

/*
    The URL syntax is as follows:
    /version/[components]/file

    Though for dynamic loading (or when loading just the core with no components), the components section can be omitted:
    /version/file

    Eg.
    /5.0.0/index.js -> Loads the core.
    /5.0.0/select.js -> Loads only the select component.
    /5.0.0/select,modal/index.js -> Loads the core and the select and modal components as a bundle.
    /5.0.0/select,modal/bundle.js -> Loads only the select and modal components as a bundle.
*/

const cacheManager = new backend.helper.CacheManager({});

const BASE_PATH = path.resolve(__dirname, "../../../"),
      DIST_PATH = BASE_PATH + "/misc/backend/akeno-cdn-api-addon/versions/",
      CORE_MARKER = "\u0000"; // Special marker for the core component, to ensure it is in the first position.

const LATEST = fs.readFileSync(BASE_PATH + "/version", "utf8").trim();

let VERSIONS = new Set([...fs.readdirSync(DIST_PATH).filter(file => {
    return fs.statSync(DIST_PATH + "/" + file).isDirectory();
})]);

const COMPONENTS = JSON.parse(fs.readFileSync(BASE_PATH + "/misc/components.json", "utf8"));


// Alias some versions
// Note: This API no longer supports versions < 3.0.0, as they used a completely different format (pre-processed JSON).
const VERSION_ALIAS = {
    "4.0.0": "4.0.2",
    "3.0_lts": "4.0.2",
    "4.0_lts": "4.0.2", // Note: Support for v4 ended

    // 5.x to 5.2.5
    "5.0.0": "5.2.5",
    "5.0.1": "5.2.5",
    "5.0.2": "5.2.5",
    "5.1.0": "5.2.5",
    "5.2.0": "5.2.5",
    "5.2.1": "5.2.5",
    "5.2.2": "5.2.5",
    "5.2.3": "5.2.5",
    "5.2.4": "5.2.5",

    // 5.2.6 to 5.2.7 (5.2.6 was only a small patch)
    "5.2.6": "5.2.7",
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

        VERSIONS = new Set([...fs.readdirSync(DIST_PATH).filter(file => {
            return fs.statSync(DIST_PATH + "/" + file).isDirectory();
        })]);
    }

    async onRequest(req, res) {
        const segments = backend.helper.getPathSegments({ path: req.path.slice(3).toLowerCase() });
        if (segments.length < 2) return backend.helper.error(req, res, 2);

        const version = this.getEffectiveVersion(segments[0]);

        let VERSION_PATH = DIST_PATH + path.posix.resolve("/", version);

        if (isWindows) {
            // Windows is quite unreliable with symlinks (or does not provide them at all in some environments), so we skip them entirely and just use dist.
            // This is incorrect, but you shouldn't use Windows for production servers anyway, this API does not support Windows, so functionality is not guaranteed either way.
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
        const type = file.slice(last_index + 1);

        if(type !== "js" && type !== "css") return backend.helper.error(req, res, 43, null, "404");

        const unsortedList = segments[1] === "*"? COMPONENTS[type] : segments.length === 2? []: segments[1].split(",");
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

        const CACHE_KEY = `${version}:${type}:${components.join(",")}`;
        const mimeType = type === "js"? "text/javascript": "text/css";
        const suggestedCompressionAlgorithm = backend.helper.getUsedCompression(req, mimeType); // uws aah

        // Check cache
        if(!cacheManager.cache.has(CACHE_KEY)) {
            let result = [];

            for(let component of components) {
                let component_path = component === CORE_MARKER? VERSION_PATH + "/ls." + type: VERSION_PATH  + "/" + type + "/" + component + "." + type;

                if(isWindows && component_path.includes("dist") && !component_path.includes("css")) {
                    // Windows workaround
                    component_path = component_path.replace("dist/", "");
                }

                if(!fs.existsSync(component_path)) {
                    if(version === "4.0.2"){
                        // Legacy or LTS releases had a less strict API.
                        continue;
                    }

                    return backend.helper.error(req, res, `Component "${component}" was not found`, 404);
                }

                result.push("\n", fs.readFileSync(component_path, "utf8"));
            }

            // We pass data as a string, because we do code processing with esbuild etc.
            // It gets converted to a buffer internally later.
            await cacheManager.refresh(CACHE_KEY, null, null, result.join(""), mimeType);
        }

        cacheManager.serve(req, res, CACHE_KEY, null, {
            codeCompression: do_compress
        }, suggestedCompressionAlgorithm);
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