const fs = require("fs");
const path = require("path");

// const { xxh32 } = require("@node-rs/xxhash");

const backend = require("akeno:backend");

const cacheManager = new backend.helper.CacheManager({});

const BASE_PATH = path.resolve(__dirname, ".."),
      DIST_PATH = BASE_PATH + "/backend/versions/",
      CORE_MARKER = "\u0000"; // Special marker for the core component

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

    This is different from versions prior to v5, where the core was treated as an optional component.

    All components may be automatically minified by appending ".min" to the file name.
    This also differs from legacy versions where there were separate distribution files for minified code.
*/

const LATEST = fs.readFileSync(BASE_PATH + "/version", "utf8").trim();

const VERSIONS = fs.readdirSync(DIST_PATH).filter(file => {
    return fs.statSync(DIST_PATH + "/" + file).isDirectory();
})

const COMPONENTS = JSON.parse(fs.readFileSync(BASE_PATH + "/misc/components.json", "utf8"));

// A map of cache maps, one per version
// const cache = new Map;

const VERSION_ALIAS = {
    "4.0.0": "4.0.1",
    "3.0_lts": "4.0.1",
    "4.0_lts": "4.0.1", // Note: Support ended

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
let IGNORE_PATCH_VERSION = false;

const LATEST_MAJOR = LATEST.split(".")[0] || "0";
const LATEST_PATCH = LATEST.split(".")[2] || "0";

function getEffectiveVersion(version) {
    if (IGNORE_PATCH_VERSION && version.startsWith(LATEST_MAJOR + ".")) {
        const last_index = version.lastIndexOf(".");
        if (last_index !== -1) {
            version = version.slice(0, last_index) + "." + LATEST_PATCH;
        }
    }
    return version;
}

const isWindows = process.platform === "win32";
if(isWindows) {
    if (Math.random() > .9) console.debug("(´∀｀*)☛ get a load of this guy");
    console.warn("[LS API] Warning: The LS backend is not supported on Windows and may break. We will ignore issues from the Windows platform.");
}

module.exports = {
    reload() {
        // Reload hook
        cacheManager.clear();
    },

    async onRequest(req, res) {
        const segments = backend.helper.getPathSegments({ path: req.path.slice(3).toLowerCase() });
        if (segments.length < 2) return backend.helper.error(req, res, 2);

        // This will be removed at some point
        if(segments[0] === "js" || segments[0] === "css" || segments[0] === "js.min" || segments[0] === "css.min") {
            return serveLegacy(req, res, segments);
        }

        const version = segments[0] === "latest" ? LATEST : VERSION_ALIAS[segments[0]] || getEffectiveVersion(segments[0]);

        let VERSION_PATH = DIST_PATH + path.posix.resolve("/", version);

        // Windows is stupid, so we need to resolve symlinks manually
        if (isWindows) {
            // try {
            //     if (fs.lstatSync(VERSION_PATH).isFile()) {
            //         const link = fs.readFileSync(VERSION_PATH, "utf8");                    
            //         VERSION_PATH = path.resolve(DIST_PATH, link);
            //     }
            // } catch (e) {
            //     // Ignore if not a symlink or path doesn't exist
            // }
            VERSION_PATH = BASE_PATH + "/dist/dev";
        } else {
            if(!VERSIONS.includes(version)) {
                return backend.helper.error(req, res, `Version "${version}" was not found or is invalid`, 404);
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
                    components.push(v); // Changed from list.push(v) to components.push(v)
                    last = v;
                }
            }
        }

        const CACHE_KEY = `${version}:${type}:${components.join(",")}`;
        const mimeType = type === "js"? "text/javascript": "text/css";
        const suggestedCompressionAlgorithm = backend.helper.getUsedCompression(req, mimeType); // uws aah

        if(!cacheManager.cache.has(CACHE_KEY)) {
            let result = "";

            for(let component of components) {
                let component_path = component === CORE_MARKER? VERSION_PATH + "/ls." + type: VERSION_PATH  + "/" + type + "/" + component + "." + type;

                if(isWindows && component_path.includes("dist/dev") && !component_path.includes("css")) {
                    // Windows can't handle symlinks properly
                    component_path = component_path.replace("dist/dev/", "");
                }

                if(!fs.existsSync(component_path)) {
                    if(version === "4.0.1"){
                        // Legacy or LTS releases had a less strict API.
                        continue;
                    }

                    return backend.helper.error(req, res, `Component "${component}" was not found`, 404);
                }

                result += "\n" + fs.readFileSync(component_path, "utf8");
            }

            await cacheManager.refresh(CACHE_KEY, null, null, result, mimeType);
        }

        cacheManager.serve(req, res, CACHE_KEY, null, {
            codeCompression: do_compress
        }, suggestedCompressionAlgorithm);
    }
}


// The legacy.js file provides full backwards compatibility with the legacy URL syntax, both to provide access to old releases using the old system and to provide access to new releases using the old syntax.
// Legacy mode had a terrible URL syntax and didn't respect versioning.
// If you do not need to support the legacy system, simply remove the following code.
let legacy = null;
function serveLegacy(req, res, segments) {
    const legacy_version = segments[2]? segments[1] : "4.0.1";
    if (!segments[2]) {
        segments[2] = segments[1] || "";
    }

    if(parseInt(legacy_version[0]) > 3) {
        segments = [legacy_version, segments[2], "ls." + segments[0].split(".").reverse().join(".")];
    } else {
        if(!legacy) {
            try {
                require.resolve("./legacy");
            } catch {
                return backend.helper.error(req, res, `Legacy mode is not supported. Please upgrade to the new system`, 404);
            }

            legacy = require("./legacy");
        }

        return legacy.Handle({ req, res, segments, backend });
    }
}