{
    return(_this)=>class Console{
        constructor(id,e=O("console"),options={}){
            if(!e)throw"No element found for Terminal.";
            _this=this;
            this.element=O(e);
            this.input=N("textarea",{style:"opacity:0;position:fixed;bottom:0",class:"ls-console-inputarea"});
            this.input.on("focus", "blur", (e)=>{
                this.element.class("focus", e.type == "focus")
            })
            this.cursor=N({class:"ls-console-cursor"});
            this.container=N({class:"ls-console-line-container"});
            let input;
            Object.defineProperty(this, "activeInput", {
                get(){
                    return input
                },
                set(v){
                    input = v
                    this.inputPrev = ""
                    this.input.value = this.data[v] || ""
                    this.updateCursor()
                    this.input.dispatchEvent(new Event('input'))
                }
            })
            Object.defineProperty(this, "em", {
                get(){
                    return parseFloat(getComputedStyle(_this.container).fontSize)
                }
            })
            Object.defineProperty(this, "rows", {
                get(){
                    return Math.round(_this.container.clientHeight/(1.32*_this.em))
                }
            })
            Object.defineProperty(this, "cols", {
                get(){
                    return Math.round(_this.container.clientWidth/(_this.em*.6))
                }
            })
            this.input.on("keypress","input","keydown","keyup",(event)=>{
                if(event.type=="keydown"){
                    if (event.ctrlKey && (event.key === 'c' || event.key === 'x' || event.key === 'v')) {
                        _this.invoke("ctrl"+event.key)
                        event.preventDefault();
                    }
                    if (event.ctrlKey && event.shiftKey) {
                        if (event.key === 'C') {
                            document.execCommand('copy');
                        } else if (event.key === 'V') {
                            document.execCommand('paste');
                        } else if (event.key === 'X') {
                            document.execCommand('cut');
                        }
                    }            
                }
                this.updateCursor()
            })
            this.input.on("input", ()=>{
                if(this.activeInput&&this.element.has("#i_"+this.activeInput)){
                    let lines = this.input.value.split("\n"), element = this.element.get("#i_"+this.activeInput+" .text");
                    if(lines.length>this.inputPrev.split("\n").length)this.invoke("newline",this.activeInput,this.inputPrev)
                    if(
                        (this.inputSize[0]!="*"&&lines[0].length>+this.inputSize[0]) ||
                        (this.inputSize[1]!="*"&&lines.length>+this.inputSize[1])
                    ){
                        this.input.value=this.inputPrev
                        return
                    }
                    this.data[this.activeInput]=this.input.value
                    element.set(this.input.value)
                    if(this.inputSize[1]!=="*"){
                        for(let i=0;i<Math.max((+this.inputSize[1])-lines.length,0);i++){
                            element.add(N("br"))
                        }
                    }
                    this.invoke("input",this.activeInput,this.input.value)
                    this.inputPrev=this.input.value
                }
            })
            this.element.add(this.input, this.cursor, this.container).class("ls-console")
            ;(new ResizeObserver(e => {
                this.updateSize()
            })).observe(_this.container);
            this.element.on("click", ()=>this.input.focus())
            this.lines = 0;
            this.inputPrev = "";
            this.data = {}
            this.opt = Object.assign({proxy:!1,style:!0,overwrite:!1,highlightJS:!0,scroll:!0,max_lines:350},options)
            if(this.opt.overwrite){this._console=Object.assign(console,this.__proto__);console=this};
        }
        addLine(opt,...lines){
            if(_this.lines>=_this.opt.max_lines){_this.container.child().remove();_this.lines--;};

            let ts = "";

            opt=Object.assign({proxy:"log",nl:1},opt);
            if(_this.opt.proxy)_this._console[opt.proxy](...lines);

            //Parse type
            lines=lines.map(v=>typeof v=="object"?JSON.stringify(v,null,4):typeof v=="function"?"<i>%{#aaa}"+v.toString()+"%{/}</i>":typeof v=="number"?"%{#35f}"+v+"%{/}":typeof v=="boolean"?("%{#a5f}"+(v?"true":"false")+"%{/}"):v)
            
            //Parse styling
            let styles=0, input = 0;
            for(const [i,line] of lines.entries()){
                lines[i]=line.split("%{").map(c=>{
                    let i=c.indexOf("}");
                    if(i!=-1){
                        let s=c.split("}")[0];
                        if(s=="/"){
                            return (styles>0?(styles--)+1&&"</span>":"")+c.substring(i+1)
                        }
                        if(s.startsWith("!")){
                            let id=s.split("!")[1] || M.GlobalID, size = ["*","*"]
                            if(id.startsWith("[")&&id.includes("]")){
                                size=(id.split("]")[0].slice(1)).split(",")
                                id=id.split("]")[1]
                            }
                            let existing = this.element.get("#i_"+id);
                            if(existing){
                                existing.id=""
                            }
                            _this.data[id] = "";
                            _this.inputSize = size;
                            input = id;
                            return `<span class="ls-console-inputfield" id="i_${id}"><span class=text></span></span>`
                        }
                        styles++;
                        return"<span style=\""+s.split(";").map(s=>{
                            if(!s.includes(":")){return s.split(",").map((v,i)=>`${["color","background","outline","font-style","font-weight","text-decoration","cursor"][i]||"color"}:${v||"unset"}`).join(";")}else{return s}
                        }).join(";")+"\">"+c.substring(i+1)
                    }
                    return c;
                }).join("")
            }

            //Add icon
            ts=(opt.proxy!=="log"?` <i class=bi-${{error:'x-circle-fill',info:'info-circle-fill',warn:'exclamation-triangle-fill',success:'check-circle-fill'}[opt.proxy]||""}></i> `:"")+ts;
            
            let date=new Date;
            let result=N("span",{
                inner: `<span style=color:${opt.color||_this.opt.color||'inherit'}>${ts}${lines.join(opt.nl?"\n":"")}${opt.nl?"\n":""}`+("</span>".repeat(styles+1)),
                title: `${date.getMonth()+1}.${date.getDate()}.${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
            });

            _this.container.add(result)
            _this.invoke("line",result.textContent)
            if(_this.opt.scroll)_this.element.scroll(0,_this.element.scrollHeight+5000);
            _this.lines++;
            if(input)_this.activeInput=input;
        }
        updateCursor(){
            if(_this.activeInput&&_this.element.has("#i_"+_this.activeInput)){
                _this.element.get("#i_"+_this.activeInput)
                _this.cursor.show();
                _this.cursor.addTo(_this.element.get("#i_"+_this.activeInput))

                let start = _this.input.selectionStart,
                    end = _this.input.selectionEnd,
                    lbc = _this.input.value.substring(0, start).split('\n'),
                    direction = _this.input.selectionDirection == "forward",
                    row = lbc.length,
                    column = lbc[lbc.length - 1].length + 1
                ;

                _this.cursor.style=`top:${(row-1)*1.32}em;left:${(column-1)*.6}em;width:${.6*Math.abs(direction?end-start:start-end)+.6}em`
                return
            }
            _this.cursor.hide();
        }
        updateSize(){
            _this.invoke("resize",_this.rows,_this.cols)
        }
        write(...t){_this.addLine({nl:0},...t)}
        print(...t){_this.write(...t)}
        log(...t){_this.addLine({},...t)}
        clear(){_this.container.clear();_this.lines=0;if(_this.opt.proxy)_this._console.clear();_this.invoke("clear")}
        get(){}
        error(...t){_this.addLine({proxy:"error",color:"#f55"},...t)}
        warn(...t){_this.addLine({proxy:"warn",color:"#fb2"},...t)}
        success(...t){_this.addLine({proxy:"success",color:"#5f5"},...t)}
        info(...t){_this.addLine({proxy:"info",color:"#5ff"},...t)}
    }
}