{
    if(!LS.isWeb)return;

    gl.conf={
        batch: false,
        singular: true,
        // requires: ["Resize", "Terminal", "Tree", "Color", "Select", "Tabs", "Present", "Steps", "Form"]
    }

    return(_this)=>class Console{
        constructor(){
            console.warn("LS.Toolbox has been deprecated. This component no longer works. It may be bought back in the future with a rewrite but this is not guaranteed.")
            return



            /*
            
                TODO: If you are a maintainer, there is a general idea on how this component could be revived.

                LinuxJS would be implemented with a proper terminal emulator (probably XTerm.js).
                The inspector would need to get more features to make it useful and worth the toolbox.
            
            */




            M.StyleComponent("toolbox", "resize")
            _this = this;
            this.isOpen = false;
            this.config = {};
            this.bash = {env: {PATH: "/bin",EDITOR: "/bin/nano"}, pwd: "/", shell: 0, ws:"local"};
            this.localFS = {
                bin:{
                    ls(...args){
                        let path = args[1]||_this.bash.pwd, dir = _this.fsGet(path);
                        if(!dir)return _this.error("No such file or directory (\""+path+"\")")
                        if(!dir.dir)return _this.error("\""+path+"\" is a file")
                        _this.log(Object.keys(dir.value).map(e=>typeof dir.value[e]!="object"?`%{#35b1fb}${e}%{#fff}`:e).join("\n"))
                        this.exit()
                    },
                    pwd(){
                        _this.log(_this.bash.pwd)
                        this.exit()
                    },
                    cd(f, path = ""){
                        let dir = _this.fsGet(path);
                        if(!dir||!dir.dir)return _this.error("\""+path+"\" either doesnt exist or is not a directory")
                        _this.bash.pwd=path
                        this.exit()
                    },
                    clear(){
                        _this.lines.clear()
                        this.exit()
                    },
                    mkdir(f, path){
                        _this.fsGet(path, false);
                        this.exit()
                    },
                    touch(f, path){
                        this.exit()
                    },
                    env(){
                        _this.log(Object.keys(_this.bash.env).map(e=>`${e}=${_this.bash.env[e]}`).join("\n"))
                        this.exit()
                    },
                    export(f, e){
                        e = e.split("=")
                        let name = e[0];
                        e.shift()
                        _this.bash.env[name]=e.join("=")
                        this.exit()
                    },
                    echo(f, ...v){
                        _this.log(v.join(" "))
                        this.exit()
                    },
                    make(f, file){
                        this.exit()
                    },
                    nano(f, file){
                        let filename="asd.txt";
                        function draw(){
                            let helpSpacing = " ".repeat(Math.max(0,(_this.lines.cols/2)-16));
                            _this.exec(`clear && echo "%{#000,#fff}  Text Editor  ${" ".repeat((_this.lines.cols/2)-15)}${filename}${" ".repeat(((_this.lines.cols/2)-(filename.length)))}%{/}
%{![${_this.lines.cols},${_this.lines.rows-3}]editor-text}%{/}
%{#000,#fff}^S%{/} Save${helpSpacing}%{#000,#fff}^Z%{/} Undo${helpSpacing}%{#000,#fff}^C%{/} Copy
%{#000,#fff}^X%{/} Exit${helpSpacing}%{#000,#fff}^Y%{/} Redo${helpSpacing}%{#000,#fff}^V%{/} Paste
"`)
                            _this.lines.once("resize",draw)
                        }
                        draw();
                    },
                    async desktop(f, name){
                        let de;
                        function launch(){
                            de
                        }
                        let list=[
                            {id:"LiDE 0.12.1",dir:"lide",cdn:"@lide?"+Math.random()},
                            {id:"Gnome Lite",dir:"gnome-lite",cdn:"@gnome-lite"}
                        ],
                        target = list.find(d=>d.id.toLowerCase().includes(name.toLowerCase())), bin;
                        if(!target){
                            _this.error("Desktop environment \""+name+"\" not found.")
                            return this.exit()
                        }
                        de = _this.fsGet("/env/"+target.dir)
                        if(de){
                            launch();
                            return this.exit()
                        }
                        _this.lines.warn("Desktop environment \""+name+"\" not installed, downloading")
                        _this.log("Preparing to download "+target.id+" to /env/"+target.dir)
                        fetch(LS.CDN+"/file/"+target.cdn)
                            .then(async r=>{
                                _this.log("Checking...")
                                bin = await r.json()
                                if(bin.success===false){
                                    _this.error(bin.error)
                                }else{
                                    _this.fsGet("/env/"+target.dir,false,bin)
                                    _this.log("All done! Launching.")
                                    de = _this.fsGet("/env/"+target.dir)
                                    launch()
                                }
                                this.exit()
                            })
                            .catch(e=>{
                                _this.error(e.toString())
                                this.exit()
                            })
                    }
                }
            }

            this.fs = "local"
            this.container = N("div",{class: "ls-toolbox-container"})
            this.rootContainer = N("div",{class: "ls-toolbox-host"}).addTo(this.container)
            this.root = this.rootContainer.attachShadow({ mode: 'open' });
            this.content = N({id: "root", attr: {"ls-style": "sharp", ls: "", "ls-theme": "dark", "ls-accent": "blue"}});
            this.root.appendChild(this.content)

            LS.Resize("ls.toolbox", this.container, [1]).on("resizeend",()=>{
                this.updateConfig("height", LS.Resize("ls.toolbox").values[0])
            })
            LS.once("body-available", ()=>{
                _this.load()
            })
        }
        // updateConfig(k,v){
        //     if(k)_this.config[k]=v;
        //     localStorage.lsDebugConsole=JSON.stringify(_this.config)
        // }
        // loadConfig(){
        //     if(localStorage.lsDebugConsole){
        //         _this.config=JSON.parse(localStorage.lsDebugConsole)
        //     }
        //     _this.container.style.height=_this.config.height+"px"
        //     if(LS._debugToolBoxShow){
        //         _this.open()
        //         LS._debugToolBoxShow = false
        //     }else{
        //         _this[_this.config.open?"open":"close"]()
        //     }
        // }
        // load(){
        //     LS._topLayer.add(this.container)

        //     _this.loadConfig()
        //     _this.content.appendChild(N("link",{rel:"stylesheet",href:LS.CDN+"/ls/css/0/Base,ls-sharp,ls-flat,toolbox-frame,tabs,present,progress,tree,resize,select"}))
        //     _this.content.appendChild(N("link",{rel:"stylesheet",href:"https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.min.css"}))
        //     _this.content.appendChild(N("link",{rel:"stylesheet",href:"https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100;300;400;500;600;700;800&display=swap"}))

        //     _this.content.add(N("ls-group", {style: "position:absolute;top:-1px;right:0", attr: "join", inner: [
        //         N("button", {inner: N("i", {class: "bi-arrows-fullscreen"}), onclick(){_this.container.style.height="100%"}}),
        //         N("button", {inner: N("i", {class: "bi-x-lg"}), onclick(){_this.close()}})
        //     ]}))

        //     _this.content.add(N("tabs",{
        //         inner:[
        //             N("tab",{
        //                 attr: {"tab-title":"<i class=bi-tools></i> Debugger", fl: "true"},
        //                 inner: [N({class:"components"}), N({class:"content"})],
        //                 style: "height:100%"
        //             }),
        //             N("tab",{
        //                 attr: {"tab-title":"<i class=bi-terminal-fill></i> Terminal"},
        //                 inner: [N({class:"lines"})]
        //             }),
        //             N("tab",{
        //                 attr: {"tab-title":"<i class=bi-wrench></i> Config"},
        //                 inner: []
        //             }),
        //             N("tab",{
        //                 attr: {"tab-title":"<i class=bi-display></i> Desktop"},
        //                 inner: [N({
        //                     attr: "chv",
        //                     inner: "<div class=setup ct><div ls-box ls-yellow><i class=bi-exclamation-triangle-fill></i> You do not have an available desktop yet.</div><br><h3 style=font-weight:100>Choose your desktop</h3><br><div style=gap:10px ch class=setup-de><div onclick=\"LS.Tabs('ls.toolbox.tabs').setActive(1);_this.exec('desktop lide',true)\"><img src=https://cdn.extragon.cloud/file/820d268e7d9c435a8fab082ff82c316d.svg><br>LiDE</div><div onclick=\"LS.Tabs('ls.toolbox.tabs').setActive(1);_this.exec('desktop gnome',true)\"><img src=https://cdn.extragon.cloud/file/275005127b56c088e7b7179e7695c194.svg><br>Gnome Lite</div></div></div><div id=desktop></div>"
        //                 })]
        //             })
        //         ]
        //     }))

        //     LS._topLayer.add(N({id:"ls-toolbox-overlay", style:"display:none"}))
        //     let overlay = O("#ls-toolbox-overlay")

        //     function highlight(element){
        //         let rect = element.getBoundingClientRect();
        //         overlay.style = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`
        //         overlay.show()
        //     }

        //     LS.Tree("ls.toolbox.components", _this.content.get(".components"), [], {class:"project_explorer"}).on("data", (path, expand)=>{
        //         path = path.split("/").filter(g=>g);
        //         if(!expand){
        //             let isGlobal = path[0] == "_global";
        //             if(!LS[path[0]] && !isGlobal)return;
        //             let instance = isGlobal ? {} : LS[path[0]].list[path[1]],
        //                 content = _this.content.get(".content")
        //             ;

        //             content.clear()
        //             if(instance.element || isGlobal){
        //                 if(isGlobal)instance.element = O();
        //                 let select = N("ls-select", {attr: "compatibility"});
        //                 content.add(N([
        //                     N("h2", "Element config"),
        //                     N("h3", "Accent color"),
        //                     select
        //                 ]))
        //                 let a = LS.Select(M.GlobalID, select, [{value: "default", label: "Inherit"}, ...LS.Color.all().map(c=>{return{value: c, label: `<div ls-accent="${c}" class="select_color"></div>`}})], {root: _this.content});
        //                 a.on("change", (v)=>{
        //                     if(v=="default")return instance.element.delAttr("ls-accent");
        //                     instance.element.attrAssign({"ls-accent": v})
        //                 })
        //                 if(instance.element.attr("ls-accent")){
        //                     a.set(a.getOptions().find(o=>o.value==instance.element.attr("ls-accent")))
        //                 }
        //             }
        //             if(isGlobal)return;
        //             return
        //         }
        //         return Object.keys(LS[path[0]].list).map(c => {
        //             if(c.startsWith("ls.toolbox"))return;
        //             let element = LS[path[0]].list[c].element;
        //             return {expandable: false, inner: "<span" + (element?" style=color:orange><i class=bi-code-slash></i ":"") + "> " + c + "</span>", path: c, element: {
        //                 onmouseenter(){
        //                     if(element)highlight(element)
        //                 },
        //                 onmouseleave(){
        //                     overlay.hide()
        //                 }
        //             }}
        //         }).filter(g=>g)
        //     })

        //     LS.Resize("ls.toolbox.components", _this.content.get(".components"), [0, 0, 0, 1])

        //     function updateComponentList(){
        //         LS.Tree("ls.toolbox.components").expand("", [
        //             {
        //                 expandable: false,
        //                 inner: " ",
        //                 path: "___",
        //                 element: {style: "pointer-events:none;padding:5px"}
        //             },
        //             {
        //                 expandable: false,
        //                 inner: N([
        //                     N("button", {inner: N("i", {class: "bi-arrow-clockwise"}), onclick(){updateComponentList()}}),
        //                     N("button", {inner: N("i", {class: "bi-arrows-angle-expand"}), onclick(){_this.content.getAll(".components .ls-tree-expandable").all(e=>e.click())}}),
        //                 ]),
        //                 path: "_misc",
        //                 element: {style: "padding:0 15px"}
        //             },
        //             {
        //                 expandable: false,
        //                 inner: "<ls-group join><input id=add_component placeholder='Component name' style=background:var(--ui-bg-1);width:100%><button onclick='M.Component(LS.ToolBox.content.get(\"#add_component\").value)'><i class=bi-plus></button></ls-group>",
        //                 path: "_add",
        //                 element: {style: "padding:0 15px"}
        //             },
        //             {
        //                 expandable: false,
        //                 inner: " ",
        //                 path: "__",
        //                 element: {style: "pointer-events:none;padding:5px"}
        //             },
        //             {
        //                 expandable: false,
        //                 inner: "<i class=bi-house-fill></i> Global",
        //                 path: "_global"
        //             },
        //             ...Object.keys(LS).map(c => {
        //                 if(LS[c].name !== "Component") return;
        //                 let keys = Object.keys(LS[c].list),
        //                     instances = keys.length - (keys.filter(k=>k.startsWith("ls.toolbox")).length)
        //                 ;
        //                 return {i: instances, expandable: true, inner: `<i class=bi-puzzle-fill></i> ${c} ${instances?"<span class=num_badge>"+instances+"</span>":""}`, path: c}
        //             }).filter(g=>g).sort((a, b) => b.i - a.i)
        //         ], true)
        //     }

        //     updateComponentList()

        //     LS.on("componentLoad", updateComponentList)

        //     LS.Tabs('ls.toolbox.tabs', _this.content.get("tabs"))
        //     let lines = LS.Terminal("lines", _this.content.get(".lines"))

        //     _this.lines = lines
        //     _this.log = lines.log
        //     _this.print = lines.print
        //     _this.error = lines.error

        //     _this.content.get(".lines").click();

        //     LS.Present("desktop", _this.content.get('#desktop'), {fullscreen: true, ignoreEvents: true})

        //     _this.log("[ %{red}Welcome%{/} ]\n %{cyan}*%{/} List default commands with \"%{cyan}ls /bin%{/}\" or all commands \"%{cyan}ls -l : $PATH%{/}\"\n %{cyan}*%{/} Access JS with \"%{cyan}js%{/}\" or \"%{cyan}eval ...%{/}\"\n %{cyan}*%{/} Connect to a remote workspace: \"%{cyan}remote name@host%{/}\" (exclude host to use default server)\n %{cyan}*%{/} You can edit files with nano, set variables including PATH etc. same way as in UNIX.\n\nFor more examples and tutorials, run \"%{cyan}man%{/}\".\n")
        //     _this.content.attrAssign(["ls","ls-sharp"])
        //     _this.exec("init")
        //     _this.lines.on("newline",(i, v)=>{
        //         if(i == "bash-command"){
        //             _this.proccess(v)
        //         }
        //     })
        // }
        // open(){
        //     if(_this.isOpen)return;
        //     _this.isOpen=true
        //     _this.container.class("open")
        //     _this.invoke("open")
        //     _this.updateConfig("open",true)
        // }
        // close(){
        //     if(!_this.isOpen)return;
        //     _this.isOpen=false
        //     _this.container.class("open",0)
        //     _this.invoke("closed")
        //     _this.updateConfig("open",false)
        // }
        // toggle(){
        //     _this[_this.isOpen?"close":"open"]()
        //     return _this.isOpen
        // }
        // fsGet(path="/", strict = true, sv = null){
        //     if(path.endsWith("/"))path=path.slice(0,-1)
        //     let t = LS.Util.objectPath(_this.fs=="local"? _this.localFS : _this.fs, path, sv, "/", strict)
        //     return t?{dir: typeof t=="object"?1:0, value: t}:null
        // }
        // proccess(d){
        //     switch(_this.bash.shell){
        //         case 0:
        //             _this.exec(d, true)
        //         break;
        //         default:
        //             _this.handler
        //     }
        // }
        // async exec(cmd, isShell){
        //     if(cmd!="init"){
        //         //First, parse strings
        //         let strings = [], inside=false, prev="", str = "", result = "";
        //         for(let char of cmd){
        //             if(char=='"'&&prev!="\\"){
        //                 inside=!inside;
        //             }
        //             if(inside){
        //                 if(char!='"'||prev=="\\")str+=char
        //             }else if(str){
        //                 strings.push(str)
        //                 str=""
        //                 result += "%{@}"
        //             }else if(char!='"'||prev=="\\"){
        //                 result += char
        //             }
        //             prev=char
        //         }
        //         strings=strings.map(s=>s.replaceAll("\\\"","\""))
        //         cmd=result.replace(/#.*$/gm, '').split("&&").map(c=>c.split(" ").filter(g=>g)).filter(g=>g);
        //         for(let c of cmd){
        //             c=c.map(s=>{
        //                 if(s=="%{@}"){
        //                     return strings.shift()
        //                 }
        //                 return s
        //             })
        //             let found=0
        //             for(let p of _this.bash.env.PATH.split(":")){
        //                 let dir = _this.fsGet(p)
        //                 if(!dir||!dir.dir)continue;
        //                 if(Object.keys(dir.value).includes(c[0])&&typeof dir.value[c[0]]=="function"){
        //                     try{
        //                         await new Promise((r,j)=>{
        //                             _this.lines.once("ctrlc",r)
        //                             dir.value[c[0]].call({
        //                                 get exit(){return ()=>r(0)},
        //                                 set exit(v){r(v)}
        //                             },...c)
        //                         })
        //                     }catch(e){_this.error(e.toString())}
        //                     found=1
        //                 }
        //             }
        //             if(!found){_this.error(c[0]+" not found");break}
        //         }
        //     }
        //     if(isShell||cmd=="init")_this.log(`%{lime}[${_this.bash.ws} ${_this.bash.pwd}]#%{/} %{![*,1]bash-command}`)
        // }
    }
}