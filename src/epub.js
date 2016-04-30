// var parseXML = require('/src/parseXML')

// EPUBJS.Render.Iframe.prototype.page = function(pg){
// 	this.leftPos = this.pageWidth * (pg-1); //-- pages start at 1
	
// 	// Reverse for rtl langs
// 	if(this.direction === "rtl"){
// 		this.leftPos = this.leftPos * -1;
// 	}

// 	this.setLeft(this.leftPos);
// };


// EPUBJS.Render.Iframe.prototype.setLeft = function(leftPos){
	
// 	if (navigator.userAgent.match(/(iPad|iPhone|iPod|Mobile|Android)/g)) {
// 		this.docEl.style["-webkit-transform"] = 'translate('+ (-leftPos) + 'px, 0)';
// 	} else {
// 		this.document.defaultView.scrollTo(leftPos, 0);
// 	}
	
// };
// https://raw.githubusercontent.com/IDPF/epub-revision/master/src/samples/cfi/epubcfi.js
//http://stackoverflow.com/questions/16792578/how-to-create-a-epub-annotation-with-save-option-within-the-epub
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
'use strict'
var http = axios;
function parse(xml){
    if (window.DOMParser){
        var parser=new DOMParser();
        var xmlDoc=parser.parseFromString(xml,"text/xml");
    }
    else {
        var xmlDoc=new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async=false;
        xmlDoc.loadXML(xml);
    }
    return xmlDoc;

}

// Changes XML to JSON
// https://davidwalsh.name/convert-xml-json
function xmlToJson(xml) {
	// Create the return object
	var obj = {};

	if (xml.nodeType == 1) { // element
		// do attributes
		if (xml.attributes.length > 0) {
		obj["@attributes"] = {};
			for (var j = 0; j < xml.attributes.length; j++) {
				var attribute = xml.attributes.item(j);
				obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
			}
		}
	} else if (xml.nodeType == 3) { // text
		obj = xml.nodeValue.trim();
	}

	// do children
	if (xml.hasChildNodes()) {
		for(var i = 0; i < xml.childNodes.length; i++) {
			var item = xml.childNodes.item(i);
			var nodeName = item.nodeName;
			if (typeof(obj[nodeName]) == "undefined") {
                //var o = xmlToJson(item);
                //if (typeof(o) ==="object")
				obj[nodeName] = xmlToJson(item);
			} else {
				if (typeof(obj[nodeName].push) == "undefined") {
					var old = obj[nodeName];
					obj[nodeName] = [];
					obj[nodeName].push(old);
				}
                // empty object
                var o = xmlToJson(item);
                if (typeof(o) ==="object")
				    obj[nodeName].push(o);
			}
		}
	}
	return obj;
};
class Epub{
    /**
     * contruction
     * path = /books/moby-dick/
     * path = /books/moby-dick.epub
     * container.xml -> package.opf -> toc.ncx
     *                   index files   index
     */
    constructor(path, options) {
        this.path = path;
        this.path += '/';
        this.options = options;
        this.navDefaultHandle.bind(this);
    }

    /**
     * render to element
     */
    render(view){
        this.view = view;
        this.showChapterByOrder('first');
        var me =  this;
        this.view.onclick = function(evt){
             markAndReload (evt, me.dom);
        }
    }
    
    /**
     * default render handle
     */
    renderNav(elm, handle){
       if (!handle){
           this.navDefaultHandle(elm);
       }
       else{
           handle(elm);
       }
    }
    tocAsJson(){
        if(!this.tocJson){
            this.tocJson = xmlToJson(this.toc);
        }
        return this.tocJson;
    }
    navDefaultHandle(elm){
        let tocj = this.tocAsJson();
        let navMap = tocj.ncx.navMap.navPoint;
        let ul = document.createElement("ul");
        let me = this;
        var order = 0;
        navMap.forEach(function (e) {
           let li = document.createElement("li");
           let a = document.createElement("a");
           a.innerText = e.navLabel.text['#text'];
           a.setAttribute('href', '#');
           a.setAttribute('order', order);
           a.onclick = function(e){
               me.gotoFile(this);
           }
           li.appendChild(a);
           ul.appendChild(li);
           order ++;
        });
        elm.appendChild(ul);
        
        return this;
    }
    
    gotoFile(elm){
        this.showChapterByOrder(elm.getAttribute('order'));
    }
    
    calcPages(){
        var scrollWidth = this.view.scrollWidth,
            containerW = this.view.offsetWidth,
            total = Math.ceil(scrollWidth / containerW) - 1; // start at 0
        this.page = {
            current: 0,
            total: total,
            width: this.view.offsetWidth
        }
        this.view.scrollLeft = 0;
        
        if((scrollWidth % containerW) !== 0){
            var frag = document.createDocumentFragment();
            var p = document.createElement("p");
            p.innerHTML = '&nbsp';
            p.style.height = "99%";
            
            frag.appendChild(p);
            this.view.appendChild(frag);
        }
    }
    
    
    gotoPage(page){
        var inpage =  page;
        switch(page){
            case 'next':
                if(this.page.current >= this.page.total){
                    this.showChapterByOrder('next');
                    return;
                }
                else{
                    this.page.current += 1;
                }
                break;
            case 'back':
                if(this.page.current <= 0){
                    var me = this;
                    this.showChapterByOrder('back').then(function(){
                        me.gotoPage('last');
                    });
                    
                    return;
                }
                else{
                    this.page.current -= 1;
                }
                break;
            case 'last':
                this.page.current = this.page.total;
                break;
            default:
                // goto numner
                try{
                    page = parseInt(page);
                    if (page < 0 || page > this.page.total){
                        return new Error('page out of range ' + page)
                    }
                    this.page.current = page;
                }
                catch (error) {
                    return error;    
                }
                
                break;
        }
        // // test show elem
        // var elv = document.getElementById("nguyen");
        // if (elv)
        //     if (this.checkVisible(elv))
        //         alert(123);
                
        var w = this.view.offsetWidth;
        // goto page
        this.view.scrollLeft = this.page.current*(w);
    }
    
    
    
