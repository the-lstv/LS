LS.WebSocket = class WebSocketWrapper extends LS.EventHandler {
    constructor(url, options = {}){
        super();

        if(!url) throw "No URL specified";
        if(!url.startsWith("ws://") && !url.startsWith("wss://")) url = (location.protocol === "https:"? "wss://": "ws://") + url;

        this.addEventListener = this.on;
        this.removeEventListener = this.off;

        if(Array.isArray(options) || typeof options === "string"){
            options = {protocols: options};
        }

        if(typeof options !== "object" || options === null || typeof options === "undefined") options = {};

        this.options = LS.Util.defaults({
            autoReconnect: true,
            autoConnect: true,
            delayMessages: true,
            protocols: null
        }, options);

        this.queue = [];

        Object.defineProperty(this, "readyState", {
            get(){
                return this.socket.readyState
            }
        });

        Object.defineProperty(this, "bufferedAmount", {
            get(){
                return this.socket.bufferedAmount
            }
        });

        Object.defineProperty(this, "protocol", {
            get(){
                return this.socket.protocol
            }
        });

        this.url = url;
        if(this.options.autoConnect) this.connect();
    }

    connect(){
        if(this.socket && this.socket.readyState === 1) return;

        this.socket = new WebSocket(this.url, this.options.protocols || null);

        this.socket.addEventListener("open", event => {
            if(this.queue.length > 0){
                for(let message of this.queue) this.socket.send(message);
                this.queue = [];
            }

            this.emit("open", [event]);
        });

        this.socket.addEventListener("message", event => {
            this.emit("message", [event]);
        });

        this.socket.addEventListener("close", async event => {
            let prevent = false;

            this.emit("close", [event, () => {
                prevent = true
            }]);

            if(!prevent && this.options.autoReconnect) this.connect();
        });

        this.socket.addEventListener("error", event => {
            this.emit("error", [event]);
        });
    }

    send(data){
        if(!this.socket || this.socket.readyState !== 1) {
            if(this.options.delayMessages) this.queue.push(data);
            return false;
        }

        this.socket.send(data);
        return true;
    }

    close(code, message){
        this.socket.close(code, message);
    }
};
