{
    return _this => class LS_WorkSpace{
        constructor (id, element, options = {}) {
            _this = this;
            this.id = id || M.GlobalID;
            this.content = O(element || N());
            this.content.class("ls-workspace-content")
            this.element = N({class: "ls-workspace"})
            this.content.wrapIn(this.element);

            this.options = {
                maxZoom: 5,
                minZoom: 0,
                ...options
            }

            this.__x = 0;
            this.__y = 0;

            this.originCorrection = [0, 0];

            this.__scale = 1;
            this.hover = false;

            let handle = new LS.Util.TouchHandle(this.element, {exclude: true, buttons: [1], legacyEvents: true});
            handle.cursor = "grabbing";

            this.define(this)

            document.addEventListener('wheel', (event) => {
                if (event.ctrlKey && this.element.matches(":hover")) {
                    event.preventDefault();

                    let zoomFactor = this.scale * .01
                    let scale = _this.scale - (event.deltaY > 0 ? zoomFactor : -zoomFactor)

                    let mouse = _this.mousePoint;
                    this.content.style.transformOrigin = `${mouse.x}px ${mouse.y}px`
                    // this.originCorrection = [scale*mouse.x, scale*mouse.y]
                    this.correctPosition()


                    this.scale = scale;
                    
                    // this.x -= M.x
                }
            }, { passive: false });

            let initialX, initialY, initialWX, initialWY;
            
            handle.on("start", ()=>{
                initialX = M.x;
                initialY = M.y;
                initialWX = this.x;
                initialWY = this.y;
            })

            handle.on("move", (x, y, e)=>{
                this.x = initialWX + (x - initialX)
                this.y = initialWY + (y - initialY)
            })

            handle.on("end", ()=>{

            })
        }

        define(scope){
            Object.defineProperty(scope, "mousePoint",{
                get(){ return _this.relativePoint(M.x, M.y) }
            })
            Object.defineProperty(scope, "scale",{
                get(){ return _this.__scale },
                set(v){
                    if(v < 0 || v < _this.options.minZoom || v > _this.options.maxZoom) return;
                    _this.__scale = v;
                    _this.content.style.transform = "scale(" + v + ")"
                }
            })
            Object.defineProperty(scope, "x",{
                get(){ return _this.__x },
                set(v){
                    _this.__x = v;
                    _this.correctPosition()
                }
            })
            Object.defineProperty(scope, "y",{
                get(){ return _this.__y },
                set(v){
                    _this.__y = v;
                    _this.correctPosition()
                }
            })
        }

        move(x = _this.x, y = _this.y){
            _this.x = x
            _this.y = y
        }

        correctPosition(){
            this.content.style.left = this.__x - _this.originCorrection[0] + "px"
            this.content.style.top = this.__y - _this.originCorrection[1] + "px"
        }

        relativePoint(ax = M.x, ay = M.y){
            // Gives you relative positions from an absolute one
            let rect = _this.element.getBoundingClientRect(),
                x = ax - rect.x,
                y = ay - rect.y
            ;
            return {
                x, y,
                canvasX: _this.x + x,
                canvasY: _this.y + y,
                canvasXr: x - _this.x,
                canvasYr: y - _this.y,
            }
        }

        isInBounds(x = M.x, y = M.y){
            let rect = _this.element.getBoundingClientRect(),
                point = _this.relativePoint()
            ;
            return //TODO: Do the magic
        }
    }
}