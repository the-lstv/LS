{
    gl.conf.requires=["Tabs","Form"];
    return(_this)=>class Steps{
        constructor(id, element = O("steps"), o = {}){
            console.warn("LS.Steps is currently outdated, thus may break, have performance or functional issues and is subject to a big change in the future")

            _this = this;
            element = O(element);

            this.opt = Object.assign({
                listElement: null,
                doneText: "Done",
                select: "ls-step, step",
                style: "wizzard",
                buttons: true,
                clickable: false,
                bar: true
            }, o);

            this.form = LS.Form("steps_form_" + id, element, {autoUpdate: true, observe: true});

            this.tabs = LS.Tabs.new("step_tabs_"+id, element, {
                listClass: "ls-steps ls-steps-"+this.opt.style,
                select: this.opt.select,
                listItemClass: this.opt.listItemClass||"ls-steps-item",
                noStyle: true,
                infinite: false,
                listClickable: this.opt.clickable,
                listElement: this.opt.listElement,
                mode: this.opt.mode,
                bar: this.opt.list,
                ...this.opt.tabOptions
            });

            this.element = element;
            this.stack=[];
            this.values={};
            this.step=0;
            this.stepIndex=this.tabs.tab;

            if(this.opt.buttons){
                if(this.opt.buttons.back !== false){
                    if(!Array.isArray(this.opt.buttons.back)) this.opt.buttons.back = [this.opt.buttons.back];
                    this.opt.buttons.back.forEach(element => this.setBackButton(element || null))
                }
                if(this.opt.buttons.next !== false){
                    if(!Array.isArray(this.opt.buttons.next)) this.opt.buttons.next = [this.opt.buttons.next];
                    this.opt.buttons.next.forEach(element => this.setNextButton(element || null))
                }
            }

            this.tabs.on("tab_changed", (i, tab)=>{
                this.stepIndex = i;
                this.invoke("step_changed", i, tab);
                let isRequired = this.tabs.tabs[tab].attr("required");
                this.setCanContinue(!(isRequired&&!this.values[isRequired]));
                let last = i == this.tabs.order.indexOf(this.stack.at(-1));
                this.invoke("last_step_" + (last? "enter" : "leave"))

                if(this.opt.buttons){
                    this.element.getAll(".ls-steps-next[finish-text]").all(element => element.set(last? element.attr("finish-text") || "Done" : "Next" ))
                    S(this.element.getAll(".ls-steps-previous"), {opacity: i!=0?"1":".4" });
                }
            })

            this.form.on("values_changed",v=>{
                this.values = v;
            })

            this.form.on("change",(key,value,type,element,group)=>{
                if(type !== "radio")return;
                let rq = group.findParent("step").attr("required");

                if(rq)_this.setCanContinue(!!_this.values[rq]);
                _this.updateStack();
            })
        }
        _init(){
            this.reset();
        }
        getValues(){
            return _this.form.get()
        }
        setCanContinue(v=!0){
            if(this.opt.buttons)S(_this.opt.nextBtn,{opacity:v?"1":".4","pointer-events":v?"all":"none"});
        }
        next(){
            if(_this.step == this.stack.length-1) {
                _this.invoke("done",_this.form.get())
            }

            _this.updateStack()
            if(_this.step<_this.stack.length-1) {
                _this.tabs.setActive(_this.stack[(_this.step++)+1])
            }
        }
        previous(){
            _this.updateStack()
            if(!_this.step<1) {
                _this.tabs.setActive(_this.stack[(_this.step--)-1])
            }
        }
        updateStack(){
            _this.stack=[];
            for(const tab of _this.tabs.order){
                let e = _this.tabs.tabs[tab];
                let pass=!(e.attr("if")?e.attr("if").split(";").map(c=>c.split("=")).find(a=>_this.values[a[0]]==a[1]):!0);
                if(_this.tabs.list)_this.tabs.list[tab].style.display=pass?"none":"";
                if(pass){continue}
                _this.stack.push(tab)
            }
            if(_this.tabs.list) _this.stack.forEach((e,i)=>{
                e=_this.tabs.list[e];
                e.class(["last-child","only-child","first-child"],0);
                if(_this.stack.length<2){e.class("only-child");return};
                if(i==0)e.class("first-child");
                if(i==_this.stack.length-1)e.class("last-child");
            })
        }
        reset(){
            _this.setCanContinue(!0);
            _this.step=0;
            _this.tabs.setActive(0,1);
            _this.form.reset();
            _this.updateStack()
        }
        setNextButton(element){
            if(!element){
                element = N("button", {innerText: "Next", attr: {"finish-text": "Done"}});
                _this.element.add(element)
            }
            element.class("ls-steps-next")
            element.on("click", ()=>{
                _this.next()
            })
        }
        setBackButton(element){
            if(!element){
                element = N("button", "Previous");
                _this.element.add(element)
            }
            element.class("ls-steps-previous")
            element.on("click", ()=>{
                _this.previous()
            })
        }
    }
}