{

    return(_this)=>class PresentationView{
        constructor(id, element = O("present"), options = {}){
            element = O(element);

            if(!element) throw"No element found for the presentation.";

            _this = this;

            if(!options.resolution) options.resolution = [1280, 720];
            if(!options.select) options.select = "ls-slide";

            this.options = options;

            element.class("ls-present-container");

            this.element = element.wrapIn(N({class: "ls-present-body"}));

            if(!options.frameOnly) {
                this.tabs = LS.Tabs("LS.Present." + id, this.element, {
                    list: false,
                    select: options.select || "ls-slide",
                    mode: "presentation"
                })

                // This is for legacy applications, since this used to be forwarded through LS.Steps in the past.
                this.steps = {
                    tabs: this.tabs
                }
            }

            this.setResolution()

            M.on("resize", this.fixResolution);

            (options.fullscreen? O() : element).on("keydown", "wheel", this.handleEvent);
            element.on("click", this.handleEvent)
        }

        handleEvent(e){
            if(_this.options.ignoreEvents || (_this.lastTimer&&(Date.now() - _this.lastTimer) < ((+_this.slideElement().attr("min-time")) || 500)))return;
            if(_this.options.canContinue && typeof _this.options.canContinue == "function"){
                let canContinue = _this.options.canContinue(e)
            }

            if(!canContinue) return;

            _this.lastTimer = Date.now();

            if(
                (e.type=="wheel" && e.deltaY<=0)||
                (e.type=="keydown" && ["ArrowLeft","ArrowUp"].includes(e.key))
            ){
                _this.navigate(-1,false,true);
                return
            }

            _this.navigate(1,false,true);
        }

        slideElement(id = null){
            return _this.tabs.tabs[_this.tabs.order[id || _this.tabs.tab]]
        }

        fixResolution(){
            let e = _this.element,
            scale = Math.min(
                (_this.options.containerWidth || Number(window.innerWidth)) / _this.options.resolution[0],    
                (_this.options.containerHeight || Number(window.innerHeight)) / _this.options.resolution[1]
            );
            _this.scale = scale
            e.style.transform=`translate(-50%,-50%) scale(${scale})`;
        }

        setResolution(w, h){
            if(typeof w === "undefined" && typeof h === "undefined") {
                w = _this.options.resolution[0];
                h = _this.options.resolution[1];
            }
            
            let aspectRatio = _this.options.resolution[0] / _this.options.resolution[1];
            if(typeof w === "undefined") w = Math.round(h * aspectRatio);
            if(typeof h === "undefined") h = Math.round(w / aspectRatio);
            
            _this.options.resolution[0] = w;
            _this.options.resolution[1] = h;
            
            _this.element.applyStyle({width: w +"px", height: h +"px"});
            _this.fixResolution()

           if(_this.invoke) _this.invoke("resolution-changed", w, h, aspectRatio)
        }

        navigate(direction, jump = false, key=false){
            if(!jump && direction == 0) return;
            if(!jump && typeof direction == "string") {
                direction = _this.tabs.order.indexOf(direction)
                jump = true
            }

            let element = _this.slideElement();
            if(!element) return false;

            let stages = (element.attr("stages") || "").split(";").map(stage=>{
                let obj = {};

                for(let key of stage.split(",")){
                    if(key.length < 1) continue;

                    key = key.split(":");
                    obj[key[0]] = key[1];
                }

                return Object.keys(obj).length < 1? null : obj;
            }).filter(garbage => garbage), hold = false;

            if(stages.length > 0 && !jump){
                let stage = element.attr("stage");
                stage = +(stage || 0);

                console.log(stage, stages.length, stages, direction);

                if(
                    direction > 0?
                        stage != stages.length
                    :
                        stage > 0
                ){
                    element.attrAssign({stage: stage + direction})
                    hold = true
                }
            }

            if(!hold){
                if(direction ==1 && key && element.hasAttr("no-action")) return false;

                if(jump){
                    _this.tabs.setActive(direction);
                }else{
                    _this.tabs[direction > 0? "next" : "previous"]();
                }
            }else{
                _this.invoke("stage", _this.tabs.activeTab, direction, jump);
            }

            _this.invoke("change", _this.tabs.activeTab, _this.tabs.order.length, direction, jump);

            return true
        }

        set(tab){
            return _this.tabs.setActive(tab)
        }

        next(){
            return _this.navigate(1)
        }

        slide(slide = 0){
            return _this.navigate(slide, true)
        }

        back(){
            return _this.navigate(-1)
        }

        fullscreen(){
            return this.element.requestFullscreen()
        }
    }
}