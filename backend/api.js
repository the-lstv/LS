const fs = require("fs");
const path = require("path");

const { xxh32 } = require("@node-rs/xxhash");

let backend;

var Path = path.resolve(__dirname, ".."),
    DistPath = Path + "/dist"
;

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

const Enum = Object.freeze({
    all: 1
});

const latest = fs.readFileSync(Path + "/version", "utf8").trim();

// A map of cache maps, one per version
const cache = new Map;

function Handle({ req, res, segments, error, send }){
    let version = segments[0];

    if(version === "latest") {
        version = latest;
    }

    if(version === "4.0.0" || version === "3.0_lts" || version === "4.0_lts") {
        version = "4.0.1";
    }

    const VersionPath = DistPath + "/" + version + "/";
    if(!version || !fs.existsSync(VersionPath)) {
        return error(`Version "${version}" was not found or is invalid`, 404);
    }

    let file_cache = cache.get(version);

    if(!file_cache){
        file_cache = new Map;
        cache.set(version, file_cache);
    }

    let file = segments.length === 2? segments[1]: segments[2];
    let list = segments[1] === "*"? Enum.all : new Set(segments.length === 2? []: segments[1].split(","));

    const first_index = file.indexOf(".");
    const last_index = file.lastIndexOf(".");

    if(first_index === -1) return error(43, null, "404");

    const file_name = file.slice(0, first_index);
    const do_compress = file.indexOf(".min") !== -1;
    const type = file.slice(last_index + 1);

    if(type !== "js" && type !== "css") return error(43, null, "404");

    const result = [];

    if(file_name === "index" || file_name === "core" || file_name === "ls") {
        const file_path = VersionPath + "ls." + type;

        if(!fs.existsSync(file_path)) {
            return error(`Core file was not found`, 404);
        }

        const file_key = file;
        let content = file_cache.get(file_key);

        if(!content) {
            if(do_compress) {
                content = backend.compression.code(fs.readFileSync(file_path, "utf8"), type === "css");
            } else {
                content = fs.readFileSync(file_path)
            }

            file_cache.set(file_key, content);
        }

        result.push(content);
    } else { if(file_name !== "bundle") list.add(file_name) }

    if(list === Enum.all) {
        list = new Set(fs.readdirSync(VersionPath + type + "/").filter(file => file.endsWith(type)).map(file => file.slice(0, file.lastIndexOf("."))));
    }

    for(let component of list) {
        const component_path = VersionPath + type + "/" + component + "." + type;

        if(!fs.existsSync(component_path)) {
            if(version === "4.0.1"){
                // Legacy or LTS releases had a less strict API.
                continue;
            }

            return error(`Component "${component}" was not found`, 404);
        }

        const file_key = component + (do_compress? ".min": "") + "." + type;
        let content = file_cache.get(file_key);

        if(!content) {
            if(do_compress) {
                content = backend.compression.code(fs.readFileSync(component_path, "utf8"), type === "css");
            } else {
                content = fs.readFileSync(component_path)
            }

            file_cache.set(file_key, content);
        }

        result.push(content);
    }

    backend.helper.send(req, res, result.length === 1? result[0]: Buffer.concat(result), {
        'cache-control': backend.isDev? "no-cache": `public, max-age=31536000`,
        'content-type': `${type === "js"? "text/javascript": type === "css"? "text/css": "text/plain"}; charset=UTF-8`
    });
}


// TODO: When Akeno receives a proper module system, replace this with that and replace the send function.

let legacy = null;

module.exports = {
    Initialize($){
        backend = $;
    },

    HandleRequest({ req, res, segments, error }){
        if(segments.length < 2) return error(2);

        // Case-insensitive
        segments = segments.map(segment => segment.toLowerCase());

        // The legacy.js file provides full backwards compatibility with the legacy URL syntax, both to provide access to old releases using the old system and to provide access to new releases using the old syntax.
        // Legacy mode had a terrible URL syntax and didnt respect versioning.
        // If you do not need to support the legacy system, simply remove the following code.
        if(["js", "css", "css.min", "js.min"].indexOf(segments[0]) !== -1) {
            const legacy_version = segments[2]? segments[1] : "4.0.1";
            if (!segments[2]) {
                segments[2] = segments[1] || ""
            }

            if(parseInt(legacy_version[0]) > 3) {
                segments = [legacy_version, segments[2], "ls." + segments[0].split(".").reverse().join(".")];
            } else {
                if(!legacy) {
                    legacy = require("./legacy");
                }

                return legacy.Handle({ req, res, segments, error, backend })
            }
        }

        return Handle({ req, res, segments, error });
    }
}