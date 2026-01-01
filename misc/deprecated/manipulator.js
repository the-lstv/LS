function Manipulate(str,mapper=" *:",options){
    if(!mapper)return [str];
    //Many of you may be confused on what this is.
    //Remember the pain of learning regexp?
    
    //#~\n{$>+": "} splits string by \n, for each segment, add a ": "
    ">?/::/,\\*:/,[/+]*:/";
    let d="";
    let opt={
        regMatch:/\[(.*?)\]/g,
        blockMatch:/\{(.*?)\}/g,
        stringMatch:/"(.*?)"|'(.*?)'|\[\[(.*?)\]\]/g,
        bracketID:/\((.*?)\)/,
        cases:{
            a:"toLowerCase",
            A:"toUpperCase",
            b4:(str)=>btoa(str),
            Aa:(str)=>str.split(".").map(s=>s.replace(/[a-zA-Z]/,l=>l.toUpperCase())).join("."),
            n:(str)=>+(str.match(/[0-9-]/g)||['0']).join(''),
            uE:(str)=>encodeURIComponent(str),
            uD:(str)=>decodeURIComponent(str),
        },
        ...options
    };

    function matchingBracket(){

    }

    let rx={};
    
    function getRegex(id,flags){
        let m=id.match(opt.bracketID);
        if(m)id=m[1];
        return new RegExp(rx[id],flags)
    }

    function parseMapper(mapperString){
        let _rx=mapperString.match(opt.regMatch),i=[],j=0;
        _rx=_rx?_rx.map(e=>e.slice(1,-1)):[];
        for(const regexp of _rx){
            let id=M.GlobalID;
            rx[id]=regexp;
            i.push(id);
        }
        console.log(rx);
        mapperString=mapperString.split(",").map(o=>o.replace(opt.stringMatch,()=>'$S('+(i[j++])+')')).map(o=>o.replace(opt.regMatch,()=>'$R('+(i[j++])+')'));
        return mapperString
    }

    function block(o,str){
        console.log(o);
        if(o.length<1)return str;
        if(o=="t"){
            return str.trim();
        }
        if(opt.cases[o]){
            if(typeof opt.cases[o]=="function"){
                return str=opt.cases[o](str);
            }
            /*-->explanation*/d+=opt.cases[o]+"\n";
            return str=str[opt.cases[o]]();
        }
        if(['>','<','*'].includes(o[0])&&o[1]!=":"){
            if(o[1]=="?"){
                let c=o.slice(2).split(":"),i=str[o[0]==">"?"startsWith":"endsWith"](c[0]),r=str[o[0]==">"?"indexOf":"lastIndexOf"](c[0]);
                if(o[0]==">"){
                    str=str.slice(r<0?0:r);
                    str=(i?c[1]:c[2])+str
                }
                if(o[0]=="<"){
                    str=str.slice(0,r<0?Infinity:r+1)
                    str+=i?c[1]:c[2];
                }
            }
            return str;
        }
        if(o.startsWith("at(")){
            return str.at(opt.cases.n(o))
        }
        let cmd="replace";
        if(o[0]=="-"){
            if(o[1]=="*"){
                cmd="replaceAll";
                o=o.slice(1);
            }
            o=[o.slice(1),'']
        }else{
            o=o.split(":");
            if(o[0].at(-1)=="*"){
                cmd="replaceAll";
                o[0]=o[0].slice(0,-1);
            }
        }
        if(o[0].startsWith("$R"))o[0]=getRegex(o[0],cmd=="replaceAll"?"g":"");
        
        /*-->explanation*/d+=cmd+" '"+o[0]+"' with '"+o[1]+"'\n";
        str=str[cmd](o[0],o[1])
        return str
    }

    for(const o of parseMapper(mapper)){
        str=block(o,str);
    }
    return str||[str,d]
}