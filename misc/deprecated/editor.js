{
    gl.set("themes",{
        base:{
            textarea:"all:revert;position:absolute;inset:0;outline:none;background:#0000;color:#0000;resize:none;border:none"
        },
        light:{
            body:"background:#fff;color:#000;woú:0"
        },
        dark:{
            include:"base",
            body:"background:#232a2f;color:#eee"
        },
    });
    return(_this)=>class Editor{
        constructor(id,e,opt){
            this.opt=Object.assign({indent:"    "},opt);
            this.element=O(e||N("editor"));
            S(this.element,{
                position:"relative",
                width:this.element.attr("width")||"400px",
                height:this.element.attr("height")||"250px",
                display:"block"
            });
            this.element.className="ls-editor-body";
            _this=this;
            this.style(gl.themes.dark);
            this.element.set([
                N("div",{className:"ls-editor-inner",style:S({position:"absolute",display:"block",width:"100%",height:"100%"}),inner:[
                    N("div",{className:"ls-editor-overlay",style:S({
                        position:"absolute",
                        "pointer-events":"none",
                        inset:"0",
                        "white-space":"pre"
                    })}),
                    N("textarea",{className:"ls-editor-edit ls-editor-text",inner:["hi"],oninput:function(){
                        _this.element.get(".ls-editor-overlay").innerHTML=this.value
                    }})
                ]})
            ])

        }
        style(theme){
            let r={};
            function get(obj){
                if(!obj)return;
                Object.keys(obj).forEach(k=>{
                    let t={};
                    if(k=="include"){
                        return obj[k].split(",").forEach(k=>get(gl.themes[k]))
                    }
                    r[k]=r[k]||{};
                    obj[k].split(";").map(e=>e.split(":").map(e=>e.trim())).forEach(k=>t[k[0]]=k[1]);
                    Object.assign(r[k],t)
                })
            }
            get(theme);
            Object.keys(r).forEach(k=>{console.warn(_this.element.querySelectorAll("*"));(k=="body"?[_this.element]:_this.element.querySelectorAll(k)).forEach(e=>{console.log(1,e,r[k]);S(e,r[k])})})
            console.log(r);
        }
        addTheme(key,theme){gl.themes[key]=theme}
        set(){

        }
        get(){

        }
    }
}