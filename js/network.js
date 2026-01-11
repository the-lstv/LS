LS.WebSocket = class WebSocketWrapper extends LS.EventHandler {
    #options;
    constructor(url, options = {}){
        super();

        if(!url) throw "No URL specified";
        if(url.startsWith("http://")) url = "ws://" + url.slice(7);
        if(url.startsWith("https://")) url = "wss://" + url.slice(8);
        if(!url.startsWith("ws://") && !url.startsWith("wss://")) url = (location.protocol === "https:"? "wss://": "ws://") + location.host + (url.startsWith("/")? "": "/") + url;

        this.addEventListener = this.on;
        this.removeEventListener = this.off;

        if(Array.isArray(options) || typeof options === "string"){
            options = {protocols: options};
        }

        if(typeof options !== "object" || options === null || typeof options === "undefined") options = {};

        this.#options = LS.Util.defaults({
            autoReconnect: true,
            reconnectInterval: 2000,
            autoConnect: true,
            delayMessages: true,
            protocols: null,
            initialPayload: null
        }, options);

        this.queue = [];
        this.url = url;
        if(this.#options.autoConnect) this.connect();
    }

    get readyState(){
        return this.socket ? this.socket.readyState : 3;
    }

    get bufferedAmount(){
        return this.socket ? this.socket.bufferedAmount : 0;
    }

    get protocol(){
        return this.socket ? this.socket.protocol : "";
    }

    connect() {
        if(this.destroyed) throw "WebSocket is destroyed";
        if(this.socket && this.socket.readyState === 1) return;

        if(this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.socket = new WebSocket(this.url, this.#options.protocols || null);

        this.socket.addEventListener("open", event => {
            if(this.#options.initialPayload) {
                this.send(this.#options.initialPayload);
            }

            if(this.queue && this.queue.length > 0){
                for(let message of this.queue) this.socket.send(message);
                this.queue.length = 0;
            }

            this.emit("open", [event]);
        });

        this.socket.addEventListener("message", event => {
            this.emit("message", [event.data, event]);
        });

        this.socket.addEventListener("close", async event => {
            let prevent = false;

            this.emit("close", [event, () => {
                prevent = true
            }]);

            if(!prevent && this.#options.autoReconnect) {
                this.reconnectTimeout = setTimeout(() => this.connect(), this.#options.reconnectInterval);
            }
        });

        this.socket.addEventListener("error", event => {
            this.emit("error", [event]);
        });
    }

    send(data){
        if(this.destroyed) throw "WebSocket is destroyed";

        if(data instanceof Uint8Array) data = data.buffer;
        if(typeof data !== "string" && !(data instanceof ArrayBuffer) && !(data instanceof Blob)) {
            if(typeof data === "object") data = JSON.stringify(data); else data = String(data);
        }

        if(!this.socket || this.socket.readyState !== 1) {
            if(this.#options.delayMessages) this.queue.push(data);
            return false;
        }

        this.socket.send(data);
        return true;
    }

    close(code, message){
        if(this.socket) this.socket.close(code, message);
    }

    destroy(){
        this.close();
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
        this.emit("destroy");
        this.events.clear();
        this.socket = null;
        this.queue = null;
        this.#options = null;
        this.url = null;
        this.events = null;
        this.destroyed = true;
    }
};
