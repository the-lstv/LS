{
    return _this=>class LS_Multiselect{
        constructor (id, element, options = {}) {
            _this = this;
            if(!element || !O(element))throw new Error("No element provided");
            this.element = O(element)
            let handle = LS.Util.touchHandle(this.element, {exclude: options.passthrough || false, buttons: [0]});
            handle.cursor = "none";
            this.handle = handle;
            this.enabled = true;
            
            this.mask = O("#ls-multiselect-mask");
            if(!this.mask) {
                this.mask = N({id: "ls-multiselect-mask"})
                O().add(this.mask)
            }

            let initial = [];

            function draw(){
                let
                    rect = _this.element.getBoundingClientRect(),
                    reverseX = initial[0] > M.x,
                    reverseY = initial[1] > M.y,
                    px = reverseX ? innerWidth - initial[0] : initial[0],
                    py = reverseY ? innerHeight - initial[1] : initial[1],
                    width = reverseX ? initial[0] - M.x : M.x - initial[0],
                    height = reverseY ? initial[1] - M.y : M.y - initial[1]
                ;

                _this.mask.style = `${reverseX?"right":"left"}:${px}px;${reverseY?"bottom":"top"}:${py}px;width:${width}px;height:${height}px`
            }

            handle.on("start", ()=>{
                initial = [M.x, M.y]
                this.mask.style.opacity = "1"
                draw()
            })
            handle.on("move", draw)
            handle.on("end", ()=>{
                this.mask.style.opacity = "0"
            })
        }
    }
}