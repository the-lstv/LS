/*

    For older projects that used LS v2/v3/v4 modules or features, this patch aims to provide some
    backwards-compatibility to allow them to keep using v5 of the framework.

    It re-adds some deprecated features, and sort of brings back the old component system.

*/

(() => {
    const og_LoadComponents = LS.LoadComponents;

    LS.LoadComponents = function(components){
        /*
            Old (v4) component system backwards-compatibility for v5
        */

        if(Array.isArray(components)) return og_LoadComponents(components);

        for(let name in components){
            LS[name] = function ComponentInstance(id, ...attributes){
                if(LS[name].conf.isFunction) return (LS[name].class({})) (id, ...attributes);
                return LS[name].new(id, ...attributes);
            }

            LS[name].class = (components[name]) (LS[name]);

            LS[name].conf = {
                batch: true,
                events: true,
                ... LS[name].conf
            };

            if(LS[name].conf.events) LS[name].Events = new LS.EventHandler(LS[name]);

            if(LS[name].conf.singular){

                if(LS[name].conf.becomeClass) {
                    LS[name] = LS[name].class;
                    continue
                }

                LS[name] = LS[name].new("global");
            }

            LS[name].new = function (id, ...attributes){
                let ClassInstance = new((LS[name].class)({})) (id, ...attributes);
                if(LS[name].conf.events) ClassInstance.Events = new LS.EventHandler(ClassInstance);
                if(ClassInstance._init) ClassInstance._init();

                return ClassInstance
            }
        }
    }

    LS.Tiny.M.payloadSignature = function (title, dataArray = [], paddingSize = 128, base = 16){
        if(dataArray.length > paddingSize){
            throw "The length of data cannot exceed the padding size"
        }

        if(base < 16 || base > 36) throw "base must be a number between 16 and 36";

        let encoder = new TextEncoder();

        for(let i = 0; i < dataArray.length; i++){
            if(!(dataArray[i] instanceof Uint8Array) && typeof dataArray[i] !== "string") throw "Data can only be a string or an Uint8Array.";
            dataArray[i] = typeof dataArray[i] === "string"? encoder.encode(dataArray[i]): dataArray[i];
        }

        dataArray.push(crypto.getRandomValues(new Uint8Array(paddingSize - dataArray.length)));

        let data = dataArray.map(data => [...data].map(value => value.toString(base).padStart(2, "0")).join("")).join(":") + "0" + (base -1).toString(base)

        return `---signature block start "${M.uid()}${title? "-"+ title: ""}"---\n${data}\n---signature block end---`
    }

    LS.Tiny.M.parsePayloadSignature = function (signature){
        if(!signature.startsWith("---signature block start") || !signature.endsWith("\n---signature block end---")) throw "Invalid signature data";

        let header = signature.match(/---signature block start "(.*?)"---\n/)[1].split("-"), timestamp, id, instanceID;

        timestamp = parseInt(header[0], 36)
        id = parseInt(header[1], 36)
        instanceID = parseInt(header[2], 36)
        header = header[4] || null

        function decodeBody(hexString) {
            const byteArray = new Uint8Array(hexString.length / 2);

            for (let i = 0; i < hexString.length; i += 2) {
                byteArray[i / 2] = parseInt(hexString.substring(i, i + 2), base);
            }
            
            return byteArray;
        }

        let rawBody = signature.match(/['"t]---\n(.*?)\n---signature block end/s)[1], base = parseInt(rawBody.slice(-2), 36) +1;
        
        let body = rawBody.split(":").map(payload => decodeBody(payload));
        
        let padding = body.pop()

        return { header, body, padding, timestamp, id, instanceID }
    }
})();