    scl(){
        var elm = view.getElementById("nguyen");//document.getElementById("nguyen");
        this.gotoElm(elm);
    }
    
    gotoElm(elm) {
        if(!elm)
            return;
        var rect = elm.getBoundingClientRect();
        var w = this.view.offsetWidth;
        var page = 0;
        var left= 0;
        
        while (page <= this.page.total) {
            // elm.left > view.left && elm.left < view.left + this.view.offsetWidth;    
            if (rect.left > left && rect.left < left + w){
                this.gotoPage(page)
                break;
            }
            page ++;
            left = page*w;
        }
    }
    
    checkVisible(elm) {
        /*
        bottom 134
        height 17
        left 3847.59375
        right 3923.328125
        top 117
        width 75.734375
        
        scrollWidth ~ 10k
        
        */
        var rect = elm.getBoundingClientRect();
        var scrollWidth = this.view.scrollWidth;
        var viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
        return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
       // (rect.bottom > 0 && rect.top - viewHeight <= 0);
    }
    
    /**
     * toc playorder = 1,2,3...
     * Params:
     * order = 'next' / 'back', 'first' or number,
     * cb = do affter load chapter complete (aync ?)
     */
    showChapterByOrder(order, cb){
        var me = this;
        var inorder = order;
        switch(order){
            case 'next':
                inorder = this.navPoint+1;
                break;
            case 'back':
                inorder = this.navPoint-1;
                break;
            case 'first':
                inorder = 0;
                break;
            default:
            break;
        }
       
        return _playOrder(inorder);
        
        function _playOrder(order){
            if (isNaN(inorder)){
                throw new Error("play order must in number");           
            }
            order = parseInt(order);
            var navList = me.tocAsJson()['ncx']['navMap']['navPoint'];
            var len = navList.length;
            if (inorder < 0 || inorder >= len){
                return;
            }
        
            me.navPoint = order;
            var e = navList[order];
            var src = e['content']['@attributes']['src'];
            return me.readHtml(src);
            //if (cb)
            //    cb();
        }
    }
    
    processContent(content) {
        let contentDom = parse(content);
        let css = contentDom.querySelectorAll('link[type="text/css"]');
        for(let i=0; i < css.length;  i++){
            let e = css[i];
            e.setAttribute('href', this.bookPath + e.getAttribute('href'));
        }
        var img = contentDom.querySelectorAll('img');
        for(let i=0; i < img.length;  i++){
            let e = img[i];
            e.setAttribute('src', this.bookPath + e.getAttribute('src'));
        }
        return contentDom;
    }
    
    
    readHtml(url, view){
        let path = this.bookPath + url;
        let me = this;
        view = view || this.view;
        //var v = view;
        function show(resp) {
            let content = me.processContent(resp.data);
            let t = new XMLSerializer().serializeToString(content.documentElement);
            view.innerHTML = t;            
            me.calcPages();
            me.dom = content;
        }
        
        return http.get(path).then(show);
    }
   
    init(){
        let containerPath = this.path + '/META-INF/container.xml';
        let me = this;
        
        function getTocPath(xml) {
            var node = xml.querySelector("item[media-type='application/x-dtbncx+xml']");
            // If we can't find the toc by media-type then try to look for id of the item in the spine attributes as
            // according to http://www.idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.4.1.2, 
            // "The item that describes the NCX must be referenced by the spine toc attribute."
            if (!node) {
                var spine = xml.querySelector("spine");
                var tocId = spine.getAttribute("toc");
                if(tocId) {
                    node = manifestNode.querySelector("item[id='" + tocId + "']");
                }
            }

            var tocpath = node ? node.getAttribute('href') : false;
            if (!tocpath){
                throw new Error('can not get toc path');
            }
            return tocpath;
        }
        
        function parseContainer(resp){
            var xml = parse(resp.data);
            console.log(xml.documentElement.nodeName);
            var opfPath = xml.getElementsByTagName('rootfile')[0].getAttribute("full-path");
            // opf path is root, all others related to this path
            // path poiter to opf folder
            me.bookPath = me.path + opfPath.substr(0, opfPath.lastIndexOf('/')) + '/';
            return http.get( me.path+'/'+opfPath).then(function (resp) {
                // 1st opf and spine
                let xml = parse(resp.data); 
                me.opf = xml;
                
                // 2nd get toc
                var tocpath = getTocPath(xml, me.spine); 
                // toc path relative with opfPath
                tocpath = opfPath.substr(0, opfPath.lastIndexOf('/')) + '/' + tocpath;
                return http.get(me.path+'/'+tocpath).then(function (resp) {
                    me.toc = parse(resp.data);
                    return me;
                });
            });
        }
        
        return http.get(containerPath)
            .then(parseContainer);
    }
    
}

